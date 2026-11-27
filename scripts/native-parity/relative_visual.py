"""Unresized, position-preserving visual measurements for Android WebView pairs."""
import numpy as np
from PIL import Image, ImageFilter
from relative_policy import POLICY

RADIUS = 3
WINDOW_PIXELS = (2 * RADIUS + 1) ** 2
FOREGROUND_DELTA = 12
STRONG_CONTRAST = 32
MIN_PEER_CONTRAST = 0.65
FLAT_RANGE = 8
COLOR_DELTA = 12


def window_sum(values):
    padded = np.pad(values, RADIUS, mode="edge")
    integral = np.pad(padded, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    size = 2 * RADIUS + 1
    return integral[size:, size:] - integral[:-size, size:] - integral[size:, :-size] + integral[:-size, :-size]


def window_max(values):
    return int(window_sum(values.astype(np.int32)).max())


def max_filter(values):
    return np.asarray(Image.fromarray(values).filter(ImageFilter.MaxFilter(3)))


def local_contrast(rgb):
    channels = []
    for channel in np.moveaxis(rgb, -1, 0):
        values = Image.fromarray(channel)
        high = np.asarray(values.filter(ImageFilter.MaxFilter(3)))
        low = np.asarray(values.filter(ImageFilter.MinFilter(3)))
        channels.append(high - low)
    return np.maximum.reduce(channels)


def canvas_color(rgb):
    perimeter = np.concatenate((rgb[0], rgb[-1], rgb[1:-1, 0], rgb[1:-1, -1]))
    colors, counts = np.unique(perimeter, axis=0, return_counts=True)
    return colors[counts.argmax()].astype(np.int16)


def bounds(mask):
    y, x = np.nonzero(mask)
    return [int(x.min()), int(y.min()), int(x.max()) + 1, int(y.max()) + 1] if x.size else None


def luminance_ssim(reference, native):
    # BT.709 weights in the sRGB sample domain. SSIM uses uniform 7 x 7 windows.
    weights = np.array([0.2126, 0.7152, 0.0722])
    left, right = reference @ weights, native @ weights
    mean_left, mean_right = window_sum(left) / WINDOW_PIXELS, window_sum(right) / WINDOW_PIXELS
    left_sq, right_sq, product = mean_left ** 2, mean_right ** 2, mean_left * mean_right
    variance_left = np.maximum(0, window_sum(left ** 2) / WINDOW_PIXELS - left_sq)
    variance_right = np.maximum(0, window_sum(right ** 2) / WINDOW_PIXELS - right_sq)
    covariance = window_sum(left * right) / WINDOW_PIXELS - product
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    scores = ((2 * product + c1) * (2 * covariance + c2) /
              ((left_sq + right_sq + c1) * (variance_left + variance_right + c2)))
    return np.clip(scores, -1, 1)


def measure_relative(reference, native):
    if reference.size != native.size or min(reference.size) < 7:
        return None
    left, right = np.asarray(reference.convert("RGB")), np.asarray(native.convert("RGB"))
    canvas_left, canvas_right = canvas_color(left), canvas_color(right)
    foreground_left = np.abs(left - canvas_left).max(axis=2) >= FOREGROUND_DELTA
    foreground_right = np.abs(right - canvas_right).max(axis=2) >= FOREGROUND_DELTA
    near_foreground = window_sum((foreground_left | foreground_right).astype(np.int32)) > 0
    scores = luminance_ssim(left, right)
    contrast_left, contrast_right = local_contrast(left), local_contrast(right)
    flat = (contrast_left <= FLAT_RANGE) & (contrast_right <= FLAT_RANGE)
    wrong_color = flat & (np.abs(left.astype(np.int16) - right).max(axis=2) > COLOR_DELTA)
    # The peer may have its antialiasing one pixel away. This applies only
    # to the local contrast check, never to SSIM, color or anchor alignment.
    missing = (contrast_left >= STRONG_CONTRAST) & (max_filter(contrast_right) < MIN_PEER_CONTRAST * contrast_left)
    extra = (contrast_right >= STRONG_CONTRAST) & (max_filter(contrast_left) < MIN_PEER_CONTRAST * contrast_right)
    return {
        "policy": POLICY,
        "framePixels": list(reference.size),
        "fullSsim": float(scores.mean()),
        "foregroundSsim": float(scores[near_foreground].mean()) if near_foreground.any() else 0.0,
        "referenceForeground": int(foreground_left.sum()),
        "nativeForeground": int(foreground_right.sum()),
        "referenceBounds": bounds(foreground_left),
        "nativeBounds": bounds(foreground_right),
        "canvasMaxRgbDelta": int(np.abs(canvas_left - canvas_right).max()),
        "flatColorWindow": window_max(wrong_color),
        "unmatchedSalienceWindow": max(window_max(missing), window_max(extra)),
    }
