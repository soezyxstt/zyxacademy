"""Shared, reviewed staging-only authoring browser identity; never contains a secret."""
import json
import os
from pathlib import Path
import re
import sys


def staging_browser_settings():
    settings = json.loads((Path(__file__).resolve().parents[1] / "config/staging-authoring-browser.json").read_text())
    if (not isinstance(settings, dict)
            or set(settings) != {"AUTHORING_VERIFICATION_BROWSER_PROVIDER", "AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION"}
            or settings["AUTHORING_VERIFICATION_BROWSER_PROVIDER"] != "steel"
            or not isinstance(settings["AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION"], str)
            or not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", settings["AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION"])):
        raise ValueError("Invalid reviewed staging browser identity.")
    return settings


if __name__ == "__main__":
    if os.environ.get("ZYX_ENVIRONMENT") != "staging" or len(sys.argv) < 2:
        raise SystemExit("Staging browser settings require an explicit staging command.")
    os.environ.update(staging_browser_settings())
    os.execvp(sys.argv[1], sys.argv[1:])
