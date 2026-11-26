"""Open an Expo route and capture the real simulator framebuffer."""
import subprocess


def open_route(platform, device, path):
    url = f"zyx-native-parity://{path}"
    if platform == "ios":
        command = ["xcrun", "simctl", "openurl", device, url]
    else:
        command = ["adb", "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url,
                   "com.zyx.academy.nativeparity"]
    subprocess.run(command, check=True)


def screenshot(platform, device, destination):
    if platform == "ios":
        subprocess.run(["xcrun", "simctl", "io", device, "screenshot", str(destination)], check=True)
    else:
        with destination.open("wb") as stream:
            subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=stream, check=True)
