import unittest

from summarize import check_device


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
