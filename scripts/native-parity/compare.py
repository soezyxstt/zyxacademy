"""Compare native fixture crops at device scale with the corresponding browser crops."""
import argparse
import io
import json
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageCms, ImageOps

from case_manifest import load_case_layout
from relative_policy import relative_issues

MARKER = (224, 0, 239)


def load_frame(path):
    with Image.open(path) as image:
        profile = image.info.get("icc_profile")
        frame = image.convert("RGB")
    if profile:
        frame = ImageCms.profileToProfile(frame, io.BytesIO(profile), ImageCms.createProfile("sRGB"))
    return frame


def crop_positions(frame, scale, identity_width):
    width = 320 * scale
    # Android's GPU can round an identity-strip channel by one when compositing
    # a filtered EditText. Keep its exact run length to distinguish neighbors.
    delta = ImageChops.difference(frame, Image.new("RGB", frame.size, MARKER))
    identity_mask = delta.point(lambda channel: 255 if channel <= 1 else 0).convert("L")
    identity_run = bytes([255]) * identity_width
    # Only the first row of each full-width marker starts a case.
    positions = []
    identified = False
    for y in range(frame.height):
        line = frame.crop((0, y, frame.width, y + 1)).tobytes()
        if not identified:
            mask_line = identity_mask.crop((0, y, frame.width, y + 1)).tobytes()
            identified = mask_line.count(255) == identity_width and identity_run in mask_line
        offset = line.find(bytes(MARKER) * width)
        if offset >= 0 and offset % 3 == 0:
            x = offset // 3
            if y == 0 or frame.getpixel((x, y - 1)) != MARKER:
                positions.append((x, y + scale))
    return positions if identified else []


def component_crops(frame, scale, index, cases, heights, *, webview=False):
    positions = crop_positions(frame, scale, ((96 if webview else 16) + index) * scale)
    width = 320 * scale
    if len(positions) != len(cases):
        raise ValueError(f"Expected {len(cases)} marker strips, found {len(positions)}")
    bounds = [(x, y, x + width, y + heights[case] * scale) for case, (x, y) in zip(cases, positions)]
    if any(right > frame.width or bottom > frame.height for _, _, right, bottom in bounds):
        raise ValueError("Expected every fixture to fit within the capture")
    return [frame.crop(box) for box in bounds]


def unchanged_crops(previous, current):
    return previous is not None and len(previous) == len(current) and all(
        not ImageChops.difference(a, b).getbbox() for a, b in zip(previous, current)
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("frame", type=Path)
    parser.add_argument("scale", type=int, choices=(1, 3))
    parser.add_argument("component")
    parser.add_argument("--ready", action="store_true")
    parser.add_argument("--mobile-webview-reference", type=Path)
    args = parser.parse_args()
    platform = args.frame.parent.name
    relative = platform == "android" and args.mobile_webview_reference is not None
    diagnostic = platform == "android" and args.mobile_webview_reference is None
    if relative and args.scale != 1:
        parser.error("Android relative comparisons require the DPR 1 emulator")
    frame = load_frame(args.frame)
    reference_dir = args.mobile_webview_reference or Path(f"artifacts/native-parity/web/dpr{args.scale}")
    output_dir = args.frame.parent
    if args.mobile_webview_reference:
        if platform not in {"android", "ios"}:
            parser.error("Mobile WebView comparisons require an Android or iOS native frame")
        output_dir = output_dir / "native-vs-webview"
        output_dir.mkdir(exist_ok=True)
    groups, heights = load_case_layout(reference_dir / "cases.json")
    if args.component not in groups:
        parser.error(f"Unknown component {args.component}")
    ordinal = list(groups).index(args.component)
    cases = groups[args.component]
    try:
        crops = component_crops(frame, args.scale, ordinal, cases, heights)
    except ValueError as error:
        raise SystemExit(str(error))
    if args.ready:
        return
    mismatches = []
    rows = []
    measurements = []
    for case, native in zip(cases, crops):
        expected = (320 * args.scale, heights[case] * args.scale)
        native.save(output_dir / f"{case}.png")
        try:
            with Image.open(reference_dir / f"{case}.png") as image:
                web = image.convert("RGB")
            if web.size != expected:
                raise ValueError("incompatible dimensions")
        except (OSError, ValueError):
            measurements.append({"id": case, "evidenceIssue": "missing or incompatible reference"})
            mismatches.append(case)
            rows.append(f"| {case} |  |  |  | Missing or incompatible reference |")
            continue
        difference = ImageChops.difference(web, native)
        ImageOps.autocontrast(difference).save(output_dir / f"{case}-diff.png")
        # A missing primitive on both platforms must never give a passing blank crop.
        changed = sum(pixel != (0, 0, 0) for pixel in difference.get_flattened_data())
        blank_reference = not any(lo < hi for lo, hi in web.getextrema())
        blank_native = not any(lo < hi for lo, hi in native.getextrema())
        measurement = {"id": case, "differentPixels": changed, "blankReference": blank_reference,
                       "blankNative": blank_native}
        issues = []
        if relative:
            from relative_visual import measure_relative
            metrics = measure_relative(web, native)
            measurement["relativeVisual"] = metrics
            issues = relative_issues(metrics, expected)
        if blank_reference or blank_native:
            issues.insert(0, "blank crop")
        passed = not issues and (relative or changed == 0)
        if not passed:
            mismatches.append(case)
        bounds = difference.getbbox()
        extent = ", ".join(map(str, bounds)) if bounds else ""
        max_delta = max(hi for _, hi in difference.getextrema())
        measurement.update(maxRgbDelta=max_delta, bounds=bounds)
        measurements.append(measurement)
        if relative:
            detail = f"SSIM {metrics['fullSsim']:.4f} / {metrics['foregroundSsim']:.4f}" if metrics else "No SSIM"
            status = detail + (" · " + ", ".join(issues) if issues else " · Pass")
        elif diagnostic:
            status = "Diagnostic" if not issues else ", ".join(issues)
        else:
            status = "Pass" if passed else "Fail"
        rows.append(f"| {case} | {changed} | {max_delta} | {extent} | {status} |")
    report = "\n".join([
        f"### {args.frame.parent.name}: {args.component} at DPR {args.scale}"
        + (" vs mobile WebView" if args.mobile_webview_reference else ""), "",
        "| Case | Different pixels | Maximum RGB delta | Difference bounds (px) | Result |",
        "| --- | ---: | ---: | --- | --- |", *rows, "",
    ])
    evidence = {"component": args.component, "platform": platform, "scale": args.scale,
                "commit": os.environ.get("PARITY_HEAD_SHA"), "buildCommit": os.environ.get("GITHUB_SHA"),
                "cases": measurements}
    if args.mobile_webview_reference:
        evidence["referenceEngine"] = "android-webview" if relative else "ios-wkwebview"
    (output_dir / f"result-{args.component}.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(report)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(report + "\n")
    if mismatches and not diagnostic:
        raise SystemExit(f"Visual parity failed: {', '.join(mismatches)}")
    if not relative and not mismatches:
        print(f"All {len(cases)} crops match at DPR {args.scale}")


if __name__ == "__main__":
    main()
