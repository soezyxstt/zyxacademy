import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from case_manifest import load_case_groups


class CaseManifestTests(unittest.TestCase):
    def load(self, entries):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "cases.json"
            path.write_text(json.dumps(entries), encoding="utf-8")
            return load_case_groups(path)

    def test_explicit_component_keeps_group_and_case_order(self):
        groups = self.load([
            {"id": "group-empty", "component": "radio-group"},
            {"id": "radio-empty", "component": "radio"},
            {"id": "group-selected", "component": "radio-group"},
            {"id": "radio-selected", "component": "radio"},
            {"id": "radio-disabled", "component": "radio"},
            {"id": "group-disabled", "component": "radio-group"},
        ])

        self.assertEqual(list(groups.items()), [
            ("radio-group", ["group-empty", "group-selected", "group-disabled"]),
            ("radio", ["radio-empty", "radio-selected", "radio-disabled"]),
        ])

    def test_rejects_duplicate_case_ids(self):
        with self.assertRaisesRegex(ValueError, "Duplicate case id radio-empty"):
            self.load([
                {"id": "radio-empty", "component": "radio-group"},
                {"id": "radio-empty", "component": "radio"},
            ])

    def test_requires_three_cases_per_component(self):
        with self.assertRaisesRegex(ValueError, "Expected three cases for radio-group, found 1"):
            self.load([{"id": "radio-empty", "component": "radio-group"}])
