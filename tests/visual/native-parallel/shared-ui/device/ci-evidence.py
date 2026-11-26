"""Capture one group of real device/web evidence and retain per-step diagnostics."""

from decimal import Decimal
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

from evidence import command_text, device_screenshot, maestro_case_flow, transient_android_failure, wait_for_android_device

ROOT = Path(__file__).resolve().parents[5]
DEVICE_DIR = Path(__file__).resolve().parent
GROUP_WIDTHS = {"phone": 380, "tablet": 768, "wide": 1024}
GROUP_CASE_COUNTS = {"phone": 49, "tablet": 2, "wide": 1}
GEOMETRY_CASE = "shared-ui-shell-back-light"
MARKER = re.compile(r"shared-ui-geometry-(\d+)x(\d+)-dpr-(\d+(?:-\d+)?)-insets-(\d+)-(\d+)-(\d+)-(\d+)")


def measure(hierarchy):
    """Parse the marker emitted by the mounted native view, without rounding."""
    markers = set(match.group(0) for match in MARKER.finditer(hierarchy))
    if len(markers) != 1:
        raise ValueError(f"expected one unique native geometry marker, found {sorted(markers)}")
    marker = markers.pop()
    match = MARKER.fullmatch(marker)
    width_px, height_px = int(match[1]), int(match[2])
    scale = Decimal(match[3].replace("-", "."))
    if scale <= 0 or width_px <= 0 or height_px <= 0:
        raise ValueError(f"invalid native geometry: {marker}")
    dimensions = (Decimal(width_px) / scale, Decimal(height_px) / scale)
    if any(value != value.to_integral_value() for value in dimensions):
        raise ValueError(f"native marker {marker} has fractional CSS dimensions {dimensions}; cannot capture exact Playwright viewport")
    return {
        "marker": marker,
        "physicalWidth": width_px,
        "physicalHeight": height_px,
        "scale": format(scale.normalize(), "f"),
        "width": int(dimensions[0]),
        "height": int(dimensions[1]),
        "insets": [int(match[i]) for i in range(4, 8)],
    }


def command(name, args, log_dir, env=None):
    log = log_dir / f"{name}.log"
    print(f"[{name}] {' '.join(map(str, args))}", flush=True)
    with log.open("w", encoding="utf-8") as output:
        result = subprocess.run(args, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT, text=True, check=False)
    print(f"[{name}] exit {result.returncode}, log {log.relative_to(ROOT)}", flush=True)
    if result.returncode:
        print("\n".join(log.read_text(encoding="utf-8", errors="replace").splitlines()[-20:]), flush=True)
    return result.returncode


def expected_cases(group):
    expression = ("import { sharedUiCases } from './packages/native-parity/shared-ui/cases'; "
                  "console.log(JSON.stringify(sharedUiCases.map(c => ({id:c.id,width:c.width}))))")
    text = subprocess.check_output(["bun", "-e", expression], cwd=ROOT, text=True)
    cases = json.loads(text)
    if len(cases) != 52 or len({item["id"] for item in cases}) != 52:
        raise ValueError("expected 52 unique shared UI fixture cases")
    if any(item["width"] not in GROUP_WIDTHS.values() for item in cases):
        raise ValueError("case has no phone/tablet/wide group")
    selected = [item["id"] for item in cases if item["width"] == GROUP_WIDTHS[group]]
    if len(selected) != GROUP_CASE_COUNTS[group]:
        raise ValueError(f"expected {GROUP_CASE_COUNTS[group]} cases in {group}, found {len(selected)}")
    return selected


def read_shard(platform, group):
    try:
        index = int(os.environ.get("SHARED_SHARD_INDEX", "0"))
        count = int(os.environ.get("SHARED_SHARD_COUNT", "1"))
    except ValueError as error:
        raise ValueError("SHARED_SHARD_INDEX and SHARED_SHARD_COUNT must be integers") from error
    if count == 1 and index == 0:
        return index, count
    if platform == "ios" and group == "phone" and count == 3 and 0 <= index < count:
        return index, count
    raise ValueError("Only iOS phone supports SHARED_SHARD_COUNT=3 with SHARED_SHARD_INDEX 0, 1 or 2")


def shard_cases(cases, index, count):
    base, extra = divmod(len(cases), count)
    start = index * base + min(index, extra)
    size = base + int(index < extra)
    return cases[start : start + size]


def require_group_width(group, width):
    if group == "phone":
        if width >= GROUP_WIDTHS["tablet"]:
            raise ValueError(f"phone requires a compact native content width below {GROUP_WIDTHS['tablet']} dp, measured {width} dp")
    elif width < (minimum := GROUP_WIDTHS[group]):
        raise ValueError(f"{group} requires a native content width of at least {minimum} dp, measured {width} dp")


def probe_geometry(device, output, *, platform):
    flow = output / "geometry.yaml"
    flow.write_text(maestro_case_flow(GEOMETRY_CASE, f"shared-ui-case-{GEOMETRY_CASE}"), encoding="utf-8")
    maestro = ["maestro", "--device", device]
    open_attempts = 3 if platform == "android" else 1
    for attempt in range(1, open_attempts + 1):
        suffix = "" if attempt == 1 else f"-{attempt}"
        name = f"geometry-open{suffix}"
        open_result = command(name, [
            *maestro, "test", "--test-output-dir", str(output / f"geometry-results{suffix}"),
            "--debug-output", str(output / f"geometry-debug{suffix}"), str(flow),
        ], output)
        if open_result == 0 or attempt == open_attempts:
            break
        diagnostics = (output / f"{name}.log").read_text(encoding="utf-8", errors="replace")
        if not transient_android_failure(diagnostics, fixture_setup=True):
            break
        wait_for_android_device(device, name)
    reason = "Maestro hierarchy did not complete"
    attempts = 1 if open_result else 3
    for attempt in range(1, attempts + 1):
        name = f"geometry-hierarchy-{attempt}"
        result = command(name, [*maestro, "hierarchy"], output)
        if result == 0 and open_result == 0:
            try:
                return measure((output / f"{name}.log").read_text(encoding="utf-8", errors="replace"))
            except ValueError as error:
                reason = str(error)
                print(f"Geometry attempt {attempt}: {reason}", flush=True)
    if open_result:
        raise ValueError("could not open native geometry fixture")
    raise ValueError(f"could not obtain a unique integral viewport geometry marker: {reason}")


def main():
    platform = os.environ.get("SHARED_PLATFORM", "")
    group = os.environ.get("SHARED_GROUP", "")
    device = os.environ.get("SHARED_DEVICE", "")
    build = os.environ.get("SHARED_BUILD") or os.environ.get("GITHUB_SHA", "")
    if platform not in ("android", "ios") or group not in GROUP_WIDTHS or not device or not re.fullmatch(r"[0-9a-fA-F]{40}", build):
        raise ValueError("Set SHARED_PLATFORM=android|ios, SHARED_GROUP=phone|tablet|wide, SHARED_DEVICE and 40-character SHARED_BUILD or GITHUB_SHA")
    shard_index, shard_count = read_shard(platform, group)
    group_dir = ROOT / "artifacts" / "native-parity" / "shared-ui" / platform / group
    group_dir.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix="run-", dir=group_dir))
    summary = {
        "platform": platform, "group": group, "device": device, "build": build,
        "shardIndex": shard_index, "shardCount": shard_count, "runDirectory": str(output.relative_to(ROOT)), "errors": [],
    }
    status = 1
    try:
        expected = shard_cases(expected_cases(group), shard_index, shard_count)
        summary["expectedCases"] = len(expected)
        summary["expectedCaseIds"] = expected
        (output / "expected-cases.json").write_text(json.dumps(expected, indent=2) + "\n", encoding="utf-8")
        try:
            geometry = probe_geometry(device, output, platform=platform)
            geometry.update({"platform": platform, "group": group, "device": device, "build": build, "baselineWidth": GROUP_WIDTHS[group]})
            summary["geometry"] = geometry
            (output / "geometry.json").write_text(json.dumps(geometry, indent=2) + "\n", encoding="utf-8")
            print(f"Measured native geometry: {geometry}", flush=True)
            require_group_width(group, geometry["width"])
        except (OSError, ValueError, subprocess.SubprocessError):
            try:
                device_screenshot(platform, device, output / "geometry-failure.png")
            except (OSError, subprocess.SubprocessError) as error:
                diagnostics = command_text(getattr(error, "stderr", None))
                detail = f"\n{diagnostics}" if diagnostics else ""
                print(f"Geometry diagnostic screenshot failed: {error}{detail}", file=sys.stderr, flush=True)
            raise

        web_root = output / "web"
        scale = geometry["scale"]
        reference = web_root / f"dpr{scale}"
        env = os.environ.copy()
        env.update({
            "SHARED_UI_VIEWPORT": f'{geometry["width"]}x{geometry["height"]}',
            "SHARED_UI_BASE_WIDTH": str(GROUP_WIDTHS[group]),
            "SHARED_UI_REFERENCES": str(web_root),
            "PARITY_DPR": scale,
        })
        web_result = command("web-capture", ["bun", "tests/visual/native-parallel/shared-ui/capture.ts", *expected], output, env)
        summary["webExit"] = web_result
        manifest = reference / "results.json"
        if not manifest.exists():
            raise ValueError(f"missing web capture manifest: {manifest}")
        records = json.loads(manifest.read_text(encoding="utf-8"))
        actual_ids = [record["id"] for record in records]
        summary["webCaptured"] = sum(record.get("captured") is True for record in records)
        if len(actual_ids) != len(expected) or set(actual_ids) != set(expected):
            raise ValueError(f"web manifest does not cover exactly the {len(expected)} cases in {group}")

        raw = output / "raw"
        report = output / "compare"
        common = ["--platform", platform, "--scale", scale, "--reference-dir", str(reference), "--raw-dir", str(raw)]
        evidence = ["python3", str(DEVICE_DIR / "evidence.py")]
        summary["nativeExit"] = command("native-capture", [*evidence, "capture", *common, "--device", device, "--build", build, "--insets", *map(str, geometry["insets"])], output)
        # Compare even after capture failure; preserve valid crops and diffs.
        summary["compareExit"] = command("compare", [*evidence, "compare", *common, "--build", build, "--out-dir", str(report)], output)
        results = report / "results.json"
        if results.exists():
            compared = json.loads(results.read_text(encoding="utf-8"))["cases"]
            counts = {key: sum(item.get("status") == key for item in compared) for key in ("match", "different", "blank", "invalid", "unverified")}
            summary["comparisonCounts"] = counts
            summary["nativeCaptured"] = sum((raw / f"{case_id}.json").exists() for case_id in expected)
            if len(compared) != len(expected) or {item["id"] for item in compared} != set(expected):
                summary["errors"].append("comparison report is incomplete")
        else:
            summary["errors"].append("comparison report is missing")
        status = int(bool(web_result or summary["nativeExit"] or summary["compareExit"] or summary["errors"]))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        summary["errors"].append(str(error))
        print(f"CI evidence error: {error}", file=sys.stderr, flush=True)
    finally:
        if group == "phone" and shard_index == 0:
            try:
                accessibility = command("accessibility", ["bash", str(DEVICE_DIR / "ci-accessibility.sh")], output)
            except OSError as error:
                print(f"Accessibility error: {error}", file=sys.stderr, flush=True)
                accessibility = 1
            summary["accessibilityExit"] = accessibility
            status = int(bool(status or accessibility))
        summary["exit"] = status
        (output / "ci-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        (group_dir / "latest-run.json").write_text(json.dumps({"runDirectory": str(output.relative_to(ROOT)), "exit": status}, indent=2) + "\n", encoding="utf-8")
        print(f"Group summary: {output / 'ci-summary.json'}", flush=True)
    return status


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"CI evidence error: {error}", file=sys.stderr)
        sys.exit(1)
