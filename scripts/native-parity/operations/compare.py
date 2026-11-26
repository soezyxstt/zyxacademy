"""Compare whole, unscaled device viewports. Retain chrome, offsets and all differences."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

PAIRS = {
    "cases/operations-public-blog-list-open-back": "blog-list-light",
    "cases/operations-public-blog-detail-content": "blog-detail-light",
    "cases/operations-public-blog-list-empty": "blog-empty-dark-en",
    "blog-list": "blog-list-light",
    "blog-detail": "blog-detail-light",
    "blog-empty-dark": "blog-empty-dark",
    "management-form-summary": "management-form-summary",
}

UTC_JOBS = "evaluation/jobs-completed-light-380-viewport-utc.png"
UTC_NAMES = {"UTC", "Etc/UTC", "GMT", "Etc/GMT"}

def compare(device_dir, reference_dir, width_dp, density):
    rows = []
    timezone_path = device_dir / "timezone.txt"
    timezone = timezone_path.read_text().strip() if timezone_path.is_file() else None
    pairs = {capture: f"{reference}-{width_dp}-dpr{density}.png" for capture, reference in PAIRS.items()}
    if width_dp == 380 and density == 1:
        pairs.update({
            "cases/operations-evaluation-jobs-populated": UTC_JOBS,
            "cases/operations-evaluation-jobs-alternate": "evaluation/jobs-empty-dark-380.png",
            "cases/operations-monitoring-admin-populated": "monitoring/home-populated-light-380.png",
            "cases/operations-monitoring-admin-ops-web-analytics-populated": "monitoring/web-analytics-populated-light-380-viewport.png",
            "cases/operations-monitoring-admin-ops-feature-usage-populated": "monitoring/features-30-days-light-380-viewport.png",
            "feature-usage": "monitoring/features-30-days-light-380-viewport.png",
            "feature-usage-empty-range": "monitoring/features-7-days-light-380-viewport.png",
            "cases/operations-public-hero-id": "../public-pages/references/hero-id-380-dpr1.png",
            "cases/operations-public-form-empty": "../public-pages/references/form-empty-380-dpr1.png",
            "web-analytics": "monitoring/web-analytics-populated-light-380-viewport.png",
        })
    for capture, reference in pairs.items():
        device_path = device_dir / f"{capture}.png"
        reference_path = reference_dir / reference
        row = {"device": str(device_path.relative_to(device_dir)), "reference": reference}
        rows.append(row)
        if not device_path.is_file() or not reference_path.is_file():
            row["status"] = "awaiting capture"
            continue
        if reference == UTC_JOBS and timezone not in UTC_NAMES:
            row.update(status="time zone unverified" if not timezone else "time zone mismatch",
                deviceTimeZone=timezone, referenceTimeZone="UTC")
            continue
        with Image.open(device_path) as native, Image.open(reference_path) as web:
            row["devicePixels"] = native.size
            row["referencePixels"] = web.size
            if native.size != web.size or native.width != width_dp * density:
                row["status"] = "viewport mismatch"
                continue
            if not any(low < high for low, high in web.convert("RGB").getextrema()):
                row["status"] = "blank reference"
                continue
            difference = ImageChops.difference(native.convert("RGB"), web.convert("RGB"))
            # Count pixels with any nonzero channel, including a single intensity step.
            red, green, blue = difference.split()
            maximum = ImageChops.lighter(red, ImageChops.lighter(green, blue))
            different = native.width * native.height - maximum.histogram()[0]
            row.update(differentPixels=different, maxChannelDelta=maximum.getextrema()[1])
            row["status"] = "different" if different else "identical"
            ImageOps.autocontrast(difference).save(device_dir / f"{capture}-diff.png")
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("device_dir", type=Path)
    parser.add_argument("reference_dir", type=Path)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--density", type=int, required=True)
    args = parser.parse_args()
    args.device_dir.mkdir(parents=True, exist_ok=True)
    rows = compare(args.device_dir, args.reference_dir, args.width, args.density)
    report = json.dumps(rows, indent=2) + "\n"
    (args.device_dir / "comparison.json").write_text(report)
    print(report)
