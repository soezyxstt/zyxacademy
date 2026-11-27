"""Prepare private Neon worker settings from one explicit GitHub environment."""
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

from cloud_run_runtime import ALIASES, REQUIRED, RUNTIME_KEYS, validate_database
from staging_authoring_browser import staging_browser_settings


TARGETS = {
    "production": {
        "host": "ep-quiet-math-azyey0mb-pooler.c-3.ap-southeast-1.aws.neon.tech",
        "branch": "br-wandering-butterfly-azi11h8r",
        "bucket": "zyx-production",
        "origin": "https://www.zyxacademy.com",
        "inngest": "production-1bedaa8a",
        "renderer": "https://zyx-diktat-renderer.16922204.workers.dev",
    },
    "staging": {
        "host": "ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech",
        "branch": "br-gentle-scene-azq0gp91",
        "bucket": "zyx-staging",
        "origin": "https://staging.zyxacademy.com",
        "inngest": "staging-40f1da25",
        "renderer": "https://zyx-diktat-renderer-staging.16922204.workers.dev",
    },
}
EXPO_IOS_APNS_KEYS = tuple(f"APNS_EXPO_IOS_{environment}_{field}"
                          for environment in ("DEVELOPMENT", "PRODUCTION")
                          for field in ("KEY_ID", "TEAM_ID", "PRIVATE_KEY"))
CI_KEYS = {"NEON_API_KEY", "GITHUB_TOKEN", "VERCEL_TOKEN", "GCP_SERVICE_ACCOUNT_KEY",
           "SKIP_ENV_VALIDATION"}


def prepare_worker_runtime(environment, secrets, variables):
    if environment not in TARGETS:
        raise ValueError("WORKER_ENVIRONMENT_REQUIRED")
    if not isinstance(secrets, dict) or not isinstance(variables, dict):
        raise ValueError("WORKER_SETTINGS_INVALID")
    target = TARGETS[environment]
    for source in (secrets, variables):
        for marker in ("ZYX_ENVIRONMENT", "ZYX_MCP_ENVIRONMENT"):
            if source.get(marker) not in (None, "", environment):
                raise ValueError("WORKER_ENVIRONMENT_MISMATCH")
        if source.get("NEXT_PUBLIC_APP_URL") not in (None, "", target["origin"], target["origin"] + "/"):
            raise ValueError("WORKER_APP_ORIGIN_MISMATCH")
    if variables.get("DATABASE_URL") and variables["DATABASE_URL"] != secrets.get("DATABASE_URL"):
        raise ValueError("WORKER_DATABASE_CREDENTIALS_CONFLICT")

    settings = {}
    keys = RUNTIME_KEYS | {name for name in secrets.keys() | variables.keys() if name.startswith("FEATURE_")}
    for name in keys - CI_KEYS:
        value = variables.get(name) or secrets.get(name)
        if not value and name in ALIASES:
            value = variables.get(ALIASES[name]) or secrets.get(ALIASES[name])
        if value is not None and value != "":
            if not isinstance(value, str):
                raise ValueError("WORKER_SETTING_TYPE_INVALID")
            settings[name] = value
    if settings.get("QUEUE_PROVIDER", "inngest") not in ("inngest", "cloud-tasks"):
        raise ValueError("WORKER_QUEUE_PROVIDER_INVALID")
    settings["DATABASE_URL"] = secrets.get("DATABASE_URL", "")
    try:
        validate_database(settings["DATABASE_URL"], target["host"])
        if urlparse(settings["DATABASE_URL"]).scheme != "postgresql":
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError("WORKER_DATABASE_TARGET_MISMATCH") from None

    endpoint = f"https://{target['branch']}.storage.c-3.ap-southeast-1.aws.neon.tech"
    if (settings.get("STORAGE_PROVIDER_MODE") != "neon"
            or settings.get("AWS_REGION") != "ap-southeast-1"
            or settings.get("NEON_STORAGE_BUCKET") != target["bucket"]
            or settings.get("AWS_ENDPOINT_URL_S3") not in (endpoint, endpoint + "/")):
        raise ValueError("WORKER_STORAGE_TARGET_MISMATCH")
    settings.setdefault("INNGEST_ENV", target["inngest"])
    if settings.get("INNGEST_ENV") != target["inngest"]:
        raise ValueError("WORKER_INNGEST_ENV_MISMATCH")
    if settings.get("DIKTAT_RENDERER_URL") not in (target["renderer"], target["renderer"] + "/"):
        raise ValueError("WORKER_PDF_RENDERER_MISMATCH")
    for name in (*REQUIRED, "INNGEST_SIGNING_KEY", "COMPUTE_SERVICE_SECRET", "DIKTAT_RENDERER_SECRET", "CF_ACCOUNT_ID"):
        if settings.get("QUEUE_PROVIDER") == "cloud-tasks" and name in ("INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"):
            continue
        value = settings.get(name)
        if not value or not value.strip() or value == "[SENSITIVE]":
            raise ValueError("WORKER_SETTING_REQUIRED:" + name)
    if not settings.get("CF_BROWSER_API_TOKEN") and not settings.get("CF_API_TOKEN"):
        raise ValueError("WORKER_BROWSER_TOKEN_REQUIRED")
    writer_url = variables.get("BACKGROUND_VECTORIZE_WORKER_URL") or secrets.get("BACKGROUND_VECTORIZE_WORKER_URL")
    writer_secret = secrets.get("BACKGROUND_VECTORIZE_SHARED_SECRET")
    if writer_url or writer_secret:
        if (environment != "production"
                or writer_url != "https://zyx-vector-api-background.16922204.workers.dev"
                or not isinstance(writer_secret, str) or not writer_secret.strip() or writer_secret == "[SENSITIVE]"):
            raise ValueError("WORKER_VECTOR_WRITER_TARGET_MISMATCH")
        settings.update(VECTORIZE_WORKER_URL=writer_url, VECTORIZE_SHARED_SECRET=writer_secret)
    settings.update(NODE_ENV="production", ZYX_ENVIRONMENT=environment, ZYX_MCP_ENVIRONMENT=environment,
                    NEXT_PUBLIC_APP_URL=target["origin"], BETTER_AUTH_URL=target["origin"],
                    COMPUTE_SERVICE_URL=f"https://{target['branch']}-zyxcompute.compute.c-3.ap-southeast-1.aws.neon.tech",
                    AUTHORING_VERIFICATION_BROWSER_PROVIDER="cloudflare")
    if environment == "staging":
        for key in EXPO_IOS_APNS_KEYS:
            value = secrets.get(key) if key.endswith("_PRIVATE_KEY") else variables.get(key) or secrets.get(key)
            if value:
                if not isinstance(value, str):
                    raise ValueError("STAGING_EXPO_IOS_APNS_VALUE_INVALID")
                settings[key] = value
        steel_key = secrets.get("STEEL_API_KEY")
        if not isinstance(steel_key, str) or not steel_key.strip() or steel_key == "[SENSITIVE]":
            raise ValueError("WORKER_STEEL_API_KEY_REQUIRED")
        settings["STEEL_API_KEY"] = steel_key
        settings.update(staging_browser_settings())
    if settings.keys() & CI_KEYS:
        raise ValueError("WORKER_CI_CREDENTIAL_LEAK")
    return settings


def main():
    try:
        environment = os.environ.get("GITHUB_ENVIRONMENT_NAME")
        secrets = json.loads(os.environ["GITHUB_RUNTIME_SECRETS"])
        variables = json.loads(os.environ["GITHUB_RUNTIME_VARS"])
        if environment == "production" and os.environ.get("REUSE_PRODUCTION_WEB_RUNTIME") == "1":
            from prepare_cloud_run_production import current_runtime
            from deploy_cloud_run_staging import read_secret

            if os.environ.get("GITHUB_REF") != "refs/heads/main":
                raise ValueError("WORKER_PRODUCTION_BRANCH_REQUIRED")
            _, current, refs = current_runtime()
            variables["QUEUE_PROVIDER"] = current.get("QUEUE_PROVIDER", {}).get("value", "inngest")
            for name in ("DATABASE_URL", "COMPUTE_SERVICE_SECRET", "BETTER_AUTH_SECRET"):
                if name not in refs:
                    raise ValueError("WORKER_PRODUCTION_WEB_SECRET_REQUIRED:" + name)
                secrets[name] = read_secret(refs[name])
        settings = prepare_worker_runtime(environment, secrets, variables)
        path = Path(sys.argv[1])
        path.parent.mkdir(parents=True, exist_ok=True)
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as output:
            json.dump({"environment": settings, "sourceRevision": os.environ.get("GITHUB_SHA")}, output)
        if os.environ.get("GITHUB_OUTPUT"):
            with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
                output.write(f"queue_provider={settings.get('QUEUE_PROVIDER', 'inngest')}\n")
        print("Verified worker settings prepared; values were not printed.")
    except (KeyError, ValueError, IndexError) as error:
        message = str(error) if isinstance(error, ValueError) and str(error).startswith("WORKER_") else "WORKER_SETTINGS_INVALID"
        raise SystemExit(message) from None


if __name__ == "__main__":
    main()
