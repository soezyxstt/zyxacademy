"""Open each academic fixture with the OS and run its Maestro assertions and actions."""

import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from capture import APP_ID, open_url, run


def fixture_segments(flow):
    header, separator, body = flow.read_text().partition("\n---\n")
    launch = "- launchApp\n"
    link = "- openLink: "
    if not separator or not header.startswith(f"appId: {APP_ID}\n") or not body.startswith(launch + link):
        raise ValueError("Expected an academic Maestro header followed by launchApp and openLink")
    for segment in body.removeprefix(launch + link).split(f"\n{link}"):
        url, newline, steps = segment.partition("\n")
        parsed = urlsplit(url)
        params = parse_qs(parsed.query)
        if (
            (parsed.scheme, parsed.netloc, parsed.path, parsed.fragment) != ("zyx-native-parity", "academic", "", "")
            or params.get("role") not in (["tutor"], ["admin"], ["student"])
            or params.get("theme") not in (["light"], ["dark"])
            or len(params.get("path", [])) != 1
            or not params["path"][0].startswith(("/tutor", "/admin/"))
        ):
            raise ValueError(f"Invalid academic fixture URL: {url}")
        if not newline or not steps.startswith("- extendedWaitUntil:\n"):
            raise ValueError(f"Expected a positive route assertion after fixture URL: {url}")
        yield url, f"{header}\n---\n{steps}"


def preopen_fixture(platform, device, url, output):
    # A locally seeded flow starts from a fresh process so an earlier screen
    # cannot satisfy the next segment's first route assertion.
    if platform == "ios":
        restart = ["xcrun", "simctl", "launch", "--terminate-running-process", device, APP_ID]
    else:
        restart = ["adb", "-s", device, "shell", "am", "force-stop", APP_ID]
    with (output / "preopen.log").open("wb") as log:
        log.write(f"{url}\n".encode())
        try:
            log.write(run(restart))
            opened = open_url(platform, device, url)
            log.write(opened)
            if platform == "android" and b"Status: ok" not in opened.splitlines():
                raise ValueError("Android did not confirm the fixture intent")
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            if isinstance(error, (subprocess.CalledProcessError, subprocess.TimeoutExpired)):
                log.write(error.stdout or b"")
                log.write(error.stderr or b"")
            log.write(f"\n{error}\n".encode())
            return False
    return True


def run_segment(command_prefix, flow, output, timeout):
    command = [
        *command_prefix, "test", "--format", "junit", "--output", str(output / "report.xml"),
        "--test-output-dir", str(output / "results"), "--debug-output", str(output / "logs"),
        str(flow.resolve()),
    ]
    with (output / "maestro.log").open("w") as log:
        try:
            process = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
            return {"exitCode": process.returncode, "status": "passed" if process.returncode == 0 else "failed"}
        except subprocess.TimeoutExpired:
            return {"status": "timed-out"}
        except OSError as error:
            log.write(f"{error}\n")
            return {"status": "runner-error"}


def run_flow(platform, device, command_prefix, flow, output, timeout=150):
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    try:
        segments = list(fixture_segments(flow))
    except (OSError, ValueError) as error:
        (output / "runner-error.log").write_text(f"{error}\n")
        return {"flow": flow.stem, "status": "runner-error", "segments": []}
    results = []
    for index, (url, definition) in enumerate(segments, 1):
        segment_output = output if len(segments) == 1 else output / f"segment-{index:02d}"
        segment_output.mkdir(parents=True, exist_ok=True)
        segment = segment_output / flow.name
        segment.write_text(definition)
        result = {"segment": index, "fixture": url, "status": "fixture-open-failed"}
        if preopen_fixture(platform, device, url, segment_output):
            result.update(run_segment(command_prefix, segment, segment_output, timeout))
        results.append(result)
    status = next((result["status"] for result in results if result["status"] != "passed"), "passed")
    return {"flow": flow.stem, "status": status, "segments": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios"))
    parser.add_argument("device")
    parser.add_argument("maestro", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    prefix = [str(args.maestro), "--platform", args.platform, "--device", args.device]
    results = []
    for flow in sorted(Path(".maestro/native-parallel/academic").glob("*.yaml")):
        result = run_flow(args.platform, args.device, prefix, flow, args.output / flow.stem)
        results.append(result)
        (args.output / "statuses.json").write_text(json.dumps(results, indent=2) + "\n")
        print(f"{result['status'].upper()} {flow.stem}", flush=True)
    return 0 if results and all(result["status"] == "passed" for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
