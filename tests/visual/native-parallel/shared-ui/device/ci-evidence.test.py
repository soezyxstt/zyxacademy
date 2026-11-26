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
        cases = [{"id": f"case-{i}", "width": (380 if i < 49 else 768 if i < 51 else 1024)} for i in range(52)]
        with patch.object(ci.subprocess, "check_output", return_value=json.dumps(cases)):
            self.assertEqual(len(ci.expected_cases("phone")), 49)
            self.assertEqual(len(ci.expected_cases("tablet")), 2)
            self.assertEqual(len(ci.expected_cases("wide")), 1)
        shifted = [{**cases[0], "width": 768}, *cases[1:]]
        with patch.object(ci.subprocess, "check_output", return_value=json.dumps(shifted)):
            with self.assertRaisesRegex(ValueError, "expected 49 cases in phone, found 48"):
                ci.expected_cases("phone")
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


class ShardTests(unittest.TestCase):
    def test_ios_phone_shards_partition_all_cases_in_registry_order(self):
        cases = [f"case-{index}" for index in range(49)]
        shards = [ci.shard_cases(cases, index, 3) for index in range(3)]

        self.assertEqual([len(shard) for shard in shards], [17, 16, 16])
        self.assertEqual([case for shard in shards for case in shard], cases)
        self.assertEqual(ci.shard_cases(cases, 0, 1), cases)

    def test_shard_environment_only_allows_three_way_partition_of_ios_phone(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(ci.read_shard("android", "phone"), (0, 1))
        for index in range(3):
            with patch.dict(os.environ, SHARED_SHARD_INDEX=str(index), SHARED_SHARD_COUNT="3"):
                self.assertEqual(ci.read_shard("ios", "phone"), (index, 3))
        for platform, group, index, count in (
            ("android", "phone", "0", "3"), ("ios", "tablet", "0", "3"),
            ("ios", "phone", "3", "3"), ("ios", "phone", "-1", "3"),
            ("ios", "phone", "0", "2"), ("ios", "phone", "1", "1"), ("ios", "phone", "x", "3"),
        ):
            with (
                self.subTest(platform=platform, group=group, index=index, count=count),
                patch.dict(os.environ, SHARED_SHARD_INDEX=index, SHARED_SHARD_COUNT=count),
                self.assertRaises(ValueError),
            ):
                ci.read_shard(platform, group)


class OrchestrationTests(unittest.TestCase):
    def test_android_geometry_retries_transient_fixture_start(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            calls = []

            def fake_command(name, args, directory, env=None):
                calls.append(name)
                if name == "geometry-open":
                    (directory / f"{name}.log").write_text("error: device offline")
                    return 1
                if name == "geometry-hierarchy-1":
                    (directory / f"{name}.log").write_text("shared-ui-geometry-380x760-dpr-1-insets-0-20-0-40")
                return 0

            with patch.object(ci, "command", side_effect=fake_command), patch.object(ci, "wait_for_android_device") as wait:
                geometry = ci.probe_geometry("fixture", output, platform="android")
            self.assertEqual(geometry["width"], 380)
            self.assertEqual(calls, ["geometry-open", "geometry-open-2", "geometry-hierarchy-1"])
            wait.assert_called_once_with("fixture", "geometry-open")

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
                    (output / f"{name}.log").write_text("Assertion is false: geometry fixture")
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

    def test_secondary_ios_phone_shard_runs_only_selected_cases_without_accessibility(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = [f"case-{index}" for index in range(49)]
            selected = registry[17:33]
            geometry = ci.measure("shared-ui-geometry-380x760-dpr-1-insets-0-20-0-40")
            calls = []

            def fake_command(name, args, output, env=None):
                calls.append(name)
                if name == "web-capture":
                    self.assertEqual(args[2:], selected)
                    reference = Path(env["SHARED_UI_REFERENCES"]) / "dpr1"
                    reference.mkdir(parents=True)
                    (reference / "results.json").write_text(json.dumps([{"id": item, "captured": True} for item in selected]))
                if name == "native-capture":
                    reference = Path(args[args.index("--reference-dir") + 1])
                    self.assertEqual([item["id"] for item in json.loads((reference / "results.json").read_text())], selected)
                if name == "compare":
                    report = Path(args[args.index("--out-dir") + 1])
                    report.mkdir(parents=True)
                    (report / "results.json").write_text(json.dumps({"cases": [{"id": item, "status": "match"} for item in selected]}))
                return 0

            environment = {
                "SHARED_PLATFORM": "ios", "SHARED_GROUP": "phone", "SHARED_DEVICE": "fixture", "SHARED_BUILD": "a" * 40,
                "SHARED_SHARD_INDEX": "1", "SHARED_SHARD_COUNT": "3",
            }
            with (
                patch.object(ci, "ROOT", root), patch.object(ci, "probe_geometry", return_value=geometry),
                patch.object(ci, "command", side_effect=fake_command), patch.object(ci, "expected_cases", return_value=registry),
                patch.dict(os.environ, environment),
            ):
                self.assertEqual(ci.main(), 0)

            self.assertEqual(calls, ["web-capture", "native-capture", "compare"])
            (output,) = (root / "artifacts/native-parity/shared-ui/ios/phone").glob("run-*")
            summary = json.loads((output / "ci-summary.json").read_text())
            self.assertEqual((summary["shardIndex"], summary["shardCount"], summary["expectedCases"]), (1, 3, 16))
            self.assertEqual(summary["expectedCaseIds"], selected)
            self.assertEqual(json.loads((output / "expected-cases.json").read_text()), selected)
            self.assertNotIn("accessibilityExit", summary)


if __name__ == "__main__":
    unittest.main()
