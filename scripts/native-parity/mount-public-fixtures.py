"""Mount archived public pages into an opt-in, hosted Expo device build."""

import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = "diagnostics/public-pages"
ROUTES = ("public-links", "public-forms", "meet")
OPTIONS = "historical-public.tsx"
DEFAULT_OPTIONS = "// The hosted diagnostic build replaces these defaults with the archived fixtures."


def mount(mobile):
    archive = mobile / ARCHIVE
    destinations = {
        mobile / "app/internal" / route / "[caseId].tsx": (archive / route / "[caseId].tsx").read_bytes()
        for route in ROUTES
    }
    options = mobile / "features/parity" / OPTIONS
    destinations[options] = (archive / OPTIONS).read_bytes()
    for path, source in destinations.items():
        if path.exists():
            previous = path.read_bytes()
            if previous != source and (path != options or DEFAULT_OPTIONS.encode() not in previous):
                raise ValueError(f"Existing fixture path requires review: {path.relative_to(mobile)}")

    for path, source in destinations.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(source)


if __name__ == "__main__":
    if any(os.environ.get(key) != value for key, value in {
        "GITHUB_ACTIONS": "true",
        "RUNNER_ENVIRONMENT": "github-hosted",
        "NATIVE_PARITY_PUBLIC_FIXTURES": "1",
    }.items()):
        raise SystemExit("Public page fixtures only mount in the opt-in hosted device job.")
    mount(ROOT / "apps/mobile-native")
