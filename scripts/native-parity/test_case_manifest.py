import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from case_manifest import load_case_layout


class CaseManifestTests(unittest.TestCase):
    def load(self, entries, include_heights=False):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "cases.json"
            path.write_text(json.dumps(entries), encoding="utf-8")
            groups, heights = load_case_layout(path)
            return (groups, heights) if include_heights else groups

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

    def test_retains_case_heights_and_defaults_to_the_original_crop(self):
        groups, heights = self.load([
            {"id": "inbox-empty", "component": "inbox", "height": 216},
            {"id": "inbox-unread", "component": "inbox", "height": 180},
            {"id": "inbox-mixed", "component": "inbox"},
        ], include_heights=True)
        self.assertEqual(groups, {"inbox": ["inbox-empty", "inbox-unread", "inbox-mixed"]})
        self.assertEqual(heights, {"inbox-empty": 216, "inbox-unread": 180, "inbox-mixed": 100})

    def test_rejects_capture_heights_too_tall_for_the_gallery(self):
        with self.assertRaisesRegex(ValueError, "Invalid capture height"):
            self.load([{"id": "inbox-empty", "component": "inbox", "height": 669}])

    def test_rejects_three_frames_that_overflow_together(self):
        with self.assertRaisesRegex(ValueError, "exceed the gallery viewport"):
            self.load([{"id": name, "component": "inbox", "height": 223}
                       for name in ("inbox-empty", "inbox-unread", "inbox-mixed")])
