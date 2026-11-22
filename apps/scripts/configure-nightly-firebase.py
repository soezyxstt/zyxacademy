"""Validate and install only the staging Android Firebase configuration."""
import json
import os
from pathlib import Path


def configure(raw, destination):
    config = json.loads(raw)
    if config.get("project_info", {}).get("project_id") != "zyx-academy-staging":
        raise ValueError("Nightly requires the staging Firebase project.")
    clients = config.get("client", [])
    packages = [client.get("client_info", {}).get("android_client_info", {}).get("package_name")
                for client in clients]
    if packages != ["com.zyx.academy.nightly"]:
        raise ValueError("Nightly requires its dedicated Android Firebase app.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(config), encoding="utf-8")


if __name__ == "__main__":
    configure(os.environ["GOOGLE_SERVICES_JSON"],
              Path("apps/mobile/android/app/src/nightly/google-services.json"))
