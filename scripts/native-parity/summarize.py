"""Report Android WebView relative visual parity and optional iOS exact measurements."""
import argparse
import json
import os
from pathlib import Path

from case_manifest import PAGE_BEHAVIORS, PAGE_CAPTURES, load_case_layout, load_page_manifest, page_behavior_cases
from relative_policy import relative_issues

SCALES = {"android": 1, "ios": 3}


def device_results(report, component, case_ids, platform, commit, build_commit, reference_engine=None):
    if not isinstance(report, dict) or (
        report.get("platform"), report.get("scale"), report.get("component"), report.get("commit"), report.get("buildCommit")
    ) != (platform, SCALES[platform], component, commit, build_commit):
        return None
    if report.get("referenceEngine") != reference_engine:
        return None
    results = report.get("cases")
    if not isinstance(results, list) or not all(isinstance(item, dict) for item in results):
        return None
    if [item.get("id") for item in results] != case_ids:
        return None
    return results


def check_device(report, component, case_ids, platform, commit, build_commit, reference_engine=None):
    results = device_results(report, component, case_ids, platform, commit, build_commit, reference_engine)
    if results is None:
        return "Missing"
    counts = [item.get("differentPixels") for item in results]
    if any(type(count) is not int or count < 0 for count in counts):
        return "Missing"
    if not all(item.get("blankReference") is False for item in results):
        return "Invalid reference"
    if any(counts):
        return f"{sum(counts):,} differing pixels"
    return "Pass"


def android_relative_rows(report, component, case_ids, heights, commit, build_commit):
    results = device_results(report, component, case_ids, "android", commit, build_commit, "android-webview")
    if results is None:
        results = [{} for _ in case_ids]
    rows = []
    for case, item in zip(case_ids, results):
        metrics = item.get("relativeVisual")
        expected = (320, heights[case])
        raw = item.get("differentPixels")
        issues = relative_issues(metrics, expected)
        if item.get("blankReference") is True or item.get("blankNative") is True:
            status = "Invalid blank crop"
        elif (item.get("blankReference") is not False or item.get("blankNative") is not False
              or type(raw) is not int or not 0 <= raw <= expected[0] * expected[1]):
            status = "Missing or incompatible evidence"
        else:
            status = ", ".join(issues) if issues else "Pass"
        comparable = isinstance(metrics, dict)
        scores = [metrics.get(key) if comparable else None for key in ("fullSsim", "foregroundSsim")]
        rows.append([case, *(f"{score:.4f}" if type(score) in (int, float) else "—" for score in scores),
                     f"{raw:,}" if type(raw) is int else "—", status])
    return rows


def load_device_result(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


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
    manifests = [load_case_layout(args.artifacts / f"reference-manifests/dpr{SCALES[p]}/cases.json") for p in selected]
    groups, heights = manifests[0]
    if any(other != manifests[0] for other in manifests):
        raise ValueError("Case manifests differ between Android and iOS reference scales")
    rows = []
    android_cases = []
    passes = dict.fromkeys(selected, 0)
    for component, case_ids in groups.items():
        states = []
        for platform in selected:
            directory = args.artifacts / f"{platform}-measurements"
            engine = "android-webview" if platform == "android" else "ios-wkwebview"
            chromium = load_device_result(directory / f"result-{component}.json")
            browser = load_device_result(directory / "native-vs-webview" / f"result-{component}.json")
            diagnostic = check_device(chromium, component, case_ids, platform, args.commit, args.build_commit)
            if platform == "android":
                cases = android_relative_rows(browser, component, case_ids, heights, args.commit, args.build_commit)
                android_cases.extend(table_row(row) for row in cases)
                passed = sum(row[-1] == "Pass" for row in cases)
                states.extend((f"{passed}/{len(case_ids)} visual", "Exact" if diagnostic == "Pass" else diagnostic))
                passes[platform] += passed == len(case_ids)
            else:
                exact = check_device(browser, component, case_ids, platform, args.commit, args.build_commit, engine)
                states.extend((diagnostic, exact))
                passes[platform] += diagnostic == exact == "Pass"
        rows.append(f"| {component} | {' | '.join(states)} |")
    headers = {"android": ("Android WebView visual", "Android Chromium diagnostic"),
               "ios": ("iOS Chromium exact", "iOS WKWebView exact")}
    totals = {"android": "passed all three Android WebView visual cases",
              "ios": "matched all three cases exactly in both iOS references"}
    output = "\n".join([
        f"### Native visual measurements for `{args.commit}`", "", f"Tested checkout: `{args.build_commit}`.", "",
        *(f"{passes[p]}/{len(groups)} components {totals[p]}." for p in selected), "",
        table_row(["Component", *(label for platform in selected for label in headers[platform])]),
        table_row(["---"] * (1 + 2 * len(selected))), *rows, "",
        *(["#### Android WebView cases", "",
           table_row(["Case", "Full SSIM", "Foreground SSIM", "Different pixels", "Visual result"]),
           table_row(["---"] * 5), *android_cases, ""] if android_cases else []),
        "Public page fixture captures are outside native page readiness.", "",
        "Visual results cover only the captured state. Interaction, accessibility and product readiness require separate evidence.", "",
    ])
    print(output)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(output)
    if any(passed != len(groups) for passed in passes.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
