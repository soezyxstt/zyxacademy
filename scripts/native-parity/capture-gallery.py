"""Exercise every component independently so gallery coverage can exceed one viewport."""
from pathlib import Path
import subprocess
import sys
import time

from case_manifest import load_case_layout
from compare import component_crops, load_frame, unchanged_crops
from device_capture import open_route, screenshot


def capture(platform, device):
    scale = 3 if platform == "ios" else 1
    directory = Path("artifacts/native-parity")
    components, heights = load_case_layout(directory / "web" / f"dpr{scale}" / "cases.json")
    failures = []
    for index, (component, cases) in enumerate(components.items()):
        frame = directory / platform / f"frame-{component}.png"
        command = [sys.executable, str(Path(__file__).with_name("compare.py")), str(frame),
                   str(scale), component]
        open_route(platform, device, f"gallery/{component}")
        previous = None
        for _ in range(30):
            screenshot(platform, device, frame)
            try:
                crops = component_crops(load_frame(frame), scale, index, cases, heights)
            except ValueError:
                previous = None
                time.sleep(1)
                continue
            if platform == "ios" or unchanged_crops(previous, crops):
                break
            previous = crops
            time.sleep(1)
        else:
            frame.replace(frame.with_name(f"unstable-frame-{component}.png"))
            failures.append(component)
            continue
        result = subprocess.run(command)
        if result.returncode:
            failures.append(component)
    if failures:
        raise SystemExit(f"Parity failed for {', '.join(failures)}")


if __name__ == "__main__":
    capture(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
