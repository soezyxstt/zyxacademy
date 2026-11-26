"""Match archived Maestro PNGs by name and record measured device geometry."""

import argparse
import json
import os
from pathlib import Path

from PIL import Image


MAESTRO_CASES = {
    "academic-tutor-dashboard-populated-light": "tutor-dashboard-assigned-light",
    "academic-tutor-participants-populated-light": "tutor-participants-enrolled-light",
    "academic-tutor-participants-empty-dark": "tutor-participants-empty-dark",
    "academic-tutor-grading-queue-light": "tutor-tryout-grading-pending-light",
    "academic-tutor-quiz-list-populated-light": "tutor-quizzes-list-light",
    "academic-admin-courses-list-populated-light": "admin-courses-list-light",
    "academic-admin-courses-list-empty-dark": "admin-courses-empty-dark",
    "academic-admin-courses-overview-populated-light": "admin-course-chapters-light",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("screenshots", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--platform", required=True, choices=("android", "ios"))
    parser.add_argument("--device", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--dpr", type=int, choices=(1, 3), required=True)
    parser.add_argument("--viewport", nargs=2, type=int, required=True, metavar=("WIDTH", "HEIGHT"))
    parser.add_argument("--bounds", nargs=4, type=int, required=True, metavar=("X", "Y", "WIDTH", "HEIGHT"))
    args = parser.parse_args()
    if not args.screenshots.is_dir():
        parser.error(f"Screenshot directory is missing: {args.screenshots}")
    viewport_width, viewport_height = args.viewport
    x, y, width, height = args.bounds
    if min(viewport_width, viewport_height, width, height) <= 0 or min(x, y) < 0:
        parser.error("Bounds and viewport must have positive dimensions and a nonnegative origin")

    captures = []
    missing = []
    for maestro, case in MAESTRO_CASES.items():
        images = [
            image for image in args.screenshots.rglob(f"{maestro}.png")
            if "prior-attempts" not in image.relative_to(args.screenshots).parts
        ]
        if not images:
            missing.append(case)
            continue
        if len(images) > 1:
            parser.error(f"Multiple screenshots match {maestro}.png")
        image = images[0]
        with Image.open(image) as png:
            if x + width > png.width or y + height > png.height:
                parser.error(f"Content bounds exceed {image} at {png.width} × {png.height}")
        captures.append({
            "id": case,
            "maestroScreenshot": maestro,
            "image": os.path.relpath(image, args.manifest.parent),
            "theme": case.rsplit("-", 1)[-1],
            "bounds": {"x": x, "y": y, "width": width, "height": height},
        })
    if not captures:
        parser.error("The artifact has no named screenshots with a semantic web match")
    document = {
        "platform": args.platform,
        "device": args.device,
        "revision": args.revision,
        "deviceScaleFactor": args.dpr,
        "viewport": {"width": viewport_width, "height": viewport_height},
        "expectedDeviceCases": list(MAESTRO_CASES.values()),
        "captures": captures,
        "missingDeviceCases": missing,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(document, indent=2) + "\n")


if __name__ == "__main__":
    main()
