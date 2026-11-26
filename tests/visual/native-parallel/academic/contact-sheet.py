"""Create a local contact sheet from a generated academic capture manifest."""

import argparse
import json
from itertools import batched
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    captures = manifest["captures"]
    width = 220
    height = round(width * manifest["viewport"]["height"] / manifest["viewport"]["width"])
    gap = 14
    caption = 40
    columns = 6
    rows = list(batched(captures, columns))
    canvas = Image.new("RGB", (gap + columns * (width + gap), gap + len(rows) * (height + caption + gap)), "#e3e5e7")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=13)

    for row_index, row in enumerate(rows):
        for column, capture in enumerate(row):
            x = gap + column * (width + gap)
            y = gap + row_index * (height + caption + gap)
            with Image.open(args.manifest.parent / capture["image"]) as original:
                canvas.paste(original.convert("RGB").resize((width, height), Image.Resampling.LANCZOS), (x, y))
            draw.text((x, y + height + 4), capture["component"].replace(" + ", " / "), fill="#20272d", font=font)
            label = capture["id"].removeprefix("admin-").removeprefix("tutor-")
            draw.text((x, y + height + 20), label, fill="#20272d", font=font)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output)


if __name__ == "__main__":
    main()
