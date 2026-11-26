"""Exercise every component independently so gallery coverage can exceed one viewport."""
from pathlib import Path
import subprocess
import sys
import time

from case_manifest import load_case_groups
from device_capture import open_route, screenshot


def capture(platform, device):
    scale = 3 if platform == "ios" else 1
    directory = Path("artifacts/native-parity")
    components = load_case_groups(directory / "web" / f"dpr{scale}" / "cases.json")
    failures = []
    for component in components:
        frame = directory / platform / f"frame-{component}.png"
        command = [sys.executable, str(Path(__file__).with_name("compare.py")), str(frame),
                   str(scale), component]
        open_route(platform, device, f"gallery/{component}")
        for _ in range(30):
            screenshot(platform, device, frame)
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
