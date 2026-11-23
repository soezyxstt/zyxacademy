"""Prepare production settings without printing credential values."""
import json
import os
import re
from pathlib import Path
import subprocess
import sys

from cloud_run_runtime import ALIASES, RUNTIME_KEYS, validate_database
from prepare_worker_runtime import prepare_worker_runtime
from deploy_cloud_run_staging import (
    BLOCKED_KEYS, ENVIRONMENT, ORIGIN_TOKEN, PLAIN_RUNTIME_KEYS, PROJECT, RUNTIME_ACCOUNT,
    SECRET_PREFIX, TARGET, VERSION, check_revision, describe_service, is_build_key,
    public_config, read_secret, require, traffic,
)


def settings(secrets, variables, database_url=None, queue_provider="cloud-tasks"):
    require(ENVIRONMENT == "production", "Explicit production environment is required.")
    if database_url is not None:
        secrets = {**secrets, "DATABASE_URL": database_url}
    source = {**secrets, **{key: value for key, value in variables.items() if value}}
    validated = prepare_worker_runtime("production", secrets, {**variables, "QUEUE_PROVIDER": queue_provider})
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


def current_runtime():
    serving = traffic(describe_service())
    require(len(serving) == 1 and list(serving.values()) == [100],
            "Production runtime requires one serving revision at 100%.")
    revision = next(iter(serving))
    data, _ = check_revision(revision)
    require(data["spec"].get("serviceAccountName") == RUNTIME_ACCOUNT, "Production runtime account mismatch.")
    entries = {entry["name"]: entry for entry in data["spec"]["containers"][0].get("env", [])}
    refs = {key: entry["valueFrom"]["secretKeyRef"] for key, entry in entries.items() if "valueFrom" in entry}
    for key, ref in refs.items():
        require(re.fullmatch(SECRET_PREFIX + r"[a-z0-9-]+", ref.get("name", ""))
                and VERSION.fullmatch(ref.get("key", "")), f"Invalid production secret reference: {key}")
    return revision, entries, refs


def validate_vectorize(values):
    from urllib.request import Request, urlopen

    account = values["CF_ACCOUNT_ID"]
    require(re.fullmatch(r"[a-f0-9]{32}", account), "Invalid Vectorize account identity.")
    for index in ("zyx-vectors-production-v2", "zyx-site-search-production"):
        url = f"https://api.cloudflare.com/client/v4/accounts/{account}/vectorize/v2/indexes/{index}"
        with urlopen(Request(url, headers={"Authorization": "Bearer " + values["CF_API_TOKEN"]}), timeout=20) as response:
            data = json.load(response)
        config = data.get("result", {}).get("config", {})
        require(data.get("success") and data["result"].get("name") == index
                and config.get("dimensions") == 768 and config.get("metric") == "cosine",
                f"Production Vectorize index did not pass validation: {index}")


def main():
    require((os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_REF"), os.environ.get("GITHUB_EVENT_NAME")) ==
            ("soezyxstt/zyxacademy", "refs/heads/main", "workflow_dispatch"), "Only explicit production releases are supported.")
    secrets = json.loads(os.environ["GITHUB_RUNTIME_SECRETS"])
    variables = json.loads(os.environ["GITHUB_RUNTIME_VARS"])
    revision, current, existing_refs = current_runtime()
    database = read_secret(existing_refs["DATABASE_URL"])
    validate_database(database, TARGET["host"])
    queue_provider = current.get("QUEUE_PROVIDER", {}).get("value", "inngest")
    values, public = settings(secrets, variables, database, queue_provider)
    print(f"Current production revision: {revision} (100%)")
    print(f"Current production queue provider: {queue_provider}")
    print("Missing Cloud Run runtime keys: " + (", ".join(sorted(values.keys() - current.keys())) or "none"))
    vectorize_values = {**values}
    if "CF_API_TOKEN" in existing_refs:
        vectorize_values["CF_API_TOKEN"] = read_secret(existing_refs["CF_API_TOKEN"])
    validate_vectorize(vectorize_values)
    print("Verified both production Vectorize indexes (768 dimensions, cosine).")
    if os.environ["CLOUD_RUN_OPERATION"] == "inspect-runtime":
        return
    plain, refs = {}, {}
    for key, value in sorted(values.items()):
        if key in existing_refs:
            refs[key] = existing_refs[key]
        elif key in PLAIN_RUNTIME_KEYS or is_build_key(key) or key.startswith("FEATURE_"):
            plain[key] = value
        else:
            require(key in RUNTIME_KEYS, "Unsupported production runtime key.")
            refs[key] = secret_version(key, value)
    refs[ORIGIN_TOKEN] = existing_refs[ORIGIN_TOKEN]
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
        if isinstance(error, ValueError) and re.fullmatch(r"WORKER_[A-Z_]+(?::[A-Z_]+)?|Production runtime configuration command failed: [A-Za-z0-9 -]+", code):
            sys.exit(code)
        sys.exit("Production runtime preparation failed. Check the production environment and provisioned secret permissions.")
