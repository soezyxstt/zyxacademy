# Coding implementation verification

Status: `ACTIVE`. Updated: 2026-10-23.

## Original implementation checkpoint, 2026-10-22

Worktree: `/workspace/zyx-python-foundation`, branch
`codex/python-learning-foundation`, based on `origin/staging` at `9962cfd3`.
The original checkout remains unchanged. This records local implementation checks;
it does not attest a production deployment.

## Automated checks

Commands ran from the worktree. Bun was invoked through
`npm exec --cache /tmp/zyx-npm-cache --offline --package=bun -- bun` because
the environment has no global Bun executable.

| Check | Outcome |
| --- | --- |
| `bun run build` (local test configuration) | Exit 0; Next production build completed |
| `npm run typecheck` | Exit 0 |
| Focused coding test TypeScript configuration `/tmp/zyx-coding-tsconfig.json` | Exit 0 |
| Focused ESLint over changed application, runtime and test sources | Exit 0 |
| Repository-wide ESLint | Exit 1: one existing render-time `Date.now()` error in `voucher-management-tab.tsx:149`, also reproduced in the original checkout; 257 warnings |
| Nine contract/regression files below | 52 passed, 0 failed |
| `tests/contracts/product-v4-publication-integration.test.ts` | Passed |
| `tests/visual/coding.spec.ts` | 10 passed across two viewport projects |
| Generated migration applied to `/tmp/zyx-coding.db` | Exit 0 using `bun db/migrate.ts`; the package script's tsx IPC socket was unavailable in the sandbox |

The combined contract command was `bun test` with these files under
`tests/contracts/`: `coding-foundation.test.ts`, `coding-repository.test.ts`,
`coding-live-room.test.ts`, `coding-http.test.ts`, `coding-python-runtime.test.ts`,
`article-parts.test.ts`, `diktat-v4.test.ts`,
`product-v4-schema-delivery.test.ts`, and `live-idea-evidence.test.ts`.
It exercises strict contracts, private answer boundaries, real SQLite attempts,
replay and leases, HTTP authorization, Live room scoring, real Python execution,
and existing article delivery contracts. The full repository test typecheck has
preexisting errors; the focused result is not a claim that all repository tests pass.

## Browser and screenshot review

Command:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/zyx-playwright \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
node node_modules/@playwright/test/cli.js test tests/visual/coding.spec.ts
```

The primary agent personally inspected screenshots at **380×844** and
**1536×864**. Full-page captures live under
`artifacts/visual-quality/results/<test>-<project>/screenshots/`; the HTML report
is in `artifacts/visual-quality/report/`. These are generated local artifacts.

| Surface | Inspected screenshot filenames, in both viewport projects |
| --- | --- |
| Playground | `playground-idle`, `playground-loading`, `playground-success`, `playground-input-changed`, `playground-error`, `playground-syntax`, `playground-stopped`, `playground-timeout`, `playground-no-output` |
| Article and Live learner | `article-ready`, `article-checking`, `article-partial`, `article-correct`, `article-flowchart`, `article-history`, `live-open`, `live-closed` |
| Tutor setup | `host-setup`, `host-options`, `host-coding-selected` |
| Draft recovery | `draft-conflict`, `draft-resolved` |
| Zyra structured canvas | `typed-flowchart`, `typed-flowchart-stale` |

All filenames have `.png` extensions: 24 states per viewport, 48 captures.
Review confirmed readable editor/output, wrapping controls, visible feedback,
vertical flowcharts and stale-result notices without horizontal page overflow.
The browser suite also asserts absence of unexpected console/page/network errors.

## Verification limits and release work

Browser Python uses actual Pyodide/WASM. Visual auth, grading, draft and AI
responses are deterministic fixtures. No live Gemini call or Cloudflare Browser
Run credential was exercised. Server Python tests inject an isolated browser;
the environment cannot launch Chromium with its kernel sandbox. Normal local
server grading deliberately fails closed when that sandbox is unavailable.

No remote migration, deployment, push or PR was performed. Release requires the
generated database migration, configured Cloudflare runtime credentials, and
coordinated deployment of the Next application and realtime Worker. Course
materials and canonical problems still need to be supplied/published; the
authoring API is implemented, but no separate problem authoring UI was added.
The feature has no new rollout flag, following the user's explicit choice to
make it available for all courses while retaining course access checks and the
existing Live Quiz gate.

## Semantic flowchart correction, 2026-10-23

The coding helper now preserves explicit node kinds from the typed AI contract
through rendering and legacy Markdown serialization. Start/end use ellipses,
input/output parallelograms, processes rectangles, and decisions diamonds.
Branch arrows attach to the diamond vertices. Orthogonal loop-back paths avoid
the intervening nodes. The view refits after layout measurement and repeated
responses, and keeps zoom controls outside the node content.

| Check | Outcome |
| --- | --- |
| `bun run build` | Exit 0, including regeneration of runtime binding metadata |
| `npm run typecheck` | Exit 0 |
| TypeScript for the changed contract, rendering and browser tests via `/tmp/zyx-flowchart-tsconfig.json` | Exit 0 |
| Focused ESLint over changed application sources | Exit 0 |
| Seven focused contract/regression files | 52 passed, 0 failed |
| Four selected browser cases across both viewport projects | 4 passed, 0 failed |

The focused `bun test` command includes `flowchart-symbols.test.ts`,
`learning-canvas-schema.test.ts`, `learning-canvas-renderer.test.ts`,
`coding-foundation.test.ts`, `zyra-legacy-visual-parser.test.ts`,
`scientific-canvas-rendering.test.tsx`, and
`learning-canvas-accessibility.test.tsx` under `tests/contracts/`.
It checks explicit kinds, compatibility with older diagrams, branch-label
roundtripping, scientific label rendering and existing coding boundaries.

The browser command is the earlier Playwright command with
`--grep 'coding consultation|article examples'`. The primary agent personally
inspected `article-flowchart.png`, `typed-flowchart.png`,
`typed-flowchart-stale.png`, and `flowchart-symbols.png` at both **380×844** and
**1536×864**, eight relevant captures. Their directories are:

```text
artifacts/visual-quality/results/coding-article-examples-re-fe8bd-rt-history-and-live-closure-<project>/screenshots/
artifacts/visual-quality/results/coding-coding-consultation-28de0-and-reuses-its-chat-session-<project>/screenshots/
```

`<project>` is `mobile-380` or `laptop-fhd-125`. The focused run replaces the
generated local report and captures from the earlier full run. Browser assertions
verify all six node kinds, the actual rendered diamond/parallelogram/ellipse
elements, labeled branches, and exact arrow attachment points at the decision's
east/south/north vertices. They also check that a repeated response stays fitted,
with no unexpected HTTP, console, page errors or horizontal page overflow.
The screenshot review confirmed the symbols, complete loop path and unoccluded
controls. The same synthetic AI and remote-service limitations above still apply.


## Recovery and live integration, 2026-10-23

The handoff ZIP was recovered on `codex/python-learning-recovery` at `26fc96cb`.
`git unpack-objects` supplied base blobs and `git apply --3way` reconciled the
patch based on `9962cfd3`. All 88 transferred files were restored. Conflicts in
ARCHITECTURE.md and README.md retained the newer verification documentation.
Five intentional initial hash differences retained destination changes in the
structured Article reader, sidebar, architecture/index and V4 runtime binding.
No full-file overwrite of existing application files was used.

Live verification uses synthetic users, course `coding-course`, a published local
problem and Article, and `/tmp/zyx-coding-live.db`. The launch wrapper overrides
all three database URL selectors and removes remote database authentication,
KV, Vectorize, storage, analytics and event bindings for the child process.
Injected Gemini credentials, AI Gateway routing and proxy/CA settings remain
inherited. Nothing writes to staging or production data. Tests use real Better
Auth sessions and `/api/zyra/chat`, including canonical course access, allowance,
pedagogy, output validation and conversation persistence.

Problems found and corrected:

- Local SQLite loaded through a dynamic createRequire path that failed in Next
  route bundles. It now loads the externalized native client explicitly on the
  local path. Remote Turso retains the existing web client.
- Short coaching questions could fail lexical evidence matching and lose the
  current code in a general fallback. Server-resolved coding context now remains
  the evidence for coding turns, bypassing unrelated catalogue retrieval and
  shared response caches.
- Grounded coding generation lacked the response wire schema and recent chat
  turns. Coding now supplies its response schema, the appropriate teaching
  action and bounded owner-scoped conversation. Hints exclude prior AI answers.
- Prose cleanup previously removed empty Python call parentheses and collapsed
  indentation inside code blocks. Code formatting now survives cleanup while
  existing citation/ID redaction still runs on code and prose.
- Current coding questions now override topic extraction from older conversation.
  Ordinary error/review turns use a text-only output contract; explicit flowchart
  requests retain the structured diagram channel.
- Provider schema conversion omits unsupported validation keywords and null-only
  fields. The existing full Zod and semantic validators remain authoritative;
  provider routing, allowance rules and assessment redaction were not weakened.

An early schema experiment was rejected before successful generation. One
bounded diagnostic also received provider HTTP 402 for depleted project credit.
These failures are not recorded as successful tutoring. The final verification
below is separate from those exploratory runs.

### Reproduction

Bun can be invoked with `npm exec --cache /tmp/zyx-npm-cache --offline
--package=bun -- bun` when it is not globally installed. After dependency and
Chromium installation, use these local-only commands from the repository root:

```sh
python scripts/coding/local-env.py bun db/migrate.ts
python scripts/coding/local-env.py python scripts/coding/seed-live.py 1 5
python scripts/coding/local-env.py bun tests/fixtures/coding/local-room.ts
python scripts/coding/local-env.py node node_modules/next/dist/bin/next dev --port 3000
RUN_CODING_LIVE=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
  python scripts/coding/local-env.py node node_modules/@playwright/test/cli.js \
  test tests/visual/coding-live.spec.ts
```

Run the room and Next server in separate terminals. The room uses the real
LiveQuizRoom class with in-memory synthetic storage and bootstrapped membership;
this verifies server hints resolution, not deployed Durable Object persistence or
WebSocket admission. Browser push support is disabled only in the verification
context to prevent unrelated Firebase calls. The opaque Python iframe retains
its sandbox. Do not run screenshot suites concurrently against the same output
folder. The live suite is opt-in and consumes the ordinary application allowance.
Repeated runs can exhaust a synthetic account's daily budget; never change the
quota service to make a test pass.


### Final scenario evidence

The accepted runs contain 15 integrated live AI turns through the application.
Gemini generation was real; no model stream was substituted in these turns.
Earlier exploratory failures remain distinct from the accepted evidence. Source
responses are retained in each test directory as `live-responses.json`,
`additional-responses.json`, or `live-text-response.json`.

| Scenario | Verified result and boundary |
| --- | --- |
| SyntaxError | Real browser Python reports the missing colon; Zyra identifies it and proposes the correct line. |
| Runtime errors | Real Python and live Zyra cover ZeroDivisionError, NameError and ValueError for `abc`. |
| Logic error | The canonical local exercise provides the prompt and public case. Zyra explains the exclusive range stop. Separate actual Article Runs produce 6 before correction and 12 afterward. |
| Run before Submit | Zyra distinguishes practice execution from official submission; no trusted verdict is fabricated. |
| Before Run | Execution is null; the response explicitly labels the explanation as not verified by execution. |
| Trial and error | A missing colon is corrected and real Python prints 0, 1, 2. |
| Continued conversation | The session persists. A later code change from SyntaxError to invalid numeric input receives the latest ValueError explanation. |
| Stale code/stdin | UI marks stale output; after changing stdin the request excludes the old execution. |
| Decomposition | Live response separates input, accumulation/loop and output for the synthetic even-sum problem. |
| Flowchart | Real typed response renders start/end, input/output, process and decision symbols, labeled branches and loop-back. No execution is claimed for the newly edited while-loop code. |
| Hints | Application resolves hints policy through the local room class. Response gives a bounded range hint without the reference program or private test canaries. Public problem projection excludes private fields, and forged trusted browser authority returns 400. |
| AI outage | Explicit simulated SSE failure gives an understandable error; actual Pyodide Run still returns 5 on both viewports. This is not a real provider outage claim. |

### Accepted commands and outcomes

Commands use the local environment wrapper above. Bun below denotes the installed
Bun binary invoked through the npm cache when necessary.

| Command/check | Exit and result |
| --- | --- |
| `bun db/migrate.ts` | 0, all migrations including 0098 applied to the synthetic local SQLite file |
| `bun test` over 13 focused contract files | 0, 99 passed, 0 failed |
| `bun test tests/contracts/coding-python-runtime.test.ts tests/contracts/product-v4-publication-integration.test.ts` | 0, 4 passed, 0 failed |
| `npm run typecheck` | 0, checked separately from the build |
| `tsc -p /tmp/zyx-coding-focused-tsconfig.json --noEmit` | 0, new coding contract and live browser tests; includes explicit Bun/Node type roots |
| Focused ESLint over the changed server modules | 0, one existing unused-import warning in tutor.ts |
| `npm run lint` | 1, existing voucher-management-tab.tsx:149 render-time Date.now error, 258 warnings; global lint is not clean |
| `NODE_ENV=production bun run build` | 0, production compilation and page generation, local configuration only |
| `git diff --check` and `git diff --cached --check` | 0 |

The 13 contract files are `coding-answer-sanitizer`, `coding-pedagogy`,
`coding-foundation`, `coding-repository`, `coding-live-room`, `coding-http`,
`flowchart-symbols`, `zyra-pedagogy-state`, `zyra-assessment-safety`,
`learning-canvas-schema`, `learning-canvas-renderer`, `article-parts`, and
`tutor-rag`, each under `tests/contracts/` with extension `.test.ts`.
The full repository test typecheck was not rerun or claimed clean.

The accepted browser runs use `node node_modules/@playwright/test/cli.js test
 tests/visual/coding-live.spec.ts` with these selectors and output directories:

| Selection | Exit and result | Output directory under artifacts/visual-quality/results/ |
| --- | --- | --- |
| Main file before the two final focused additions | 0, 5 passed, one mobile duplication skipped | root |
| `--grep 'real text coaching'`, mobile project | Mobile case passed; the paired desktop attempt hit its synthetic account allowance | text-coaching/ |
| `--grep 'real text coaching' --project=laptop-fhd-125` with the same synthetic actor as the accepted mobile turn | 0, 1 passed | text-coaching-desktop/ |
| `--grep 'local Article runs'`, mobile project | Mobile case passed; the paired desktop test initially raced draft restoration | article-live/ |
| `--grep 'local Article runs' --project=laptop-fhd-125` after waiting for restoration and using real editor keyboard input | 0, 1 passed | article-desktop/ |

These are nine accepted browser/API cases across the incremental runs, not a
claim that every exploratory invocation passed. The additional runtime/API
matrix runs once on desktop to bound provider usage. The selected Article and
text-coaching reruns preserve the successful mobile evidence in separate output
folders. Dev hydration and editor assertions were corrected in the test harness;
no sandbox or application quota was relaxed.

### Personally inspected screenshots

All listed PNGs were opened directly by the primary agent. Viewports are
**380x844** and **1536x864**. Playground route is
`/courses/coding-course/playground`; Article synthetic fixture route is
`/visual-fixtures/coding?tab=article` using the actual local coding APIs.

Under `artifacts/visual-quality/results/`, the exact directory prefixes are:

- `coding-live-real-Zyra-erro-15f39-Run-and-algorithm-flowchart-<project>/screenshots/`
- `coding-live-real-Zyra-runt-b493f-henticated-context-policies-laptop-fhd-125/screenshots/`
- `coding-live-simulated-AI-o-78a9f-al-browser-Python-available-<project>/screenshots/`
- `text-coaching/coding-live-real-text-coac-dff1f-hout-an-unsolicited-diagram-mobile-380/screenshots/`
- `text-coaching-desktop/coding-live-real-text-coac-dff1f-hout-an-unsolicited-diagram-laptop-fhd-125/screenshots/`
- `article-live/coding-live-local-Article--0e1a7-ts-correction-before-Submit-mobile-380/screenshots/`
- `article-desktop/coding-live-local-Article--0e1a7-ts-correction-before-Submit-laptop-fhd-125/screenshots/`

| Inspected state | PNG filenames | Viewports |
| --- | --- | --- |
| Initial live error, help and corrected Run | 01-syntax-error, 02-live-zyra-help, 03-corrected-run | both |
| Continued chat and stale stdin | 04-followup, 05-stale-input | desktop |
| Requested typed flowchart and symbol detail | 06-live-flowchart, 07-flowchart-detail | both |
| Runtime error plus real AI help | zero-division, undefined-variable, invalid-input | desktop |
| Controlled failure and real Run during failure | simulated-ai-outage, run-during-simulated-outage | both |
| Final text-only coaching after switching the code topic | live-error-help-text | both, in their separate text-coaching folders |
| Article logic mistake and correction | article-logic-error-run, article-corrected-run | both, in their separate Article folders |

All filenames have `.png` suffixes. Twenty-five selected captures were inspected.
The final text-coaching images supersede earlier spontaneous diagrams in error
explanations. Requested algorithm diagrams have proper symbols, readable branch
labels, a complete loop and available zoom controls. No horizontal page overflow,
unexpected redirects, HTTP failures, uncaught errors or console errors occurred
in the accepted browser cases. The intentional forged-context 400 is an API
negative test, not an unexpected browser failure. Logs and generated reports
remain under ignored artifacts; none contain a deployment attestation.

### Remaining external boundary

A call through `createTrustedPythonRuntime` in production mode returned
unavailable. Cloudflare Browser Run grading is not certified in this session.
The passing server Python regression uses its existing injected isolated browser,
not the production connector. No trusted Submit result from Cloudflare, deployed
Worker, remote database migration, push, PR or deployment is claimed. The local
real room-class harness does not certify production room admission or storage.


### Compact coaching controls, local visual verification

The question composer now opens on demand. Closing it retains the draft and
leaves the answer visible. Mobile actions are icons with accessible labels and
shared tooltips. A current syntax error, runtime error or timeout highlights the
error explanation action; editing code or stdin returns it to neutral.

The final runs of both commands exited 0, with two passing cases each. An
intermediate capture run exited 1 because the Article component remounted during
hydration. The capture now retries scrolling and verifies the toolbar is inside
the viewport before taking the screenshot; the same cases then passed.

Commands:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 python scripts/coding/local-env.py node node_modules/@playwright/test/cli.js test tests/visual/coding.spec.ts --grep 'compact Zyra toolbar' --output artifacts/visual-quality/results/coding-toolbar
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 python scripts/coding/local-env.py node node_modules/@playwright/test/cli.js test tests/visual/coding.spec.ts --grep 'compact Zyra controls' --output artifacts/visual-quality/results/coding-toolbar-surfaces
```

The primary agent directly inspected all 21 PNGs at 380 by 844 and 1536 by 864,
plus one 640 by 864 breakpoint capture. Routes were
`/visual-fixtures/coding`, `?tab=article` and `?tab=live`. The latter two render
the shared Article and Live Quiz components with deterministic local data.

| Surface | Captured states at both standard viewports |
| --- | --- |
| Playground | toolbar-closed, question-open, execution-error, error-stale, question-busy, answer-composer-closed |
| Article | article-closed, article-question-open |
| Live Quiz | live-closed, live-question-open |

PNG paths are under these ignored directories, each in `screenshots/`:

- `artifacts/visual-quality/results/coding-toolbar/coding-compact-Zyra-toolba-3fb83-ts-current-execution-errors-<project>/`
- `artifacts/visual-quality/results/coding-toolbar-surfaces/coding-compact-Zyra-contro-7ad62-le-in-Article-and-Live-Quiz-<project>/`

The additional laptop-project filename is `toolbar-breakpoint-640.png`.
The tests check retained question drafts, automatic textarea focus, empty and
busy send states, error-to-neutral transitions, hidden mobile labels, visible
desktop labels and answers remaining after closing the composer. There were no
unexpected redirects, HTTP errors, console errors, uncaught page errors or
horizontal overflow. Direct inspection found readable controls, visible focus,
clean wrapping and no clipping or overlap.

Component ESLint and focused TypeScript checks exited 0. Test files are excluded
by the existing ESLint configuration. Python execution was real in the browser;
AI responses, authentication and persistence were controlled local fixtures for
this UI-only check. No new live AI integration, remote service, deployed route or
database mutation is certified by these screenshots.


### Staging integration before PR

Merged staging `bf8a5649` into the recovery branch, preserving newer navigation,
request-cache and Steel browser verification changes. Only `ARCHITECTURE.md` and
`README.md` needed manual conflict resolution; both sides were
retained. The build regenerated the runtime fingerprint from the merged sources.

Post-merge local validation:

- `npm run typecheck`: exit 0.
- Focused contract suite: exit 0, 99 tests across 14 files, including runtime binding and request-cache integration.
- Renderer, isolated Python runtime and SQLite publication suite: exit 0, 15 tests across 3 files.
- `python scripts/coding/local-env.py env NODE_ENV=production npm exec --cache /tmp/zyx-npm-cache --offline --package=bun -- bun run build`: exit 0.
- `git diff --check` and `git diff --cached --check`: exit 0.

Logs are in ignored `artifacts/coding-live/post-staging-{typecheck,contracts,runtime,build}.log`.
The earlier visual and live AI evidence predates this merge; those external calls
were not repeated for PR creation. Existing global lint and Cloudflare grading
limitations above still apply. No deployment or remote database mutation occurred.


## PR #217 real-provider follow-up, 2026-10-23

Status: `OPEN / IN PROGRESS`. PR is **not ready to merge**. No merge, deployment,
remote migration or remote database write was performed. Temporary Steel browser
sessions were the only provider mutations. Work continued in an isolated clone
at `/tmp/zyxacademy-python-217` because the original checkout's Git metadata was
read-only. Latest staging `af63f7de` was merged with Git's three-way `ort` strategy,
retaining both environment-secret configuration commits without conflicts.

### Provider configuration and cleanup

`CODING_BROWSER_PROVIDER` is explicitly independent of the V4 verifier, as approved
by the user. Defaults remain Cloudflare in production and sandboxed Chromium in
development. Steel reuses `acquireSteelVerificationBrowser`; Cloudflare now reuses
`acquireVerificationBrowser`. Neither credentials nor learner requests select a
fallback. Production rejects local Chromium. Runtime initialization failures log
safe categories and execution phases, never provider errors, headers or CDP URLs.
The context deadline now begins before routing/navigation. Submit closes the
provider session before accepting its evaluation; a failed close returns
`ungradable`. Finally still retries cleanup on failure.

### Real connectors and application API

Cloudflare REST acquisition returned `VERIFICATION_BROWSER_RATE_LIMITED`. This
establishes a current rate-limit response, not the cause of the earlier unavailable
probe, nor a successful Cloudflare grading execution.

Steel REST acquisition worked. Direct Playwright CDP from this managed environment
failed with `ECONNREFUSED`; a local test preload sent only `connect.steel.dev`
through the inherited HTTP policy proxy, preserving TLS validation. With that
transport adaptation, real Steel CDP connected to Chromium `155.0.8059.79` and its
REST release completed. The adaptation changes transport only and was not added
to application provider selection. It is not evidence of deployed connectivity.

The real Python probe exited **1**: its first stdin/stdout assertion received
`unavailable`, not `completed`, after Worker initialization reached the context
deadline. A minimal Worker successfully exchanged messages. Separate synthetic
module-import probes did not complete. The exact underlying import/runtime cause
remains unresolved. A temporary self-contained asset experiment also failed and
was not adopted. Do not claim that Steel rejects all Workers, that its connector
is unavailable, or that its Python sandbox/network isolation has passed.
The probe's final REST session release passed, including after failed execution.
No browser sandbox was disabled. A fresh local Chromium launch with
`chromiumSandbox: true` failed with `No usable sandbox`, exit 1.

The application ran from a production build against synthetic local SQLite
`/tmp/zyx-coding-live.db`. Its authenticated API used real Steel sessions and real
Pyodide, with no grading mocks. The realtime Worker ran locally under Wrangler.

| Real application API case | HTTP | Result |
| --- | --- | --- |
| Published problem, authenticated local learner | 200 | Private tests, reference solution and canaries absent |
| Article Submit, two distinct requests | 200 each | `ungradable`, about 32 to 33 seconds each |
| Live Quiz Submit, `maxAttempts=1`, two distinct requests | 200 each | Both `ungradable`; retry did not spend the attempt limit |
| Live reveal after both failed submissions | 200 | No pending grading reservation blocked reveal |

Neither Article nor Live Quiz produced a valid score through Steel. All four
Submit responses omitted private test/solution canaries. This does **not** verify
correct/incorrect, syntax/runtime-error, learner timeout, output-limit,
interpreter/filesystem isolation, network denial, or post-timeout recovery through
Steel: those require a successfully initialized Python runtime. The committed
opt-in probe enumerates these assertions but stopped on its first failure.
Playground Run and live Zyra UI were not re-certified in this follow-up; earlier
browser and live AI evidence remains a separate checkpoint. Hints redaction is
covered by contract tests, not a new live AI attestation.

### Local checks and evidence

Commands used Bun from `/tmp/zyx-tools/node_modules/.bin/bun` and Node 24.19.0.
The local environment wrapper clears remote DB, storage, event and analytics
bindings and retains injected provider credentials and proxy/CA configuration.
Authentication state is ignored and contains only synthetic local sessions.

| Command | Outcome |
| --- | --- |
| `bun install --frozen-lockfile` | Exit 0, lockfile unchanged |
| `python scripts/coding/local-env.py bun db/migrate.ts` | Exit 0, local SQLite only |
| `python scripts/coding/local-env.py python scripts/coding/seed-live.py 1 5` | Exit 0, synthetic local data only |
| Real Steel runtime probe, Node bundle with `--conditions=react-server` and policy-proxy preload | Exit 1, first execution unavailable; release passed |
| Ignored `node artifacts/coding-live/api-probe.mjs` | Exit 0, real authenticated Article/Live failure and retry assertions above |
| Focused contracts listed below | Exit 0, 55 tests across 9 files |
| `bun test tests/contracts/product-v4-runtime-binding.test.ts tests/contracts/coding-pedagogy.test.ts` | Exit 0, 12 additional tests |
| Focused ESLint over runtime, environment, Submit route and probe | Exit 0 |
| `npm run typecheck` | Exit 0 on sequential rerun |
| `npm run lint` | Exit 1, existing voucher render-time `Date.now()` error; 257 warnings |
| `python scripts/coding/local-env.py env NODE_ENV=production bun run build` | Exit 0, final production build after cleanup-result correction |
| `git diff --check` | Exit 0 |

Focused command: `bun test` with `tests/contracts/coding-runtime-provider.test.ts`,
`coding-http.test.ts`, `coding-foundation.test.ts`, `coding-repository.test.ts`,
`coding-live-room.test.ts`, `article-parts.test.ts`, `diktat-v4.test.ts`,
`product-v4-schema-delivery.test.ts`, and `product-v4-browser-session.test.ts`.
Provider selection and HTTP failure regression tests use dependency injection;
they are distinct from the real connector/API tests above. HTTP child fixture
additionally checks release failure, provider recovery and redaction. Existing
repository tests check that infrastructure failure does not spend an attempt.
No UI was changed, so no new visual sign-off is claimed.

Ignored evidence: `artifacts/coding-live/steel-runtime.log`, `api-probe.log`,
`server-final.log`, `api-probe-final.log`, `contracts-final.log`, `lint.log`, `typecheck-final.log`,
`build-final.log`, and synthetic worker diagnostic logs in the same directory.
The final successful typecheck rerun exited 0 and emitted no diagnostics; the earlier parallel
run had a nonzero result without TypeScript diagnostics and is not counted as a
pass. The wrapper test initially expected the old child-test count; it was updated
for the added regression and reran successfully.

At original PR head `44d1cf99`, Schedule Regression Suite, MCP skills distribution
and Deno workflow checks passed. Build workflow `39934301696` failed solely in
SonarQube job `120349938386`: `Not authorized or organization not found`, scanner
exit 3 before analysis. This is independent of Python verification. CI was not
weakened. Check the pushed head again before merge.
