"""Compare native fixture crops at device scale with the corresponding browser crops."""
import argparse
import io
import json
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageCms, ImageOps

from case_manifest import load_case_groups

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
    # Only the first row of each full-width marker starts a case.
    positions = []
    identified = False
    for y in range(frame.height):
        line = frame.crop((0, y, frame.width, y + 1)).tobytes()
        if not identified and line.count(bytes(MARKER)) == identity_width:
            identified = bytes(MARKER) * identity_width in line
        offset = line.find(bytes(MARKER) * width)
        if offset >= 0 and offset % 3 == 0:
            x = offset // 3
            if y == 0 or frame.getpixel((x, y - 1)) != MARKER:
                positions.append((x, y + scale))
    return positions if identified else []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("frame", type=Path)
    parser.add_argument("scale", type=int, choices=(1, 3))
    parser.add_argument("component")
    parser.add_argument("--ready", action="store_true")
    parser.add_argument("--mobile-webview-reference", type=Path)
    args = parser.parse_args()
    frame = load_frame(args.frame)
    reference_dir = args.mobile_webview_reference or Path(f"artifacts/native-parity/web/dpr{args.scale}")
    output_dir = args.frame.parent
    if args.mobile_webview_reference:
        if output_dir.name not in {"android", "ios"}:
            parser.error("Mobile WebView comparisons require an Android or iOS native frame")
        output_dir = output_dir / "native-vs-webview"
        output_dir.mkdir(exist_ok=True)
    groups = load_case_groups(reference_dir / "cases.json")
    if args.component not in groups:
        parser.error(f"Unknown component {args.component}")
    ordinal = list(groups).index(args.component)
    cases = groups[args.component]
    positions = crop_positions(frame, args.scale, (16 + ordinal) * args.scale)
    if len(positions) != len(cases):
        raise SystemExit(f"Expected {len(cases)} marker strips, found {len(positions)}")
    if args.ready:
        return
    mismatches = []
    rows = []
    measurements = []
    for case, (x, y) in zip(cases, positions):
        reference = reference_dir / f"{case}.png"
        web = Image.open(reference).convert("RGB")
        expected = (320 * args.scale, 100 * args.scale)
        if web.size != expected or y + expected[1] > frame.height:
            raise ValueError(f"{case}: invalid capture dimensions")
        native = frame.crop((x, y, x + expected[0], y + expected[1]))
        native.save(output_dir / f"{case}.png")
        difference = ImageChops.difference(web, native)
        ImageOps.autocontrast(difference).save(output_dir / f"{case}-diff.png")
        # A missing primitive on both platforms must never give a passing blank crop.
        changed = sum(pixel != (0, 0, 0) for pixel in difference.get_flattened_data())
        blank_reference = not any(lo < hi for lo, hi in web.getextrema())
        passed = changed == 0 and not blank_reference
        if not passed:
            mismatches.append(case)
        bounds = difference.getbbox()
        extent = ", ".join(map(str, bounds)) if bounds else ""
        max_delta = max(hi for _, hi in difference.getextrema())
        measurements.append({"id": case, "differentPixels": changed, "maxRgbDelta": max_delta,
                             "bounds": bounds, "blankReference": blank_reference})
        rows.append(f"| {case} | {changed} | {max_delta} | {extent} | {'Pass' if passed else 'Fail'} |")
    report = "\n".join([
        f"### {args.frame.parent.name}: {args.component} at DPR {args.scale}"
        + (" vs mobile WebView" if args.mobile_webview_reference else ""), "",
        "| Case | Different pixels | Maximum RGB delta | Difference bounds (px) | Result |",
        "| --- | ---: | ---: | --- | --- |", *rows, "",
    ])
    evidence = {"component": args.component, "platform": args.frame.parent.name, "scale": args.scale,
                "commit": os.environ.get("PARITY_HEAD_SHA"), "buildCommit": os.environ.get("GITHUB_SHA"),
                "cases": measurements}
    if args.mobile_webview_reference:
        evidence["referenceEngine"] = "android-webview" if args.frame.parent.name == "android" else "ios-wkwebview"
    (output_dir / f"result-{args.component}.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(report)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(report + "\n")
    if args.mobile_webview_reference and any(case["blankReference"] for case in measurements):
        raise SystemExit("Mobile WebView reference contains a blank crop")
    if mismatches:
        raise SystemExit(f"Pixel parity failed: {', '.join(mismatches)}")
    if not mismatches:
        print(f"All {len(cases)} crops match at DPR {args.scale}")


if __name__ == "__main__":
    main()
