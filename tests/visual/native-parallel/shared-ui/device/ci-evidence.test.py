import importlib.util
from pathlib import Path
import unittest
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
        import json
        with patch.object(ci.subprocess, "check_output", return_value=json.dumps(cases)):
            self.assertEqual(len(ci.expected_cases("phone")), 48)
            self.assertEqual(len(ci.expected_cases("tablet")), 2)
            self.assertEqual(len(ci.expected_cases("wide")), 2)
        with patch.object(ci.subprocess, "check_output", return_value=json.dumps(cases[:-1])):
            with self.assertRaises(ValueError):
                ci.expected_cases("phone")


if __name__ == "__main__":
    unittest.main()
