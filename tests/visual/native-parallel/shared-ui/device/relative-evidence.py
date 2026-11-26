"""Compare Shared UI safe-area crops in Expo and Android WebView at DPR 1."""
import argparse
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory

from PIL import ImageChops, ImageCms, ImageOps

from evidence import (
    APP_ID, TOKEN, capture_frame, crop_viewport, flat_color, geometry_id, load_png, parse_scale,
    read_json, sha256, stable_crop, write_json,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[5] / "scripts/native-parity"))
from relative_policy import POLICY, relative_issues
from relative_visual import measure_relative


def webview_flow(case_id, build, dimensions):
    width, height = dimensions
    size = f"{width}x{height}"
    uri = f"zyx-native-parity://internal/shared-ui-reference/{case_id}?viewport={size}&build={build}"
    return (f'appId: {APP_ID}\n---\n- openLink: "{uri}"\n- extendedWaitUntil:\n    visible:\n'
            f"      id: shared-ui-webview-ready-{case_id}-{size}\n    timeout: 30000\n")


def native_crop(path, case_id, ready, device, build, dimensions, insets):
    evidence = read_json(path.with_suffix(".json"))
    expected = {
        "id": case_id, "readyId": ready, "build": build, "platform": "android", "device": device,
        "dpr": "1", "insets": insets, "method": "maestro-ready-and-geometry", "stableCrop": True,
        "nativeViewport": list(dimensions), "geometryId": geometry_id(dimensions, parse_scale("1"), insets),
        "rawSha256": sha256(path),
    }
    if not isinstance(evidence, dict) or any(evidence.get(key) != value for key, value in expected.items()):
        raise ValueError("Expo sidecar disagrees with the case, build, device or viewport")
    frame = load_png(path)
    if evidence.get("rawPixels") != list(frame.size):
        raise ValueError("Expo sidecar disagrees with framebuffer dimensions")
    return crop_viewport(frame, dimensions, insets)[0]


def compare_relative_case(case, args, scratch):
    case_id = case["id"]
    dimensions = case["width"], case["height"]
    ready = case.get("readyId", f"shared-ui-case-{case_id}")
    native_path = args.raw / f"{case_id}.png"
    native = native_crop(native_path, case_id, ready, args.device, args.build, dimensions, args.insets)
    target = args.output / f"{case_id}-webview-frame.png"
    flow = scratch / f"{case_id}.yaml"
    flow.write_text(webview_flow(case_id, args.build, dimensions), encoding="utf-8")
    capture_frame(args, case_id, flow, target)
    stable_crop("android", args.device, target, dimensions, args.insets)
    reference, box = crop_viewport(load_png(target), dimensions, args.insets)
    reference.save(args.output / f"{case_id}-webview.png")
    native.save(args.output / f"{case_id}-expo.png")
    diff = ImageChops.difference(reference, native)
    ImageOps.autocontrast(diff).save(args.output / f"{case_id}-diff.png")
    metrics = measure_relative(reference, native)
    issues = relative_issues(metrics, dimensions)
    reference_blank, native_blank = flat_color(reference), flat_color(native)
    if reference_blank or native_blank:
        issues.insert(0, "blank crop")
    return {
        "id": case_id, "component": case["component"], "status": "fail" if issues else "pass", "issues": issues,
        "differentPixels": sum(pixel != (0, 0, 0) for pixel in diff.get_flattened_data()),
        "maxRgbDelta": max(hi for _, hi in diff.getextrema()), "differenceBounds": diff.getbbox(),
        "referenceBlank": reference_blank, "nativeBlank": native_blank, "cropPixels": box,
        "expoRawSha256": sha256(native_path), "webviewRawSha256": sha256(target), "relativeVisual": metrics,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("manifest", "cases", "raw", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--build", required=True)
    parser.add_argument("--insets", nargs=4, type=int, required=True)
    args = parser.parse_args()
    args.platform = "android"
    if not re.fullmatch(r"[a-f0-9]{40}", args.build) or not re.fullmatch(r"emulator-\d+", args.device):
        parser.error("Expected a committed build and a disposable Android emulator")
    selected = read_json(args.cases)
    by_id = {case["id"]: case for case in read_json(args.manifest)}
    if not selected or len(selected) != len(set(selected)) or not all(TOKEN.fullmatch(case) and case in by_id for case in selected):
        parser.error("Expected unique registered relative cases")
    args.output.mkdir(parents=True, exist_ok=True)
    rows = []
    with TemporaryDirectory() as directory:
        for case_id in selected:
            case = by_id[case_id]
            try:
                rows.append(compare_relative_case(case, args, Path(directory)))
            except (OSError, ValueError, subprocess.SubprocessError, ImageCms.PyCMSError) as error:
                rows.append({"id": case_id, "component": case["component"], "status": "unverified", "issues": [str(error)]})
    write_json(args.output / "results.json", {
        "referenceEngine": "android-webview", "policy": POLICY, "build": args.build,
        "platform": "android", "device": args.device, "dpr": 1, "cases": rows,
    })
    return int(any(row["status"] != "pass" for row in rows))


if __name__ == "__main__":
    sys.exit(main())
