from contextlib import redirect_stdout
from decimal import Decimal
from io import StringIO
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from PIL import Image

from evidence import APP_ID, capture_case, capture_frame, device_info, geometry_id, ios_app_info, manifest_cases, parse_scale, pixel_size, read_args, sha256


SCRIPT = Path(__file__).with_name("evidence.py")
CASE = {
    "id": "sample-light", "component": "sample", "theme": "light", "width": 3, "height": 2,
    "deviceScaleFactor": 2, "captured": True, "errors": [], "readyId": "sample-modal-panel",
}


class EvidenceTest(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.reference, self.raw, self.report = (self.root / label for label in ("reference", "raw", "report"))
        self.reference.mkdir()
        self.raw.mkdir()
        self.manifest = self.reference / "results.json"
        self.manifest.write_text(json.dumps([CASE]))
        self.image_name = "sample-light.png"

    def compare(self, *flags, build="wanted-sha"):
        return subprocess.run([
            sys.executable, str(SCRIPT), "compare", "--platform", "android", "--scale", "2", "--build", build,
            "--reference-dir", str(self.reference), "--raw-dir", str(self.raw), "--out-dir", str(self.report),
            *flags,
        ], capture_output=True, text=True)

    def result(self):
        return json.loads((self.report / "results.json").read_text())["cases"][0]

    def make_images(self, blank=False, changed=False):
        reference = Image.new("RGB", (6, 4), "white")
        if not blank:
            reference.putpixel((2, 3), (0, 0, 0))
            reference.putpixel((0, 0), (0, 0, 0))
        reference.save(self.reference / self.image_name)
        frame = Image.new("RGB", (8, 8), "red")
        frame.paste(reference, (1, 2))
        if changed:
            frame.putpixel((3, 5), (255, 255, 255))
        frame.save(self.raw / self.image_name)

    def make_verified_sidecar(self):
        raw = self.raw / self.image_name
        insets = [1, 2, 1, 2]
        raw.with_suffix(".json").write_text(json.dumps({
            "id": CASE["id"], "platform": "android", "dpr": "2", "build": "wanted-sha",
            "rawPixels": [8, 8], "insets": insets, "nativeViewport": [6, 4], "readyId": CASE["readyId"],
            "method": "maestro-ready-and-geometry", "geometryId": geometry_id((6, 4), Decimal(2), insets),
            "rawSha256": sha256(raw), "referenceSha256": sha256(self.reference / self.image_name),
        }))

    def test_exact_opaque_nonblank_match_with_verified_geometry(self):
        self.make_images()
        self.make_verified_sidecar()
        run = self.compare()
        self.assertEqual(run.returncode, 0, run.stderr)
        result = self.result()
        self.assertEqual(result["expectedPixels"], [6, 4])
        self.assertEqual(result["cropPixels"], [1, 2, 7, 6])
        self.assertEqual(result["status"], "match")
        self.assertEqual(result["changedPixels"], 0)

    def test_single_pixel_mismatch_writes_diff(self):
        self.make_images(changed=True)
        self.make_verified_sidecar()
        run = self.compare()
        self.assertEqual(run.returncode, 1, run.stderr)
        result = self.result()
        self.assertEqual(result["status"], "different")
        self.assertEqual(result["changedPixels"], 1)
        self.assertEqual(result["maxRgbDelta"], 255)
        self.assertEqual(result["differenceBounds"], [2, 3, 3, 4])
        self.assertTrue((self.report / result["diff"]).is_file())

    def test_identical_blank_crops_fail(self):
        self.make_images(blank=True)
        self.make_verified_sidecar()
        self.assertEqual(self.compare().returncode, 1)
        self.assertEqual(self.result()["status"], "blank")

    def test_invalid_geometry_is_never_resized(self):
        self.make_images()
        run = self.compare("--insets", "0", "0", "0", "0")
        self.assertEqual(run.returncode, 1, run.stderr)
        self.assertIn("expected (6, 4)", self.result()["error"])
        self.assertFalse((self.report / "sample-light-native.png").exists())

    def test_matching_raw_png_without_geometry_cannot_pass(self):
        self.make_images()
        self.assertEqual(self.compare("--insets", "1", "2", "1", "2").returncode, 1)
        self.assertEqual(self.result()["status"], "unverified")
        self.assertEqual(self.result()["changedPixels"], 0)

    def test_sidecar_must_match_raw_checksum_and_build(self):
        self.make_images()
        self.make_verified_sidecar()
        self.assertEqual(self.compare(build="wrong-sha").returncode, 1)
        self.assertIn("expected capture from build", self.result()["error"])
        self.make_images(changed=True)
        self.assertEqual(self.compare().returncode, 1)
        self.assertIn("rawSha256 disagrees", self.result()["error"])

    def test_rejects_failed_reference_and_reference_scale_mismatch(self):
        self.make_images()
        self.make_verified_sidecar()
        self.manifest.write_text(json.dumps([{**CASE, "captured": False, "errors": ["runtime error"]}]))
        self.assertEqual(self.compare().returncode, 1)
        self.assertIn("web reference failed", self.result()["error"])
        self.manifest.write_text(json.dumps([{**CASE, "deviceScaleFactor": 3}]))
        self.assertEqual(self.compare().returncode, 1)
        self.assertIn("reference DPR is 3", self.result()["error"])

    def test_rejects_bad_manifest_fields_and_dpr_geometry(self):
        for cases in ([CASE, CASE], [{**CASE, "readyId": "../output"}], [{**CASE, "width": True}]):
            self.manifest.write_text(json.dumps(cases))
            with self.assertRaises(ValueError):
                manifest_cases(self.manifest, [], None)
        with self.assertRaises(ValueError):
            pixel_size(CASE, parse_scale("2.625"))

    def test_android_checks_effective_density_override(self):
        args = SimpleNamespace(platform="android", device="test-serial", scale=Decimal(3))
        with patch("evidence.text_output", return_value="Physical density: 160\nOverride density: 320"):
            with self.assertRaisesRegex(ValueError, "reference DPR is 3"):
                device_info(args)

    def test_ios_reads_installed_bundle_architecture_without_guest_tools(self):
        app = self.root / "Native Gallery.app"
        app.mkdir()
        executable = app / "Native Gallery"
        executable.write_bytes(b"test Mach-O payload")
        (app / "Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": APP_ID, "CFBundleExecutable": executable.name,
        }, fmt=plistlib.FMT_BINARY))
        runtime = "com.apple.CoreSimulator.SimRuntime.iOS-26-2"
        simulator = "test-udid"
        listing = json.dumps({"devices": {runtime: [{"udid": simulator.upper(), "name": "Test iPhone"}]}})
        args = SimpleNamespace(platform="ios", device=simulator, ios_executable_sha256=sha256(executable).upper())

        with patch("evidence.text_output", side_effect=[listing, str(app), "x86_64 arm64"]) as command, patch("evidence.platform.machine", return_value="arm64"):
            result = device_info(args)

        self.assertEqual(result, {
            "model": "Test iPhone", "osVersion": runtime, "abi": "arm64", "appArchitectures": ["x86_64", "arm64"],
            "appExecutableSha256": sha256(executable),
        })
        self.assertEqual([call.args[0] for call in command.call_args_list], [
            ["xcrun", "simctl", "list", "devices", "booted", "-j"],
            ["xcrun", "simctl", "get_app_container", simulator, APP_ID, "app"],
            ["xcrun", "lipo", "-archs", str(executable)],
        ])

    def test_ios_rejects_installed_bundle_incompatible_with_runner_or_build(self):
        app = self.root / "Gallery.app"
        app.mkdir()
        (app / "Gallery").write_bytes(b"test Mach-O payload")
        (app / "Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": APP_ID, "CFBundleExecutable": "Gallery"}))
        for architectures, message in (("x86_64", "runner architecture"), ("arm64", "disagrees with expected")):
            with (
                self.subTest(architectures=architectures),
                patch("evidence.text_output", side_effect=[str(app), architectures]),
                patch("evidence.platform.machine", return_value="arm64"),
                self.assertRaisesRegex(ValueError, message),
            ):
                ios_app_info("test-udid", "0" * 64)

    def test_ios_capture_keeps_shard_case_selection_and_reads_artifact_checksum(self):
        digest = "a" * 64
        flags = [
            "capture", "--platform", "ios", "--scale", "2", "--raw-dir", str(self.raw),
            "--insets", "0", "0", "0", "0", "--device", "fixture", "--build", "wanted-sha",
            "--case", "sample-light", "--case", "sample-dark",
        ]
        with patch.object(sys, "argv", [str(SCRIPT), *flags]), patch.dict(os.environ, SHARED_IOS_EXECUTABLE_SHA256=digest):
            args = read_args()
        self.assertEqual(args.ios_executable_sha256, digest)
        self.assertEqual(args.case, ["sample-light", "sample-dark"])

    def test_ios_fixture_setup_allows_the_slower_simulator_driver(self):
        args = SimpleNamespace(platform="ios", device="test-udid")
        frame = self.raw / self.image_name
        result = subprocess.CompletedProcess([], 0, stdout=b"")
        with patch("evidence.subprocess.run", return_value=result) as run, redirect_stdout(StringIO()):
            capture_frame(args, CASE["id"], self.root / "flow.yml", frame)
        self.assertEqual(run.call_args_list[0].kwargs["timeout"], 240)
        self.assertEqual(run.call_args_list[1].args[0], ["xcrun", "simctl", "io", args.device, "screenshot", str(frame)])

    def test_capture_waits_for_gallery_case_and_geometry_and_records_verified_frame(self):
        self.make_images()
        screenshot = (self.raw / self.image_name).read_bytes()
        scratch = self.root / "scratch"
        scratch.mkdir()
        args = SimpleNamespace(
            platform="android", device="test-serial", scale=Decimal(2), build="wanted-sha",
            insets=[1, 2, 1, 2], reference_dir=self.reference, raw_dir=self.raw,
        )

        def mock_run(command, *, check, stdout=None, **options):
            self.assertTrue(check)
            if command[0] == "maestro":
                flow = Path(command[-1]).read_text()
                steps = (
                    "- launchApp",
                    "visible: separator",
                    "- openLink: zyx-native-parity://internal/shared-ui/sample-light",
                    "platform: iOS",
                    r"visible: '^Open in “Zyx Academy Native”\?$'",
                    "tapOn: '^Open$'",
                    "id: sample-modal-panel",
                    "id: shared-ui-geometry-6x4-dpr-2-insets-1-2-1-2",
                )
                positions = [flow.index(step) for step in steps]
                self.assertEqual(positions, sorted(positions))
                return subprocess.CompletedProcess(command, 0, stdout=b"")
            elif command[0] == "adb":
                stdout.write(screenshot)
            else:
                self.fail(f"Unexpected device command {command}")

        with patch("evidence.subprocess.run", side_effect=mock_run):
            capture_case(CASE, args, {"model": "test-device"}, scratch)
        self.assertEqual(self.compare().returncode, 0)
        self.assertTrue(self.result()["geometryVerified"])

    def test_capture_replays_markers_after_transient_launch_and_screenshot_failures(self):
        args = SimpleNamespace(platform="android", device="test-serial")
        success = subprocess.CompletedProcess([], 0, stdout=b"")
        startup = subprocess.CalledProcessError(1, "maestro", output=b'Launch app "app"...\n==== Debug output')
        offline = subprocess.CalledProcessError(255, "adb", stderr=b"error: device 'test-serial' not found")
        output = StringIO()

        with patch("evidence.subprocess.run", side_effect=[startup, success, success, offline, success, success, success]) as run, redirect_stdout(output):
            capture_frame(args, CASE["id"], self.root / "flow.yml", self.raw / self.image_name)

        commands = [call.args[0] for call in run.call_args_list]
        stages = [command[0] if command[0] == "maestro" else command[3] for command in commands]
        self.assertEqual(stages, ["maestro", "wait-for-device", "maestro", "exec-out", "wait-for-device", "maestro", "exec-out"])
        self.assertIn("Maestro fixture setup failed on attempt 1/3", output.getvalue())
        self.assertIn("device 'test-serial' not found", output.getvalue())

    def test_capture_stops_on_assertion_even_when_driver_reports_offline(self):
        args = SimpleNamespace(platform="android", device="test-serial")
        failure = subprocess.CalledProcessError(1, "maestro", output=b"Assertion is false: marker\ndevice offline")
        with patch("evidence.subprocess.run", side_effect=failure) as run, redirect_stdout(StringIO()):
            with self.assertRaises(subprocess.CalledProcessError):
                capture_frame(args, CASE["id"], self.root / "flow.yml", self.raw / self.image_name)
        self.assertEqual(run.call_count, 1)

    def test_capture_stops_after_three_transient_failures(self):
        args = SimpleNamespace(platform="android", device="test-serial")
        failure = subprocess.CalledProcessError(1, "maestro", output=b"device offline")
        with patch("evidence.subprocess.run", side_effect=[failure, None, failure, None, failure]) as run, redirect_stdout(StringIO()):
            with self.assertRaises(subprocess.CalledProcessError):
                capture_frame(args, CASE["id"], self.root / "flow.yml", self.raw / self.image_name)
        self.assertEqual(run.call_count, 5)


if __name__ == "__main__":
    unittest.main()
