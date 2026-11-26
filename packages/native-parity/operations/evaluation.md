# Native Admin evaluation handoff

The native entry is `EvaluationScreen` in `apps/mobile-native/features/operations/evaluation/index.tsx`. `evaluationRoutes` covers the 13 files under the operations content and evaluation route groups. The host passes a session-bound `request`, an `accountKey` incorporating account and origin, and `navigate(href, { replace })`. The host owns protected entry, the shared rich text and AST renderers, native file access, and the canonical academic destinations.

| Route | Implementation |
| --- | --- |
| `/admin/assessments`, `/admin/assessments/[id]` | Retired assessment aliases replace the current entry with `/admin/questions` |
| `/admin/diktats` | Opens academic product review with `section=product` |
| `/admin/leaderboard`, `/admin/quiz-insights`, `/admin/quizzes` | Resolves the course identity on the server and opens its academic view or the course catalog |
| `/admin/quiz-insights/[id]`, `/admin/quizzes/[id]/edit` | Resolves ownership using the stored quiz identity. Missing quiz returns 404 |
| `/admin/quizzes/new` | Prefers `courseId` over `courseSlug` and carries encoded `tags` to the academic editor |
| `/admin/questions` | Active and historical bank, server filters and pages, selection, review, question create/edit/delete and Markdown import |
| `/admin/jobs` | Course, chapter and active knowledge-object selection, queued generation, running and terminal statuses, progress logs and status recovery |
| `/admin/distractors` | Question option ratios, correct option, misconception and question totals |
| `/admin/ast-inspector` | Local shared compiler and demos, source entry, block explorer, diagnostics, JSON, pipeline and metrics. Rich preview and import/export use renderer and file props |

## HTTPS and local operations

Both `/api/native/operations/evaluation` and its `/actions` route require the same session, first-use identity provisioning and canonical Admin membership as the web Admin shell. Responses are private and uncached. Inactive membership on a legacy Admin session produces 403 and missing authentication produces 401. The actions endpoint rejects a foreign browser origin and requires JSON for POST and PUT. Existing web and Tutor endpoints retain their authorization and processing.

| Operation ID | Caller and handler | Input and recovery |
| --- | --- | --- |
| `evaluation.alias.resolve` | Evaluation route boundary → GET evaluation → existing course identity resolvers | Local route and query. Unknown quiz gives 404. Known path returns a replace target. GET can be retried |
| `evaluation.questions.read` | Questions screen → GET evaluation → shared `readQuestionBank` | Original tab, filters and pagination. Records authorized global disclosures before returning protected question data. Retries reload the requested page |
| `evaluation.questions.selection` | Questions screen → GET evaluation with `view=selection` → existing server actions | Same filters. Returns active IDs or reviewable historical ID, status and eligibility pairs. Bulk writes recheck targets |
| `evaluation.questions.chapters`, `evaluation.questions.ideas` | Question editor → GET evaluation with `view=chapters` or `view=ideas` → existing server actions | Selected course, with optional chapter for published Ideas. Superseded reads are aborted |
| `evaluation.questions.create`, `evaluation.questions.edit` | Question editor → POST or PUT evaluation actions → existing Admin question handlers | Canonical authoring payload, update ID, validation, answer key and Idea weights. Retains draft on rejection and asks the user to check the bank after uncertain delivery |
| `evaluation.questions.import` | Question editor → POST evaluation actions → original bulk Markdown handler | Original Markdown, course, chapter, Ideas and review status. Same validation and uncertain-delivery handling |
| `evaluation.questions.review`, `evaluation.questions.delete` | Questions screen → PUT or DELETE evaluation actions → original handlers | Selected question IDs and target review status, or confirmed delete ID. Historical transition and quiz eligibility are checked on the server. Re-read bank after success |
| `evaluation.jobs.load` | Jobs screen → GET evaluation → shared `readGenerationJobs` | Latest 50 jobs, course and chapter choices, active knowledge objects |
| `evaluation.jobs.create` | Jobs screen → POST evaluation actions → existing generation job handler | Course, chapter and optional KO. Returns job ID and target count. Guarded against concurrent submissions. Unknown delivery calls for queue refresh before operator starts another job |
| `evaluation.jobs.status` | Jobs screen → GET evaluation actions → existing generation job detail | Job ID. Polls pending or processing every three seconds. Same server timeout transition and worker details. Stops polling at terminal status |
| `evaluation.distractors.read` | Distractors screen → GET evaluation → shared `readDistractors` | Returns attempted questions sorted by attempts. Records authorized disclosures before response. GET can be retried |
| `evaluation.ast.access`, `evaluation.ast.compile` | AST Inspector → GET evaluation to check access, then local shared compiler | Markdown stays on device. JSON file pick, share and copy are supplied by the host. AST draft is scoped to the mounted account and route |

MCP review confirmed that the native adapter uses existing domain services and authoring actions. It adds no MCP tool registration, discovery, scope, consent, packaged skill, host prompt, or environment binding. Generation remains on the existing job queue. The web source remains the operations coverage catalog reference.

## Fixture and evidence

- `evaluation-fixtures.ts` exports 39 case descriptors and a stateful authenticated or denied fixture request. `evaluation.test.ts` exercises redirects, ownership, tags, missing quizzes, query/filter, historical review, generation progress and compiler behavior. `tests/gamification/question-disclosure-calls.test.ts` checks the shared authorization and question disclosure sequence.
- `tests/visual/native-parallel/operations/capture-evaluation.ts` exercises the actual web AST Inspector and generation client under the local fixture harness. Run it from the repository root against the operations harness on port 3211. It saves six states in both themes at 380 × 844 and 1536 × 864, DPR 1, under `artifacts/native-parity/operations-web/evaluation/`. The browser timezone defaults to the invoking system’s timezone. Set `PARITY_OPERATIONS_TIME_ZONE` to the harness timezone when the two differ.
- The local capture command exited 0 for 24 screenshots using Indonesian and Asia/Jakarta. The 24 synthetic reference images and full manifest are stored in `tests/visual/native-parallel/operations/references/evaluation/`. HTTP, redirect, browser error and horizontal overflow assertions passed. The actual fixture clients render with the browser application’s KaTeX stylesheet.
- Mount the repository operations fixture route using `node scripts/native-parity/operations/mount.mjs` in an isolated checkout. Open `zyx-native-parity://operations-fixture?path=%2Fadmin%2Fquestions` for the populated Bank Soal. The evaluation Maestro flow under `.maestro/native-parallel/operations/` covers an assessment alias, active and historical data, jobs recovery, distractors empty state and denied AST access.
- Visual differences awaiting Android and iOS review include the inline native form and selector presentation, rich AST/Markdown rendering, and narrow vs. wide web placement. Device screenshots, pixel diffs and authorized deployment verification are pending. The device flow exercises synthetic records and sends no job to a remote queue.

## Legacy alias verification

Run from the repository root:

```sh
bun tests/integration/operations-evaluation-aliases.mjs tests/visual/native-parallel/operations/references/evaluation/legacy-redirect-signals.json
```

The verifier invokes the nine original Next.js page functions with synthetic Admin authorization and course identities. Its manifest records 17 redirect, missing or unknown identity cases paired with the native fixture result, and nine simulated rejections at the page guard. The direct checks use the Next.js redirect and not-found signals. Authentication and database behavior are covered separately by the protected handler tests.

The standalone alias harness can verify one path per route in Chromium, including the unknown-quiz 404 and browser Back from each case. Start it after other operations reference captures finish:

```sh
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev tests/visual/native-parallel/operations/evaluation-aliases-web --webpack -p 3211
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium bun tests/visual/native-parallel/operations/capture-evaluation-aliases.ts
```

The browser command writes `artifacts/native-parity/operations-web/evaluation-aliases/cases.json` with the observed HTTP status, destination, reached URL, browser Back result and native fixture response.

Playwright verified nine source paths at 380 × 844 DPR 1. Eight responded with HTTP 307 followed by the canonical destination, and one unknown quiz responded with HTTP 404. Browser Back reached the original listing in all nine cases. The route functions used synthetic Admin authorization and course identities. See [the observed HTTP and history results](../../../tests/visual/native-parallel/operations/references/evaluation/legacy-browser.json).

## Question Idea assignment

The browser question editor and native draft form share the default Idea weighting rule. Adding or removing an Idea redistributes the total equally and preserves the roles of retained Ideas. Native displays the linked count and total weight, preserves decimal drafting with either separator, and validates the total before submission. The local fixture now includes two published Ideas in the same chapter. The fixture regression checks that an invalid revision preserves the original links and a balanced revision persists both links.

Run the synthetic device flow `.maestro/native-parallel/operations/evaluation-ideas.yaml` from the mounted operations gallery. It edits an existing question, links a second Idea, verifies readiness at 100%, and saves the draft. Render the production web Idea widget with the fixture harness, then run `capture-evaluation-ideas.ts` to compare available, balanced and invalid states. These interactions use synthetic data.
