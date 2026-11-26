"""Recapture vetted Playwright cases at the measured native content viewport."""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def compare_platform(platform, artifact, output):
    manifest = artifact / "interaction-manifest.json"
    if not manifest.is_file():
        return {"platform": platform, "status": "unverified", "reason": "no verified device interaction manifest"}
    device = json.loads(manifest.read_text())
    ids = [row["id"] for row in device["captures"]]
    missing = device.get("missingDeviceCases", [])
    expected = device.get("expectedDeviceCases", [*ids, *missing])
    requested = list(dict.fromkeys([*expected, *ids, *missing]))
    if not ids:
        return {"platform": platform, "status": "unverified", "reason": "no vetted matched cases"}
    viewport = device["viewport"]
    dpr = device["deviceScaleFactor"]
    root = Path("tests/visual/native-parallel/academic")
    generated = output / platform / "web"
    generated.mkdir(parents=True, exist_ok=True)
    environment = {
        **os.environ,
        "PARITY_WIDTH": str(viewport["width"]),
        "PARITY_HEIGHT": str(viewport["height"]),
        "PARITY_DPR": str(dpr),
        "PARITY_CASES": ",".join(requested),
        "PARITY_OUTPUT_DIR": str(generated),
    }
    reference = subprocess.run(["bun", str(root / "capture.ts")], env=environment).returncode
    comparison = None
    if reference == 0:
        comparison = subprocess.run([
            sys.executable, str(root / "compare.py"), str(generated / "manifest.json"),
            str(manifest), str(output / platform / "diffs"),
        ]).returncode
    status = "unverified"
    if missing or len(set(ids)) < 8:
        status = "partial" if comparison is not None else "unverified"
    elif comparison == 0 and set(ids) == set(expected):
        status = "passed"
    elif comparison == 1:
        status = "differences"
    return {
        "platform": platform, "status": status,
        "viewport": viewport, "deviceScaleFactor": dpr, "deviceRevision": device["revision"],
        "cases": ids, "expectedCases": requested, "missingDeviceCases": missing,
        "referenceExitCode": reference, "comparisonExitCode": comparison,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifacts", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for platform in ("android", "ios"):
        try:
            result = compare_platform(platform, args.artifacts / f"academic-{platform}-evidence", args.output)
        except (OSError, ValueError, KeyError) as error:
            result = {"platform": platform, "status": "unverified", "reason": str(error)}
        results.append(result)
        (args.output / "status.json").write_text(json.dumps(results, indent=2) + "\n")
    return 0 if all(result["status"] == "passed" for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
