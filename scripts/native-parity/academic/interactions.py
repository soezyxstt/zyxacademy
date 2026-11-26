"""Run each academic Maestro flow independently on the selected device."""

import argparse
import json
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios"))
    parser.add_argument("device")
    parser.add_argument("maestro", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for flow in sorted(Path(".maestro/native-parallel/academic").glob("*.yaml")):
        output = (args.output / flow.stem).resolve()
        output.mkdir(parents=True, exist_ok=True)
        command = [
            str(args.maestro), "--platform", args.platform, "--device", args.device, "test",
            "--format", "junit", "--output", str(output / "report.xml"),
            "--test-output-dir", str(output / "results"), "--debug-output", str(output / "logs"),
            str(flow.resolve()),
        ]
        with (output / "maestro.log").open("w") as log:
            try:
                process = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=150)
                result = {"flow": flow.stem, "exitCode": process.returncode, "status": "passed" if process.returncode == 0 else "failed"}
            except subprocess.TimeoutExpired:
                result = {"flow": flow.stem, "status": "timed-out"}
            except OSError:
                result = {"flow": flow.stem, "status": "runner-error"}
        results.append(result)
        (args.output / "statuses.json").write_text(json.dumps(results, indent=2) + "\n")
        print(f"{result['status'].upper()} {flow.stem}", flush=True)
    return 0 if results and all(result["status"] == "passed" for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
