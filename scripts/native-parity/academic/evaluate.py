"""Record measured native geometry for the matched-viewport comparison job."""

import argparse
from collections import Counter
import json
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--provisional", action="store_true", help="Prepare diagnostics from priority routes only")
    args = parser.parse_args()
    output = args.output
    suffix = "-provisional" if args.provisional else ""
    manifest = output / f"interaction-manifest{suffix}.json"
    status_file = output / f"comparison-status{suffix}.json"
    manifest.unlink(missing_ok=True)
    status_file.unlink(missing_ok=True)
    try:
        report = json.loads((output / "routes" / "manifest.json").read_text())
    except (OSError, ValueError):
        status_file.write_text('{"status":"unverified","reason":"route geometry unavailable"}\n')
        return 1
    geometry = Counter(
        tuple(row["bounds"][key] for key in ("x", "y", "width", "height"))
        for row in report["captures"] if row["status"] == "captured" and row.get("bounds")
    )
    if len(geometry) != 1:
        status = {"status": "unverified", "reason": "no single verified content box", "observedBounds": list(geometry.items())}
        status_file.write_text(json.dumps(status, indent=2) + "\n")
        return 1
    x, y, width, height = next(iter(geometry))
    dpr = report["deviceScaleFactor"]
    if width % dpr or height % dpr:
        status = {"status": "unverified", "reason": "content bounds are fractional at device density", "bounds": [x, y, width, height]}
        status_file.write_text(json.dumps(status, indent=2) + "\n")
        return 1
    tests = Path("tests/visual/native-parallel/academic")
    prepared = subprocess.run([
        sys.executable, str(tests / "device-manifest.py"), str(output / "interactions"), str(manifest),
        "--platform", report["platform"], "--device", report.get("device", report["platform"]),
        "--revision", report["revision"], "--dpr", str(dpr), "--viewport", str(width // dpr), str(height // dpr),
        "--bounds", str(x), str(y), str(width), str(height),
    ]).returncode
    if prepared:
        manifest.unlink(missing_ok=True)
    status = {
        "status": "ready" if prepared == 0 else "unverified",
        "manifestExitCode": prepared,
        "bounds": {"x": x, "y": y, "width": width, "height": height},
        "contentViewport": {"width": width // dpr, "height": height // dpr},
    }
    status_file.write_text(json.dumps(status, indent=2) + "\n")
    return prepared


if __name__ == "__main__":
    raise SystemExit(main())
