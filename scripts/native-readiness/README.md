# Page dependency inventory

`scan.py` emits a deterministic JSON source inventory for review. From the checkout root:

```sh
python3 scripts/native-readiness/scan.py --page 'app/(student)/dashboard/page.tsx' > /tmp/dashboard-inventory.json
python3 scripts/native-readiness/scan.py --all --max-depth 2 > /tmp/pages-inventory.json
python3 -m unittest discover -s scripts/native-readiness -p 'test_*.py'
```

The all-pages command is an explicit, potentially expensive graph traversal. It reads the current working tree, including local edits, and excludes visual fixtures. The baseline document's Git commit counts are a separate snapshot. Each page record has its route pattern, inherited layouts, source hashes, reachable module imports, API URL literals and candidate handler matches, imported server actions, direct database references, server-side call candidates, and unresolved edges. Handler matches use route patterns and may be ambiguous. HTTP methods and call-site bindings require manual review. Every candidate is unverified; an import does not prove execution, a server call is not necessarily a product operation, and no Expo credit follows from this output.

Traversal is bounded by import depth. A `depth_limit` edge identifies an unvisited module; increase the limit selectively. Missing local imports, variable dynamic imports, variable fetches, and dynamic URLs are recorded for investigation. The scanner uses regular expressions rather than a TypeScript parser and can miss or misread code, aliases, barrel exports, computed calls, comments and wrappers. It cannot resolve all runtime conditions, methods, auth, side effects or external endpoints. Layouts are included as possible dependencies, but middleware, templates, loading and error files need separate review. Parallel or intercepting routes need manual URL validation. Use source hashes and the checkout commit alongside this output; no generated result is a release or authorization assessment. Review all records and unresolved edges against source before deduplicating testable operations.
