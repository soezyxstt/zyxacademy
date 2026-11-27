"""Compare the visible material list before opening a row and after navigating back."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops
from standalone_evidence import StandaloneEvidence


def compare(directory):
    standalone = StandaloneEvidence(directory)
    testcase = 'Student course long material list fixture'
    if standalone.cases is not None and standalone.status(testcase) != 'SUCCESS':
        return {'status': 'inconclusive', 'reason': 'The effective Maestro material flow did not finish successfully'}
    images = []
    for name in ("student-long-content", "student-long-content-restored"):
        matches = standalone.captures(testcase, f"{name}.png")
        if len(matches) != 1:
            return {"status": "missing", "capture": name, "matches": len(matches)}
        images.append(matches[0])
    if standalone.cases is not None and images[0].parent != images[1].parent:
        return {'status': 'inconclusive', 'reason': 'Material captures came from different Maestro executions'}

    with Image.open(images[0]) as before, Image.open(images[1]) as after:
        if before.size != after.size:
            return {"status": "different_size", "before": before.size, "after": after.size}
        width, height = before.size
        # Keep the rows, excluding system bars, navigation controls and the scroll indicator.
        bounds = (width // 10, height // 4, width * 9 // 10, height * 3 // 4)
        reference = before.convert("RGB").crop(bounds)
        restored = after.convert("RGB").crop(bounds)
        difference = ImageChops.difference(reference, restored)
        pixels = sum(color != (0, 0, 0) for color in difference.getdata())
        values = reference.getextrema()
        if all(high - low < 24 for low, high in values):
            return {"status": "inconclusive", "reason": "No recognizable list detail in the reference region"}
        if pixels:
            difference.save(directory / "scroll-restoration-diff.png")
        return {"status": "different" if pixels else "pass",
                "region": bounds, "dimensions": before.size, "different_pixels": pixels,
                "before": str(images[0].relative_to(directory)), "after": str(images[1].relative_to(directory))}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    directory = parser.parse_args().directory
    directory.mkdir(parents=True, exist_ok=True)
    result = compare(directory)
    (directory / "scroll-restoration.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    raise SystemExit(0 if result["status"] == "pass" else 1)
