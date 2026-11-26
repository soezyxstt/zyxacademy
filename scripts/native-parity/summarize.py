"""Report verified Android and iOS pixel parity for one CI head revision."""
import argparse
import json
import os
from pathlib import Path

from case_manifest import PAGE_CAPTURES, load_case_groups, load_page_manifest

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


def check_page(report, manifest, platform):
    scale = SCALES[platform]
    viewport = [manifest["width"], manifest["height"]]
    case_ids = manifest["cases"]
    missing = ["Missing"] * len(case_ids)
    if not isinstance(report, dict) or (
        report.get("route"), report.get("platform"), report.get("scale"), report.get("viewport"),
        report.get("referenceEngine"), report.get("commit"), report.get("buildCommit"),
    ) != (manifest["route"], platform, scale, viewport, "chromium", manifest["commit"], manifest["buildCommit"]):
        return missing
    results = report.get("cases")
    if not isinstance(results, list) or not all(isinstance(item, dict) for item in results):
        return missing
    if [item.get("case") for item in results] != case_ids:
        return missing
    expected_size = [value * scale for value in viewport]
    redirect = manifest.get("externalRedirect")
    states = []
    for item in results:
        status, changed = item.get("status"), item.get("differentPixels")
        if status == "invalid-reference" or item.get("blankReference") is True:
            states.append("Invalid reference")
        elif status == "missing-stable-frame":
            states.append("Missing stable frame")
        elif status == "navigation-failed":
            states.append("Fixture navigation failed")
        elif redirect and item["case"] == redirect["case"]:
            if (status == "external-redirect" and item.get("externalRedirect") == redirect
                    and item.get("framePixels") == expected_size and "differentPixels" not in item):
                states.append("Web redirects, native handoff captured")
            else:
                states.append("Missing native handoff evidence")
        elif (item.get("framePixels") != expected_size or item.get("blankReference") is not False
              or type(changed) is not int or changed < 0 or status != ("fail" if changed else "pass")):
            states.append("Missing")
        else:
            states.append(f"{changed:,} differing pixels" if changed else "Pass")
    return states


def page_summary(artifacts, commit, build_commit, group):
    route, _ = PAGE_CAPTURES[group]
    title = f"#### `{route}` route vs Chromium"
    try:
        manifest = load_page_manifest(artifacts / f"reference-manifests/dpr1/{group}.json", group)
        ios_manifest = load_page_manifest(artifacts / f"reference-manifests/dpr3/{group}.json", group)
    except (OSError, ValueError):
        return [title, "", "Missing or invalid page case manifest.", ""], False
    if manifest != ios_manifest or (manifest["commit"], manifest["buildCommit"]) != (commit, build_commit):
        return [title, "", "Page case manifests do not match the two reference scales and tested revision.", ""], False

    platforms = []
    for platform in SCALES:
        try:
            path = artifacts / f"{platform}-measurements/{group}/result.json"
            report = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            report = None
        platforms.append(check_page(report, manifest, platform))
    rows = [f"| {case} | {android} | {ios} |" for case, android, ios in zip(manifest["cases"], *platforms)]
    redirect = manifest.get("externalRedirect")
    comparable = len(rows) - bool(redirect)
    passed = sum(android == ios == "Pass" for android, ios in zip(*platforms))
    redirect_ok = not redirect or all(
        states[manifest["cases"].index(redirect["case"])] == "Web redirects, native handoff captured" for states in platforms
    )
    explanation = ["The Google Meet case has a web redirect and a native handoff screen. It is excluded from the pixel comparison.", ""] if redirect else []
    return [
        title, "", f"Viewport {manifest['width']} × {manifest['height']}. "
        f"{passed}/{comparable} comparable route cases matched exactly on both platforms.", "", *explanation,
        "| Case | Android DPR 1 | iOS DPR 3 |", "| --- | --- | --- |", *rows, "",
    ], passed == comparable and redirect_ok


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifacts", type=Path)
    parser.add_argument("commit")
    parser.add_argument("build_commit")
    args = parser.parse_args()
    groups = load_case_groups(args.artifacts / "reference-manifests/dpr1/cases.json")
    ios_groups = load_case_groups(args.artifacts / "reference-manifests/dpr3/cases.json")
    if groups != ios_groups:
        raise ValueError("Case manifests differ between Android and iOS reference scales")
    rows = []
    passed = 0
    for component, case_ids in groups.items():
        states = []
        for platform in SCALES:
            directory = args.artifacts / f"{platform}-measurements"
            engine = "android-webview" if platform == "android" else "ios-wkwebview"
            for root, reference in ((directory, None), (directory / "native-vs-webview", engine)):
                path = root / f"result-{component}.json"
                result = json.loads(path.read_text()) if path.exists() else None
                states.append(check_device(result, component, case_ids, platform, args.commit, args.build_commit, reference))
        passed += all(state == "Pass" for state in states)
        rows.append(f"| {component} | {' | '.join(states)} |")
    pages = [page_summary(args.artifacts, args.commit, args.build_commit, group) for group in PAGE_CAPTURES]
    output = "\n".join([
        f"### Native pixel parity for `{args.commit}`", "", f"Tested checkout: `{args.build_commit}`.", "",
        f"{passed}/{len(groups)} components matched all three cases against Chromium and the same-device WebView on both platforms.", "",
        "| Component | Android vs Chromium | Android vs WebView | iOS vs Chromium | iOS vs WKWebView |", "| --- | --- | --- | --- | --- |", *rows, "",
        *(line for section, _ in pages for line in section),
        "Interaction and accessibility checks are reported by each device job.", "",
    ])
    print(output)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(output)
    if passed != len(groups) or not all(page_passed for _, page_passed in pages):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
