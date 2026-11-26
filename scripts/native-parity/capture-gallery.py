"""Exercise every component independently so gallery coverage can exceed one viewport."""
import json
from pathlib import Path
import subprocess
import sys
import time


def capture(platform, device):
    scale = 3 if platform == "ios" else 1
    directory = Path("artifacts/native-parity")
    cases = json.loads((directory / "web" / f"dpr{scale}" / "cases.json").read_text())
    components = dict.fromkeys(case.split("-", 1)[0] for case in cases)
    failures = []
    for component in components:
        url = f"zyx-native-parity://gallery/{component}"
        frame = directory / platform / f"frame-{component}.png"
        command = [sys.executable, str(Path(__file__).with_name("compare.py")), str(frame),
                   str(scale), component]
        if platform == "ios":
            subprocess.run(["xcrun", "simctl", "openurl", device, url], check=True)
        else:
            subprocess.run(["adb", "shell", "am", "start", "-W", "-a",
                            "android.intent.action.VIEW", "-d", url,
                            "com.zyx.academy.nativeparity"], check=True)
        for _ in range(30):
            if platform == "ios":
                subprocess.run(["xcrun", "simctl", "io", device, "screenshot", str(frame)], check=True)
            else:
                with frame.open("wb") as stream:
                    subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=stream, check=True)
            if subprocess.run([*command, "--ready"], capture_output=True).returncode == 0:
                break
            time.sleep(1)
        result = subprocess.run(command)
        if result.returncode:
            failures.append(component)
    if failures:
        raise SystemExit(f"Parity failed for {', '.join(failures)}")


if __name__ == "__main__":
    capture(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
