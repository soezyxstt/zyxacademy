import subprocess
import unittest
from unittest.mock import patch

from device_capture import CAPTURE_FLOW, open_route


class CaptureNavigationTests(unittest.TestCase):
    @patch.dict("os.environ", {"NATIVE_PARITY_MAESTRO": "/pinned/maestro"})
    @patch("device_capture.subprocess.run")
    def test_ios_enters_the_fixture_through_the_shared_menu(self, run):
        targets = {
            "gallery/separator": "parity-capture-gallery-separator",
            "internal/public-links/grouped": "parity-capture-directory-grouped",
            "internal/public-forms/short-meeting": "parity-capture-public-forms-short-meeting",
            "internal/meet/meeting-recovery": "parity-capture-meet-meeting-recovery",
            "internal/webview-reference/formatted-date": "parity-capture-webview-formatted-date",
        }
        for path, target in targets.items():
            with self.subTest(path=path):
                open_route("ios", "simulator", path)
                run.assert_called_with([
                    "/pinned/maestro", "--platform", "ios", "--device", "simulator", "test", "-e",
                    f"TARGET_ID={target}", "--debug-output", f"artifacts/native-parity/ios/navigation/{target}",
                    str(CAPTURE_FLOW),
                ], check=True, timeout=120)
        flow = CAPTURE_FLOW.read_text()
        self.assertIn("- launchApp", flow)
        self.assertIn("id: ${TARGET_ID}", flow)
        self.assertNotIn("openLink", flow)

    @patch("device_capture.subprocess.run", side_effect=subprocess.CalledProcessError(1, "maestro"))
    def test_failed_navigation_and_unrelated_routes_do_not_fall_back_to_openurl(self, run):
        with self.assertRaises(subprocess.CalledProcessError):
            open_route("ios", "simulator", "gallery/separator")
        with self.assertRaises(ValueError):
            open_route("ios", "simulator", "admin")
        self.assertEqual(run.call_count, 1)

    @patch("device_capture.subprocess.run")
    def test_android_retains_its_existing_app_intent(self, run):
        open_route("android", None, "gallery/separator")
        run.assert_called_once_with([
            "adb", "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
            "-d", "zyx-native-parity://gallery/separator", "com.zyx.academy.nativeparity",
        ], check=True)

    @patch("device_capture.subprocess.run")
    def test_android_requests_the_form_frame_without_changing_the_normal_fixture(self, run):
        open_route("android", None, "internal/public-forms/forms-ready")
        run.assert_called_once_with([
            "adb", "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
            "-d", "zyx-native-parity://internal/public-forms/forms-ready?frame=1", "com.zyx.academy.nativeparity",
        ], check=True)
