#!/usr/bin/env bash
# Update the configured staging service, then route traffic to a ready revision.
set -euo pipefail

: "${GCP_PROJECT:?}" "${GCP_REGION:?}" "${CLOUD_RUN_SERVICE:?}"
: "${CLOUD_RUN_RUNTIME_ACCOUNT:?}" "${CLOUD_RUN_IMAGE:?}" "${CLOUD_RUN_BUILD_ORIGIN:?}"

# Keep the deployment target fixed even when invoked outside the workflow.
if [ "$GCP_PROJECT" != zyx-academy ] || [ "$GCP_REGION" != asia-east1 ] || \
   [ "$CLOUD_RUN_SERVICE" != zyx-academy ] || \
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

python3 "$(dirname "$0")/cloud_run_runtime.py" "$temporary/before.json" "$temporary"
runtime_flags=(--env-vars-file="$temporary/runtime.json")
if [ -s "$temporary/secret-refs.txt" ]; then
  runtime_flags+=(--set-secrets="$(cat "$temporary/secret-refs.txt")")
else
  runtime_flags+=(--clear-secrets)
fi

# Sync GitHub runtime settings and preserve unmanaged settings/references and IAM.
# Deploy first
# without changing traffic; gcloud waits for the new revision to become ready.
gcloud run deploy "$CLOUD_RUN_SERVICE" "${target[@]}" \
  --image="$CLOUD_RUN_IMAGE" \
  --service-account="$CLOUD_RUN_RUNTIME_ACCOUNT" \
  "${runtime_flags[@]}" \
  --cpu=1 --memory=1Gi --cpu-throttling \
  --min=0 --max=1 --concurrency=8 --timeout=300 --port=8080 \
  --no-traffic --quiet --format=json > "$temporary/deployed.json"

# A no-traffic deployment can leave the service's latestReadyRevisionName on
# the serving revision. Read the created revision and check its own Ready status.
revision="$(gcloud run services describe "$CLOUD_RUN_SERVICE" "${target[@]}" \
  --format='value(status.latestCreatedRevisionName)')"
if [ -z "$revision" ]; then
  echo '::error::Could not identify the newly created revision; traffic was not changed.'
  exit 1
fi

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
