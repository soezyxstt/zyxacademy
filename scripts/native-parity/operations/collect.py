"""Copy only named Maestro captures, leaving failure screenshots and raw logs intact."""
import json
import shutil
import sys
from pathlib import Path


def collect(destination, flows):
    case_dir = destination / "cases"
    cases = json.loads((case_dir / "manifest.json").read_text())
    targets = {row["filename"]: case_dir / row["filename"] for row in cases}
    for flow in flows.glob("*.yaml"):
        for line in flow.read_text().splitlines():
            if line.startswith("- takeScreenshot: "):
                name = line.removeprefix("- takeScreenshot: ").strip('"') + ".png"
                targets.setdefault(name, destination / name)

    for folder in [destination / "results", destination / "logs", flows]:
        for image in sorted(folder.rglob("*.png")):
            target = targets.get(image.name)
            if target and not target.exists():
                shutil.copyfile(image, target)
    missing = [name for name, target in targets.items() if not target.exists()]
    (destination / "missing-captures.json").write_text(json.dumps(missing, indent=2) + "\n")
    if missing:
        sys.exit(f"Maestro did not save {len(missing)} of {len(targets)} expected named captures")


if __name__ == "__main__":
    collect(*(Path(arg) for arg in sys.argv[1:]))
