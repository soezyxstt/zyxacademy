"""Three-way merge independent MCP catalog entries in a disposable integration checkout."""
import json
import subprocess
from pathlib import Path

CATALOG = "lib/admin-mcp/operations-catalog.ts"
DECLARATION = "export const operationsCatalog = "


def entries(source):
    prefix, value = source.split(DECLARATION, 1)
    body, suffix = value.rsplit(" as const;", 1)
    rows = json.loads(body)
    items = {row["source"]: row for row in rows}
    if len(items) != len(rows):
        raise ValueError("Duplicate operation catalog source")
    return prefix, items, suffix


def combine(base, ours, theirs):
    merged = {}
    for source in dict.fromkeys([*ours, *theirs, *base]):
        old, left, right = base.get(source), ours.get(source), theirs.get(source)
        if left == right or right == old:
            value = left
        elif left == old:
            value = right
        else:
            raise ValueError(f"Conflicting changes to catalog entry {source}")
        if value is not None:
            merged[source] = value
    return list(merged.values())


if __name__ == "__main__":
    parts = [entries(subprocess.check_output(["git", "show", f":{stage}:{CATALOG}"], text=True)) for stage in (1, 2, 3)]
    if len({(prefix, suffix) for prefix, _, suffix in parts}) != 1:
        raise ValueError("Catalog declaration changed and requires review")
    rows = combine(*(items for _, items, _ in parts))
    prefix, _, suffix = parts[1]
    Path(CATALOG).write_text(prefix + DECLARATION + json.dumps(rows, indent=2, ensure_ascii=False) + " as const;" + suffix)
