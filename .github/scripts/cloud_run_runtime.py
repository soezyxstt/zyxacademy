"""Prepare Cloud Run runtime settings without putting credentials in an image."""
import json
import os
from pathlib import Path
from urllib.parse import parse_qsl, urlparse


# CI credentials, deployment tokens, build-only switches and mutation opt-ins
# deliberately do not belong to the application runtime.
RUNTIME_KEYS = set("""
DATABASE_URL TURSO_DATABASE_URL TURSO_CONNECTION_URL TURSO_AUTH_TOKEN
BETTER_AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN
RESEND_API_KEY WHATSAPP_ADMIN_NUMBER GEMINI_API_KEY GEMINI_API_KEY_2 GEMINI_API_KEY_3
GEMINI_API_KEY_4 GEMINI_PROJECT_ALIAS_1 GEMINI_PROJECT_ALIAS_2 GEMINI_PROJECT_ALIAS_3
GEMINI_PROJECT_ALIAS_4 INNGEST_EVENT_KEY INNGEST_SIGNING_KEY INNGEST_ENV
R2_ENDPOINT R2_BUCKET R2_PUBLIC_URL R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY STORAGE_PROVIDER_MODE
NEON_STORAGE_BUCKET AWS_ENDPOINT_URL_S3 AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
CF_ACCOUNT_ID CF_API_TOKEN CF_BROWSER_API_TOKEN CF_AI_GATEWAY_URL CF_AI_GATEWAY_TOKEN CF_KV_NAMESPACE_ID
VECTORIZE_WORKER_URL VECTORIZE_SHARED_SECRET VECTOR_SYNC_BATCH_SIZE
DIKTAT_RENDERER_URL DIKTAT_RENDERER_SECRET AUTHORING_VERIFICATION_RENDERER_URL
AUTHORING_VERIFICATION_RENDERER_SECRET AUTHORING_VERIFICATION_ACCESS_URL AUTHORING_VERIFICATION_BROWSER_PROVIDER
AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION STEEL_API_KEY CODING_BROWSER_PROVIDER
PYTHON_RUNTIME_TOKEN_SECRET
COMPUTE_SERVICE_URL COMPUTE_SERVICE_SECRET ZYRA_CONTROL_PLANE_URL ZYRA_CONTROL_PLANE_TOKEN
LIVE_HMAC_SECRET CRON_SECRET STAGING_ZYRA_PEDAGOGY_USER_ID
FEATURE_PKA FEATURE_LIVE FEATURE_REFLECTION_EMAIL FEATURE_DIKTAT_AI
FEATURE_ZYRA_IMAGE_INPUT_V1 FEATURE_ZYRA_SEMANTIC_CACHE_V1 FEATURE_DRIVE_EDITOR_SYNC
FEATURE_STRUCTURED_ARTICLE_READER_V1 FIREBASE_SERVICE_ACCOUNT_JSON
GA_PROPERTY_ID GA_CLIENT_EMAIL GA_PRIVATE_KEY
SENTRY_ORG SENTRY_PROJECT SENTRY_PUBLIC_KEY SENTRY_OTLP_TRACES_URL SENTRY_VERCEL_LOG_DRAIN_URL
NEXT_PUBLIC_APP_URL NEXT_PUBLIC_SENTRY_DSN NEXT_PUBLIC_DESMOS_API_KEY
NEXT_PUBLIC_WHATSAPP_NUMBER NEXT_PUBLIC_REALTIME_URL NEXT_PUBLIC_BRAND_EMAIL
NEXT_PUBLIC_BRAND_INSTAGRAM NEXT_PUBLIC_BRAND_TIKTOK NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST NEXT_PUBLIC_FEATURE_ZYRA_IMAGE_INPUT_V1
NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID NEXT_PUBLIC_FIREBASE_VAPID_KEY
""".split())
ALIASES = {"R2_BUCKET": "CF_R2_BUCKET", "R2_ACCESS_KEY_ID": "CF_R2_ACCESS_KEY_ID",
           "R2_SECRET_ACCESS_KEY": "CF_R2_SECRET_ACCESS_KEY",
           "VECTORIZE_SHARED_SECRET": "VECTORIZE_WORKER_SECRET"}
REQUIRED = ("DATABASE_URL", "STORAGE_PROVIDER_MODE", "NEON_STORAGE_BUCKET", "AWS_ENDPOINT_URL_S3",
            "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "GEMINI_API_KEY", "INNGEST_EVENT_KEY")


def validate_database(database, expected_host):
    parsed = urlparse(database)
    parameters = parse_qsl(parsed.query, keep_blank_values=True)
    if (parsed.scheme not in ("postgres", "postgresql") or not expected_host
            or not expected_host.endswith(".neon.tech") or parsed.hostname != expected_host
            or parsed.path != "/neondb" or parsed.fragment or parsed.port not in (None, 5432)
            or len(parameters) != len(dict(parameters))
            or any(key not in ("sslmode", "channel_binding", "application_name", "connect_timeout") for key, _ in parameters)
            or dict(parameters).get("sslmode") != "verify-full"):
        raise ValueError("GitHub staging must provide the exact expected Neon PostgreSQL target.")


def validate_staging_target(settings, variables):
    validate_database(settings.get("DATABASE_URL", ""), variables.get("NEON_EXPECTED_HOST", ""))
    endpoint = settings.get("AWS_ENDPOINT_URL_S3", "")
    parsed = urlparse(endpoint)
    region = settings.get("AWS_REGION", "")
    if (settings.get("STORAGE_PROVIDER_MODE") != "neon"
            or not variables.get("NEON_EXPECTED_STORAGE_ENDPOINT")
            or endpoint != variables["NEON_EXPECTED_STORAGE_ENDPOINT"]
            or not variables.get("NEON_EXPECTED_STORAGE_BUCKET")
            or settings.get("NEON_STORAGE_BUCKET") != variables["NEON_EXPECTED_STORAGE_BUCKET"]
            or parsed.scheme != "https" or not region
            or not (parsed.hostname or "").endswith("." + region + ".aws.neon.tech")
            or ".storage." not in (parsed.hostname or "")
            or parsed.username or parsed.password or parsed.port
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("GitHub staging must provide the exact expected Neon storage target.")


def prepare_runtime(service, secrets, variables, origin):
    parsed = urlparse(origin)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment
            or parsed.hostname in ("zyxacademy.com", "www.zyxacademy.com", "zyx.academy")):
        raise ValueError("A staging HTTPS build origin is required.")
    spec = service.get("spec", {}).get("template", {}).get("spec", {})
    containers = spec.get("containers", [])
    if len(containers) != 1:
        raise ValueError("Staging must have one web container.")
    existing = {item["name"]: item for item in containers[0].get("env", [])}
    if existing.get("ZYX_ENVIRONMENT", {}).get("value") not in (None, "", "staging"):
        raise ValueError("Refusing to overwrite a non-staging environment.")

    incoming = {}
    if variables.get("DATABASE_URL") and variables["DATABASE_URL"] != secrets.get("DATABASE_URL"):
        raise ValueError("Staging database variable conflicts with the shared web and worker secret.")
    for name in RUNTIME_KEYS:
        value = variables.get(name) or secrets.get(name)
        if not value and name in ALIASES:
            value = variables.get(ALIASES[name]) or secrets.get(ALIASES[name])
        if isinstance(value, str) and value != "":
            incoming[name] = value
    incoming["DATABASE_URL"] = secrets.get("DATABASE_URL", "")
    validate_database(incoming["DATABASE_URL"], variables.get("NEON_EXPECTED_HOST", ""))
    incoming.update(NODE_ENV="production", ZYX_ENVIRONMENT="staging", ZYX_MCP_ENVIRONMENT="staging",
                    BETTER_AUTH_URL=origin.rstrip("/"), NEXT_PUBLIC_APP_URL=origin.rstrip("/"))
    incoming.setdefault("AUTHORING_VERIFICATION_BROWSER_PROVIDER", "cloudflare")
    merged = {**existing, **{key: {"name": key, "value": value} for key, value in incoming.items()}}
    validate_staging_target({key: item.get("value", "") for key, item in merged.items()}, variables)
    merged.pop("SKIP_ENV_VALIDATION", None)
    # Never propagate CI-only secrets, including anything accidentally set manually.
    for name in ("GCP_SERVICE_ACCOUNT_KEY", "GITHUB_TOKEN", "VERCEL_TOKEN", "DENO_DEPLOY_TOKEN"):
        merged.pop(name, None)
    for key in REQUIRED:
        item = merged.get(key, {})
        if not item.get("value") and not item.get("valueFrom", {}).get("secretKeyRef"):
            raise ValueError("Missing required GitHub staging runtime setting: " + key)
    plain, refs = {}, []
    for key, item in sorted(merged.items()):
        if "value" in item:
            plain[key] = item["value"]
        elif item.get("valueFrom", {}).get("secretKeyRef"):
            ref = item["valueFrom"]["secretKeyRef"]
            refs.append(f"{key}={ref['name']}:{ref['key']}")
    return plain, refs


def main():
    import sys
    try:
        service = json.loads(Path(sys.argv[1]).read_text())
        secrets = json.loads(os.environ["GITHUB_STAGING_SECRETS"])
        variables = json.loads(os.environ.get("GITHUB_STAGING_VARS", "{}"))
        if not isinstance(secrets, dict) or not isinstance(variables, dict):
            raise ValueError("Invalid GitHub staging settings.")
        plain, refs = prepare_runtime(service, secrets, variables, os.environ["CLOUD_RUN_BUILD_ORIGIN"])
        for name, contents in (("runtime.json", json.dumps(plain)), ("secret-refs.txt", ",".join(refs))):
            path = Path(sys.argv[2]) / name
            with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as output:
                output.write(contents)
        print("Staging runtime settings prepared from GitHub; values were not printed.")
    except (ValueError, KeyError) as error:
        # JSON errors must not include source material from the secret payload.
        message = str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError) else "Invalid GitHub staging runtime configuration."
        sys.exit(message)


if __name__ == "__main__":
    main()
