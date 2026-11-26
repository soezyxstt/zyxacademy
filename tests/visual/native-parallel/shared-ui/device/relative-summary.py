"""Report verified relative Shared UI cases and require all three per component."""
from collections import defaultdict
import json
from pathlib import Path
import re
import sys

from relative_catalog import expected_relative_cases

sys.path.insert(0, str(Path(__file__).resolve().parents[5] / "scripts/native-parity"))
from relative_policy import POLICY, relative_issues


def summarize(root, build, expected):
    selected = {case["id"]: case["component"] for case in expected}
    reports = defaultdict(list)
    devices = set()
    errors = []
    for group in ("phone", "tablet", "wide"):
        folder = root / group
        try:
            latest = json.loads((folder / "latest-run.json").read_text())["runDirectory"]
            summary_dir = folder / Path(latest).name
            summary = json.loads((summary_dir / "ci-summary.json").read_text())
            if summary.get("platform") != "android" or summary.get("build") != build or summary.get("group") != group:
                raise ValueError("unexpected group or build")
            devices.add(summary["device"])
            if not summary.get("relativeCases"):
                continue
            geometry = summary["geometry"]
            size = geometry["width"], geometry["height"]
            if geometry.get("scale") != "1" or any(type(value) is not int or value <= 0 for value in size):
                raise ValueError("invalid native geometry at DPR 1")
            insets = geometry["insets"]
            if not isinstance(insets, list) or len(insets) != 4 or any(type(value) is not int or value < 0 for value in insets):
                raise ValueError("invalid safe area insets")
            box = [insets[0], insets[1], insets[0] + size[0], insets[1] + size[1]]
            evidence = json.loads((summary_dir / "relative/results.json").read_text())
            if (evidence.get("policy"), evidence.get("platform"), evidence.get("referenceEngine"),
                    evidence.get("build"), evidence.get("dpr"), evidence.get("device")) != (
                        POLICY, "android", "android-webview", build, 1, summary["device"]):
                raise ValueError("unexpected relative evidence provenance")
            cases = evidence["cases"]
            if sorted(row["id"] for row in cases) != sorted(summary["relativeCases"]):
                raise ValueError("report does not cover the expected cases for this viewport")
            for row in cases:
                if row.get("status") == "pass" and (row.get("cropPixels") != box or any(
                    not re.fullmatch(r"[a-f0-9]{64}", str(row.get(key))) for key in ("expoRawSha256", "webviewRawSha256")
                )):
                    raise ValueError(f"{row['id']}: missing or incompatible crop provenance")
                reports[row["id"]].append((row, size))
        except (OSError, ValueError, KeyError, TypeError) as error:
            errors.append(f"{group}: {error}")
    if len(devices) != 1:
        errors.append("Expected one Android emulator for every viewport")
    if reports.keys() - selected.keys():
        errors.append("Unexpected relative fixture cases")

    groups = defaultdict(list)
    rows = []
    for case, component in selected.items():
        copies = reports[case]
        row, size = copies[0] if len(copies) == 1 and copies[0][0].get("component") == component else ({}, None)
        metrics = row.get("relativeVisual")
        raw = row.get("differentPixels")
        verified = (row.get("status") == "pass" and row.get("issues") == [] and size
                    and row.get("referenceBlank") is False and row.get("nativeBlank") is False
                    and type(raw) is int and 0 <= raw <= size[0] * size[1] and not relative_issues(metrics, size))
        groups[component].append(verified)
        scores = [metrics.get(key) if isinstance(metrics, dict) else None for key in ("fullSsim", "foregroundSsim")]
        rows.append([case, *(f"{score:.4f}" if type(score) in (int, float) else "—" for score in scores),
                     str(raw) if type(raw) is int else "—", "Pass" if verified else "Fail" if row.get("status") == "fail" else "Unverified"])
    passed = sum(len(cases) == 3 and all(cases) for cases in groups.values())
    if any(len(cases) != 3 for cases in groups.values()) or len(expected) != len(selected):
        errors.append("Expected exactly three registered cases per component")

    print("### Shared UI Android WebView · relative visual gate\n")
    print(f"{passed}/{len(groups)} components passed all three cases on Android. Build `{build}`.\n")
    print("| Case | Full SSIM | Foreground SSIM | Different pixels | Visual result |")
    print("| --- | ---: | ---: | ---: | --- |")
    for row in rows:
        print("| " + " | ".join(row) + " |")
    print("\nInteraction, accessibility and product readiness use separate evidence.")
    for error in errors:
        print(f"\n- {error}")
    return int(bool(errors) or not groups or passed != len(groups))


if __name__ == "__main__":
    sys.exit(summarize(Path(sys.argv[1]), sys.argv[2], expected_relative_cases()))
