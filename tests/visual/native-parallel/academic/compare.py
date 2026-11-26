"""Compare device captures with semantically matched Playwright references."""

import argparse
import io
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageCms


def open_srgb(path):
    with Image.open(path) as original:
        image = original.convert("RGB")
        profile = original.info.get("icc_profile")
    if profile:
        return ImageCms.profileToProfile(image, io.BytesIO(profile), ImageCms.createProfile("sRGB"))
    return image


def measured_image(image, bounds=None):
    frame = {"width": image.width, "height": image.height}
    bounds = bounds if bounds is not None else {"x": 0, "y": 0, **frame}
    x, y, width, height = (bounds.get(key) for key in ("x", "y", "width", "height"))
    if (
        any(type(value) is not int for value in (x, y, width, height))
        or x < 0 or y < 0 or width <= 0 or height <= 0
        or x + width > image.width or y + height > image.height
    ):
        raise ValueError(f"content bounds {bounds} are outside the PNG frame {frame}")
    return image.crop((x, y, x + width, y + height)), {"frame": frame, "bounds": bounds}


def write_unmatched(image, overlap_width, overlap_height, path):
    if image.size == (overlap_width, overlap_height):
        return None
    remaining = image.convert("RGBA")
    remaining.paste((0, 0, 0, 0), (0, 0, overlap_width, overlap_height))
    remaining.save(path)
    return path.name


def measure_pair(capture, reference, device, device_capture, output):
    case = capture["id"]
    web, web_geometry = measured_image(
        open_srgb(reference["directory"] / capture["image"]), capture.get("bounds"),
    )
    native, native_geometry = measured_image(
        open_srgb(device["directory"] / device_capture["image"]), device_capture.get("bounds"),
    )
    reference_dpr = capture.get("deviceScaleFactor", reference["deviceScaleFactor"])
    reference_viewport = capture.get("viewport", reference["viewport"])
    device_dpr = device_capture.get("deviceScaleFactor", device.get("deviceScaleFactor"))
    device_viewport = device_capture.get("viewport", device.get("viewport"))
    result = {
        "id": case,
        "passed": False,
        "reference": {**web_geometry, "viewport": reference_viewport, "deviceScaleFactor": reference_dpr, "theme": capture["theme"]},
        "device": {**native_geometry, "viewport": device_viewport, "deviceScaleFactor": device_dpr, "theme": device_capture.get("theme")},
    }
    mismatches = []
    if web.size != (capture["width"], capture["height"]):
        mismatches.append("reference dimensions differ from its manifest")
    if device_dpr != reference_dpr:
        mismatches.append("different device scale factor")
    if device_viewport != reference_viewport:
        mismatches.append("different logical viewport")
    if (
        device_dpr in (1, 3) and isinstance(device_viewport, dict) and {"width", "height"} <= device_viewport.keys()
        and native.size != (device_viewport["width"] * device_dpr, device_viewport["height"] * device_dpr)
    ):
        mismatches.append("device content dimensions do not match its viewport at the recorded scale")
    if device_capture.get("bounds") is None:
        mismatches.append("device content bounds are missing")
    if web.size != native.size:
        mismatches.append("different content dimensions")
    if device_capture.get("theme") != capture["theme"]:
        mismatches.append("different or unverified theme")

    width, height = min(web.width, native.width), min(web.height, native.height)
    overlap = (0, 0, width, height)
    diff = ImageChops.difference(web.crop(overlap), native.crop(overlap))
    red, green, blue = diff.split()
    different_pixels = sum(ImageChops.lighter(ImageChops.lighter(red, green), blue).histogram()[1:])
    difference_file = output / f"{case}-{'overlap-' if mismatches else ''}diff.png"
    diff.save(difference_file)
    files = {"difference": difference_file.name}
    for source, image in (("web", web), ("device", native)):
        unmatched = write_unmatched(image, width, height, output / f"{case}-unmatched-{source}.png")
        if unmatched:
            files[f"unmatched_{source}"] = unmatched
    blank = not any(lo < hi for lo, hi in web.getextrema())
    result.update({
        "passed": not mismatches and not blank and different_pixels == 0,
        "comparison": "overlap-diagnostic" if mismatches else "full-frame",
        "mismatches": mismatches,
        "overlap": {"width": width, "height": height},
        "differentOverlapPixels": different_pixels,
        "maxRgbDelta": max(high for _, high in diff.getextrema()),
        "differenceBoundsInOverlap": diff.getbbox(),
        "blankReference": blank,
        "files": files,
    })
    return result


def load_manifest(path):
    return {**json.loads(path.read_text()), "directory": path.parent}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference_manifest", type=Path)
    parser.add_argument("device_manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--case", action="append", help="Repeat for a targeted comparison")
    args = parser.parse_args()
    reference = load_manifest(args.reference_manifest)
    device = load_manifest(args.device_manifest)
    if device.get("platform") not in ("android", "ios"):
        parser.error("Device manifest platform must be android or ios")
    captures = {capture["id"]: capture for capture in reference["captures"]}
    devices = {capture["id"]: capture for capture in device["captures"]}
    mapped = set(devices) | set(device.get("missingDeviceCases", []))
    cases = args.case or [case for case in captures if case in mapped]
    unknown = sorted(set(cases) - captures.keys())
    if unknown:
        parser.error(f"Unknown case IDs: {', '.join(unknown)}")
    if not cases:
        parser.error("No selected reference case has a semantic device mapping")

    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for case in cases:
        if case not in devices:
            result = {"id": case, "passed": False, "error": "missing matched device case"}
        else:
            try:
                result = measure_pair(captures[case], reference, device, devices[case], args.output)
            except (OSError, ValueError, KeyError) as error:
                result = {"id": case, "passed": False, "error": str(error)}
        results.append(result)
        diagnostic = result.get("error") or result.get("mismatches")
        if not diagnostic:
            diagnostic = "blank reference" if result.get("blankReference") else result.get("differentOverlapPixels")
        print(f"{'PASS' if result['passed'] else 'FAIL'} {case}: {diagnostic}")

    evidence = {
        "platform": device["platform"],
        "device": device.get("device"),
        "deviceRevision": device.get("revision"),
        "sourceRevision": reference["sourceRevision"],
        "referenceViewport": reference["viewport"],
        "referenceDeviceScaleFactor": reference["deviceScaleFactor"],
        "deviceViewport": device.get("viewport"),
        "deviceScaleFactor": device.get("deviceScaleFactor"),
        "unpairedReferenceCases": [case for case in captures if case not in mapped],
        "cases": results,
    }
    (args.output / "results.json").write_text(json.dumps(evidence, indent=2) + "\n")
    return 0 if results and all(result["passed"] for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
