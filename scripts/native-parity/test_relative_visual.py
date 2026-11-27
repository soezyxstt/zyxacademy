from importlib.util import find_spec
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from relative_policy import relative_issues


@unittest.skipUnless(find_spec("numpy") and find_spec("PIL"), "Needs the Android image measurement dependencies")
class RelativeVisualTest(unittest.TestCase):
    def setUp(self):
        from PIL import Image, ImageDraw
        from relative_visual import measure_relative

        self.image = Image
        self.draw = ImageDraw.Draw
        self.measure = measure_relative
        # Keep the small glyph away from the card boundary. Its loss must
        # fail despite a high score across the much larger solid background.
        self.reference = Image.new("RGB", (320, 100), "white")
        draw = self.draw(self.reference)
        draw.rounded_rectangle((30, 12, 290, 88), radius=10, fill=(35, 61, 103))
        draw.line((44, 45, 54, 45), fill="white", width=2)
        draw.line((49, 40, 49, 50), fill="white", width=2)
        draw.rectangle((80, 34, 158, 52), fill=(222, 233, 249))

    def result(self, native):
        metrics = self.measure(self.reference, native)
        return metrics, relative_issues(metrics, self.reference.size)

    def test_identical_and_small_edge_antialiasing_pass_with_nonzero_raw_rgb_difference(self):
        self.assertEqual([], self.result(self.reference)[1])
        native = self.reference.copy()
        self.draw(native).line((42, 88, 278, 88), fill=(41, 67, 110), width=1)
        self.assertNotEqual(native.tobytes(), self.reference.tobytes())
        self.assertEqual([], self.result(native)[1])

    def test_incompatible_and_blank_frames_do_not_pass(self):
        self.assertIn("missing or incompatible measurement", self.result(self.image.new("RGB", (319, 100)))[1])
        self.assertIn("insufficient foreground", self.result(self.image.new("RGB", (320, 100), "white"))[1])
        almost_blank = self.image.new("RGB", (320, 100), "white")
        self.draw(almost_blank).point((10, 10), fill="black")
        self.assertIn("insufficient foreground", self.result(almost_blank)[1])

    def test_missing_tiny_icon_fails_even_when_global_and_foreground_ssim_are_high(self):
        native = self.reference.copy()
        self.draw(native).rectangle((42, 38, 57, 52), fill=(35, 61, 103))
        metrics, issues = self.result(native)
        self.assertGreaterEqual(metrics["fullSsim"], 0.98)
        self.assertGreaterEqual(metrics["foregroundSsim"], 0.98)
        self.assertIn("localized contrast or missing detail", issues)

    def test_shifted_geometry_fails(self):
        native = self.image.new("RGB", (320, 100), "white")
        native.paste(self.reference, (3, 0))
        self.assertIn("foreground anchor geometry", self.result(native)[1])

    def test_color_and_contrast_changes_fail(self):
        washed_out = self.reference.copy()
        self.draw(washed_out).rectangle((80, 34, 158, 52), fill=(85, 102, 131))
        self.assertIn("localized contrast or missing detail", self.result(washed_out)[1])
        # These fills have nearly identical BT.709 luma. The RGB surface
        # check must still catch the failure.
        wrong_hue = self.reference.copy()
        self.draw(wrong_hue).rectangle((80, 34, 158, 52), fill=(240, 229, 235))
        metrics, issues = self.result(wrong_hue)
        self.assertGreaterEqual(metrics["foregroundSsim"], 0.98)
        self.assertIn("canvas or surface color", issues)

    def test_android_cli_gates_relative_webview_with_nonzero_raw_diagnostics(self):
        from compare import MARKER

        with TemporaryDirectory() as directory:
            root = Path(directory)
            chromium = root / "artifacts/native-parity/web/dpr1"
            webview = root / "webview-reference"
            android = root / "android"
            for folder in (chromium, webview, android):
                folder.mkdir(parents=True)
            cases = ["button-one", "button-two", "button-three"]
            manifest = [{"id": case, "component": "button", "height": 100} for case in cases]
            for folder in (chromium, webview):
                (folder / "cases.json").write_text(json.dumps(manifest))
                for case in cases:
                    self.reference.save(folder / f"{case}.png")
            frame = self.image.new("RGB", (320, 305), "white")
            frame.paste(MARKER, (0, 0, 16, 1))
            changed = self.reference.copy()
            self.draw(changed).line((42, 88, 278, 88), fill=(41, 67, 110))
            for index in range(3):
                top = index * 101 + 2
                frame.paste(MARKER, (0, top, 320, top + 1))
                frame.paste(changed, (0, top + 1))
            native = android / "frame-button.png"
            frame.save(native)
            args = [sys.executable, str(Path(__file__).with_name("compare.py")), str(native), "1", "button"]
            for command in (args, [*args, "--mobile-webview-reference", str(webview)]):
                result = subprocess.run(command, cwd=root, capture_output=True, text=True)
                self.assertEqual(0, result.returncode, result.stderr)
            measured = android / "native-vs-webview/result-button.json"
            rows = json.loads(measured.read_text())["cases"]
            self.assertTrue(all(row["differentPixels"] > 0 and not relative_issues(row["relativeVisual"], (320, 100))
                                for row in rows))

            (webview / "button-two.png").unlink()
            self.assertNotEqual(0, subprocess.run(
                [*args, "--mobile-webview-reference", str(webview)], cwd=root, capture_output=True,
            ).returncode)
            rows = json.loads(measured.read_text())["cases"]
            self.assertEqual("missing or incompatible reference", rows[1]["evidenceIssue"])
            self.assertIn("relativeVisual", rows[2])
