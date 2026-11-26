"""Navigate to an Expo fixture and capture the real simulator framebuffer."""
import os
from pathlib import Path
import re
import subprocess

CAPTURE_FLOW = Path(__file__).resolve().parents[2] / ".maestro/native-parity/helpers/open-capture.yaml"
CAPTURE_GROUPS = {
    "gallery": "gallery",
    "internal/public-links": "directory",
    "internal/public-forms": "public-forms",
    "internal/webview-reference": "webview",
}


def open_route(platform, device, path):
    prefix, _, name = path.rpartition("/")
    if platform == "ios":
        if prefix not in CAPTURE_GROUPS or not re.fullmatch(r"[a-z0-9-]+", name):
            raise ValueError(f"Unknown parity fixture path: {path}")
        target = f"parity-capture-{CAPTURE_GROUPS[prefix]}-{name}"
        maestro = os.environ.get("NATIVE_PARITY_MAESTRO", "maestro")
        evidence = Path("artifacts/native-parity/ios/navigation") / target
        subprocess.run([maestro, "--platform", "ios", "--device", device, "test", "-e",
                        f"TARGET_ID={target}", "--debug-output", str(evidence), str(CAPTURE_FLOW)],
                       check=True, timeout=120)
        return

    suffix = "?frame=1" if prefix == "internal/public-forms" else ""
    subprocess.run(["adb", "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
                    "-d", f"zyx-native-parity://{path}{suffix}", "com.zyx.academy.nativeparity"], check=True)


def screenshot(platform, device, destination):
    if platform == "ios":
        subprocess.run(["xcrun", "simctl", "io", device, "screenshot", str(destination)], check=True)
    else:
        with destination.open("wb") as stream:
            subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=stream, check=True)
