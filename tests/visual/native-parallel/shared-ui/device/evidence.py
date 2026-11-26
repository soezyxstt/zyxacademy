"""Capture shared UI cases on native devices and compare raw PNGs at the reference DPR."""

import argparse
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import plistlib
import re
import subprocess
import time
from tempfile import TemporaryDirectory

from PIL import Image, ImageChops, ImageCms, ImageOps


APP_ID = "com.zyx.academy.nativeparity"
REFERENCE_ROOT = Path(__file__).resolve().parents[1] / "references"
TOKEN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
ADB_TRANSPORT_FAILURE = re.compile(
    r"device (?:offline|disconnected|(?:'[^']+' )?not found)|no devices/emulators found|connection (?:closed|refused|reset)",
    re.IGNORECASE,
)
MAESTRO_INTERRUPTED_LAUNCH = re.compile(r'Launch app "[^"\n]+"\.\.\.(?=\s*(?:====|$))')


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_scale(value):
    try:
        scale = Decimal(value)
    except InvalidOperation as error:
        raise argparse.ArgumentTypeError("DPR must be a positive number") from error
    if not scale.is_finite() or scale <= 0:
        raise argparse.ArgumentTypeError("DPR must be a positive number")
    return scale.normalize()


def scale_label(scale):
    return format(scale, "f")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest_cases(path, case_ids, viewport):
    records = read_json(path)
    if not isinstance(records, list) or not records:
        raise ValueError(f"{path}: expected a nonempty array of cases")

    by_id = {}
    for record in records:
        if not isinstance(record, dict):
            raise ValueError(f"{path}: expected case objects")
        case_id = record.get("id")
        component = record.get("component")
        if not all(isinstance(value, str) and TOKEN.fullmatch(value) for value in (case_id, component)):
            raise ValueError(f"{path}: invalid case id or component in {record!r}")
        ready_id = record.get("readyId", f"shared-ui-case-{case_id}")
        if not isinstance(ready_id, str) or not TOKEN.fullmatch(ready_id):
            raise ValueError(f"{path}: invalid readiness ID for {case_id}")
        if case_id in by_id:
            raise ValueError(f"{path}: duplicate case {case_id}")
        if record.get("theme") not in ("light", "dark"):
            raise ValueError(f"{path}: invalid theme for {case_id}")
        if any(type(record.get(key)) is not int or record[key] <= 0 for key in ("width", "height")):
            raise ValueError(f"{path}: invalid viewport for {case_id}")
        by_id[case_id] = record

    if missing := set(case_ids) - by_id.keys():
        raise ValueError(f"Unknown cases: {', '.join(sorted(missing))}")
    selected = [
        case for case in by_id.values()
        if (not case_ids or case["id"] in case_ids)
        and (not viewport or f'{case["width"]}x{case["height"]}' == viewport)
    ]
    if not selected:
        raise ValueError("No reference cases match the selection")
    return selected


def pixel_size(case, scale):
    dimensions = tuple(case[dimension] * scale for dimension in ("width", "height"))
    if any(value != value.to_integral_value() for value in dimensions):
        raise ValueError(f"{case['id']}: reference CSS dimensions must multiply to whole pixels at DPR {scale_label(scale)}")
    return tuple(map(int, dimensions))


def validate_reference(case, args):
    if case.get("captured") is not True or case.get("errors") != []:
        raise ValueError(f"{case['id']}: web reference failed or was not captured, errors={case.get('errors')!r}")
    reference_scale = case.get("deviceScaleFactor")
    if type(reference_scale) not in (int, float) or Decimal(str(reference_scale)) != args.scale:
        raise ValueError(f"{case['id']}: reference DPR is {reference_scale!r}, expected {scale_label(args.scale)}")
    reference_path = args.reference_dir / f"{case['id']}.png"
    dimensions = pixel_size(case, args.scale)
    reference = load_png(reference_path)
    if reference.size != dimensions:
        raise ValueError(f"Reference PNG is {reference.size}, expected {dimensions}")
    return reference, sha256(reference_path)


def geometry_id(dimensions, scale, insets):
    width, height = dimensions
    dpr = scale_label(scale).replace(".", "-")
    physical_insets = "-".join(map(str, insets))
    return f"shared-ui-geometry-{width}x{height}-dpr-{dpr}-insets-{physical_insets}"


def load_png(path):
    with Image.open(path) as source:
        if source.format != "PNG":
            raise ValueError(f"{path}: expected a PNG")
        if ("A" in source.getbands() or "transparency" in source.info) and source.convert("RGBA").getchannel("A").getextrema()[0] != 255:
            raise ValueError(f"{path}: screenshot must be opaque")
        rgb = source.convert("RGB")
        if profile := source.info.get("icc_profile"):
            rgb = ImageCms.profileToProfile(rgb, io.BytesIO(profile), ImageCms.createProfile("sRGB"))
        return rgb


def crop_viewport(frame, dimensions, insets):
    if not isinstance(insets, (list, tuple)) or len(insets) != 4 or any(type(value) is not int or value < 0 for value in insets):
        raise ValueError("Insets must be four nonnegative pixel values (left top right bottom)")
    left, top, right, bottom = insets
    box = (left, top, frame.width - right, frame.height - bottom)
    actual = (box[2] - box[0], box[3] - box[1])
    if actual != dimensions:
        raise ValueError(f"Raw frame {frame.size} with insets {tuple(insets)} yields {actual}, expected {dimensions}")
    return frame.crop(box), box


def flat_color(image):
    return all(low == high for low, high in image.getextrema())


def compare_case(case, args):
    case_id = case["id"]
    reference_path = args.reference_dir / f"{case_id}.png"
    raw_path = args.raw_dir / f"{case_id}.png"
    metadata_path = raw_path.with_suffix(".json")
    result = {key: case[key] for key in ("id", "component", "theme", "width", "height")}
    result.update({"reference": str(reference_path), "rawFrame": str(raw_path)})
    crop_path = args.out_dir / f"{case_id}-native.png"
    diff_path = args.out_dir / f"{case_id}-diff.png"

    try:
        crop_path.unlink(missing_ok=True)
        diff_path.unlink(missing_ok=True)
        dimensions = pixel_size(case, args.scale)
        result["expectedPixels"] = dimensions
        reference, reference_digest = validate_reference(case, args)
        frame = load_png(raw_path)
        result["rawPixels"] = frame.size

        metadata = read_json(metadata_path) if metadata_path.exists() else None
        if metadata is not None:
            if not isinstance(metadata, dict) or any(metadata.get(key) != value for key, value in {
                "id": case_id, "platform": args.platform, "dpr": scale_label(args.scale), "rawPixels": list(frame.size),
            }.items()):
                raise ValueError(f"{metadata_path}: case, platform, DPR or raw geometry disagrees with the comparison inputs")
            result["capture"] = metadata
        if metadata is not None and metadata.get("build") != args.build:
            raise ValueError(f"{metadata_path}: expected capture from build {args.build}")
        if metadata is not None:
            for field, digest in (("referenceSha256", reference_digest), ("rawSha256", sha256(raw_path))):
                if field in metadata and metadata[field] != digest:
                    raise ValueError(f"{metadata_path}: {field} disagrees with the current PNG")
        insets = args.insets if args.insets is not None else (metadata or {}).get("insets")
        if insets is None:
            raise ValueError("Supply full-frame pixel insets with --insets or a native capture sidecar")
        if metadata is not None and args.insets is not None and args.insets != metadata.get("insets"):
            raise ValueError(f"{metadata_path}: supplied insets disagree with the capture sidecar")

        native, box = crop_viewport(frame, dimensions, insets)
        expected_marker = geometry_id(dimensions, args.scale, insets)
        verified = metadata is not None and (
            metadata.get("method") == "maestro-ready-and-geometry"
            and metadata.get("geometryId") == expected_marker
            and metadata.get("readyId") == case.get("readyId", f"shared-ui-case-{case_id}")
            and metadata.get("nativeViewport") == list(dimensions)
            and "referenceSha256" in metadata
            and "rawSha256" in metadata
        )
        native.save(crop_path)
        difference = ImageChops.difference(reference, native)
        red, green, blue = difference.split()
        strongest_delta = ImageChops.lighter(ImageChops.lighter(red, green), blue)
        changed_pixels = native.width * native.height - strongest_delta.histogram()[0]
        if changed_pixels:
            ImageOps.autocontrast(difference).save(diff_path)
        reference_blank = flat_color(reference)
        native_blank = flat_color(native)
        status = "different" if changed_pixels else "match"
        if reference_blank or native_blank:
            status = "blank"
        if not verified:
            status = "unverified"
        result.update({
            "cropPixels": box,
            "nativeCrop": crop_path.name,
            "changedPixels": changed_pixels,
            "maxRgbDelta": strongest_delta.getextrema()[1],
            "differenceBounds": strongest_delta.getbbox(),
            "diff": diff_path.name if changed_pixels else None,
            "referenceBlank": reference_blank,
            "nativeBlank": native_blank,
            "geometryVerified": verified,
            "status": status,
        })
    except (OSError, ValueError, ImageCms.PyCMSError) as error:
        result.update({"status": "invalid", "error": str(error)})
    return result


def compare_cases(cases, args):
    args.out_dir.mkdir(parents=True, exist_ok=True)
    results = [compare_case(case, args) for case in cases]
    report = args.out_dir / "results.json"
    write_json(report, {"platform": args.platform, "dpr": scale_label(args.scale), "cases": results})
    matched = sum(row["status"] == "match" for row in results)
    print(f"{matched}/{len(results)} cases matched at DPR {scale_label(args.scale)}. Report: {report}")
    return int(matched != len(results))


def text_output(command):
    return subprocess.check_output(command, text=True).strip()


def device_info(args):
    if args.platform == "android":
        shell = ["adb", "-s", args.device, "shell"]
        density = text_output([*shell, "wm", "density"])
        reported = re.findall(r"(?:Physical|Override) density:\s*(\d+)", density)
        if not reported or Decimal(reported[-1]) / 160 != args.scale:
            raise ValueError(f"Android reported {density!r} and reference DPR is {scale_label(args.scale)}")
        return {
            "model": text_output([*shell, "getprop", "ro.product.model"]),
            "osVersion": text_output([*shell, "getprop", "ro.build.version.release"]),
            "abi": text_output([*shell, "getprop", "ro.product.cpu.abi"]),
            "windowSize": text_output([*shell, "wm", "size"]),
            "density": density,
            "fontScale": text_output([*shell, "settings", "get", "system", "font_scale"]),
        }

    listing = json.loads(text_output(["xcrun", "simctl", "list", "devices", "booted", "-j"]))
    for runtime, devices in listing["devices"].items():
        for device in devices:
            if device["udid"].lower() == args.device.lower():
                return {
                    "model": device["name"], "osVersion": runtime,
                    **ios_app_info(args.device, getattr(args, "ios_executable_sha256", None)),
                }
    raise ValueError("Choose a booted iOS simulator using its explicit UDID")


def ios_app_info(device, expected_sha256):
    app = Path(text_output(["xcrun", "simctl", "get_app_container", device, APP_ID, "app"])).resolve()
    with (app / "Info.plist").open("rb") as stream:
        info = plistlib.load(stream)
    if not isinstance(info, dict) or info.get("CFBundleIdentifier") != APP_ID:
        raise ValueError(f"Installed iOS app Info.plist must identify {APP_ID}")
    name = info.get("CFBundleExecutable")
    if not isinstance(name, str) or not name or Path(name).name != name:
        raise ValueError("Installed iOS app has an invalid CFBundleExecutable")
    executable = (app / name).resolve()
    if executable.parent != app or not executable.is_file():
        raise ValueError("Installed iOS app executable is missing from the app bundle")
    abi = platform.machine()
    architectures = text_output(["xcrun", "lipo", "-archs", str(executable)]).split()
    if abi not in architectures:
        raise ValueError(f"Installed iOS app supports {architectures}, runner architecture is {abi!r}")
    digest = sha256(executable)
    if expected_sha256 is not None and digest != expected_sha256.lower():
        raise ValueError(f"Installed iOS app executable SHA-256 {digest} disagrees with expected {expected_sha256}")
    return {"abi": abi, "appArchitectures": architectures, "appExecutableSha256": digest}


def maestro_case_flow(case_id, ready_id, marker=None):
    flow = (
        f"appId: {APP_ID}\n---\n- launchApp\n"
        "- extendedWaitUntil:\n    visible: separator\n    timeout: 20000\n"
        f"- openLink: zyx-native-parity://internal/shared-ui/{case_id}\n"
        "- runFlow:\n"
        "    when:\n"
        "      platform: iOS\n"
        r"      visible: '^Open in “Zyx Academy Native”\?$'" "\n"
        "    commands:\n"
        "      - tapOn: '^Open$'\n"
        f"- extendedWaitUntil:\n    visible:\n      id: {ready_id}\n    timeout: 20000\n"
    )
    if marker:
        flow += f"- extendedWaitUntil:\n    visible:\n      id: {marker}\n    timeout: 10000\n"
    return flow


def device_screenshot(platform, device, path):
    if platform == "ios":
        subprocess.run(["xcrun", "simctl", "io", device, "screenshot", str(path)], check=True)
    else:
        with path.open("wb") as stream:
            subprocess.run(
                ["adb", "-s", device, "exec-out", "screencap", "-p"],
                stdout=stream, stderr=subprocess.PIPE, timeout=20, check=True,
            )


def stable_crop(platform, device, first_path, dimensions, insets):
    previous, _ = crop_viewport(load_png(first_path), dimensions, insets)
    sample = first_path.with_suffix(".sample.png")
    try:
        for _ in range(8):
            time.sleep(0.4)
            device_screenshot(platform, device, sample)
            current, _ = crop_viewport(load_png(sample), dimensions, insets)
            if ImageChops.difference(previous, current).getbbox() is None:
                sample.replace(first_path)
                return
            previous = current
    finally:
        sample.unlink(missing_ok=True)
    raise ValueError("No two consecutive captures agreed inside the safe area")


def command_text(output):
    return (output or b"").decode("utf-8", errors="replace").strip()


def transient_android_failure(diagnostics, *, fixture_setup, timed_out=False):
    if fixture_setup and "Assertion is false" in diagnostics:
        return False
    return (
        timed_out
        or ADB_TRANSPORT_FAILURE.search(diagnostics) is not None
        or (fixture_setup and MAESTRO_INTERRUPTED_LAUNCH.search(diagnostics) is not None)
    )


def wait_for_android_device(device, context):
    print(f"[{context}] Waiting for {device} before retrying", flush=True)
    try:
        subprocess.run(["adb", "-s", device, "wait-for-device"], timeout=15, check=True)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(f"[{context}] ADB readiness check failed: {error}", flush=True)


def capture_frame(args, case_id, flow, path):
    attempts, timeout = (3, 120) if args.platform == "android" else (1, 240)
    for attempt in range(1, attempts + 1):
        fixture_setup = True
        try:
            result = subprocess.run(
                ["maestro", "--device", args.device, "test", str(flow)],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, check=True,
            )
            print(f"[{case_id}] Maestro attempt {attempt}/{attempts}\n{command_text(result.stdout)}", flush=True)
            fixture_setup = False
            device_screenshot(args.platform, args.device, path)
            return
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            stage = "Maestro fixture setup" if fixture_setup else "device screenshot"
            diagnostics = command_text(error.stdout if fixture_setup else error.stderr)
            detail = f"\n{diagnostics}" if diagnostics else ""
            print(f"[{case_id}] {stage} failed on attempt {attempt}/{attempts}: {error}{detail}", flush=True)
            if attempt == attempts or not transient_android_failure(
                diagnostics, fixture_setup=fixture_setup, timed_out=isinstance(error, subprocess.TimeoutExpired),
            ):
                raise
            wait_for_android_device(args.device, case_id)


def capture_case(case, args, device, scratch):
    case_id = case["id"]
    dimensions = pixel_size(case, args.scale)
    relative = case_id in getattr(args, "relative_case", [])
    try:
        _, reference_digest = validate_reference(case, args)
    except (OSError, ValueError, ImageCms.PyCMSError):
        if not relative:
            raise
        reference_digest = None
    ready_id = case.get("readyId", f"shared-ui-case-{case_id}")
    marker = geometry_id(dimensions, args.scale, args.insets)
    target = args.raw_dir / f"{case_id}.png"
    sidecar = target.with_suffix(".json")
    sidecar.unlink(missing_ok=True)
    flow = scratch / "capture.yaml"
    flow.write_text(maestro_case_flow(case_id, ready_id, marker), encoding="utf-8")
    path = scratch / f"{case_id}.png"
    capture_frame(args, case_id, flow, path)
    if relative:
        try:
            stable_crop(args.platform, args.device, path, dimensions, args.insets)
        except (OSError, ValueError, subprocess.SubprocessError, ImageCms.PyCMSError):
            path.replace(args.raw_dir / f"{case_id}-unstable.png")
            raise
    frame = load_png(path)
    path.replace(target)
    crop_viewport(frame, dimensions, args.insets)
    write_json(sidecar, {
        "id": case_id,
        "platform": args.platform,
        "device": args.device,
        "deviceInfo": device,
        "build": args.build,
        "method": "maestro-ready-and-geometry",
        "readyId": ready_id,
        "geometryId": marker,
        **({"referenceSha256": reference_digest} if reference_digest else {}),
        **({"stableCrop": True} if relative else {}),
        "rawSha256": sha256(target),
        "dpr": scale_label(args.scale),
        "nativeViewport": dimensions,
        "rawPixels": frame.size,
        "insets": args.insets,
    })


def capture_cases(cases, args):
    device = device_info(args)
    args.raw_dir.mkdir(parents=True, exist_ok=True)
    failures = []
    with TemporaryDirectory(dir=args.raw_dir) as directory:
        for case in cases:
            try:
                capture_case(case, args, device, Path(directory))
            except (OSError, ValueError, subprocess.SubprocessError, ImageCms.PyCMSError) as error:
                failures.append(case["id"])
                print(f"{case['id']}: {error}")
    print(f"{len(cases) - len(failures)}/{len(cases)} exact-viewport frames captured in {args.raw_dir}")
    return int(bool(failures))


def read_args():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--platform", choices=("android", "ios"), required=True)
    common.add_argument("--scale", type=parse_scale, required=True, help="Exact reference/device DPR")
    common.add_argument("--reference-dir", type=Path, help="Directory containing results.json and reference PNGs")
    common.add_argument("--raw-dir", type=Path, required=True, help="Directory containing full-frame device PNGs")
    common.add_argument("--case", action="append", default=[], help="Only process this case, repeat to select others")
    common.add_argument("--viewport", help="Only process cases of this CSS size (WIDTHxHEIGHT)")
    inset_flags = {"nargs": 4, "type": int, "metavar": ("LEFT", "TOP", "RIGHT", "BOTTOM"), "help": "Explicit crop in raw device pixels"}
    capture = commands.add_parser("capture", parents=[common])
    capture.add_argument("--insets", required=True, **inset_flags)
    capture.add_argument("--device", required=True, help="Explicit adb serial or booted simulator UDID")
    capture.add_argument("--build", required=True, help="Commit or artifact identifier of the installed build")
    capture.add_argument("--relative-case", action="append", default=[], help="Require a stable Expo capture independent of Chromium for this case")
    capture.add_argument("--manifest", type=Path, help="Use a case manifest when the diagnostic reference manifest is unavailable")
    capture.add_argument(
        "--ios-executable-sha256", default=os.environ.get("SHARED_IOS_EXECUTABLE_SHA256"),
        help="Expected SHA-256 of the iOS build executable (defaults to SHARED_IOS_EXECUTABLE_SHA256)",
    )
    compare = commands.add_parser("compare", parents=[common])
    compare.add_argument("--insets", **inset_flags)
    compare.add_argument("--out-dir", type=Path, required=True)
    compare.add_argument("--build", required=True, help="Commit or artifact identifier expected in native capture sidecars")
    args = parser.parse_args()
    args.reference_dir = args.reference_dir or REFERENCE_ROOT / f"dpr{scale_label(args.scale)}"
    if args.insets is not None and any(value < 0 for value in args.insets):
        parser.error("Insets must be nonnegative")
    if args.command == "capture" and args.ios_executable_sha256 is not None:
        if args.platform != "ios" or not re.fullmatch(r"[a-fA-F0-9]{64}", args.ios_executable_sha256):
            parser.error("--ios-executable-sha256 requires iOS capture and a 64-character hexadecimal digest")
    if args.command == "capture" and args.relative_case and (args.platform != "android" or args.scale != 1):
        parser.error("Relative device evidence requires Android at DPR 1")
    return args


def main():
    args = read_args()
    try:
        directories = [args.reference_dir.resolve(), args.raw_dir.resolve()]
        if args.command == "compare":
            directories.append(args.out_dir.resolve())
        if len(set(directories)) != len(directories):
            raise ValueError("Choose separate reference, raw PNG, and report directories")
        manifest = getattr(args, "manifest", None) or args.reference_dir / "results.json"
        cases = manifest_cases(manifest, args.case, args.viewport)
        return (capture_cases if args.command == "capture" else compare_cases)(cases, args)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    raise SystemExit(main())
