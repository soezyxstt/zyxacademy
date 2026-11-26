"""Capture additional same-device WebView references from the Next fixture export."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import copyfile
import subprocess
import sys
from threading import Thread
import time

from case_manifest import load_case_groups
from compare import crop_positions, load_frame


ARTIFACTS = Path("artifacts/native-parity")
HOST, PORT = "127.0.0.1", 3211


class FixtureServer(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; "
                         "style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-src 'none'")
        super().end_headers()


def open_component(platform, device, component):
    url = f"zyx-native-parity://internal/webview-reference/{component}"
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


def capture(platform, device, selected):
    scale = 3 if platform == "ios" else 1
    manifest = ARTIFACTS / "web" / f"dpr{scale}" / "cases.json"
    groups = load_case_groups(manifest)
    if selected and selected not in groups:
        raise SystemExit(f"Unknown WebView component {selected}")
    native = ARTIFACTS / platform
    references = native / "webview-reference"
    references.mkdir(parents=True, exist_ok=True)
    copyfile(manifest, references / "cases.json")

    errors = []
    for ordinal, (component, cases) in enumerate(groups.items()):
        if selected and component != selected:
            continue
        destination = references / f"frame-{component}.png"
        open_component(platform, device, component)
        for _ in range(30):
            screenshot(platform, device, destination)
            frame = load_frame(destination)
            positions = crop_positions(frame, scale, (96 + ordinal) * scale)
            width, height = 320 * scale, 100 * scale
            if len(positions) == len(cases) and all(x + width <= frame.width and y + height <= frame.height for x, y in positions):
                for case, (x, y) in zip(cases, positions):
                    frame.crop((x, y, x + width, y + height)).save(references / f"{case}.png")
                break
            time.sleep(1)
        else:
            print(f"WebView fixture did not expose all crop markers for {component}", file=sys.stderr)
            errors.append(component)
            continue

        result = subprocess.run([
            sys.executable, str(Path(__file__).with_name("compare.py")),
            str(native / f"frame-{component}.png"), str(scale), component,
            "--mobile-webview-reference", str(references),
        ])
        if result.returncode:
            errors.append(component)
    if errors:
        raise SystemExit(f"WebView parity failed for {', '.join(errors)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios"))
    parser.add_argument("device", nargs="?")
    parser.add_argument("--component", help="Capture one component from the shared case manifest")
    args = parser.parse_args()
    if args.platform == "ios" and not args.device:
        parser.error("An iOS simulator ID is required")
    site = ARTIFACTS / "webview-site"
    if not (site / "index.html").is_file():
        raise SystemExit("Missing Next.js static export for mobile WebView")

    with ThreadingHTTPServer((HOST, PORT), partial(FixtureServer, directory=site)) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        android = args.platform == "android"
        try:
            if android:
                subprocess.run(["adb", "reverse", f"tcp:{PORT}", f"tcp:{PORT}"], check=True)
            capture(args.platform, args.device, args.component)
        finally:
            if android:
                subprocess.run(["adb", "reverse", "--remove", f"tcp:{PORT}"], check=False)
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    main()
