import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import call, patch

from PIL import Image

from capture import capture_case


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

    def test_retry_diagnostics_do_not_supply_comparison_screenshots(self):
        name = "academic-admin-courses-list-populated-light.png"
        diagnostics = self.android / "interactions" / "prior-attempts" / "attempt-01-synthetic"
        diagnostics.mkdir(parents=True)
        Image.new("RGB", (380, 900)).save(diagnostics / name)
        self.route_geometry(852)
        self.assertEqual(self.run_script("evaluate.py", self.android), 0)
        manifest = json.loads((self.android / "interaction-manifest.json").read_text())
        self.assertEqual(manifest["captures"][0]["image"], f"interactions/{name}")

        (self.android / "interactions" / name).unlink()
        self.assertNotEqual(self.run_script("evaluate.py", self.android), 0)
        self.assertFalse((self.android / "interaction-manifest.json").exists())

    def test_android_route_rechecks_transport_and_stamp_on_retry(self):
        case = {"href": "zyx-native-parity://academic?role=tutor&path=%2Ftutor&theme=light"}
        stamped = Image.new("RGB", (20, 20))
        stamped.paste((224, 1, 239), (0, 0, 4, 4))
        stamped.paste((223, 1, 234), (16, 16, 20, 20))
        clean = Image.new("RGB", (20, 20))
        frames = [(b"stamped", stamped), (b"clean", clean), (b"clean", clean)]
        with (
            patch("capture.wait_for_android") as wait,
            patch("capture.open_url", side_effect=[subprocess.CalledProcessError(1, "adb"), None]) as open_link,
            patch("capture.screenshot", side_effect=frames),
            patch("capture.time.sleep"),
        ):
            png, _, bounds, status, attempts, failures = capture_case("android", "emulator", case, 1, 1, self.android)
        self.assertEqual(wait.call_args_list, [call("emulator"), call("emulator")])
        self.assertEqual(
            open_link.call_args_list,
            [call("android", "emulator", f"{case['href']}&evidence=1&evidenceNonce=1-{attempt}") for attempt in (1, 2)],
        )
        self.assertEqual((png, bounds, status, attempts), (b"clean", (0, 0, 20, 20), "captured", 2))
        self.assertEqual(failures, ["device command failed (CalledProcessError)"])

    def test_android_route_leaves_unavailable_device_unverified(self):
        case = {"href": "zyx-native-parity://academic?role=tutor&path=%2Ftutor&theme=light"}
        with (
            patch("capture.wait_for_android", side_effect=subprocess.TimeoutExpired("adb", 12)) as wait,
            patch("capture.open_url") as open_link,
        ):
            png, _, bounds, status, attempts, failures = capture_case("android", "emulator", case, 1, 1, self.android)
        self.assertEqual(wait.call_count, 2)
        open_link.assert_not_called()
        self.assertEqual((png, bounds, status, attempts), (None, None, "unverified", 2))
        self.assertEqual(failures, ["device command failed (TimeoutExpired)"] * 2)
