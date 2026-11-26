"""Compare the full 380x640 public directory on the native device and Next at the same DPR."""
import json
import os
from pathlib import Path
import sys
import time

from PIL import ImageChops, ImageOps
from compare import MARKER, load_frame
from device_capture import open_route, screenshot


def directory_crop(frame, logical_width, logical_height, index, scale):
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


def main(platform, device):
    scale = 3 if platform == "ios" else 1
    root = Path("artifacts/native-parity")
    output = root / platform / "directory"
    output.mkdir(parents=True, exist_ok=True)
    web = root / "web" / f"dpr{scale}"
    manifest = json.loads((web / "directory.json").read_text())
    rows = []
    for index, case in enumerate(manifest["cases"]):
        open_route(platform, device, f"internal/public-links/{case}")
        shot = output / f"frame-{case}.png"
        previous = None
        for _ in range(20):
            screenshot(platform, device, shot)
            crop = directory_crop(load_frame(shot), manifest["width"], manifest["height"], index, scale)
            if crop and previous and not ImageChops.difference(previous, crop).getbbox():
                break
            previous = crop
            time.sleep(0.5)
        else:
            rows.append({"case": case, "status": "missing-stable-frame"})
            continue
        crop.save(output / f"{case}.png")
        reference = load_frame(web / f"directory-{case}.png")
        if crop.size != reference.size or not any(lo < hi for lo, hi in reference.getextrema()):
            raise ValueError(f"Invalid reference size or empty content in {case}")
        diff = ImageChops.difference(reference, crop)
        changed = sum(pixel != (0, 0, 0) for pixel in diff.get_flattened_data())
        ImageOps.autocontrast(diff).save(output / f"{case}-diff.png")
        rows.append({"case": case, "differentPixels": changed, "bounds": diff.getbbox(),
                     "status": "fail" if changed else "pass"})
    evidence = {"route": "/tautan", "platform": platform, "scale": scale, "viewport": [manifest["width"], manifest["height"]],
                "commit": os.environ.get("PARITY_HEAD_SHA"), "cases": rows}
    (output / "result.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence))
    return all(row["status"] == "pass" for row in rows) and len(rows) == 3


if __name__ == "__main__":
    sys.exit(0 if main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None) else 1)
