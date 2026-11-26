"""Compare native fixture crops at device scale with the corresponding browser crops."""
import argparse
from collections import Counter
import io
import json
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageCms, ImageOps

MARKER = (224, 0, 239)


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
    args = parser.parse_args()
    frame = Image.open(args.frame)
    profile = frame.info.get("icc_profile")
    frame = frame.convert("RGB")
    if profile:
        frame = ImageCms.profileToProfile(frame, io.BytesIO(profile), ImageCms.createProfile("sRGB"))
    reference_dir = Path(f"artifacts/native-parity/web/dpr{args.scale}")
    cases = json.loads((reference_dir / "cases.json").read_text())
    counts = Counter(case.split("-", 1)[0] for case in cases)
    if not cases or len(set(cases)) != len(cases) or set(counts.values()) != {3}:
        raise ValueError("Expected three unique cases per component")
    ordinal = list(counts).index(args.component)
    cases = [case for case in cases if case.split("-", 1)[0] == args.component]
    positions = crop_positions(frame, args.scale, (16 + ordinal) * args.scale)
    if len(positions) != len(cases):
        raise SystemExit(f"Expected {len(cases)} marker strips, found {len(positions)}")
    if args.ready:
        return
    mismatches = []
    rows = []
    for case, (x, y) in zip(cases, positions):
        reference = reference_dir / f"{case}.png"
        web = Image.open(reference).convert("RGB")
        expected = (320 * args.scale, 100 * args.scale)
        if web.size != expected or y + expected[1] > frame.height:
            raise ValueError(f"{case}: invalid capture dimensions")
        native = frame.crop((x, y, x + expected[0], y + expected[1]))
        native.save(args.frame.parent / f"{case}.png")
        difference = ImageChops.difference(web, native)
        ImageOps.autocontrast(difference).save(args.frame.parent / f"{case}-diff.png")
        # A missing primitive on both platforms must never give a passing blank crop.
        changed = sum(pixel != (0, 0, 0) for pixel in difference.get_flattened_data())
        blank_reference = not any(lo < hi for lo, hi in web.getextrema())
        passed = changed == 0 and not blank_reference
        if not passed:
            mismatches.append(case)
        bounds = difference.getbbox()
        extent = ", ".join(map(str, bounds)) if bounds else ""
        max_delta = max(hi for _, hi in difference.getextrema())
        rows.append(f"| {case} | {changed} | {max_delta} | {extent} | {'Pass' if passed else 'Fail'} |")
    report = "\n".join([
        f"### {args.frame.parent.name}: {args.component} at DPR {args.scale}", "",
        "| Case | Different pixels | Maximum RGB delta | Difference bounds (px) | Result |",
        "| --- | ---: | ---: | --- | --- |", *rows, "",
    ])
    print(report)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(report + "\n")
    if mismatches:
        raise SystemExit(f"Pixel parity failed: {', '.join(mismatches)}")
    print(f"All {len(cases)} crops match at DPR {args.scale}")


if __name__ == "__main__":
    main()
