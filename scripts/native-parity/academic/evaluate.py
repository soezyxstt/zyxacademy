"""Use measured native geometry to compare the vetted Maestro screenshot subset."""

import argparse
from collections import Counter
import json
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    output = args.output
    try:
        report = json.loads((output / "routes" / "manifest.json").read_text())
    except (OSError, ValueError):
        (output / "comparison-status.json").write_text('{"status":"unverified","reason":"route geometry unavailable"}\n')
        return 1
    geometry = Counter(
        tuple(row["bounds"][key] for key in ("x", "y", "width", "height"))
        for row in report["captures"] if row["status"] == "captured" and row.get("bounds")
    )
    if len(geometry) != 1:
        status = {"status": "unverified", "reason": "no single verified content box", "observedBounds": list(geometry.items())}
        (output / "comparison-status.json").write_text(json.dumps(status, indent=2) + "\n")
        return 1
    x, y, width, height = next(iter(geometry))
    dpr = report["deviceScaleFactor"]
    if width % dpr or height % dpr:
        status = {"status": "unverified", "reason": "content bounds are fractional at device density", "bounds": [x, y, width, height]}
        (output / "comparison-status.json").write_text(json.dumps(status, indent=2) + "\n")
        return 1
    tests = Path("tests/visual/native-parallel/academic")
    device = output / "interaction-manifest.json"
    prepared = subprocess.run([
        sys.executable, str(tests / "device-manifest.py"), str(output / "interactions"), str(device),
        "--platform", report["platform"], "--device", report.get("device", report["platform"]),
        "--revision", report["revision"], "--dpr", str(dpr), "--viewport", str(width // dpr), str(height // dpr),
        "--bounds", str(x), str(y), str(width), str(height),
    ]).returncode
    compared = None
    if prepared == 0:
        reference = tests / "web" / f"dpr{dpr}" / "manifest.json"
        if reference.is_file():
            compared = subprocess.run([
                sys.executable, str(tests / "compare.py"), str(reference), str(device), str(output / "diffs"),
            ]).returncode
    status = {
        "status": "passed" if compared == 0 else "unverified" if compared is None else "differences-or-missing-cases",
        "manifestExitCode": prepared,
        "comparisonExitCode": compared,
        "bounds": {"x": x, "y": y, "width": width, "height": height},
        "contentViewport": {"width": width // dpr, "height": height // dpr},
    }
    (output / "comparison-status.json").write_text(json.dumps(status, indent=2) + "\n")
    return 0 if compared == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
