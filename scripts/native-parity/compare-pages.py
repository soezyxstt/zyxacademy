"""Compare full public page fixtures on the native device and Next at the same DPR."""
import json
import os
from pathlib import Path
from subprocess import SubprocessError
import sys
import time

from PIL import ImageChops, ImageOps
from case_manifest import PAGE_BEHAVIORS, PAGE_CAPTURES, load_page_manifest, page_behavior_cases
from compare import MARKER, load_frame
from device_capture import open_route, screenshot


def page_crop(frame, logical_width, logical_height, index, scale):
    width, height = logical_width * scale, logical_height * scale
    marker_width = (logical_width - index) * scale
    strip = bytes(MARKER) * marker_width
    for y in range(frame.height - height - scale):
        line = frame.crop((0, y, frame.width, y + 1)).tobytes()
        offset = line.find(strip)
        if offset < 0 or offset % 3 or line.count(bytes(MARKER)) != marker_width:
            continue
        left = offset // 3
        top = y + scale
        if left + width > frame.width:
            continue
        end = frame.crop((left, top + height, left + marker_width, top + height + 1)).tobytes()
        if end == strip:
            return frame.crop((left, top, left + width, top + height))
    return None


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
        previous = None
        for _ in range(20):
            screenshot(platform, device, shot)
            crop = page_crop(load_frame(shot), manifest["width"], manifest["height"], index, scale)
            if crop and previous and not ImageChops.difference(previous, crop).getbbox():
                break
            previous = crop
            time.sleep(0.5)
        else:
            rows.append({"case": case, "status": "missing-stable-frame"})
            continue
        crop.save(output / f"{case}.png")
        if key := behaviors.get(case):
            blank = not any(lo < hi for lo, hi in crop.getextrema())
            rows.append({"case": case, "status": "invalid-native-fallback" if blank else PAGE_BEHAVIORS[key][0],
                         "framePixels": list(crop.size), key: manifest[key]})
            continue
        try:
            reference = load_frame(web / f"{group}-{case}.png")
        except OSError:
            rows.append({"case": case, "status": "invalid-reference"})
            continue
        blank = not any(lo < hi for lo, hi in reference.getextrema())
        if crop.size != reference.size or blank:
            rows.append({"case": case, "status": "invalid-reference"})
            continue
        diff = ImageChops.difference(reference, crop)
        changed = sum(pixel != (0, 0, 0) for pixel in diff.get_flattened_data())
        ImageOps.autocontrast(diff).save(output / f"{case}-diff.png")
        rows.append({"case": case, "differentPixels": changed, "bounds": diff.getbbox(),
                     "blankReference": blank, "framePixels": list(crop.size),
                     "status": "fail" if changed else "pass"})
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
