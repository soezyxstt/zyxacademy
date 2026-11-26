"""Load the ordered component groups captured by the web reference job."""

import json
import re


def valid_case_id(name):
    return isinstance(name, str) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name) is not None


def load_directory_manifest(path):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("route") != "/tautan":
        raise ValueError("Expected the /tautan case manifest")
    if any(type(manifest.get(axis)) is not int or manifest[axis] <= 0 for axis in ("width", "height")):
        raise ValueError("Invalid directory viewport")
    cases = manifest.get("cases")
    if not isinstance(cases, list) or len(cases) != 3 or not all(map(valid_case_id, cases)) or len(set(cases)) != 3:
        raise ValueError("Expected three distinct directory cases")
    if any(not isinstance(manifest.get(key), str) or not manifest[key] for key in ("commit", "buildCommit")):
        raise ValueError("Missing directory reference revisions")
    return manifest


def load_case_layout(path):
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list) or not entries:
        raise ValueError("Expected a nonempty case manifest")

    groups = {}
    heights = {}
    case_ids = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Expected a case entry with id and component fields")
        case_id = entry.get("id")
        component = entry.get("component")
        for name in (case_id, component):
            if not valid_case_id(name):
                raise ValueError(f"Invalid case id or component name in {entry!r}")
        if case_id in case_ids:
            raise ValueError(f"Duplicate case id {case_id}")
        # The native gallery stacks all three cases in one device viewport.
        height = entry.get("height", 100)
        if type(height) is not int or not 1 <= height <= 200:
            raise ValueError(f"Invalid capture height for {case_id}")
        case_ids.add(case_id)
        groups.setdefault(component, []).append(case_id)
        heights[case_id] = height

    for component, cases in groups.items():
        if len(cases) != 3:
            raise ValueError(f"Expected three cases for {component}, found {len(cases)}")
    return groups, heights


def load_case_groups(path):
    return load_case_layout(path)[0]
