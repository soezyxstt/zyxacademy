"""Verify an archived device run and compare explicitly approved route pairs."""

import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess
import sys

from PIL import Image


def load(path):
    return json.loads(path.read_text()) if path.is_file() else None


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def verify_png(path, digest, frame):
    if sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError(f"SHA-256 mismatch for {path}")
    with Image.open(path) as image:
        if image.format != "PNG" or image.size != (frame["width"], frame["height"]):
            raise ValueError(f"Unexpected PNG size or type for {path}")
        image.verify()


def archive_platform(artifact, output, source, artifact_url):
    status = load(artifact / "interactions/statuses.json") or []
    data = {
        "interactionCounts": dict(Counter(row["status"] for row in status)),
        "interactions": status,
    }
    accessibility = load(artifact / "accessibility/statuses.json")
    if accessibility is not None:
        data["accessibilityCounts"] = dict(Counter(
            "passed" if row["passed"] else "failed" for row in accessibility
        ))
        data["accessibility"] = accessibility
    manifest = load(artifact / "routes/manifest.json")
    provenance = load(artifact / "provenance.json")
    if provenance is None:
        raise ValueError(f"Missing device provenance in {artifact}")
    for record in (provenance, manifest):
        if record is None:
            continue
        for field in ("revision", "runId", "runAttempt"):
            if str(record[field]) != str(source[field]):
                raise ValueError(f"{artifact}: unexpected {field} {record[field]}")
    if manifest is None:
        return data, {}
    cases = {}
    for row in manifest["captures"]:
        case = {key: row[key] for key in (
            "id", "pattern", "path", "role", "scenario", "theme", "status", "image", "sha256"
        )}
        if row["status"] == "captured":
            verify_png(artifact / "routes" / row["image"], row["sha256"], row["frame"])
            for field in ("frame", "bounds", "viewport"):
                case[field] = row[field]
        else:
            case["failures"] = row["failures"]
        if row["id"] in cases:
            raise ValueError(f"Duplicate device case {row['id']}")
        cases[row["id"]] = case
    write(output / "routes.json", {"artifactUrl": artifact_url, "cases": list(cases.values())})
    data.update(
        device=manifest["device"],
        dpr=manifest["deviceScaleFactor"],
        routeCaptureCounts=dict(Counter(row["status"] for row in cases.values())),
        capturedRoutePatterns=len({row["pattern"] for row in cases.values() if row["status"] == "captured"}),
        routeEvidence=f"{manifest['platform']}/routes.json",
    )
    return data, cases


def archive_comparisons(args, index, cases, platform, approvals):
    reference_dir = args.references / platform / "web"
    reference = load(reference_dir / "manifest.json")
    evidence = index["platforms"][platform]
    if reference["sourceRevision"] != index["revision"]:
        raise ValueError("The Playwright reference must use the device revision")
    if reference["deviceScaleFactor"] != evidence["dpr"]:
        raise ValueError("The comparison requires the measured device DPR")

    output = args.archive / platform
    native_manifest = {
        "platform": platform,
        "revision": index["revision"],
        "device": evidence["device"],
        "deviceScaleFactor": evidence["dpr"],
        "viewport": reference["viewport"],
        "captures": [],
    }
    raw_root = args.artifacts / f"academic-{platform}-evidence" / "routes"
    web_cases = {row["id"]: row for row in reference["captures"]}
    if web_cases.keys() != approvals.keys():
        raise ValueError("The Playwright case set differs from the approved mapping")
    for web_id, approval in approvals.items():
        web = web_cases[web_id]
        native = cases[approval["routeCase"]]
        verify_png(reference_dir / web["image"], web["sha256"], web)
        if web["route"] != approval.get("webRoute", web["route"]) or (
            native["status"], native["theme"], native["path"], native["role"], native["scenario"]
        ) != (
            "captured", web["theme"], approval.get("nativeRoute", web["route"]),
            approval["role"], approval["scenario"],
        ):
            raise ValueError(f"Route, role, state or theme mismatch for {web_id}")
        if native["viewport"] != reference["viewport"]:
            raise ValueError(f"Viewport mismatch for {web_id}")
        native_manifest["captures"].append({
            "id": web_id, "sourceRouteCase": native["id"], "image": str((raw_root / native["image"]).resolve()),
            "bounds": native["bounds"], "theme": native["theme"],
        })

    scratch = args.references / platform
    input_manifest = scratch / "verified-route-pairs.json"
    write(input_manifest, native_manifest)
    diff_dir = scratch / "diffs"
    diff_dir.mkdir(exist_ok=True)
    comparator = Path(__file__).resolve().parent.parent / "compare.py"
    run = subprocess.run([sys.executable, str(comparator), str(reference_dir / "manifest.json"),
                          str(input_manifest), str(diff_dir)], check=False)
    comparison = load(diff_dir / "results.json")
    if run.returncode not in (0, 1) or comparison is None or any(
        case.get("error") or case.get("mismatches") or case["blankReference"] for case in comparison["cases"]
    ):
        raise ValueError(f"Comparison did not produce full-size measurements for {platform}")

    examples = output / "examples"
    examples.mkdir(parents=True, exist_ok=True)
    for case in comparison["cases"]:
        web_id = case["id"]
        approval = approvals[web_id]
        case["sourceRouteCase"] = approval["routeCase"]
        case["differentPixelPercent"] = round(100 * case["differentOverlapPixels"] /
                                                (case["overlap"]["width"] * case["overlap"]["height"]), 4)
        diff_file = case.pop("files")["difference"]
        if approval.get("retainImages"):
            chosen = {
                "web": reference_dir / web_cases[web_id]["image"],
                "nativeFrame": raw_root / cases[approval["routeCase"]]["image"],
                "difference": diff_dir / diff_file,
            }
            case["files"] = {}
            for name, path in chosen.items():
                target = examples / f"{web_id}-{name}.png"
                shutil.copyfile(path, target)
                case["files"][name] = target.relative_to(output).as_posix()
    write(output / "comparison.json", comparison)
    write(output / "web-manifest.json", reference)
    evidence.update(
        diagnosticComparison=f"{platform}/comparison.json",
        referenceManifest=f"{platform}/web-manifest.json",
        comparisonCount=len(comparison["cases"]),
        exactMatchCount=sum(case["passed"] for case in comparison["cases"]),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifacts", type=Path, help="Downloaded workflow artifacts")
    parser.add_argument("references", type=Path, help="Scratch folder with <platform>/web Playwright capture")
    parser.add_argument("archive", type=Path, help="Evidence folder with run-source.json")
    args = parser.parse_args()
    index = load(args.archive / "run-source.json")
    for platform, evidence in index["platforms"].items():
        artifact = args.artifacts / f"academic-{platform}-evidence"
        counts, cases = archive_platform(artifact, args.archive / platform, index, evidence["artifactUrl"])
        evidence.update(counts)
        approvals = evidence.pop("approvedRoutePairs", {})
        if approvals:
            archive_comparisons(args, index, cases, platform, approvals)
    write(args.archive / "index.json", index)


if __name__ == "__main__":
    main()
