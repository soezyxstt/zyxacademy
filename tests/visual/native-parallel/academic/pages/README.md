# Protected academic web pages

`capture.mjs` connects to the already-running Next.js server on `http://127.0.0.1:3314` by default and uses the synthetic cookie in `packages/native-parity/academic/local/cookie.mjs`. It does not start a server, create data, or submit forms. Browser requests to other origins are aborted; service workers are blocked. Screenshot styles hide only the Next.js development-only `nextjs-portal` overlay; all product UI remains visible. `first-run-results.json` preserves the earlier run made before this overlay exclusion. Pages themselves can have server-side effects such as question-disclosure records. The screenshot viewport is 380 by 844 at DPR 1, with Indonesian locale, Jakarta timezone, reduced motion, locally supplied app fonts, and a separate browser context for each role and theme.

Run from the repository root only after verifying the local disposable seed and the exact origin:

```sh
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/visual/native-parallel/academic/pages/capture.mjs
```

Pass case IDs as command arguments to rerun only those cases and retain other results. `results.json` is written after every case. Each theme record includes its actual capture origin, requested and landed paths, expected task label, initial navigation HTTP status, blocked origins, screenshot path on pass, and observed text excerpt. The manifest lists the origins present in its current theme records. Older attempts preserved for history may lack an origin. A streamed redirect can initially return 200; the final URL and rendered label are checked separately. Missing fixture IDs are recorded separately and do not receive a pass. A route with a failed label, unexpected status, or unexpected destination is not visual evidence even if the request returned 200. The screenshot references are actual Next.js mobile web captures against the seeded PostgreSQL fixture. They do not establish interaction completeness, Expo behavior, Android/iOS parity, release readiness, or deployment status. The fixture is shared and may be changed by other local tests; inspect its seed before interpreting empty or populated state.

## Detail fixtures

After loading the base fixture from the [local academic setup](../../../../../packages/native-parity/academic/local/README.md), add the synthetic quiz, article draft and bundle import rows. The seed only inserts dedicated `academic-web-*` fixture IDs.

```sh
docker exec -i academic-smoke psql -v ON_ERROR_STOP=1 -U postgres -d academic \
  < packages/native-parity/academic/local/protected-web-seed.sql
```

Bundle detail captures use a separate Next.js process on port 3315. It downloads two validated synthetic ZIPs from a read-only loopback fixture on port 3316. Run the bundle generator from the repository root and keep it running while taking screenshots. It writes SQL that attaches the matching ZIP checksums to the dedicated import rows.

```sh
bun packages/native-parity/academic/local/protected-web-bundles.ts /tmp/academic-protected-web-bundles.sql
```

In a second terminal, load the generated SQL into the same disposable database. Start the separate Next.js process in another checkout with the local base setup's credentials, port 3315 for both app URLs, and the loopback storage variables shown below. Install dependencies in that checkout or use Webpack when sharing a symlinked dependency tree.

```sh
docker exec -i academic-smoke psql -v ON_ERROR_STOP=1 -U postgres -d academic \
  < /tmp/academic-protected-web-bundles.sql

DATABASE_URL=postgres://postgres:academic-local-only@127.0.0.1:55434/academic \
BETTER_AUTH_SECRET=academic-local-fixture-secret-for-smoke-only \
BETTER_AUTH_URL=http://localhost:3315 NEXT_PUBLIC_APP_URL=http://localhost:3315 \
R2_ENDPOINT=http://127.0.0.1:3316 R2_BUCKET=academic-fixture \
R2_ACCESS_KEY_ID=academic-fixture R2_SECRET_ACCESS_KEY=academic-fixture \
SKIP_ENV_VALIDATION=1 NEXT_TELEMETRY_DISABLED=1 \
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3315
```

With both services ready, run the capture from the repository with the current capture script.

```sh
PARITY_PROTECTED_ORIGIN=http://127.0.0.1:3315 \
node tests/visual/native-parallel/academic/pages/capture.mjs \
  admin-idea-bundle admin-product-bundle admin-idea-bundle-alias admin-product-bundle-alias
```

The quiz analytics detail must render the synthetic quiz title after a successful detail API response. Bundle detail captures require successful protected API reads and visible fixture content. The Product case also waits for the article review context. Redirects to the course list or course review workspace are recorded for the requested alias and linked under the route that rendered the destination.

## Route coverage crosswalk

`coverage.tsv` maps 54 route patterns from `plans/native-parallel/routes.tsv` to source pages, protected web cases, live transport, fixture boundaries, planned Maestro fixture entries, and recorded device route outcomes. Regenerate it with `python3 tests/visual/native-parallel/academic/pages/coverage.py`. The generator verifies referenced source and screenshot paths and matches each route to three case IDs from `academicCases`. Each authorized screenshot is attributed to the route that rendered it. Signed-in Student page denial checks use a 380 × 852 viewport at DPR 1 and are reported separately by the requested protected route. Their browser observer tracks same-origin 2xx responses under `/api/admin` and `/api/tutor`. [Student manifest](denied/manifest.json) The requested route records the redirect destination when navigation lands elsewhere. Planned Maestro flows use the most specific registered route for each direct fixture entry. The stamped route column records archive outcomes separately. The Tutor schedule flow uses the synthetic `TutorSchedule` editor, while the live `ConnectedSchedule` device interaction remains unverified. Web captures span a changing local worktree.

GitHub Actions run 45831051547 verified all 162 stamped Android cases across 54 routes at revision `03f9f7bd8bb6267fe68cdaa772debadf2fc95260`. All 11 fixture flows and all four accessibility checks passed, and 32 named Maestro screenshots were recorded. The exact-revision local Playwright baseline and candidate used pinned Chrome 157.0.8103.78 and identical web reference hashes at 380 × 852 DPR 1. The Tutor enrolled and Tutor empty cases differed by 42,751 and 16,926 pixels, reducing the matched local baseline differences by 10,347 and 8,454 pixels. All eight cases had nonzero differences. [Latest Android archive](../device/03f9f7bd8bb6267fe68cdaa772debadf2fc95260/README.md)

The separate signed-in Student request audit at `bea0bf4c` rechecked all 54 routes and logged 3,124 same-origin requests through hydrated page load. It observed account session, notification history, public pricing, document and asset requests. The audit records requested pathnames with query strings stripped. The earlier Student capture manifest preserves the original requested URLs used in the exact-path Android diagnostic. [Sanitized request audit](denied/api-observations.json) · [Detail-route controls](denied/api-detail-controls.json)

The Student pixel diagnostic uses the earlier protected browser captures and the `03f9f7bd` Android fixture. It compares 45 exact requested-path pairs and records both concrete paths for the nine excluded cases. The browser public homepage and the Android in-app denial are different navigation states. These measurements carry zero parity credit. [Student denial diagnostic](../denied-diagnostic/README.md)

The latest published canonical iOS observation came from the older run 45808678527 at `c60041d6`. It built and installed the Release app on an iPhone 17 Pro with iOS 26.2. The `simctl status_bar` command rejected the `unplugged` battery state and stopped setup with exit code 117 before any screenshots. The earlier published fallback report from the `f75e0496` macOS 15 job stopped at an ExpoModulesJSI Swift compilation error. Both reports contain zero iOS screenshots. [Canonical iOS build and setup outcome](../device/c60041d6d2cb98513c8232e41838b35c604b3577/README.md) · [Earlier alternate iOS build failure](../device/f75e0496914edd53c4bc24487ca58f6ac47a3769/README.md)

The code-level descriptions are intentionally abbreviated; see the detailed contracts and limits in the [Admin course](../../../../../packages/native-parity/academic/courses/README.md), [administration](../../../../../packages/native-parity/academic/administration/README.md), [assessment](../../../../../packages/native-parity/academic/assessment/README.md), and [Tutor](../../../../../packages/native-parity/academic/tutor/README.md) domain reports. `interactions.mjs` opens forms, selects a tab or fills a local draft without submitting; its results are recorded separately. Interaction checks wait for hydration and preserve earlier failed attempts. The crosswalk marks entries with no matching direct Maestro fixture entry as unassessed.

For Admin course analytics and groups and the two Tutor grading pages, readiness checks now require visible task content or a real empty state. Analytics also requires a successful `/api/admin/quiz-insights` response. These checks wait for the mobile grading queue and exclude visible skeletons; a timeout is recorded and linked as `shell-only or loading`, never as a passing page. Earlier outcomes remain as prior attempt metadata. Reused screenshot paths now contain the updated image; the earlier images were overwritten and are not current evidence.
