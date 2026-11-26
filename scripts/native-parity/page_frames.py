"""Extract and compare full-page device frames without scaling."""
import time

from PIL import ImageChops, ImageOps
from compare import MARKER, load_frame
from device_capture import screenshot


def page_crop(frame, logical_width, logical_height, index, scale, marker=MARKER):
    width, height = logical_width * scale, logical_height * scale
    marker_width = (logical_width - index) * scale
    strip = bytes(marker) * marker_width
    for y in range(frame.height - height - scale):
        line = frame.crop((0, y, frame.width, y + 1)).tobytes()
        offset = line.find(strip)
        if offset < 0 or offset % 3 or line.count(bytes(marker)) != marker_width:
            continue
        left = offset // 3
        top = y + scale
        if left + width > frame.width:
            continue
        end = frame.crop((left, top + height, left + marker_width, top + height + 1)).tobytes()
        if end == strip:
            return frame.crop((left, top, left + width, top + height))
    return None


def capture_stable_page(platform, device, shot, width, height, index, scale, marker=MARKER):
    previous = None
    for _ in range(20):
        screenshot(platform, device, shot)
        crop = page_crop(load_frame(shot), width, height, index, scale, marker)
        if crop and previous and not ImageChops.difference(previous, crop).getbbox():
            return crop
        previous = crop
        time.sleep(0.5)
    return None


def blank_frame(frame):
    return not any(lo < hi for lo, hi in frame.getextrema())


def compare_page_frames(reference, crop, diff_path):
    if crop.size != reference.size or blank_frame(reference):
        return {"status": "invalid-reference"}
    diff = ImageChops.difference(reference, crop)
    changed = sum(pixel != (0, 0, 0) for pixel in diff.get_flattened_data())
    ImageOps.autocontrast(diff).save(diff_path)
    return {"differentPixels": changed, "bounds": diff.getbbox(), "blankReference": False,
            "framePixels": list(crop.size), "status": "fail" if changed else "pass"}
