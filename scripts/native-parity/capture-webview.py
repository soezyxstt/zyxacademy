"""Capture additional same-device WebView references from the Next fixture export."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from shutil import copyfile
import subprocess
import sys
from threading import Thread
import time
from urllib.parse import urlsplit

from case_manifest import DIRECTORY_CASES, PAGE_CAPTURES, load_case_layout, load_page_manifest
from device_capture import open_route, screenshot
from compare import MARKER, crop_positions, load_frame
from page_frames import blank_frame, capture_stable_page, compare_page_frames


ARTIFACTS = Path("artifacts/native-parity")
HOST, PORT = "127.0.0.1", 3211
DIRECTORY_WEBVIEW_MARKER = (0, 242, 146)


class FixtureServer(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        directory_route, _ = PAGE_CAPTURES["directory"]
        route = urlsplit(path).path
        # Next exports these fixture URLs as .html files, while the page runs at /tautan/<case>.
        if route in {f"{directory_route}/{case}" for case in DIRECTORY_CASES}:
            path = f"{route}.html"
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; "
                         "style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-src 'none'")
        super().end_headers()


def capture(platform, device, selected):
    scale = 3 if platform == "ios" else 1
    manifest = ARTIFACTS / "web" / f"dpr{scale}" / "cases.json"
    groups, heights = load_case_layout(manifest)
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
        open_route(platform, device, f"internal/webview-reference/{component}")
        for _ in range(30):
            screenshot(platform, device, destination)
            frame = load_frame(destination)
            positions = crop_positions(frame, scale, (96 + ordinal) * scale)
            width = 320 * scale
            if len(positions) == len(cases) and all(
                x + width <= frame.width and y + heights[case] * scale <= frame.height
                for case, (x, y) in zip(cases, positions)
            ):
                for case, (x, y) in zip(cases, positions):
                    frame.crop((x, y, x + width, y + heights[case] * scale)).save(references / f"{case}.png")
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


def capture_directory(device, site):
    group = "directory"
    platform, scale = "android", 1
    manifest = load_page_manifest(ARTIFACTS / "web/dpr1/directory.json", group)
    revisions = {"commit": os.environ.get("PARITY_HEAD_SHA"), "buildCommit": os.environ.get("GITHUB_SHA")}
    exported = json.loads((site / "parity-build.json").read_text())
    if exported != revisions or any(manifest[key] != value for key, value in revisions.items()):
        raise ValueError("Directory WebView export and manifest differ from the tested build")

    artifacts = ARTIFACTS / platform
    reference = artifacts / "webview-reference" / group
    output = artifacts / "native-vs-webview" / group
    reference.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    width, height = manifest["width"], manifest["height"]
    _, native_route = PAGE_CAPTURES[group]
    rows = []
    for index, case in enumerate(manifest["cases"]):
        frames = {}
        failure = None
        for surface, route, folder, marker in (
            ("native", f"{native_route}/{case}", output, MARKER),
            ("webview", f"internal/webview-reference/directory-{case}", reference, DIRECTORY_WEBVIEW_MARKER),
        ):
            try:
                open_route(platform, device, route)
            except subprocess.SubprocessError as error:
                print(f"{case} ({surface}): {error}", file=sys.stderr)
                failure = failure or {"status": "navigation-failed", "surface": surface}
                continue
            try:
                frame = capture_stable_page(platform, device, folder / f"frame-{case}.png",
                                            width, height, index, scale, marker)
            except (OSError, subprocess.SubprocessError) as error:
                print(f"{case} ({surface}): {error}", file=sys.stderr)
                frame = None
            if frame is None:
                failure = failure or {"status": "missing-stable-frame", "surface": surface}
                continue
            frame.save(folder / f"{case}.png")
            frames[surface] = frame
        if failure is None:
            failure = ({"status": "invalid-native-frame"} if blank_frame(frames["native"]) else
                       compare_page_frames(frames["webview"], frames["native"], output / f"{case}-diff.png"))
        rows.append({"case": case, **failure})
    evidence = {"route": manifest["route"], "platform": platform, "scale": scale, "viewport": [width, height],
                "referenceEngine": "android-webview", **revisions, "cases": rows}
    (output / "result.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence))
    return all(row["status"] == "pass" for row in rows)


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
            directory_passed = True
            if android and not args.component:
                try:
                    directory_passed = capture_directory(args.device, site)
                except (OSError, ValueError) as error:
                    print(f"Directory WebView capture: {error}", file=sys.stderr)
                    directory_passed = False
            capture(args.platform, args.device, args.component)
            if not directory_passed:
                raise SystemExit("Android directory WebView parity failed")
        finally:
            if android:
                subprocess.run(["adb", "reverse", "--remove", f"tcp:{PORT}"], check=False)
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    main()
