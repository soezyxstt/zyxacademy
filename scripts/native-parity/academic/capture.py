"""Capture academic fixture routes on a real Android emulator or iOS simulator."""

import argparse
import hashlib
import io
import json
import shlex
import subprocess
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageChops, ImageCms


APP_ID = "com.zyx.academy.nativeparity"
PRIORITY = {
    ("/tutor", "populated"),
    ("/tutor", "denied"),
    ("/tutor/[courseId]/participants", "populated"),
    ("/tutor/[courseId]/participants", "empty"),
    ("/tutor/[courseId]/grading", "populated"),
    ("/tutor/[courseId]/quizzes", "populated"),
    ("/admin/courses", "populated"),
    ("/admin/courses", "empty"),
    ("/admin/courses/[slug]", "populated"),
}


def run(args):
    completed = subprocess.run(args, capture_output=True, check=True, timeout=12)
    return completed.stdout


def open_url(platform, device, url):
    if platform == "ios":
        run(["xcrun", "simctl", "openurl", device, url])
    else:
        android_intent = shlex.join(["am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, APP_ID])
        run(["adb", "-s", device, "shell", android_intent])


def screenshot(platform, device, scratch):
    if platform == "ios":
        run(["xcrun", "simctl", "io", device, "screenshot", str(scratch)])
        data = scratch.read_bytes()
    else:
        data = run(["adb", "-s", device, "exec-out", "screencap", "-p"])
    with Image.open(io.BytesIO(data)) as original:
        profile = original.info.get("icc_profile")
        image = original.convert("RGB")
    if profile:
        image = ImageCms.profileToProfile(image, io.BytesIO(profile), ImageCms.createProfile("sRGB"))
    return data, image


def marker(image, color, dpr):
    channels = [channel.point([255 if level == value else 0 for level in range(256)]) for channel, value in zip(image.split(), color)]
    region = ImageChops.multiply(ImageChops.multiply(channels[0], channels[1]), channels[2]).getbbox()
    if region:
        left, top, right, bottom = region
        if all(abs(span - 4 * dpr) <= 1 for span in (right - left, bottom - top)):
            return region
    return None


def observed_bounds(image, ordinal, dpr):
    start = marker(image, (224, ordinal, 239), dpr)
    end = marker(image, (223, ordinal, 234), dpr)
    if start and end and start[2] < end[0] and start[3] < end[1]:
        return (*start[:2], *end[2:])
    return None


def content_rect(bounds):
    if bounds is None:
        return None
    x, y, right, bottom = bounds
    return {"x": x, "y": y, "width": right - x, "height": bottom - y}


def capture_case(platform, device, case, ordinal, dpr, scratch):
    last_data = last_frame = last_bounds = None
    failures = []
    for attempt in (1, 2):
        url = f"{case['href']}&evidence={ordinal}&evidenceNonce={ordinal}-{attempt}"
        bounds = previous_content = None
        try:
            open_url(platform, device, url)
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                last_data, image = screenshot(platform, device, scratch)
                last_frame = {"width": image.width, "height": image.height}
                current_bounds = observed_bounds(image, ordinal, dpr)
                if current_bounds:
                    bounds = last_bounds = current_bounds
                    previous_content = None
                elif bounds:
                    current_content = image.crop(bounds)
                    if previous_content and ImageChops.difference(previous_content, current_content).getbbox() is None:
                        return last_data, last_frame, bounds, "captured", attempt, failures
                    previous_content = current_content
                time.sleep(0.17)
            failures.append("unstable clean frames" if bounds else "fixture readiness stamp not observed")
        except (OSError, subprocess.SubprocessError) as error:
            failures.append(f"device command failed ({type(error).__name__})")
    return last_data, last_frame, last_bounds, "unverified", 2, failures


def write_manifest(path, data):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios"))
    parser.add_argument("device")
    parser.add_argument("cases", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--case", action="append")
    parser.add_argument("--priority", action="store_true", help="Collect the first Tutor and Admin evidence before interaction flows")
    parser.add_argument("--resume", action="store_true", help="Continue the current revision without replacing verified captures")
    args = parser.parse_args()
    dpr = 1 if args.platform == "android" else 3
    args.output.mkdir(parents=True, exist_ok=True)
    raw = args.output / "raw"
    raw.mkdir(exist_ok=True)
    matrix = json.loads(args.cases.read_text())
    provenance = json.loads((args.output.parent / "provenance.json").read_text())
    device_info = (args.output.parent / "device.txt").read_text().splitlines()
    metadata = {
        **provenance, "device": " | ".join(line.strip() for line in device_info if line.strip()),
        "deviceScaleFactor": dpr,
    }
    manifest = args.output / "manifest.json"
    captures = {}
    if args.resume and manifest.is_file():
        previous = json.loads(manifest.read_text())
        if any(previous.get(key) != metadata[key] for key in ("revision", "platform", "deviceScaleFactor")):
            parser.error("Cannot resume a different revision, platform, or density")
        captures = {row["id"]: row for row in previous["captures"]}

    def save():
        write_manifest(manifest, {**metadata, "captures": [captures[case["id"]] for case in matrix if case["id"] in captures]})

    selected = [
        (ordinal, case) for ordinal, case in enumerate(matrix, 1)
        if (not args.case or case["id"] in args.case)
        and (not args.priority or (case["pattern"], case["id"].rsplit("-", 1)[-1]) in PRIORITY)
    ]
    checked_stamps = 0
    verified_identity = any(row.get("bounds") for row in captures.values())
    with tempfile.TemporaryDirectory(prefix="zyx-academic-device-") as temporary:
        scratch = Path(temporary) / "latest.png"
        for ordinal, case in selected:
            case_id = case["id"]
            if captures.get(case_id, {}).get("status") == "captured":
                continue
            if checked_stamps >= 3 and not verified_identity:
                captures[case_id] = {**case, "status": "unverified", "failures": ["device did not render the readiness stamps in the first three cases"]}
                continue
            data, frame, bounds, status, attempts, failures = capture_case(
                args.platform, args.device, case, ordinal, dpr, scratch,
            )
            checked_stamps += 1
            verified_identity = verified_identity or bounds is not None
            capture = {
                **case, "status": status, "ordinal": ordinal, "attempts": attempts, "failures": failures,
                "frame": frame, "bounds": content_rect(bounds),
                "viewport": {"width": (bounds[2] - bounds[0]) / dpr, "height": (bounds[3] - bounds[1]) / dpr} if bounds else None,
            }
            if data is not None:
                image = raw / f"{case_id}.png"
                image.write_bytes(data)
                capture["image"] = str(image.relative_to(args.output))
                capture["sha256"] = hashlib.sha256(data).hexdigest()
            captures[case_id] = capture
            save()
            print(f"{status.upper()} {case_id}", flush=True)
    save()
    captured = sum(captures[case["id"]]["status"] == "captured" for _, case in selected)
    print(f"{captured}/{len(selected)} academic cases captured on {args.platform}")
    return 0 if captured and captured == len(selected) else 1


if __name__ == "__main__":
    raise SystemExit(main())
