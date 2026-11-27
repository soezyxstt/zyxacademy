"""Verify a recorded Android WebView visual review against its CI artifacts."""

import argparse
import json
import re
from hashlib import sha256
from pathlib import Path

from case_manifest import load_case_layout
from summarize import device_results


def verified_bytes(path, expected):
    content = path.read_bytes()
    if sha256(content).hexdigest() != expected:
        raise ValueError(f"SHA-256 mismatch for {path}")
    return content


def verify(record, capture_dir, measurement_dir):
    if (record["schemaVersion"], record["platform"], record["dpr"], record["referenceEngine"]) != (
        1, "android", 1, "android-webview",
    ):
        raise ValueError("Expected an Android WebView DPR 1 review record")
    source, build = record["sourceCommit"], record["buildCommit"]
    if not all(re.fullmatch(r"[0-9a-f]{40}", revision) for revision in (source, build)):
        raise ValueError("Expected full source and build commit SHAs")
    native = capture_dir / "native-vs-webview"
    webview = capture_dir / "webview-reference"
    manifest = webview / "cases.json"
    verified_bytes(manifest, record["caseManifestSha256"])
    groups, heights = load_case_layout(manifest)
    reviews = record["components"]
    if set(reviews) != set(groups):
        raise ValueError("Review components do not match the capture case manifest")

    passed_cases = passed_components = 0
    for component, case_ids in groups.items():
        review = reviews[component]
        report_path = measurement_dir / "native-vs-webview" / f"result-{component}.json"
        report = json.loads(verified_bytes(report_path, review["measurementSha256"]))
        results = device_results(report, component, case_ids, "android", source, build, "android-webview")
        if results is None:
            raise ValueError(f"Incompatible source, build or cases in {report_path}")
        cases = review["cases"]
        if set(cases) != set(case_ids):
            raise ValueError(f"Review cases do not match the capture manifest for {component}")
        component_passes = 0
        for case, result in zip(case_ids, results):
            metrics = result.get("relativeVisual")
            if (result.get("blankReference") is not False or result.get("blankNative") is not False
                    or not isinstance(metrics, dict) or metrics.get("framePixels") != [320, heights[case]]):
                raise ValueError(f"Missing or invalid crop measurement for {case}")
            verdict = cases[case]
            if verdict["review"] not in ("pass", "fail") or (verdict["review"] == "fail" and not verdict.get("note")):
                raise ValueError(f"Missing or invalid review decision for {case}")
            verified_bytes(native / f"{case}.png", verdict["nativeSha256"])
            verified_bytes(webview / f"{case}.png", verdict["webviewSha256"])
            component_passes += verdict["review"] == "pass"
        passed_cases += component_passes
        passed_components += component_passes == len(case_ids)
    return f"{passed_cases}/{len(heights)} cases and {passed_components}/{len(groups)} components passed independent review"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path, help="Committed independent review JSON")
    parser.add_argument("capture_dir", type=Path, help="Extracted android-parity artifact")
    parser.add_argument("measurement_dir", type=Path, help="Extracted android-measurements artifact")
    args = parser.parse_args()
    try:
        record = json.loads(args.record.read_text(encoding="utf-8"))
        run_id = record["runId"]
        if type(run_id) is not int or run_id <= 0:
            raise ValueError("Expected a CI run ID")
        summary = verify(record, args.capture_dir, args.measurement_dir)
    except (KeyError, OSError, TypeError, ValueError) as error:
        parser.exit(1, f"Review verification failed: {error}\n")
    print(f"Verified artifact evidence for run {run_id}. {summary}.")


if __name__ == "__main__":
    main()
