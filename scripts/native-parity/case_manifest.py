"""Load the ordered component groups captured by the web reference job."""

import json
import re


def load_case_groups(path):
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list) or not entries:
        raise ValueError("Expected a nonempty case manifest")

    groups = {}
    case_ids = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Expected a case entry with id and component fields")
        case_id = entry.get("id")
        component = entry.get("component")
        for name in (case_id, component):
            if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
                raise ValueError(f"Invalid case id or component name in {entry!r}")
        if case_id in case_ids:
            raise ValueError(f"Duplicate case id {case_id}")
        case_ids.add(case_id)
        groups.setdefault(component, []).append(case_id)

    for component, cases in groups.items():
        if len(cases) != 3:
            raise ValueError(f"Expected three cases for {component}, found {len(cases)}")
    return groups
