"""Validate and install the Firebase configuration for one Android channel."""
import json
import os
from pathlib import Path


def configure(raw, destination, channel):
    config = json.loads(raw)
    if config.get("project_info", {}).get("project_id") != "zyx-academy-staging":
        raise ValueError("Android requires the configured Zyx Firebase project.")
    clients = config.get("client", [])
    expected = {"nightly": "com.zyx.academy.nightly", "stable": "com.zyx.academy"}.get(channel)
    matching = [client for client in clients
                if client.get("client_info", {}).get("android_client_info", {}).get("package_name") == expected]
    if expected is None or len(matching) != 1:
        raise ValueError("Firebase Android app does not match the release channel.")
    config["client"] = matching
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(config), encoding="utf-8")


if __name__ == "__main__":
    channel = os.environ["APP_CHANNEL"]
    if channel not in {"nightly", "stable"}:
        raise ValueError("Unsupported Android release channel.")
    configure(os.environ["GOOGLE_SERVICES_JSON"],
              Path("apps/mobile/android/app/src") / channel / "google-services.json", channel)
