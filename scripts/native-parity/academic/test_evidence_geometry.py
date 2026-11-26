import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parents[2]


class EvidenceGeometryTest(unittest.TestCase):
    def setUp(self):
        scratch = self.enterContext(tempfile.TemporaryDirectory())
        self.artifacts = Path(scratch) / "artifacts"
        self.android = self.artifacts / "academic-android-evidence"
        (self.android / "routes").mkdir(parents=True)
        (self.android / "interactions").mkdir()
        Image.new("RGB", (380, 900)).save(
            self.android / "interactions" / "academic-admin-courses-list-populated-light.png",
        )
        self.comparison = Path(scratch) / "matched-viewport"

    def route_geometry(self, *heights):
        report = {
            "platform": "android",
            "device": "test device",
            "revision": "test revision",
            "deviceScaleFactor": 1,
            "captures": [
                {"status": "captured", "bounds": {"x": 0, "y": 24, "width": 380, "height": height}}
                for height in heights
            ],
        }
        (self.android / "routes" / "manifest.json").write_text(json.dumps(report))

    def run_script(self, name, *args):
        process = subprocess.run(
            [sys.executable, str(SCRIPTS / name), *map(str, args)],
            cwd=ROOT, capture_output=True, text=True, timeout=10,
        )
        return process.returncode

    def test_provisional_geometry_does_not_create_a_final_manifest(self):
        self.route_geometry(852)
        self.assertEqual(self.run_script("evaluate.py", self.android, "--provisional"), 0)
        provisional = self.android / "interaction-manifest-provisional.json"
        self.assertTrue(provisional.is_file())
        self.assertFalse((self.android / "interaction-manifest.json").exists())
        self.assertFalse((self.android / "comparison-status.json").exists())
        self.assertEqual(self.run_script("match-viewport.py", self.artifacts, self.comparison), 1)
        status = json.loads((self.comparison / "status.json").read_text())[0]
        self.assertEqual(status["status"], "unverified")

    def test_failed_final_geometry_invalidates_an_existing_manifest(self):
        self.route_geometry(852)
        self.assertEqual(self.run_script("evaluate.py", self.android, "--provisional"), 0)
        self.assertEqual(self.run_script("evaluate.py", self.android), 0)
        final = self.android / "interaction-manifest.json"
        self.assertTrue(final.is_file())
        self.route_geometry(852, 848)
        self.assertEqual(self.run_script("evaluate.py", self.android), 1)
        self.assertFalse(final.exists())
        self.assertTrue((self.android / "interaction-manifest-provisional.json").is_file())
        status = json.loads((self.android / "comparison-status.json").read_text())
        self.assertEqual(status["status"], "unverified")

        final.write_text("{}")
        self.assertEqual(self.run_script("match-viewport.py", self.artifacts, self.comparison), 1)
        match = json.loads((self.comparison / "status.json").read_text())[0]
        self.assertEqual(match["reason"], "final device geometry verification failed")
