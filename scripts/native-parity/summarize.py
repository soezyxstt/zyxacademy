"""Report verified Android and iOS pixel parity for one CI head revision."""
import argparse
import json
import os
from pathlib import Path

from case_manifest import load_case_groups

SCALES = {"android": 1, "ios": 3}


def check_device(report, component, case_ids, platform, commit, build_commit):
    if not isinstance(report, dict) or (
        report.get("platform"), report.get("scale"), report.get("component"), report.get("commit"), report.get("buildCommit")
    ) != (platform, SCALES[platform], component, commit, build_commit):
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
            path = args.artifacts / f"{platform}-measurements/result-{component}.json"
            result = json.loads(path.read_text()) if path.exists() else None
            states.append(check_device(result, component, case_ids, platform, args.commit, args.build_commit))
        passed += all(state == "Pass" for state in states)
        rows.append(f"| {component} | {' | '.join(states)} |")
    output = "\n".join([
        f"### Native pixel parity for `{args.commit}`", "", f"Tested checkout: `{args.build_commit}`.", "",
        f"{passed}/{len(groups)} components matched all three cases on both platforms.", "",
        "| Component | Android | iOS |", "| --- | --- | --- |", *rows, "",
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
