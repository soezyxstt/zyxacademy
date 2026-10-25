#!/usr/bin/env bash
# Update the configured staging service, then route traffic to a ready revision.
set -euo pipefail

: "${GCP_PROJECT:?}" "${GCP_REGION:?}" "${CLOUD_RUN_SERVICE:?}"
: "${CLOUD_RUN_RUNTIME_ACCOUNT:?}" "${CLOUD_RUN_IMAGE:?}" "${CLOUD_RUN_BUILD_ORIGIN:?}"

# Keep the deployment target fixed even when invoked outside the workflow.
if [ "$GCP_PROJECT" != zyx-academy ] || [ "$GCP_REGION" != asia-east1 ] || \
   [ "$CLOUD_RUN_SERVICE" != zyx-academy-staging ] || \
   [[ ! "$CLOUD_RUN_RUNTIME_ACCOUNT" =~ ^[a-z0-9-]+@zyx-academy\.iam\.gserviceaccount\.com$ ]] || \
   [[ ! "$CLOUD_RUN_IMAGE" =~ ^asia-east1-docker\.pkg\.dev/zyx-academy/zyx-staging/zyx-academy@sha256:[a-f0-9]{64}$ ]]; then
  echo '::error::Unexpected staging deployment target or image digest.'
  exit 1
fi

temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
target=(--project="$GCP_PROJECT" --region="$GCP_REGION")

# Never implicitly create an application with missing runtime secrets.
if ! gcloud run services describe "$CLOUD_RUN_SERVICE" "${target[@]}" \
  --format=json > "$temporary/before.json"; then
  echo '::error::Could not inspect the staging service. If it does not exist, complete the one-time Console setup with runtime secrets using the image above, then rerun this workflow. For access/network errors, fix that error first.'
  exit 1
fi

python3 - "$temporary/before.json" <<'PY'
import json, os, sys
from urllib.parse import urlparse

service = json.load(open(sys.argv[1]))
spec = service.get("spec", {}).get("template", {}).get("spec", {})
containers = spec.get("containers", [])
if len(containers) != 1 or spec.get("serviceAccountName") != os.environ["CLOUD_RUN_RUNTIME_ACCOUNT"]:
    sys.exit("Staging must use the same service account as the CI JSON key and one web container.")
env = {item["name"]: item for item in containers[0].get("env", [])}
if env.get("ZYX_ENVIRONMENT", {}).get("value") != "staging":
    sys.exit("Refusing to deploy without the explicit staging runtime marker.")
if "SKIP_ENV_VALIDATION" in env:
    sys.exit("Remove build-only SKIP_ENV_VALIDATION from the runtime service.")
origin = os.environ["CLOUD_RUN_BUILD_ORIGIN"]
parsed = urlparse(origin)
if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
        or parsed.path not in ("", "/") or parsed.query or parsed.fragment
        or parsed.hostname in ("zyxacademy.com", "www.zyxacademy.com", "zyx.academy")):
    sys.exit("A staging HTTPS origin is required.")
for key in ("BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL"):
    if env.get(key, {}).get("value", "").rstrip("/") != origin.rstrip("/"):
        sys.exit("Runtime auth/public origins must match the public build origin before deployment.")
required = ("DATABASE_URL", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
            "RESEND_API_KEY", "GEMINI_API_KEY", "INNGEST_EVENT_KEY", "TURSO_AUTH_TOKEN")
for key in required:
    item = env.get(key, {})
    if not item.get("value") and not item.get("valueFrom", {}).get("secretKeyRef"):
        sys.exit("Missing required staging runtime setting: " + key)
print("Existing staging runtime configuration verified; secret values were not retrieved.")
PY

# Preserve runtime variables, secret references and invocation IAM. Deploy first
# without changing traffic; gcloud waits for the new revision to become ready.
gcloud run deploy "$CLOUD_RUN_SERVICE" "${target[@]}" \
  --image="$CLOUD_RUN_IMAGE" \
  --service-account="$CLOUD_RUN_RUNTIME_ACCOUNT" \
  --cpu=1 --memory=1Gi --cpu-throttling \
  --min=0 --max=1 --concurrency=8 --timeout=300 --port=8080 \
  --no-traffic --quiet --format=json > "$temporary/deployed.json"

revision="$(python3 - "$temporary/deployed.json" <<'PY'
import json, sys
status = json.load(open(sys.argv[1])).get("status", {})
revision = status.get("latestCreatedRevisionName")
if not revision or revision != status.get("latestReadyRevisionName"):
    sys.exit("The newly created revision is not ready; traffic was not changed.")
print(revision)
PY
)"

gcloud run revisions describe "$revision" "${target[@]}" \
  --format=json > "$temporary/revision.json"
python3 - "$temporary/revision.json" <<'PY'
import json, os, sys
revision = json.load(open(sys.argv[1]))
ready = any(c.get("type") == "Ready" and c.get("status") == "True"
            for c in revision.get("status", {}).get("conditions", []))
containers = revision.get("spec", {}).get("containers", [])
if not ready or len(containers) != 1 or containers[0].get("image") != os.environ["CLOUD_RUN_IMAGE"]:
    sys.exit("Ready revision does not match the published image; traffic was not changed.")
PY

gcloud run services update-traffic "$CLOUD_RUN_SERVICE" "${target[@]}" \
  --to-revisions="$revision=100" --quiet --format=json > "$temporary/traffic.json"

python3 - "$temporary/before.json" "$temporary/traffic.json" "$revision" <<'PY'
import json, os, sys
before, after = (json.load(open(p)) for p in sys.argv[1:3])
revision = sys.argv[3]
traffic = after.get("status", {}).get("traffic", [])
if sum(t.get("percent", 0) for t in traffic if t.get("revisionName") == revision) != 100:
    sys.exit("Could not verify 100 percent staging traffic on the new revision.")
message = ("### Staging deployed to Cloud Run\n\n"
           f"Revision: `{revision}`\n\nImage: `{os.environ['CLOUD_RUN_IMAGE']}`\n\n"
           f"Service URL: {after.get('status', {}).get('url', '')}\n\n"
           "Previous traffic, retained for rollback through Console:\n")
for entry in before.get("status", {}).get("traffic", []):
    if entry.get("percent", 0):
        name = entry.get("revisionName") or before.get("status", {}).get("latestReadyRevisionName", "")
        message += f"- `{name}`: {entry['percent']}%\n"
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write(message)
print("Published image is ready and receives 100 percent of staging traffic.")
PY
