"""Report verified Android and iOS pixel parity for one CI head revision."""
import argparse
import json
import os
from pathlib import Path

from case_manifest import PAGE_BEHAVIORS, PAGE_CAPTURES, load_case_groups, load_page_manifest, page_behavior_cases

SCALES = {"android": 1, "ios": 3}


def check_device(report, component, case_ids, platform, commit, build_commit, reference_engine=None):
    if not isinstance(report, dict) or (
        report.get("platform"), report.get("scale"), report.get("component"), report.get("commit"), report.get("buildCommit")
    ) != (platform, SCALES[platform], component, commit, build_commit):
        return "Missing"
    if report.get("referenceEngine") != reference_engine:
        return "Missing"
    results = report.get("cases")
    if not isinstance(results, list) or not all(isinstance(item, dict) for item in results):
        return "Missing"
    if [item.get("id") for item in results] != case_ids:
        return "Missing"
    counts = [item.get("differentPixels") for item in results]
    if any(type(count) is not int or count < 0 for count in counts):
        return "Missing"
    if not all(item.get("blankReference") is False for item in results):
        return "Invalid reference"
    if any(counts):
        return f"{sum(counts):,} differing pixels"
    return "Pass"


def check_page(report, manifest, platform, reference_engine="chromium"):
    scale = SCALES[platform]
    viewport = [manifest["width"], manifest["height"]]
    case_ids = manifest["cases"]
    missing = ["Missing"] * len(case_ids)
    if not isinstance(report, dict) or (
        report.get("route"), report.get("platform"), report.get("scale"), report.get("viewport"),
        report.get("referenceEngine"), report.get("commit"), report.get("buildCommit"),
    ) != (manifest["route"], platform, scale, viewport, reference_engine, manifest["commit"], manifest["buildCommit"]):
        return missing
    results = report.get("cases")
    if not isinstance(results, list) or not all(isinstance(item, dict) for item in results):
        return missing
    if [item.get("case") for item in results] != case_ids:
        return missing
    expected_size = [value * scale for value in viewport]
    behavior_cases = page_behavior_cases(manifest)
    states = []
    for item in results:
        status, changed = item.get("status"), item.get("differentPixels")
        if status == "invalid-reference" or item.get("blankReference") is True:
            states.append("Invalid reference")
        elif status == "missing-stable-frame":
            states.append({
                "native": "Missing stable native frame", "webview": "Missing stable WebView frame",
            }.get(str(item.get("surface")), "Missing stable frame"))
        elif status == "navigation-failed":
            states.append("Fixture navigation failed")
        elif status == "invalid-native-frame":
            states.append("Invalid native frame")
        elif item["case"] in behavior_cases:
            key = behavior_cases[item["case"]]
            required_status, label = PAGE_BEHAVIORS[key]
            if (status == required_status and item.get(key) == manifest[key]
                    and item.get("framePixels") == expected_size and "differentPixels" not in item):
                states.append(label)
            else:
                states.append("Missing behavior evidence")
        elif (item.get("framePixels") != expected_size or item.get("blankReference") is not False
              or type(changed) is not int or changed < 0 or status != ("fail" if changed else "pass")):
            states.append("Missing")
        else:
            states.append(f"{changed:,} differing pixels" if changed else "Pass")
    return states


def table_row(cells):
    return "| " + " | ".join(cells) + " |"


def platform_label(platforms):
    return "both platforms" if len(platforms) == 2 else {"android": "Android", "ios": "iOS"}[platforms[0]]


def page_summary(artifacts, commit, build_commit, group, selected=("android", "ios"), reference_engine="chromium"):
    route, _ = PAGE_CAPTURES[group]
    engine_name, measurement_prefix = {
        "chromium": ("Chromium", ""),
        "android-webview": ("Android WebView", "native-vs-webview/"),
    }[reference_engine]
    title = f"#### `{route}` route vs {engine_name}"
    try:
        manifests = [load_page_manifest(artifacts / f"reference-manifests/dpr{SCALES[platform]}/{group}.json", group)
                     for platform in selected]
        manifest = manifests[0]
    except (OSError, ValueError):
        return [title, "", "Missing or invalid page case manifest.", ""], False
    if any(other != manifest for other in manifests) or (manifest["commit"], manifest["buildCommit"]) != (commit, build_commit):
        return [title, "", "Page case manifests do not match the selected reference scales and tested revision.", ""], False

    platforms = []
    for platform in selected:
        try:
            path = artifacts / f"{platform}-measurements/{measurement_prefix}{group}/result.json"
            report = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            report = None
        platforms.append(check_page(report, manifest, platform, reference_engine))
    rows = [table_row(row) for row in zip(manifest["cases"], *platforms)]
    behaviors = page_behavior_cases(manifest)
    comparable = len(rows) - len(behaviors)
    passed = sum(all(state == "Pass" for state in row) for row in zip(*platforms))
    behavior_ok = all(
        states[manifest["cases"].index(case)] == PAGE_BEHAVIORS[key][1]
        for case, key in behaviors.items() for states in platforms
    )
    explanation = ["Redirect and recovery cases are reported as behavior evidence.", ""] if behaviors else []
    return [
        title, "", f"Viewport {manifest['width']} × {manifest['height']}. "
        f"{passed}/{comparable} comparable route cases matched exactly on {platform_label(selected)}.", "", *explanation,
        table_row(["Case", *(f"{platform_label([platform])} DPR {SCALES[platform]}" for platform in selected)]),
        table_row(["---"] * (1 + len(selected))), *rows, "",
    ], passed == comparable and behavior_ok


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifacts", type=Path)
    parser.add_argument("commit")
    parser.add_argument("build_commit")
    parser.add_argument("--platform", choices=SCALES, help="Report one platform as soon as its measurements exist")
    args = parser.parse_args()
    selected = (args.platform,) if args.platform else tuple(SCALES)
    manifests = [load_case_groups(args.artifacts / f"reference-manifests/dpr{SCALES[p]}/cases.json") for p in selected]
    groups = manifests[0]
    if any(other != groups for other in manifests):
        raise ValueError("Case manifests differ between Android and iOS reference scales")
    rows = []
    passed = 0
    for component, case_ids in groups.items():
        states = []
        for platform in selected:
            directory = args.artifacts / f"{platform}-measurements"
            engine = "android-webview" if platform == "android" else "ios-wkwebview"
            for root, reference in ((directory, None), (directory / "native-vs-webview", engine)):
                path = root / f"result-{component}.json"
                result = json.loads(path.read_text()) if path.exists() else None
                states.append(check_device(result, component, case_ids, platform, args.commit, args.build_commit, reference))
        passed += all(state == "Pass" for state in states)
        rows.append(f"| {component} | {' | '.join(states)} |")
    output = "\n".join([
        f"### Native pixel parity for `{args.commit}`", "", f"Tested checkout: `{args.build_commit}`.", "",
        f"{passed}/{len(groups)} components matched all three cases against Chromium and the same-device WebView on {platform_label(selected)}.", "",
        table_row(["Component", *(f"{platform_label([platform])} vs {engine}" for platform in selected
                                  for engine in ("Chromium", "WebView" if platform == "android" else "WKWebView"))]),
        table_row(["---"] * (1 + 2 * len(selected))), *rows, "",
        "Public page fixture captures are outside native page readiness.", "",
        "Interaction and accessibility checks are reported by each device job.", "",
    ])
    print(output)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(output)
    if passed != len(groups):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
