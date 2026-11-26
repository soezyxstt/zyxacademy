"""Compare native fixture crops at device scale with the corresponding browser crops."""
import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

CASES = ("separator-horizontal-light", "separator-vertical-light", "separator-horizontal-dark")
MARKER = (224, 0, 239)


def crop_positions(frame, scale):
    width = 320 * scale
    # Only the first row of each full-width marker starts a case.
    positions = []
    for y in range(frame.height):
        line = frame.crop((0, y, frame.width, y + 1)).tobytes()
        offset = line.find(bytes(MARKER) * width)
        if offset >= 0 and offset % 3 == 0:
            x = offset // 3
            if y == 0 or frame.getpixel((x, y - 1)) != MARKER:
                positions.append((x, y + scale))
    return positions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("frame", type=Path)
    parser.add_argument("scale", type=int, choices=(1, 3))
    parser.add_argument("--ready", action="store_true")
    args = parser.parse_args()
    frame = Image.open(args.frame).convert("RGB")
    positions = crop_positions(frame, args.scale)
    if len(positions) != len(CASES):
        raise SystemExit(f"Expected {len(CASES)} marker strips, found {len(positions)}")
    if args.ready:
        return
    mismatches = []
    for case, (x, y) in zip(CASES, positions):
        reference = Path(f"artifacts/native-parity/web/dpr{args.scale}/{case}.png")
        web = Image.open(reference).convert("RGB")
        expected = (320 * args.scale, 100 * args.scale)
        if web.size != expected or y + expected[1] > frame.height:
            raise ValueError(f"{case}: invalid capture dimensions")
        native = frame.crop((x, y, x + expected[0], y + expected[1]))
        native.save(args.frame.parent / f"{case}.png")
        difference = ImageChops.difference(web, native)
        ImageOps.autocontrast(difference).save(args.frame.parent / f"{case}-diff.png")
        # A missing primitive on both platforms must never give a passing blank crop.
        if difference.getbbox() or not web.getbbox() or not any(lo < hi for lo, hi in web.getextrema()):
            mismatches.append(case)
    if mismatches:
        raise SystemExit(f"Pixel parity failed: {', '.join(mismatches)}")
    print(f"All three crops match at DPR {args.scale}")


if __name__ == "__main__":
    main()
