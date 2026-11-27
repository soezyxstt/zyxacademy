"""Compare exact Student request pairs across web and Android as a divergence diagnostic."""

import argparse
from collections import Counter
from hashlib import sha256
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlsplit

import PIL

ACADEMIC = Path(__file__).resolve().parents[1]
ROOT = ACADEMIC.parents[3]
sys.path.insert(0, str(ACADEMIC))
from compare import measure_pair, measured_image, open_srgb
from device.archive import verify_png

WEB = "cd2b970c4f74f45e95c0c9a21380b46ba3d04252"
ANDROID = "03f9f7bd8bb6267fe68cdaa772debadf2fc95260"
WEB_ARCHIVE = "2cad827070b0697cdf0db29e8e2826b345e6afff"
RUN = "45831051547"
JOB = "139947644371"
RUN_URL = f"https://github.com/soezyxstt/zyxacademy/actions/runs/{RUN}"
VIEWPORT = {"width": 380, "height": 852}
WEB_DIR = ACADEMIC / "pages/denied"
EXAMPLE = "academic-admin-courses-denied"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_bytes())


def by_id(rows):
    mapped = {row["id"]: row for row in rows}
    require(len(mapped) == len(rows), "Duplicate case ID")
    return mapped


def verify_revisions():
    runner = "scripts/native-parity/academic/run-device.sh"
    changed = git("diff", "--name-only", WEB, ANDROID).decode().splitlines()
    require(changed == [runner], f"Unexpected source changes {changed}")
    scripts = [git("show", f"{revision}:{runner}").decode() for revision in (WEB, ANDROID)]
    status_bar = r"(?ms)^    xcrun simctl status_bar \"\$device\" override .*?(?=^    bundle=)"
    stripped = [re.subn(status_bar, "", script) for script in scripts]
    require(stripped[0][1] == stripped[1][1] == 1 and stripped[0][0] == stripped[1][0],
            "The scripts differ outside the status-bar override")
    manifest_path = WEB_DIR / "manifest.json"
    require(manifest_path.read_bytes() == git("show", f"{WEB_ARCHIVE}:{manifest_path.relative_to(ROOT)}"),
            "The web manifest differs from the archived capture")
    return {"changedFiles": changed, "change": "Only the iOS simctl status-bar override and its error handling changed."}


def matches_pattern(pattern, path):
    parts = urlsplit(path).path.split("/")
    tokens = pattern.split("/")
    return len(parts) == len(tokens) and all(
        part == token or (part and re.fullmatch(r"\[[^\[\]/]+\]", token))
        for token, part in zip(tokens, parts)
    )


def native_visible_state(path, bounds, states):
    image, _ = measured_image(open_srgb(path), bounds)
    key = sha256(image.tobytes()).hexdigest()
    if key not in states:
        png = io.BytesIO()
        image.save(png, format="PNG")
        ocr = subprocess.run(["tesseract", "stdin", "stdout", "-l", "eng", "--psm", "11"],
                             input=png.getvalue(), capture_output=True, check=True).stdout.decode()
        text = [line.strip() for line in ocr.splitlines() if line.strip()]
        state = "in-app-access-denied" if text == ["Akses ditolak.", "Kembali"] else "unverified"
        states[key] = {"state": state, "visibleText": text, "bottomRightRgb": image.getpixel((image.width - 1, image.height - 1))}
    return {"contentRgbSha256": key, **states[key]}


def verify_web(case, reference):
    require(case["revision"] == WEB and case["status"] == "pass" and case["theme"] == "light",
            "Unverified web revision, status or theme")
    require(case["viewport"] == {**VIEWPORT, "dpr": 1}, "Web viewport differs from 380×852 at DPR 1")
    require(case["identity"]["accountId"] == "academic-student" and case["identity"]["roles"] == ["murid"]
            and case["identity"]["status"] == 200, "The signed browser identity is not the Student fixture")
    require(matches_pattern(case["pattern"], case["requestedPath"]), "Web request does not match the registered pattern")
    require(case["classification"] == "redirected" and case["landedPath"] == "/"
            and case["navigation"] == [{"path": case["requestedPath"], "status": 307, "location": "/"}, {"path": "/", "status": 200}],
            "Unverified browser navigation outcome")
    verify_png(reference["directory"] / case["screenshot"], case["screenshotSha256"], VIEWPORT)


def verify_native(case, registry, capture, device):
    require(registry is not None and capture is not None, "No matching ID in the Android registry or capture manifest")
    require(capture["status"] == "captured", f"Android capture status {capture['status']}")
    expected = {"id": case["id"], "pattern": case["pattern"], "role": "student", "theme": case["theme"],
                "path": case["fixturePath"], "scenario": "populated"}
    require(all(source.get(key) == value for source in (registry, capture) for key, value in expected.items()),
            "Android role, theme, route pattern, fixture path or scenario differs from the web case registry")
    link = urlsplit(capture["href"])
    require(capture["href"] == registry["href"] and (link.scheme, link.netloc, link.path) == ("zyx-native-parity", "academic", "")
            and parse_qs(link.query) == {key: [expected[key]] for key in ("role", "theme", "path", "scenario")},
            "Android fixture URL does not encode the verified case binding")
    bounds = capture["bounds"]
    require(capture["viewport"] == VIEWPORT and isinstance(bounds, dict)
            and {key: bounds.get(key) for key in VIEWPORT} == VIEWPORT,
            "Android viewport or measured content rectangle differs from 380×852 at DPR 1")
    require(capture["image"] == f"raw/{case['id']}.png", "Android raw image path does not match the case ID")
    raw = device["directory"] / capture["image"]
    verify_png(raw, capture["sha256"], capture["frame"])
    return raw


def measure_web_case(case, reference, registry, capture, device, states, scratch, output):
    item = {"id": case["id"], "pattern": case["pattern"], "theme": case["theme"],
            "web": {"fixturePath": case["fixturePath"], "identity": case["identity"],
                    "requestedPath": case["requestedPath"], "landingPath": case["landedPath"],
                    "state": "public-homepage", "navigation": case["navigation"], "image": case["screenshot"],
                    "sha256": case["screenshotSha256"]},
            "android": {"requestedPath": capture.get("path") if capture else None, "state": "unverified"},
            "sameNavigationState": None, "parityCredit": False, "comparison": None}
    reasons = []
    try:
        verify_web(case, reference)
    except (ValueError, OSError, KeyError) as error:
        reasons.append(str(error))
        item["web"]["state"] = "unverified"
    try:
        raw = verify_native(case, registry, capture, device)
        state = native_visible_state(raw, capture["bounds"], states)
        item["android"].update({**state, "role": capture["role"], "scenario": capture["scenario"],
                                "fixtureUrl": capture["href"], "appEntry": "/academic",
                                "ordinal": capture["ordinal"], "viewport": capture["viewport"],
                                "frame": capture["frame"], "bounds": capture["bounds"],
                                "image": capture["image"], "sha256": capture["sha256"]})
        require(state["state"] == "in-app-access-denied", "Android crop did not confirm visible denial text")
        require(state["bottomRightRgb"] == (255, 255, 255), "Android crop does not have the light denial view background")
    except (ValueError, OSError, KeyError) as error:
        reasons.append(str(error))
    if case["requestedPath"] != item["android"]["requestedPath"]:
        reasons.append("Concrete requested paths differ")
    if reasons:
        item["excluded"] = reasons
        return item

    item["sameNavigationState"] = False
    try:
        result = measure_pair({"id": case["id"], "image": case["screenshot"], "theme": case["theme"], **VIEWPORT},
                              reference, device, capture, scratch)
        require(not result["mismatches"] and not result["blankReference"], "Comparator reported an unmatched or blank frame")
    except (ValueError, OSError, KeyError) as error:
        item["excluded"] = [str(error)]
        return item
    diff = scratch / result["files"]["difference"]
    pixel_count = VIEWPORT["width"] * VIEWPORT["height"]
    item["comparison"] = {"mode": "cross-state-pixel-diagnostic", "differentPixels": result["differentOverlapPixels"],
                          "totalPixels": pixel_count, "differentPixelPercent": round(100 * result["differentOverlapPixels"] / pixel_count, 4),
                          "maxRgbDelta": result["maxRgbDelta"],
                          "differenceBounds": result["differenceBoundsInOverlap"], "differenceSha256": digest(diff)}
    if case["id"] == EXAMPLE:
        examples = output / "examples"
        examples.mkdir(exist_ok=True)
        for field, source in (("nativeFrame", raw), ("difference", diff)):
            target = examples / f"{EXAMPLE}-{field}.png"
            shutil.copyfile(source, target)
            item["comparison"][field] = target.relative_to(output).as_posix()
    return item


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="Extracted academic-android-evidence artifact")
    parser.add_argument("output", type=Path)
    parser.add_argument("--artifact-id", required=True, type=int)
    args = parser.parse_args()
    source = verify_revisions()
    web = load(WEB_DIR / "manifest.json")
    require(web["revision"] == WEB and web["viewport"] == {**VIEWPORT, "dpr": 1}, "Invalid Playwright manifest")
    route_manifest = args.artifact / "routes/manifest.json"
    provenance = args.artifact / "provenance.json"
    registry_file = args.artifact / "cases.json"
    native = load(route_manifest)
    expected_run = {"revision": ANDROID, "runId": RUN, "runAttempt": "1", "platform": "android"}
    require(load(provenance) == expected_run and all(native.get(key) == value for key, value in expected_run.items())
            and native["deviceScaleFactor"] == 1, "Android artifact is not the pinned DPR-1 run")
    reference = {"directory": WEB_DIR, "viewport": VIEWPORT, "deviceScaleFactor": 1}
    device = {**native, "directory": route_manifest.parent}
    web_cases = by_id(web["entries"])
    require(len(web_cases) == 54, "Expected 54 source web cases")
    registry_rows = load(registry_file)
    registry = by_id(registry_rows)
    captures = by_id(native["captures"])
    ordinals = {row["id"]: index for index, row in enumerate(registry_rows, 1)}
    require(all(row.get("ordinal") == ordinals.get(case_id) for case_id, row in captures.items() if row["status"] == "captured"),
            "A captured Android ordinal does not match the exported registry")
    args.output.mkdir(parents=True, exist_ok=True)
    states = {}
    with TemporaryDirectory(prefix="zyx-student-denied-") as scratch:
        results = [measure_web_case(case, reference, registry.get(case_id), captures.get(case_id), device, states,
                                    Path(scratch), args.output) for case_id, case in web_cases.items()]
    measured = [row for row in results if row["comparison"]]
    counts = [row["comparison"]["differentPixels"] for row in measured]
    report = {
        "diagnosticOnly": True, "parityCredit": False,
        "sourceCompatibility": source,
        "web": {"revision": WEB, "archiveRevision": WEB_ARCHIVE, "browser": web["browserVersion"], "locale": web["locale"],
                "manifestSha256": digest(WEB_DIR / "manifest.json")},
        "android": {**expected_run, "runUrl": RUN_URL, "jobUrl": f"{RUN_URL}/job/{JOB}",
                    "artifactUrl": f"{RUN_URL}/artifacts/{args.artifact_id}", "device": native["device"],
                    "manifestSha256": digest(route_manifest), "provenanceSha256": digest(provenance),
                    "registrySha256": digest(registry_file)},
        "geometry": {"viewport": VIEWPORT, "deviceScaleFactor": 1, "theme": "light"},
        "tools": {"pillow": PIL.__version__, "tesseract": subprocess.check_output(["tesseract", "--version"], text=True).splitlines()[0]},
        "totals": {"cases": len(results), "compared": len(measured), "excluded": len(results) - len(measured),
                   "webStates": dict(Counter(row["web"]["state"] for row in results)),
                   "androidStates": dict(Counter(row["android"]["state"] for row in results)),
                   "uniqueObservedAndroidContent": len(states), "minDifferentPixels": min(counts, default=None),
                   "maxDifferentPixels": max(counts, default=None)},
        "androidOnlyStudentCaseIds": [case_id for case_id, case in registry.items() if case["role"] == "student" and case_id not in web_cases],
        "cases": results,
    }
    (args.output / "results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["totals"], indent=2))


if __name__ == "__main__":
    main()
