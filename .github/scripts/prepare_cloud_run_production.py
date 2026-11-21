"""Prepare production settings without printing credential values."""
import json
import os
import re
from pathlib import Path
import subprocess
import sys

from cloud_run_runtime import ALIASES, RUNTIME_KEYS
from prepare_worker_runtime import prepare_worker_runtime
from deploy_cloud_run_staging import (
    BLOCKED_KEYS, ENVIRONMENT, ORIGIN_TOKEN, PLAIN_RUNTIME_KEYS, PROJECT, RUNTIME_ACCOUNT,
    SECRET_PREFIX, TARGET, is_build_key, public_config, require,
)


def settings(secrets, variables):
    require(ENVIRONMENT == "production", "Explicit production environment is required.")
    source = {**secrets, **{key: value for key, value in variables.items() if value}}
    validated = prepare_worker_runtime("production", secrets, {**variables, "QUEUE_PROVIDER": "cloud-tasks"})
    # Worker-only Vectorize writer credentials must not replace web retrieval settings.
    values = {key: value for key, value in validated.items() if key not in BLOCKED_KEYS | {"VECTORIZE_WORKER_URL", "VECTORIZE_SHARED_SECRET"}}
    for key in ("VECTORIZE_WORKER_URL", "VECTORIZE_SHARED_SECRET"):
        value = source.get(key) or source.get(ALIASES.get(key, ""))
        if value:
            values[key] = value
    values.pop("NEXT_PUBLIC_STAGING_MEDIA_ORIGIN", None)
    public = public_config(json.dumps({key: value for key, value in values.items() if is_build_key(key)}))
    return values, public


def cli(*args, value=None, strip=True):
    result = subprocess.run(["gcloud", "--quiet", "--project", PROJECT, *args],
                            input=value, capture_output=True, text=True)
    require(result.returncode == 0, "Production runtime configuration command failed: " + " ".join(args[:3]))
    return result.stdout.strip() if strip else result.stdout


def secret_version(key, value=None):
    name = SECRET_PREFIX + key.lower().replace("_", "-")
    versions = json.loads(cli("secrets", "versions", "list", name, "--filter=state=ENABLED", "--format=json"))
    if versions:
        latest = max(versions, key=lambda entry: int(entry["name"].rsplit("/", 1)[1]))["name"].rsplit("/", 1)[1]
        if value is None or cli("secrets", "versions", "access", latest, "--secret", name, strip=False) == value:
            return {"name": name, "key": latest}
    require(value is not None, "Production origin credential must be provisioned before release.")
    version = cli("secrets", "versions", "add", name, "--data-file=-", "--format=value(name)", value=value).rsplit("/", 1)[1]
    require(version.isdigit(), "Secret Manager did not return a numeric version.")
    return {"name": name, "key": version}


def write_private(path, value):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as output:
        output.write(value)


def main():
    require((os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_REF"), os.environ.get("GITHUB_EVENT_NAME")) ==
            ("soezyxstt/zyxacademy", "refs/heads/main", "workflow_dispatch"), "Only explicit production releases are supported.")
    values, public = settings(json.loads(os.environ["GITHUB_RUNTIME_SECRETS"]), json.loads(os.environ["GITHUB_RUNTIME_VARS"]))
    plain, refs = {}, {}
    for key, value in sorted(values.items()):
        if key in PLAIN_RUNTIME_KEYS or is_build_key(key) or key.startswith("FEATURE_"):
            plain[key] = value
        else:
            require(key in RUNTIME_KEYS, "Unsupported production runtime key.")
            refs[key] = secret_version(key, value)
    refs[ORIGIN_TOKEN] = secret_version(ORIGIN_TOKEN)
    env = [{"name": key, "value": value} for key, value in plain.items()] + [
        {"name": key, "valueFrom": {"secretKeyRef": ref}} for key, ref in refs.items()]
    spec = {"serviceAccountName": RUNTIME_ACCOUNT, "containers": [{"env": env}]}
    directory = Path(os.environ["RUNNER_TEMP"])
    write_private(directory / "cloud-run-public.json", json.dumps(public))
    write_private(directory / "cloud-run-runtime.json", json.dumps(plain))
    write_private(directory / "cloud-run-secret-refs.txt", ",".join(f"{key}={ref['name']}:{ref['key']}" for key, ref in refs.items()))
    write_private(directory / "cloud-run-spec.json", json.dumps(spec))
    print("Prepared pinned production settings; credential values were not printed.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        code = str(error)
        if isinstance(error, ValueError) and re.fullmatch(r"WORKER_[A-Z_]+(?::[A-Z_]+)?", code):
            sys.exit(code)
        sys.exit("Production runtime preparation failed. Check the production environment and provisioned secret permissions.")
