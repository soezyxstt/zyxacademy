import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from summarize import check_device, check_directory, directory_summary


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


class DirectorySummaryTest(unittest.TestCase):
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
                self.assertEqual(["Missing"] * 3, check_directory(report, self.manifest, "ios"))
        report = self.report("ios")
        report["cases"][1:] = reversed(report["cases"][1:])
        self.assertEqual(["Missing"] * 3, check_directory(report, self.manifest, "ios"))
        report["cases"].pop()
        self.assertEqual(["Missing"] * 3, check_directory(report, self.manifest, "ios"))

    def test_rejects_missing_blank_and_nonmatching_frames(self):
        report = self.report("android")
        report["cases"][0] = {"case": "empty", "status": "missing-stable-frame"}
        report["cases"][1].update(status="fail", differentPixels=1)
        report["cases"][2]["blankReference"] = True
        self.assertEqual(["Missing stable frame", "1 differing pixels", "Invalid reference"],
                         check_directory(report, self.manifest, "android"))
        report["cases"][2].update(blankReference=False, framePixels=[380, 639])
        self.assertEqual("Missing", check_directory(report, self.manifest, "android")[2])
        report["cases"][2].update(framePixels=[380, 640], differentPixels=1)
        self.assertEqual("Missing", check_directory(report, self.manifest, "android")[2])

    def test_rollup_requires_both_same_revision_manifests_and_both_devices(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)

            def write(path, data):
                file = root / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(json.dumps(data))

            write("reference-manifests/dpr1/directory.json", self.manifest)
            write("reference-manifests/dpr3/directory.json", self.manifest)
            write("android-measurements/directory/result.json", self.report("android"))
            rows, passed = directory_summary(root, "fixture", "merge")
            self.assertFalse(passed)
            self.assertIn("| empty | Pass | Missing |", rows)
            write("ios-measurements/directory/result.json", self.report("ios"))
            rows, passed = directory_summary(root, "fixture", "merge")
            self.assertTrue(passed)
            self.assertIn("| grouped | Pass | Pass |", rows)
            write("reference-manifests/dpr3/directory.json", {**self.manifest, "buildCommit": "other"})
            self.assertFalse(directory_summary(root, "fixture", "merge")[1])
