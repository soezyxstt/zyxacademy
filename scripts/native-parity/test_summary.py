import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from summarize import check_device, check_page, page_summary


class DeviceSummaryTest(unittest.TestCase):
    def setUp(self):
        self.cases = ["first", "second", "third"]
        self.report = {"platform": "ios", "component": "button", "commit": "fixture", "buildCommit": "merge", "scale": 3,
                       "cases": [{"id": name, "differentPixels": 0, "blankReference": False} for name in self.cases]}

    def result(self):
        return check_device(self.report, "button", self.cases, "ios", "fixture", "merge")

    def test_requires_every_case_and_the_same_revision(self):
        self.assertEqual("Pass", self.result())
        self.report["commit"] = "other"
        self.assertEqual("Missing", self.result())
        self.report["commit"] = "fixture"
        self.report["cases"].pop()
        self.assertEqual("Missing", self.result())

    def test_requires_the_correct_reference_engine(self):
        self.assertEqual("Missing", check_device(self.report, "button", self.cases, "ios", "fixture", "merge", "ios-wkwebview"))
        self.report["referenceEngine"] = "ios-wkwebview"
        self.assertEqual("Pass", check_device(self.report, "button", self.cases, "ios", "fixture", "merge", "ios-wkwebview"))
        self.assertEqual("Missing", self.result())

    def test_retains_single_pixel_mismatches_and_blank_references(self):
        self.report["cases"][1]["differentPixels"] = 1
        self.assertEqual("1 differing pixels", self.result())
        self.report["cases"][0]["blankReference"] = True
        self.assertEqual("Invalid reference", self.result())


class PageSummaryTest(unittest.TestCase):
    def setUp(self):
        self.manifest = {"route": "/tautan", "width": 380, "height": 640, "cases": ["empty", "single", "grouped"],
                         "commit": "fixture", "buildCommit": "merge"}

    def report(self, platform):
        scale = 1 if platform == "android" else 3
        return {"route": "/tautan", "platform": platform, "scale": scale, "viewport": [380, 640],
                "commit": "fixture", "buildCommit": "merge", "referenceEngine": "chromium",
                "cases": [{"case": case, "status": "pass", "differentPixels": 0,
                           "framePixels": [380 * scale, 640 * scale], "blankReference": False}
                          for case in self.manifest["cases"]]}

    def test_requires_all_ordered_cases_and_exact_report_identity(self):
        for key, wrong in (("buildCommit", "other"), ("commit", "other"), ("platform", "android"),
                           ("viewport", [381, 640]), ("scale", 1), ("referenceEngine", "ios-wkwebview")):
            with self.subTest(key=key):
                report = self.report("ios")
                report[key] = wrong
                self.assertEqual(["Missing"] * 3, check_page(report, self.manifest, "ios"))
        report = self.report("ios")
        report["cases"][1:] = reversed(report["cases"][1:])
        self.assertEqual(["Missing"] * 3, check_page(report, self.manifest, "ios"))
        report["cases"].pop()
        self.assertEqual(["Missing"] * 3, check_page(report, self.manifest, "ios"))

    def test_rejects_missing_blank_and_nonmatching_frames(self):
        report = self.report("android")
        report["cases"][0] = {"case": "empty", "status": "missing-stable-frame"}
        report["cases"][1].update(status="fail", differentPixels=1)
        report["cases"][2]["blankReference"] = True
        self.assertEqual(["Missing stable frame", "1 differing pixels", "Invalid reference"],
                         check_page(report, self.manifest, "android"))
        report["cases"][2].update(blankReference=False, framePixels=[380, 639])
        self.assertEqual("Missing", check_page(report, self.manifest, "android")[2])
        report["cases"][2].update(framePixels=[380, 640], differentPixels=1)
        self.assertEqual("Missing", check_page(report, self.manifest, "android")[2])

    def test_rollup_requires_both_same_revision_manifests_and_both_devices(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)

            def write(path, data):
                file = root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(json.dumps(data))

            write("reference-manifests/dpr1/directory.json", self.manifest)
            write("android-measurements/directory/result.json", self.report("android"))
            android_rows, android_passed = page_summary(root, "fixture", "merge", "directory", ("android",))
            self.assertTrue(android_passed)
            self.assertIn("| Case | Android DPR 1 |", android_rows)
            self.assertIn("| empty | Pass |", android_rows)
            self.assertFalse(page_summary(root, "fixture", "merge", "directory")[1])
            write("reference-manifests/dpr3/directory.json", self.manifest)
            rows, passed = page_summary(root, "fixture", "merge", "directory")
            self.assertFalse(passed)
            self.assertIn("| empty | Pass | Missing |", rows)
            write("ios-measurements/directory/result.json", self.report("ios"))
            rows, passed = page_summary(root, "fixture", "merge", "directory")
            self.assertTrue(passed)
            self.assertIn("| grouped | Pass | Pass |", rows)
            write("reference-manifests/dpr3/directory.json", {**self.manifest, "buildCommit": "other"})
            self.assertFalse(page_summary(root, "fixture", "merge", "directory")[1])

    def test_android_webview_directory_claim_is_independent_and_exact(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "reference-manifests/dpr1/directory.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps(self.manifest))
            chromium = root / "android-measurements/directory/result.json"
            chromium.parent.mkdir(parents=True)
            report = self.report("android")
            chromium.write_text(json.dumps(report))
            webview = root / "android-measurements/native-vs-webview/directory/result.json"
            webview.parent.mkdir(parents=True)

            def webview_summary():
                return page_summary(root, "fixture", "merge", "directory", ("android",), "android-webview")

            self.assertFalse(webview_summary()[1])
            webview.write_text(json.dumps(report))
            self.assertFalse(webview_summary()[1])
            report["referenceEngine"] = "android-webview"
            webview.write_text(json.dumps(report))
            rows, passed = webview_summary()
            self.assertTrue(passed)
            self.assertIn("#### `/tautan` route vs Android WebView", rows)
            report["cases"][1].update(status="fail", differentPixels=1)
            report["cases"][2].update(status="missing-stable-frame", surface="webview")
            webview.write_text(json.dumps(report))
            rows, passed = webview_summary()
            self.assertFalse(passed)
            self.assertIn("| single | 1 differing pixels |", rows)
            self.assertIn("| grouped | Missing stable WebView frame |", rows)
            self.assertTrue(page_summary(root, "fixture", "merge", "directory", ("android",))[1])

    def test_component_rollup_excludes_public_routes_even_if_diagnostics_failed(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            manifests = root / "reference-manifests/dpr1"
            manifests.mkdir(parents=True)
            case_ids = ["first", "second", "third"]
            (manifests / "cases.json").write_text(json.dumps([
                {"id": case, "component": "button"} for case in case_ids
            ]))
            (manifests / "directory.json").write_text(json.dumps(self.manifest))
            android = root / "android-measurements"
            webview = android / "native-vs-webview"
            webview.mkdir(parents=True)
            identity = {"platform": "android", "scale": 1, "component": "button", "commit": "fixture", "buildCommit": "merge"}
            result = {**identity, "cases": [
                {"id": case, "differentPixels": 0, "blankReference": False} for case in case_ids
            ]}
            (android / "result-button.json").write_text(json.dumps(result))
            (webview / "result-button.json").write_text(json.dumps({**result, "referenceEngine": "android-webview"}))
            (android / "directory").mkdir()
            (android / "directory/result.json").write_text("{}")
            report = subprocess.run(
                [sys.executable, str(Path(__file__).with_name("summarize.py")), str(root), "fixture", "merge", "--platform", "android"],
                check=True, capture_output=True, text=True,
            ).stdout
            self.assertIn("1/1 components matched", report)
            self.assertNotIn("/tautan", report)

    def test_external_redirect_needs_two_handoff_frames_and_never_counts_as_a_pixel_match(self):
        redirect = {"case": "short-meeting", "status": 307, "location": "https://meet.google.com/abc-defg-hij"}
        manifest = {**self.manifest, "route": "/f/[slug]", "cases": ["short-collision", "short-meeting", "short-missing"],
                    "externalRedirect": redirect}
        with TemporaryDirectory() as directory:
            root = Path(directory)

            def write(path, data):
                file = root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(json.dumps(data))

            for scale in (1, 3):
                write(f"reference-manifests/dpr{scale}/short-forms.json", manifest)
            for platform in ("android", "ios"):
                report = self.report(platform)
                report["route"] = manifest["route"]
                for case, row in zip(manifest["cases"], report["cases"]):
                    row["case"] = case
                frame = report["cases"][1]["framePixels"]
                report["cases"][1] = {"case": redirect["case"], "status": "external-redirect", "framePixels": frame,
                                      "externalRedirect": redirect}
                write(f"{platform}-measurements/short-forms/result.json", report)

            rows, passed = page_summary(root, "fixture", "merge", "short-forms")
            self.assertTrue(passed)
            self.assertTrue(any("2/2 comparable route cases" in row for row in rows))
            self.assertIn("| short-meeting | Web redirects, native handoff captured | Web redirects, native handoff captured |", rows)
            report["cases"][1]["differentPixels"] = 0
            write("ios-measurements/short-forms/result.json", report)
            self.assertFalse(page_summary(root, "fixture", "merge", "short-forms")[1])
            redirect["location"] = "https://example.com/abc-defg-hij"
            write("reference-manifests/dpr3/short-forms.json", manifest)
            self.assertFalse(page_summary(root, "fixture", "merge", "short-forms")[1])

    def test_meeting_recovery_uses_behavior_evidence_and_keeps_the_unavailable_pixel_result(self):
        cases = ["meeting-unavailable", "meeting-ready", "meeting-recovery"]
        redirect = {"case": cases[1], "status": 307, "location": "https://meet.google.com/abc-defg-hij"}
        recovery = {"case": cases[2], "beforeStatus": 503, "afterStatus": 200}
        manifest = {**self.manifest, "route": "/meet/[slug]", "cases": cases, "externalRedirect": redirect, "recovery": recovery}
        report = self.report("android")
        report["route"] = manifest["route"]
        report["cases"][0].update(case=cases[0], status="fail", differentPixels=1)
        report["cases"][1] = {"case": cases[1], "status": "external-redirect", "framePixels": [380, 640], "externalRedirect": redirect}
        report["cases"][2] = {"case": cases[2], "status": "backend-recovery", "framePixels": [380, 640], "recovery": recovery}
        self.assertEqual([
            "1 differing pixels", "Web redirects, native handoff captured", "Web reload recovered, native retry screen captured",
        ], check_page(report, manifest, "android"))
        report["cases"][2].update(status="pass", differentPixels=0)
        self.assertEqual("Missing behavior evidence", check_page(report, manifest, "android")[2])
