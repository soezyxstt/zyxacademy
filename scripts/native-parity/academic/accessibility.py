"""Collect device accessibility hierarchies for the two primary academic flows."""

import argparse
import json
import subprocess
from pathlib import Path

from interactions import run_flow


ACCESSIBILITY = {
    "tutor-participant": (["Nadia Lestari", "Terdaftar sejak"], ["Meilani Prameswari"]),
    "tutor-student-denied": (["Akses ditolak"], ["Nadia Lestari", "nadia@example.test", "Kelompok Sel"]),
    "admin-list": (["Biologi Dasar", "Fisika Dasar", "Cari mata kuliah"], []),
    "admin-student-denied": (["Akses ditolak"], ["Biologi Dasar", "Fisika Dasar", "Cari mata kuliah"]),
}
LABELS = {"text", "accessibilitytext", "contentdesc", "contentdescription", "label", "name", "value", "hint"}


def accessible_labels(tree):
    labels = set()
    attributes = tree.get("attributes", {})
    for key, value in attributes.items():
        if isinstance(value, str) and key.lower().replace("-", "").replace("_", "") in LABELS:
            labels.add(" ".join(value.casefold().split()))
    for child in tree.get("children", []):
        labels.update(accessible_labels(child))
    return labels


def read_tree(stdout):
    decoder = json.JSONDecoder()
    lines = stdout.splitlines(keepends=True)
    for index, line in enumerate(lines):
        if not line.lstrip().startswith("{"):
            continue
        tail = "".join(lines[index:]).lstrip()
        try:
            tree, _ = decoder.raw_decode(tail)
        except json.JSONDecodeError:
            continue
        if isinstance(tree, dict) and "attributes" in tree:
            return tree
    raise ValueError("Maestro did not emit a native hierarchy")


def capture_hierarchy(prefix, directory):
    try:
        result = subprocess.run(
            [*prefix, "hierarchy", "--no-reinstall-driver"],
            capture_output=True, text=True, timeout=45,
        )
        (directory / "hierarchy.stderr.log").write_text(result.stderr)
        if result.returncode:
            return None, f"hierarchy command failed ({result.returncode})"
        tree = read_tree(result.stdout)
        (directory / "hierarchy.json").write_text(json.dumps(tree, ensure_ascii=False, indent=2) + "\n")
        return tree, None
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        return None, type(error).__name__


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios"))
    parser.add_argument("device")
    parser.add_argument("maestro", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    prefix = [str(args.maestro), "--platform", args.platform, "--device", args.device]
    flows = Path(".maestro/native-parallel/academic/accessibility")
    statuses = []
    for name, (required, forbidden) in ACCESSIBILITY.items():
        output = args.output / name
        flow = run_flow(prefix, flows / f"{name}.yaml", output, timeout=90)
        tree, error = capture_hierarchy(prefix, output)
        labels = accessible_labels(tree) if tree else set()
        missing = [name for name in required if not any(name.casefold() in label for label in labels)]
        exposed = [name for name in forbidden if any(name.casefold() in label for label in labels)]
        status = {
            "case": name, "passed": flow["status"] == "passed" and not error and not missing and not exposed,
            "flow": flow, "hierarchyError": error, "requiredNames": required, "missingNames": missing,
            "forbiddenNames": forbidden, "exposedNames": exposed,
        }
        statuses.append(status)
        (args.output / "statuses.json").write_text(json.dumps(statuses, indent=2) + "\n")
        print(f"{'PASS' if status['passed'] else 'FAIL'} accessibility {name}", flush=True)
    return 0 if all(status["passed"] for status in statuses) else 1


if __name__ == "__main__":
    raise SystemExit(main())
