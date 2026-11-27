"""Compare full public page fixtures on the native device and Next at the same DPR."""
import json
import os
from pathlib import Path
from subprocess import SubprocessError
import sys

from case_manifest import PAGE_BEHAVIORS, PAGE_CAPTURES, load_page_manifest, page_behavior_cases
from compare import load_frame
from device_capture import open_route
from page_frames import blank_frame, capture_stable_page, compare_page_frames


def capture_page(platform, device, group):
    scale = 3 if platform == "ios" else 1
    root = Path("artifacts/native-parity")
    output = root / platform / group
    output.mkdir(parents=True, exist_ok=True)
    web = root / "web" / f"dpr{scale}"
    manifest = load_page_manifest(web / f"{group}.json", group)
    behaviors = page_behavior_cases(manifest)
    commit, build_commit = os.environ.get("PARITY_HEAD_SHA"), os.environ.get("GITHUB_SHA")
    if (manifest["commit"], manifest["buildCommit"]) != (commit, build_commit):
        raise ValueError("Page reference revisions differ from the tested build")
    rows = []
    for index, case in enumerate(manifest["cases"]):
        try:
            open_route(platform, device, f"{PAGE_CAPTURES[group][1]}/{case}")
        except SubprocessError as error:
            print(f"{case}: {error}", file=sys.stderr)
            rows.append({"case": case, "status": "navigation-failed"})
            continue
        shot = output / f"frame-{case}.png"
        crop = capture_stable_page(platform, device, shot, manifest["width"], manifest["height"], index, scale)
        if crop is None:
            rows.append({"case": case, "status": "missing-stable-frame"})
            continue
        crop.save(output / f"{case}.png")
        if key := behaviors.get(case):
            blank = blank_frame(crop)
            rows.append({"case": case, "status": "invalid-native-fallback" if blank else PAGE_BEHAVIORS[key][0],
                         "framePixels": list(crop.size), key: manifest[key]})
            continue
        try:
            reference = load_frame(web / f"{group}-{case}.png")
        except OSError:
            rows.append({"case": case, "status": "invalid-reference"})
            continue
        rows.append({"case": case, **compare_page_frames(reference, crop, output / f"{case}-diff.png")})
    evidence = {"route": manifest["route"], "platform": platform, "scale": scale, "viewport": [manifest["width"], manifest["height"]],
                "referenceEngine": "chromium", "commit": commit, "buildCommit": build_commit, "cases": rows}
    (output / "result.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence))
    return all(row["status"] in {"pass", "external-redirect", "backend-recovery"} for row in rows) and len(rows) == 3


if __name__ == "__main__":
    platform, device = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None
    results = []
    for group in PAGE_CAPTURES:
        try:
            results.append(capture_page(platform, device, group))
        except (OSError, ValueError) as error:
            print(f"{group}: {error}", file=sys.stderr)
            results.append(False)
    sys.exit(0 if all(results) else 1)
