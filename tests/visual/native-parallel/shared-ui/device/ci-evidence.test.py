import importlib.util
from pathlib import Path
import unittest
import json
import os
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("ci_evidence", Path(__file__).with_name("ci-evidence.py"))
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class GeometryTests(unittest.TestCase):
    def test_geometry_is_measured_at_physical_density(self):
        value = ci.measure('{"id":"shared-ui-geometry-1170x2352-dpr-3-insets-0-141-0-69"}')
        self.assertEqual((value["width"], value["height"], value["scale"]), (390, 784, "3"))
        self.assertEqual(value["insets"], [0, 141, 0, 69])

    def test_decimal_density_is_exact(self):
        value = ci.measure("shared-ui-geometry-1000x2000-dpr-2-5-insets-0-20-0-20")
        self.assertEqual((value["width"], value["height"], value["scale"]), (400, 800, "2.5"))

    def test_rejects_missing_ambiguous_and_fractional_markers(self):
        for value in ("none", "shared-ui-geometry-1001x2000-dpr-2-5-insets-0-0-0-0", "shared-ui-geometry-400x800-dpr-1-insets-0-0-0-0 shared-ui-geometry-500x800-dpr-1-insets-0-0-0-0"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                ci.measure(value)

    def test_group_registry_enforces_exact_case_count(self):
        cases = [{"id": f"case-{i}", "width": (380 if i < 48 else 768 if i < 50 else 1024)} for i in range(52)]
        with patch.object(ci.subprocess, "check_output", return_value=json.dumps(cases)):
            self.assertEqual(len(ci.expected_cases("phone")), 48)
            self.assertEqual(len(ci.expected_cases("tablet")), 2)
            self.assertEqual(len(ci.expected_cases("wide")), 2)
        with patch.object(ci.subprocess, "check_output", return_value=json.dumps(cases[:-1])):
            with self.assertRaises(ValueError):
                ci.expected_cases("phone")

    def test_measured_width_selects_expected_layout(self):
        for group, width in (("phone", 390), ("phone", 767), ("tablet", 768), ("tablet", 820), ("wide", 1024), ("wide", 1194)):
            with self.subTest(group=group, width=width):
                ci.require_group_width(group, width)
        for group, width in (("phone", 768), ("tablet", 767), ("wide", 960), ("wide", 1023)):
            with self.subTest(group=group, width=width), self.assertRaisesRegex(ValueError, f"{group} .*measured {width} dp"):
                ci.require_group_width(group, width)


class OrchestrationTests(unittest.TestCase):
    def test_geometry_open_failure_records_screenshot_and_hierarchy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            calls = []

            def fake_command(name, args, output, env=None):
                calls.append(name)
                if name == "geometry-open":
                    flow = Path(args[-1]).read_text()
                    self.assertLess(flow.index("visible: separator"), flow.index("- openLink:"))
                    self.assertIn("zyx-native-parity://internal/shared-ui/" + ci.GEOMETRY_CASE, flow)
                    self.assertIn("id: shared-ui-case-" + ci.GEOMETRY_CASE, flow)
                    self.assertEqual(Path(args[args.index("--debug-output") + 1]), output / "geometry-debug")
                    return 1
                (output / f"{name}.log").write_text("separator")
                return 0

            environment = {"SHARED_PLATFORM": "android", "SHARED_GROUP": "tablet", "SHARED_DEVICE": "fixture", "SHARED_BUILD": "a" * 40}
            with (
                patch.object(ci, "ROOT", root),
                patch.object(ci, "command", side_effect=fake_command),
                patch.object(ci, "device_screenshot") as screenshot,
                patch.object(ci, "expected_cases", return_value=["example"]),
                patch.dict(os.environ, environment),
            ):
                self.assertEqual(ci.main(), 1)

            self.assertEqual(calls, ["geometry-open", "geometry-hierarchy-1"])
            latest = json.loads((root / "artifacts/native-parity/shared-ui/android/tablet/latest-run.json").read_text())
            output = root / latest["runDirectory"]
            screenshot.assert_called_once_with("android", "fixture", output / "geometry-failure.png")
            self.assertTrue((output / "geometry-hierarchy-1.log").is_file())
            summary = json.loads((output / "ci-summary.json").read_text())
            self.assertEqual(summary["errors"], ["could not open native geometry fixture"])

    def test_diff_retains_report_and_phone_accessibility_runs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            calls = []
            def fake_command(name, args, output, env=None):
                calls.append(name)
                if name.startswith("geometry-hierarchy"):
                    (output / (name + ".log")).write_text("shared-ui-geometry-380x760-dpr-1-insets-0-20-0-40")
                if name == "web-capture":
                    directory = Path(env["SHARED_UI_REFERENCES"]) / "dpr1"
                    directory.mkdir(parents=True)
                    (directory / "results.json").write_text(json.dumps([{"id": "example", "captured": True}]))
                if name == "compare":
                    directory = Path(args[args.index("--out-dir") + 1])
                    directory.mkdir(parents=True)
                    (directory / "results.json").write_text(json.dumps({"cases": [{"id": "example", "status": "different"}]}))
                    return 1
                return 0
            environment = {"SHARED_PLATFORM": "ios", "SHARED_GROUP": "phone", "SHARED_DEVICE": "fixture", "SHARED_BUILD": "a" * 40}
            with patch.object(ci, "ROOT", root), patch.object(ci, "DEVICE_DIR", root), patch.object(ci, "command", side_effect=fake_command), patch.object(ci, "expected_cases", return_value=["example"]), patch.dict(os.environ, environment):
                self.assertEqual(ci.main(), 1)
            self.assertEqual(calls[-2:], ["compare", "accessibility"])
            latest = json.loads((root / "artifacts/native-parity/shared-ui/ios/phone/latest-run.json").read_text())
            summary = json.loads((root / latest["runDirectory"] / "ci-summary.json").read_text())
            self.assertEqual(summary["comparisonCounts"]["different"], 1)
            self.assertEqual(summary["accessibilityExit"], 0)
            self.assertEqual(summary["exit"], 1)


if __name__ == "__main__":
    unittest.main()
