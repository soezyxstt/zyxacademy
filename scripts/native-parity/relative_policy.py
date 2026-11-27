"""Versioned Android WebView visual criteria, shared by measurement and reporting."""
import math

POLICY = "android-webview-relative-v1"
MIN_SSIM = 0.98
MAX_EDGE_SHIFT = 2
MIN_FOREGROUND_PIXELS = 8
MAX_FOREGROUND_AREA_DELTA = 0.20
MAX_CANVAS_DELTA = 8
MAX_COLOR_WINDOW = 8
MAX_SALIENCE_WINDOW = 8


def relative_issues(metrics, frame_size):
    if not isinstance(metrics, dict) or metrics.get("policy") != POLICY or metrics.get("framePixels") != list(frame_size):
        return ["missing or incompatible measurement"]
    scores = (metrics.get("fullSsim"), metrics.get("foregroundSsim"))
    if any(type(score) not in (int, float) or not -1 <= score <= 1 or not math.isfinite(score) for score in scores):
        return ["invalid SSIM"]
    width, height = frame_size
    reference = metrics.get("referenceForeground")
    native = metrics.get("nativeForeground")
    if any(type(count) is not int or not 0 <= count <= width * height for count in (reference, native)):
        return ["invalid foreground measurements"]
    if min(reference, native) < MIN_FOREGROUND_PIXELS:
        return ["insufficient foreground"]
    boxes = (metrics.get("referenceBounds"), metrics.get("nativeBounds"))
    for box in boxes:
        if (not isinstance(box, list) or len(box) != 4 or any(type(edge) is not int for edge in box)
                or not (0 <= box[0] < box[2] <= width and 0 <= box[1] < box[3] <= height)):
            return ["invalid foreground anchors"]
    canvas = metrics.get("canvasMaxRgbDelta")
    color = metrics.get("flatColorWindow")
    salience = metrics.get("unmatchedSalienceWindow")
    if (type(canvas) is not int or not 0 <= canvas <= 255 or
            any(type(count) is not int or not 0 <= count <= 49 for count in (color, salience))):
        return ["invalid color or salience measurements"]
    issues = []
    if min(scores) < MIN_SSIM:
        issues.append("local luminance SSIM")
    if max(abs(a - b) for a, b in zip(*boxes)) > MAX_EDGE_SHIFT:
        issues.append("foreground anchor geometry")
    if abs(native - reference) / max(native, reference) > MAX_FOREGROUND_AREA_DELTA:
        issues.append("foreground coverage")
    if canvas > MAX_CANVAS_DELTA or color > MAX_COLOR_WINDOW:
        issues.append("canvas or surface color")
    if salience > MAX_SALIENCE_WINDOW:
        issues.append("localized contrast or missing detail")
    return issues
