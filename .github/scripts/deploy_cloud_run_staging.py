"""Release an explicitly selected Cloud Run environment with pinned targets."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from cloud_run_runtime import AI_PROVIDER_SETTINGS, REQUIRED, RUNTIME_KEYS, validate_database
from prepare_worker_runtime import TARGETS

PROJECT = "zyx-academy"
REGION = "asia-southeast3"
ENVIRONMENT = os.environ.get("CLOUD_RUN_ENVIRONMENT", "staging")
if ENVIRONMENT not in ("staging", "production"):
    raise ValueError("Invalid Cloud Run environment.")
SERVICE = f"zyx-academy-{ENVIRONMENT}-web"
REPOSITORY = f"zyx-{ENVIRONMENT}-web"
REGISTRY = f"{REGION}-docker.pkg.dev"
IMAGE = f"{REGISTRY}/{PROJECT}/{REPOSITORY}/{SERVICE}"
RUNTIME_ACCOUNT = f"zyx-{ENVIRONMENT}-web-runtime@{PROJECT}.iam.gserviceaccount.com"
SECRET_PREFIX = f"zyx-{ENVIRONMENT}-web-"
STAGING = TARGETS["staging"]
TARGET = TARGETS[ENVIRONMENT]
ORIGIN_TOKEN = "CLOUD_RUN_ORIGIN_TOKEN"
BUILD_KEYS = {"AUTHORING_VERIFICATION_BROWSER_PROVIDER", "AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION",
              "SENTRY_ORG", "SENTRY_PROJECT", "NEXT_PUBLIC_STAGING_MEDIA_ORIGIN"}
PLAIN_RUNTIME_KEYS = BUILD_KEYS | AI_PROVIDER_SETTINGS | {
    "ZYX_ENVIRONMENT", "ZYX_MCP_ENVIRONMENT", "NODE_ENV", "BETTER_AUTH_URL",
    "STORAGE_PROVIDER_MODE", "NEON_STORAGE_BUCKET", "AWS_ENDPOINT_URL_S3", "AWS_REGION",
    "QUEUE_PROVIDER", "INNGEST_ENV", "DIKTAT_RENDERER_URL", "COMPUTE_SERVICE_URL", "R2_ENDPOINT", "R2_BUCKET", "R2_PUBLIC_URL",
    "CF_ACCOUNT_ID", "CF_KV_NAMESPACE_ID", "VECTORIZE_WORKER_URL", "VECTOR_SYNC_BATCH_SIZE",
    "AUTHORING_VERIFICATION_RENDERER_URL", "AUTHORING_VERIFICATION_ACCESS_URL", "CODING_BROWSER_PROVIDER",
    "ZYRA_CONTROL_PLANE_URL",
    "ANDROID_APP_LINKS_SHA256_FINGERPRINTS",  # Public Digital Asset Links certificate identifiers.
}
REQUIRED_SECRET_KEYS = set(REQUIRED) - PLAIN_RUNTIME_KEYS | {
    ORIGIN_TOKEN, "INNGEST_SIGNING_KEY", "COMPUTE_SERVICE_SECRET", "DIKTAT_RENDERER_SECRET",
    "PYTHON_RUNTIME_TOKEN_SECRET", "CF_AI_GATEWAY_URL", "CF_AI_GATEWAY_TOKEN",
    "ZYRA_CONTROL_PLANE_TOKEN",
}
REVISION = re.compile(re.escape(SERVICE) + r"-r([1-9][0-9]*)a([1-9][0-9]*)")
COMMIT_SHA = re.compile(r"[a-f0-9]{40}")
SOURCE_LABEL = "zyx-source-sha"
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")
VERSION = re.compile(r"[1-9][0-9]*")
BLOCKED_KEYS = {"SKIP_ENV_VALIDATION", "ZYX_POSTGRES_BUILD_PLACEHOLDER", "TURSO_DATABASE_URL",
                "TURSO_CONNECTION_URL", "TURSO_AUTH_TOKEN", "GCP_SERVICE_ACCOUNT_KEY",
                "GITHUB_TOKEN", "VERCEL_TOKEN", "VERCEL_URL", "VERCEL_ENV", "VERCEL"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def is_build_key(key):
    return key in BUILD_KEYS or key.startswith("NEXT_PUBLIC_") and key in RUNTIME_KEYS


def public_config(raw):
    config = json.loads(raw)
    require(isinstance(config, dict), "Cloud Run public configuration must be a JSON object.")
    require(all(is_build_key(key) and isinstance(value, str) and value.strip() and "\x00" not in value
                for key, value in config.items()), "Invalid key or value in Cloud Run public configuration.")
    canonical = config.get("NEXT_PUBLIC_APP_URL", "")
    if ENVIRONMENT == "production":
        require(canonical == TARGET["origin"] and "NEXT_PUBLIC_STAGING_MEDIA_ORIGIN" not in config,
                "Cloud Run production requires its exact public origin and production media.")
        return config
    require(re.fullmatch(r"https://(?:staging\.zyxacademy\.com|zyx-academy-staging-edge\.[a-z0-9-]+\.workers\.dev)", canonical),
            "Cloud Run public origin must be the staging domain or the dedicated staging Worker.")
    require(config.get("NEXT_PUBLIC_STAGING_MEDIA_ORIGIN", "https://cdn-staging.zyxacademy.com")
            == "https://cdn-staging.zyxacademy.com", "Public media origin must be the staging CDN.")
    return config


def command(args, label, env=None, capture=True):
    result = subprocess.run(args, env=env, capture_output=capture, text=True, check=False)
    require(result.returncode == 0, label + " failed.")
    return result.stdout.strip() if capture else None


def gcloud(*args, capture=True):
    return command(["gcloud", "--quiet", "--project", PROJECT, *args],
                   "Google Cloud " + " ".join(args[:3]), capture=capture)


def run(*args):
    return gcloud("run", *args, "--region", REGION)


def describe_service():
    service = json.loads(run("services", "describe", SERVICE, "--format=json"))
    metadata = service["metadata"]
    annotations = metadata.get("annotations", {})
    require(metadata["name"] == SERVICE and metadata["labels"]["cloud.googleapis.com/location"] == REGION,
            "Cloud Run service identity mismatch.")
    require(annotations.get("run.googleapis.com/invoker-iam-disabled") == "true"
            and annotations.get("run.googleapis.com/ingress") == "all"
            and annotations.get("run.googleapis.com/default-url-disabled") != "true",
            "Cloud Run transport must match the staging Worker configuration.")
    return service


def validate_template(spec, config):
    require(spec.get("serviceAccountName") == RUNTIME_ACCOUNT and len(spec["containers"]) == 1,
            "Cloud Run staging runtime identity or container count mismatch.")
    container = spec["containers"][0]
    require(not any(container.get(key) for key in ("command", "args", "volumeMounts")),
            "Cloud Run container entrypoint or filesystem was overridden.")
    env = {item["name"]: item for item in container.get("env", [])}
    require(not (env.keys() & BLOCKED_KEYS), "Cloud Run service contains disallowed environment settings.")
    plain, refs = {}, {}
    for key, item in env.items():
        if "value" in item:
            require(key in PLAIN_RUNTIME_KEYS or is_build_key(key) or key.startswith("FEATURE_"),
                    "A staging runtime setting requires a Secret Manager reference: " + key)
            require(key not in REQUIRED_SECRET_KEYS, "A required staging secret is configured in plaintext.")
            plain[key] = item["value"]
        else:
            require(key in (RUNTIME_KEYS | {ORIGIN_TOKEN}), "Unsupported staging secret environment key: " + key)
            ref = item.get("valueFrom", {}).get("secretKeyRef", {})
            require(re.fullmatch(SECRET_PREFIX + r"[a-z0-9-]+", ref.get("name", ""))
                    and VERSION.fullmatch(ref.get("key", "")),
                    "Cloud Run staging secret must use a local staging name and numeric version: " + key)
            refs[key] = ref
    require(plain.get("NODE_ENV", "production") == "production", "Cloud Run must run the production Next.js server.")
    provider = plain.get("QUEUE_PROVIDER", "inngest")
    require(provider in ("inngest", "cloud-tasks"), "Invalid staging queue provider.")
    required_secrets = REQUIRED_SECRET_KEYS - ({"INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"} if provider == "cloud-tasks" else set())
    require(required_secrets <= refs.keys(), "Cloud Run staging runtime is missing required Secret Manager references.")
    require("ZYRA_CONTROL_PLANE_URL" in plain or "ZYRA_CONTROL_PLANE_URL" in refs,
            "Cloud Run staging runtime is missing ZYRA_CONTROL_PLANE_URL.")
    require("CF_ACCOUNT_ID" in plain and bool({"CF_API_TOKEN", "CF_BROWSER_API_TOKEN"} & refs.keys()),
            "Cloud Run staging Cloudflare Browser Run settings are incomplete.")
    expected = {
        "ZYX_ENVIRONMENT": ENVIRONMENT, "ZYX_MCP_ENVIRONMENT": ENVIRONMENT,
        "BETTER_AUTH_URL": config["NEXT_PUBLIC_APP_URL"],
        "STORAGE_PROVIDER_MODE": "neon", "NEON_STORAGE_BUCKET": TARGET["bucket"], "AWS_REGION": "ap-southeast-1",
        "AWS_ENDPOINT_URL_S3": f"https://{TARGET['branch']}.storage.c-3.ap-southeast-1.aws.neon.tech",
        "INNGEST_ENV": TARGET["inngest"], "DIKTAT_RENDERER_URL": TARGET["renderer"],
        "COMPUTE_SERVICE_URL": f"https://{TARGET['branch']}-zyxcompute.compute.c-3.ap-southeast-1.aws.neon.tech",
    }
    for key, value in expected.items():
        require(plain.get(key) == value, "Cloud Run staging runtime does not match the expected " + key + ".")
    require({key: value for key, value in plain.items() if is_build_key(key)} == config,
            "Cloud Run staging runtime public settings do not match the image build configuration.")
    return refs


def read_secret(ref):
    value = gcloud("secrets", "versions", "access", ref["key"], "--secret", ref["name"])
    require(bool(value) and "\n" not in value and "\r" not in value, "Invalid staging preflight secret format.")
    return value


def verify_database(refs):
    runtime_url = read_secret(refs["DATABASE_URL"])
    if ENVIRONMENT == "production":
        validate_database(runtime_url, TARGET["host"])
        result = command(["bun", "scripts/production/cloud-run-migration.ts", "--check", "--source-metadata", "scripts/production/cloud-run-source.json"], "Read-only production database gate",
                env={**os.environ, "DATABASE_URL": runtime_url, "NEON_BRANCH_ID": TARGET["branch"],
                     "NEON_EXPECTED_HOST": TARGET["host"], "NEON_EXPECTED_DATABASE": "neondb"})
        require(json.loads(result).get("state") == "already complete", "Production database migration and history cutover must be complete before deployment.")
        return
    validate_database(runtime_url, STAGING["host"])
    require(urlsplit(runtime_url).scheme == "postgresql" and urlsplit(runtime_url).username == "zyx_staging_app_20261115",
            "The staged runtime database URL must use the dedicated application role.")
    check = read_secret({
        "name": SECRET_PREFIX + "preflight-database-url",
        "key": os.environ["CLOUD_RUN_PREFLIGHT_DATABASE_VERSION"],
    })
    validate_database(check, STAGING["host"])
    require(urlsplit(check).username == "zyx_staging_web_preflight", "Staging preflight URL must use the read-only role.")
    for mode, url in (("journal", check), ("runtime", runtime_url)):
        command(["bun", "scripts/cloud-run/check-staging.ts", mode], "Read-only staging database gate",
                env={**os.environ, "CLOUD_RUN_PREFLIGHT_DATABASE_URL": url}, capture=False)


def prepare():
    require(os.environ.get("GITHUB_REPOSITORY") == "soezyxstt/zyxacademy"
            and os.environ.get("GITHUB_REF") == ("refs/heads/main" if ENVIRONMENT == "production" else "refs/heads/staging")
            and os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch", "Only manual releases from the selected environment branch are supported.")
    sha = os.environ["GITHUB_SHA"]
    require(COMMIT_SHA.fullmatch(sha) and command(["git", "rev-parse", "HEAD"], "Read checkout") == sha,
            "Cloud Run checkout does not match the dispatched SHA.")
    operation, revision = os.environ["CLOUD_RUN_OPERATION"], os.environ["CLOUD_RUN_REVISION"]
    require(operation in ("candidate", "promote", "rollback"), "Unknown Cloud Run operation.")
    if operation == "candidate":
        require(not revision, "Candidate operation derives its own exact revision.")
    else:
        require(REVISION.fullmatch(revision), "An exact revision is required for traffic changes.")
    require(re.fullmatch(r"projects/[1-9][0-9]*/locations/global/workloadIdentityPools/[a-z0-9-]+/providers/[a-z0-9-]+",
                         os.environ["CLOUD_RUN_WORKLOAD_IDENTITY_PROVIDER"]),
            "Configure CLOUD_RUN_STAGING_WORKLOAD_IDENTITY_PROVIDER in the staging-cloud-run GitHub environment.")
    require(ENVIRONMENT == "production" or VERSION.fullmatch(os.environ.get("CLOUD_RUN_PREFLIGHT_DATABASE_VERSION", "")),
            "Configure CLOUD_RUN_STAGING_PREFLIGHT_DATABASE_VERSION in the staging-cloud-run GitHub environment.")
    raw_config = os.environ.get("CLOUD_RUN_PUBLIC_CONFIG")
    if ENVIRONMENT == "production" and operation != "candidate":
        data, _ = check_revision(revision)
        raw_config = json.dumps({entry["name"]: entry["value"]
                                 for entry in data["spec"]["containers"][0].get("env", [])
                                 if is_build_key(entry["name"])})
    config = public_config(raw_config)
    (Path(os.environ["RUNNER_TEMP"]) / "cloud-run-public.json").write_text(json.dumps(config), encoding="utf-8")
    return config


def is_ready(resource):
    return any(item.get("type") == "Ready" and item.get("status") == "True"
               for item in resource["status"].get("conditions", []))


def traffic(service):
    return {item["revisionName"]: int(item["percent"]) for item in service["status"].get("traffic", [])
            if item.get("percent", 0)}


def check_revision(revision):
    data = json.loads(run("revisions", "describe", revision, "--format=json"))
    labels = data["metadata"]["labels"]
    require(data["metadata"]["name"] == revision
            and labels["serving.knative.dev/service"] == SERVICE
            and COMMIT_SHA.fullmatch(labels.get(SOURCE_LABEL, ""))
            and is_ready(data), "Cloud Run revision identity or readiness mismatch.")
    image = data["spec"]["containers"][0]["image"]
    prefix, _, digest = image.partition("@")
    resolved = data["status"].get("imageDigest", "")
    require(prefix == IMAGE and DIGEST.fullmatch(digest) and resolved in (image, digest),
            "Cloud Run revision does not resolve to the staging registry image digest.")
    return data, image


def read_tag(service, tag, revision):
    matching = [entry for entry in service["status"]["traffic"]
                if entry.get("tag") == tag and entry.get("revisionName") == revision]
    require(len(matching) == 1, "Cloud Run revision does not have the expected verification tag.")
    return matching[0]["url"]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def smoke(url, refs):
    require(re.fullmatch(r"https://[a-z0-9-]+\.(?:[a-z0-9-]+\.)?run\.app", url),
            "Invalid Cloud Run smoke target.")
    token = read_secret(refs[ORIGIN_TOKEN])
    require(re.fullmatch(r"[A-Za-z0-9_-]{43,}", token), "Invalid Cloud Run origin token.")
    opener = build_opener(NoRedirect())

    def request(path, expected, headers=None, method="GET"):
        try:
            response = opener.open(Request(url + path, headers=headers or {}, method=method), timeout=60)
        except HTTPError as error:
            response = error
        with response:
            require(response.status == expected, f"Unexpected HTTP status at {path}: {response.status}.")
            return response.read(2_000_000).decode("utf-8", errors="replace"), response.headers

    request("/", 403, {"X-Forwarded-Host": urlsplit(TARGET["origin"]).hostname, "X-Forwarded-Proto": "https"})
    headers = {"X-Zyx-Origin-Token": token}
    home, _ = request("/", 200, headers)
    require("<html" in home.lower(), "Cloud Run did not return the application landing page.")
    static = re.search(r'["\'](/_next/static/[-a-zA-Z0-9_./]+\.js(?:\?dpl=[-a-zA-Z0-9]+)?)["\']', home)
    require(static, "No standalone static JavaScript chunk found.")
    _, asset_headers = request(static.group(1), 200, headers, method="HEAD")
    require("immutable" in asset_headers.get("Cache-Control", ""), "Static JavaScript cache policy is missing.")
    session, _ = request("/api/auth/get-session", 200, headers)
    require(json.loads(session) is None, "Anonymous Better Auth session must be empty.")
    _, attachment_headers = request("/api/storage/file/zyx-attachments/2099-01-01/cloud-run-smoke.png", 404, headers)
    require("no-store" in attachment_headers.get("Cache-Control", ""), "Private file denial must not be cached.")
    request("/api/storage/file/courses/cloud-run-smoke/diktats/untitled.pdf", 404, headers)
    request("/cloud-run-smoke-missing-page", 404, headers)


def pushed_image(tagged_image, push_output):
    repository, separator, tag = tagged_image.rpartition(":")
    require(repository == IMAGE and separator and tag, "Invalid Cloud Run image push target.")
    digests = re.findall(rf"^{re.escape(tag)}: digest: ({DIGEST.pattern}) size: [0-9]+$", push_output, re.MULTILINE)
    require(len(digests) == 1, "Artifact Registry push did not publish exactly one digest for the release tag.")
    return f"{repository}@{digests[0]}"


def candidate_tag(run_id, attempt):
    tag = f"c-{run_id}-{attempt}"
    require(len(tag) + len(SERVICE) <= 46, "Cloud Run traffic tag and service name exceed 46 characters.")
    return tag


def candidate(config, before):
    sha = os.environ["GITHUB_SHA"]
    run_id, attempt = os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"]
    revision = f"{SERVICE}-r{run_id}a{attempt}"
    require(REVISION.fullmatch(revision), "Invalid GitHub run identity.")
    tag = candidate_tag(run_id, attempt)
    repository = json.loads(gcloud("artifacts", "repositories", "describe", REPOSITORY,
                                   "--location", REGION, "--format=json"))
    require(repository["format"] == "DOCKER", "Cloud Run staging requires a Docker repository.")
    gcloud("auth", "configure-docker", REGISTRY)
    tagged_image = f"{IMAGE}:{sha}-{run_id}-{attempt}"
    command(["docker", "tag", f"zyx-{ENVIRONMENT}-web:{sha}", tagged_image], "Tag release image")
    push_output = command(["docker", "push", tagged_image], "Push Cloud Run image")
    image = pushed_image(tagged_image, push_output)
    provider = os.environ.get("QUEUE_PROVIDER", "inngest")
    require(provider in ("inngest", "cloud-tasks"), "Invalid candidate queue provider.")
    runtime_args = ["--update-env-vars", f"QUEUE_PROVIDER={provider}"]
    if ENVIRONMENT == "production":
        directory = Path(os.environ["RUNNER_TEMP"])
        runtime_args = ["--env-vars-file", str(directory / "cloud-run-runtime.json"),
                        "--set-secrets", (directory / "cloud-run-secret-refs.txt").read_text(),
                        "--service-account", RUNTIME_ACCOUNT]
    run("deploy", SERVICE, "--image", image, *runtime_args, "--no-traffic", "--tag", tag, "--revision-suffix", f"r{run_id}a{attempt}",
        "--labels", f"{SOURCE_LABEL}={sha},environment={ENVIRONMENT}",
        "--execution-environment=gen2", "--cpu=1", "--memory=1Gi", "--min=0", "--max=1",
        "--min-instances=0", "--max-instances=1", "--concurrency=8", "--cpu-throttling",
        "--no-cpu-boost", "--timeout=300", "--port=8080")
    after = describe_service()
    require(traffic(before) == traffic(after) and revision not in traffic(after),
            "Unexpected staging traffic change during candidate release.")
    data, actual = check_revision(revision)
    require(actual == image and data["metadata"]["labels"][SOURCE_LABEL] == sha,
            "Deployed revision does not match the published image and source commit.")
    url = read_tag(after, tag, revision)
    smoke(url, validate_template(data["spec"], config))
    summarize("Verified staging candidate", revision, image, url, traffic(before))


def summarize(title, revision, image, url, previous):
    with (Path(os.environ["GITHUB_STEP_SUMMARY"])).open("a", encoding="utf-8") as out:
        out.write(f"\n### {title}\n\n"
                  f"- Project `{PROJECT}`, region `{REGION}`, service `{SERVICE}`\n"
                  f"- Dispatch SHA `{os.environ['GITHUB_SHA']}`\n"
                  f"- Revision `{revision}`\n"
                  f"- Image `{image}`\n"
                  f"- Smoke endpoint {url}\n"
                  f"- Previous traffic `{json.dumps(previous, sort_keys=True)}`\n")


def change_traffic(config, before, operation):
    revision = os.environ["CLOUD_RUN_REVISION"]
    identity = REVISION.fullmatch(revision)
    run_id, attempt = identity.groups()
    tag = candidate_tag(run_id, attempt) if operation == "promote" else "rollback"
    data, image = check_revision(revision)
    if operation == "promote":
        require(data["metadata"]["labels"][SOURCE_LABEL] == os.environ["GITHUB_SHA"],
                "Promotion requires a candidate built from the dispatched SHA.")
    refs = validate_template(data["spec"], config)
    verify_database(refs)
    smoke(read_tag(before, tag, revision), refs)
    previous = traffic(before)
    require(traffic(describe_service()) == previous, "Traffic changed during verification. Retry after review.")
    require(len(previous) == 1 and list(previous.values()) == [100],
            "Cloud Run staging expects a single serving revision for rollback.")
    current = next(iter(previous))
    require(current != revision, "Requested revision already serves staging.")
    args = ["services", "update-traffic", SERVICE, f"--to-revisions={revision}=100"]
    if REVISION.fullmatch(current):
        args.append(f"--update-tags=rollback={current}")
    run(*args)
    after = describe_service()
    require(traffic(after) == {revision: 100}, "Cloud Run staging traffic readback mismatch.")
    try:
        smoke(after["status"]["url"], refs)
    except (ValueError, OSError):
        require(traffic(describe_service()) == {revision: 100},
                "Post-switch smoke failed and traffic changed externally. Inspect live routing.")
        run("services", "update-traffic", SERVICE, f"--to-revisions={current}=100")
        require(traffic(describe_service()) == previous, "Failed to restore prior Cloud Run traffic.")
        sys.exit("Post-switch smoke failed. Previous Cloud Run traffic was restored.")
    summarize("Updated staging traffic", revision, image, after["status"]["url"], previous)


def release():
    config = prepare()
    before = describe_service()
    require(is_ready(before), "Pre-provisioned Cloud Run staging service is not ready.")
    operation = os.environ["CLOUD_RUN_OPERATION"]
    if operation == "candidate":
        spec = (json.loads((Path(os.environ["RUNNER_TEMP"]) / "cloud-run-spec.json").read_text())
                if ENVIRONMENT == "production" else before["spec"]["template"]["spec"])
        refs = validate_template(spec, config)
        verify_database(refs)
        candidate(config, before)
    else:
        change_traffic(config, before, operation)


def verify_model_catalog(spec, refs):
    catalog_keys = AI_PROVIDER_SETTINGS | {"ZYX_ENVIRONMENT", "BETTER_AUTH_URL"}
    runtime = {item["name"]: item["value"] for item in spec["containers"][0]["env"]
               if item["name"] in catalog_keys and "value" in item}
    runtime.update({key: read_secret(refs[key]) for key in ("CF_AI_GATEWAY_URL", "CF_AI_GATEWAY_TOKEN")})
    probe = subprocess.run(["bun", "scripts/production/check-text-model-catalog.ts"],
                           env={**os.environ, **runtime}, capture_output=True, text=True, check=False)
    counts = json.loads(probe.stdout)
    require(set(counts) == {"openai", "muse"} and all(count is None or type(count) is int and count >= 0 for count in counts.values()),
            "Unexpected production model catalog probe result.")
    for provider, count in counts.items():
        print(f"Production {provider} model catalog: {count if count is not None else 'disabled'}", flush=True)
    require(probe.returncode == 0, "Production OpenAI or Muse model discovery failed.")


def preflight():
    require(ENVIRONMENT == "production", "Production preflight requires an explicit environment.")
    config = prepare()
    spec = json.loads((Path(os.environ["RUNNER_TEMP"]) / "cloud-run-spec.json").read_text())
    refs = validate_template(spec, config)
    verify_database(refs)
    verify_model_catalog(spec, refs)


if __name__ == "__main__":
    try:
        {"prepare": prepare, "preflight": preflight, "release": release}[sys.argv[1]]()
    except (ValueError, KeyError, IndexError, OSError) as error:
        # URL/JSON exceptions and subprocess output may contain runtime data.
        sys.exit(str(error) if type(error) is ValueError else "Cloud Run staging operation failed. Check its prerequisites.")
