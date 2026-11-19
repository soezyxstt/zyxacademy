"""Send the approved staging credential set directly to Secret Manager."""
import os
import subprocess
import sys
from urllib.parse import urlsplit

from deploy_cloud_run_staging import PROJECT, REQUIRED_SECRET_KEYS, ORIGIN_TOKEN, SECRET_PREFIX, STAGING
from cloud_run_runtime import validate_database


IMPORT_KEYS = (REQUIRED_SECRET_KEYS - {ORIGIN_TOKEN}) | {"CF_API_TOKEN"}


def main():
    if (os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_REF"),
        os.environ.get("GITHUB_EVENT_NAME")) != (
        "soezyxstt/zyxacademy", "refs/heads/staging", "workflow_dispatch",
    ):
        sys.exit("Only manual staging secret imports are allowed.")

    missing = sorted(name for name in IMPORT_KEYS if not os.environ.get(name, "").strip())
    if missing:
        sys.exit("Missing staging settings: " + ", ".join(missing))

    try:
        database_url = os.environ["DATABASE_URL"]
        validate_database(database_url, STAGING["host"])
        if urlsplit(database_url).username != "zyx_staging_app_20261115":
            raise ValueError("Invalid database role")
    except ValueError:
        sys.exit("The staging database URL does not match the approved host and application account.")

    for name in sorted(IMPORT_KEYS):
        secret = SECRET_PREFIX + name.lower().replace("_", "-")
        result = subprocess.run(
            ["gcloud", "--quiet", "--project", PROJECT, "secrets", "versions", "add",
             secret, "--data-file=-", "--format=value(name)"],
            input=os.environ[name], capture_output=True, text=True, check=False,
            env={key: value for key, value in os.environ.items() if key not in IMPORT_KEYS},
        )
        version = result.stdout.strip().rsplit("/", 1)[-1]
        if result.returncode != 0 or not version.isascii() or not version.isdecimal():
            sys.exit(f"Import failed for {name}. Check its Secret Manager destination and IAM grant.")
        print(f"{name}: {secret}:{version}", flush=True)


if __name__ == "__main__":
    main()
