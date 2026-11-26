# Page dependency inventory

`scan.py` emits a deterministic JSON source inventory for review. From the checkout root:

```sh
python3 scripts/native-readiness/scan.py --page 'app/(student)/dashboard/page.tsx' > /tmp/dashboard-inventory.json
python3 scripts/native-readiness/scan.py --all --max-depth 2 > /tmp/pages-inventory.json
python3 -m unittest discover -s scripts/native-readiness -p 'test_*.py'
```

The all-pages command is an explicit, potentially expensive graph traversal. It reads the current working tree, including local edits, and excludes visual fixtures. The baseline document's Git commit counts are a separate snapshot. Each page record has its route pattern, inherited layouts, source hashes, reachable module imports, API URL literals and candidate handler matches, imported server actions, direct database references, server-side call candidates, and unresolved edges. Handler matches use route patterns and may be ambiguous. HTTP methods and call-site bindings require manual review. Every candidate is unverified; an import does not prove execution, a server call is not necessarily a product operation, and no Expo credit follows from this output.

Traversal is bounded by import depth. A `depth_limit` edge identifies an unvisited module; increase the limit selectively. Missing local imports, variable dynamic imports, variable fetches, and dynamic URLs are recorded for investigation. The scanner uses regular expressions rather than a TypeScript parser and can miss or misread code, aliases, barrel exports, computed calls, comments and wrappers. It cannot resolve all runtime conditions, methods, auth, side effects or external endpoints. Layouts are included as possible dependencies, but middleware, templates, loading and error files need separate review. Parallel or intercepting routes need manual URL validation. Use source hashes and the checkout commit alongside this output; no generated result is a release or authorization assessment. Review all records and unresolved edges against source before deduplicating testable operations.

## Symbol inventory

`symbols.ts` uses the repository's installed TypeScript parser and Bun. It reads source without creating a TypeScript program or resolving imports. Run the focused tests and a single-file inventory from the checkout root:

```sh
bun test scripts/native-readiness/symbols.test.ts
bun scripts/native-readiness/symbols.ts --file 'app/(student)/dashboard/page.tsx' > /tmp/dashboard-symbols.json
```

For a CI artifact after dependency installation, run the following and upload `artifacts/native-readiness/symbols.json` with the checkout commit and test results:

```sh
mkdir -p artifacts/native-readiness
bun test scripts/native-readiness/symbols.test.ts
bun scripts/native-readiness/symbols.ts --all > artifacts/native-readiness/symbols.json
```

`--all` uses Git's tracked and non-ignored untracked paths under `app/`, `components/` and `features/`, selects TSX files including pages, and excludes `visual-fixtures` directories. It reads the current working tree, not a historical Git snapshot. Compare the path list and hashes with the intended commit and the baseline scope before review; pages are included in addition to the baseline UI modules. Run it in CI for the full inventory. `--file` is repeatable and allows a bounded review. Missing files and invalid paths fail the command.

Each module includes a hash, declarations that may render, imports, export bindings and unresolved markers. IDs include the path, local name, line and column; source edits can change them. Function names and JSX are heuristics: wrappers, aliases, reexports, anonymous callbacks, destructured bindings, JSX outside functions, parse errors, candidate-free files and uncertain shapes need manual investigation. Barrel exports are recorded but not followed or deduplicated. Classes, dynamic component selection, render props, imported components, generated code, non-TSX files and accessible variants may require additional review. An export or import is not proof of execution or of a component. Every item remains unverified, and no Expo readiness credit or denominator can be derived from this inventory alone.

## Combined native preview

The GitHub Actions preview composes the four migration branches on a disposable checkout. The host dispatches staged OAuth consent, native authentication and the two Academic aliases. The preview retains the reviewed host router when a branch carries an earlier copy.

The host shared row combines the Student title role and actionable test ID with the Academic primary-action test ID. The preview retains this component for the reviewed Student and Academic blobs, including when Git merges both JSX attributes cleanly.

The reviewed Student submission and Academic draft and grading changes compose in the shared tryout action. Operations and Academic disclosure checks follow their shared read models. The offline library keeps the Student target control alongside the host storage controls and retains both catalog assertions. The resolver checks the exact three input blobs before applying a targeted resolution. New conflicts require source review. The preview records the branch commits and runs the focused routing and disclosure tests before the Expo typecheck.
