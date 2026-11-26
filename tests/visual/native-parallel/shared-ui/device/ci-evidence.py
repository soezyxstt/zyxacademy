"""Capture one group of real device/web evidence and retain per-step diagnostics."""

from decimal import Decimal
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[5]
DEVICE_DIR = Path(__file__).resolve().parent
GROUP_WIDTHS = {"phone": 380, "tablet": 768, "wide": 1024}
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
    if not selected:
        raise ValueError(f"no cases in group {group}")
    return selected


def main():
    platform = os.environ.get("SHARED_PLATFORM", "")
    group = os.environ.get("SHARED_GROUP", "")
    device = os.environ.get("SHARED_DEVICE", "")
    build = os.environ.get("SHARED_BUILD") or os.environ.get("GITHUB_SHA", "")
    if platform not in ("android", "ios") or group not in GROUP_WIDTHS or not device or not re.fullmatch(r"[0-9a-fA-F]{40}", build):
        raise ValueError("Set SHARED_PLATFORM=android|ios, SHARED_GROUP=phone|tablet|wide, SHARED_DEVICE and 40-character SHARED_BUILD or GITHUB_SHA")
    group_dir = ROOT / "artifacts" / "native-parity" / "shared-ui" / platform / group
    group_dir.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix="run-", dir=group_dir))
    summary = {"platform": platform, "group": group, "device": device, "build": build, "runDirectory": str(output.relative_to(ROOT)), "errors": []}
    status = 1
    try:
        expected = expected_cases(group)
        summary["expectedCases"] = len(expected)
        (output / "expected-cases.json").write_text(json.dumps(expected, indent=2) + "\n", encoding="utf-8")
        flow = output / "geometry.yaml"
        flow.write_text(
            "appId: com.zyx.academy.nativeparity\n---\n- launchApp\n"
            "- openLink: zyx-native-parity://shared-ui/shared-ui-shell-back-light\n"
            "- extendedWaitUntil:\n    visible:\n      id: shared-ui-case-shared-ui-shell-back-light\n    timeout: 30000\n",
            encoding="utf-8",
        )
        if command("geometry-open", ["maestro", "--device", device, "test", str(flow)], output):
            raise ValueError("could not open native geometry fixture")
        geometry = None
        for attempt in range(1, 4):
            result = command(f"geometry-hierarchy-{attempt}", ["maestro", "--device", device, "hierarchy"], output)
            if result == 0:
                try:
                    geometry = measure((output / f"geometry-hierarchy-{attempt}.log").read_text(encoding="utf-8", errors="replace"))
                    break
                except ValueError as error:
                    print(f"Geometry attempt {attempt}: {error}", flush=True)
        if geometry is None:
            raise ValueError("could not obtain a unique integral viewport geometry marker")
        geometry.update({"platform": platform, "group": group, "device": device, "build": build, "baselineWidth": GROUP_WIDTHS[group]})
        summary["geometry"] = geometry
        (output / "geometry.json").write_text(json.dumps(geometry, indent=2) + "\n", encoding="utf-8")
        print(f"Measured native geometry: {geometry}", flush=True)

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
        web_result = command("web-capture", ["bun", "tests/visual/native-parallel/shared-ui/capture.ts"], output, env)
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
        if group == "phone":
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
