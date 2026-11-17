# Client data audit, 17 November 2026

Status: OPEN / IN PROGRESS. Source implementation and local evidence are separate from PR review, deployment and authenticated staging acceptance. No production data or database schema changed.

## Scope and baseline

Base: staging `c8f9e675a215e89103939970feeef89a0222d86a`. Initial source scan covered 1,767 TypeScript modules in app/components/hooks/lib, 408 explicit client modules and 152 API routes. The reproducible AST inventory also covers jobs, workers and database modules; its totals therefore use a broader denominator and include newly extracted hooks. Run `bun run audit:client-data artifacts/query-data-layer/inventory.json` for the current tree rather than treating this snapshot as a permanent count.

The npm registry resolved both `@tanstack/react-query` and `@tanstack/eslint-plugin-query` to 5.107.2 during implementation. Both direct dependencies and the Bun lockfile are updated. The official Query guides and the installed Next.js guides informed the ownership policy in [Browser data ownership](../client-data.md).

## Decisions by data path

| Data path | Decision and reason |
| --- | --- |
| RSC course/catalogue/article/assessment reads, metadata and initial flashcard queues | Retain server loading, request deduplication and authorization. No extra client request for unchanged initial content. |
| Shared today-plan and sidebar data | One validated account-scoped query; preserve guarded optimistic completion and activity refresh. |
| Pricing plus admin save | Shared public query; runtime-validate mutation response, cancel competing reads before writing cache. |
| Admin operations, key diagnostics, flags and AI analytics | Shared typed option factories with bounded foreground polling and account-specific keys. |
| Study path | Query owns fetched plan; React owns day input; safe placeholders only within an account/course; demos plan locally. |
| Discussion badge | Typed account/course cache and existing event invalidation. |
| Discussion message pages and read receipts | Retain cursor, visibility and request-version contracts. A later conversion needs receipt/cursor race tests, not a blind useQuery replacement. |
| Quiz player | Split model/transport/controller/view; preserve local drafts, timers and upload progress; mutation submission has a synchronous lock and no replay. |
| Quiz review | Validated owner/attempt response, no retained answer cache, elapsed-time polling budget instead of request-duration counting. |
| Article reader | Split public types, progress transport and controller from presentation; memoize section content; keep read-only previews outside live mutations. |
| Flashcards | Split session controller from view; wrap existing authorized grading action without caching the evolving local study queue. |
| Solution collections | Keep released content server-owned; live completion uses an isolated mutation and emits learning invalidation. Read-only previews do not need Query context. |
| Zyra allowance | Shared account/course query; a refresh trigger invalidates the same key rather than creating a cache entry per interaction. |
| Zyra chat, coding assistance, live classroom, streams and workers | Retain the stream/worker owner. A stream is not an ordinary repeated JSON query. |
| PDF/video/document bytes and attachment upload progress | Retain dedicated delivery/cancellation/progress paths; do not cache large binaries or XHR progress in Query. |
| Admin edit forms, review workflows, notifications and remaining client reads | Listed below for incremental adoption. Preserve current state-machine, access and acknowledgement rules until targeted tests exist. |
| Database, background generation, RAG, storage and auth | No client state-library substitution. Server authority and contracts remain unchanged. |

## Defects addressed with the refactor

The old attempt-review poll budget advanced through a timeout tied to `isFetching`. Fast responses could clear the timeout before it counted a poll. The new budget uses elapsed wall time and stops on access errors, complete feedback or hidden answer keys.

Quiz submission now locks before awaiting uploads, updates the answer snapshot synchronously, and prevents the expiry clock from replaying a failed submission every second. Drafts are cleared only after the transport succeeds.

Article completion previously sent the current reading-time counter from more than one path and invented five seconds for other visible sections. The counter is now consumed once, other sections receive zero elapsed time, hidden-document ticks do not add time, and progress cannot regress on a late response. This does not add a durable offline outbox or server idempotency.

## Evidence and acceptance

- Baseline application typecheck passed.
- Baseline lint passed with 24 pre-existing warnings.
- Focused Query tests: 25 passed, zero failed, 65 assertions at the initial checkpoint.
- Broad single-process contract execution exposed shared `mock.module` contamination and unrelated environment-dependent imports. A passing full-suite claim is not made; affected files are being checked in fresh processes with an unchanged-source comparison for failures.
- Current implementation typecheck, final lint, isolated contracts, browser interaction checks and build: verification in progress. Update this section with the final commands and outcomes before review.
- Production latency, actual server cost, authenticated staging writes and deployed cache behavior have not been measured. Local deduplication and cancellation tests prove their specific contracts, not a global speedup.
- Review-bot completion and deployment checks remain release gates. Do not merge while review is processing or a valid thread remains open.

## Remaining direct browser transport inventory

These are static call sites, not a claim that every row should become a query. Several are writes, exports, upload helpers, coding execution or deliberate live protocols. Line numbers are from the audit checkpoint; rerun the inventory after edits. Import reachability is conservative and does not cover every dynamic import/re-export.

| Module | Transport call lines |
| --- | --- |
| `app/(admin)/admin/(academic)/materials/materials-client.tsx` | 278, 565, 608, 1710, 1731, 1961, 2118 |
| `app/(admin)/admin/(content)/assessments/[id]/detail-client.tsx` | 122, 169, 192 |
| `app/(admin)/admin/(content)/assessments/assessments-client.tsx` | 97, 183 |
| `app/(admin)/admin/(eval)/jobs/jobs-client.tsx` | 87, 131 |
| `app/(admin)/admin/(eval)/questions/historical-questions-client.tsx` | 287 |
| `app/(admin)/admin/(eval)/questions/questions-client.tsx` | 314, 382, 462, 528, 591 |
| `app/(admin)/admin/(eval)/quiz-insights/[id]/_components/quiz-attempts-spreadsheet.tsx` | 92 |
| `app/(admin)/admin/(eval)/quiz-insights/quiz-insight-detail-client.tsx` | 144, 167 |
| `app/(admin)/admin/(eval)/quiz-insights/quiz-insights-list-client.tsx` | 88 |
| `app/(admin)/admin/(eval)/quizzes/_components/quiz-form.tsx` | 289, 553, 565 |
| `app/(admin)/admin/(eval)/quizzes/quizzes-client.tsx` | 98, 120, 142, 167 |
| `app/(admin)/admin/forms/[id]/page.tsx` | 324, 393 |
| `app/(admin)/admin/meet/[id]/page.tsx` | 53 |
| `app/(admin)/admin/meet/page.tsx` | 128, 149, 171, 210, 235 |
| `app/(admin)/admin/ops/short-links/page.tsx` | 42, 61 |
| `app/(student)/courses/[id]/live/page.tsx` | 59, 86 |
| `app/(student)/courses/[id]/quiz/[quizId]/quiz-start-button.tsx` | 34 |
| `components/admin/course-detail/batch-upload-dialog.tsx` | 463, 771, 831 |
| `components/admin/course-detail/questions-tab.tsx` | 157 |
| `components/admin/document-viewer.tsx` | 270, 381 |
| `components/admin/idea-bundle-v2-panel.tsx` | 121, 171, 195, 212 |
| `components/admin/leaderboard/admin-leaderboard-client.tsx` | 158 |
| `components/admin/links-manager.tsx` | 120, 216, 245, 280, 304 |
| `components/admin/markdown-editor.tsx` | 115, 179 |
| `components/admin/material-bundle-upload-dialog.tsx` | 52, 60 |
| `components/admin/material-review-detail.tsx` | 376, 400, 419, 450, 454, 507, 551, 1236, 1466, 1847, 2534, 2539, 2636, 2666, 2688, 2811, 2827 |
| `components/admin/media-library.tsx` | 268, 402, 416, 446, 511 |
| `components/admin/ops-ai/action-proposal-card.tsx` | 116 |
| `components/admin/ops-ai/ops-ai-panel.tsx` | 468 |
| `components/admin/product-catalog-panel.tsx` | 94 |
| `components/admin/refresh-analytics-button.tsx` | 16 |
| `components/admin/solution-collection-review.tsx` | 201, 298 |
| `components/admin/storage-browser.tsx` | 221, 314, 348 |
| `components/admin/zyra-ops-panel.tsx` | 19 |
| `components/coding/article-coding.tsx` | 102 |
| `components/coding/coding-help.tsx` | 40 |
| `components/coding/coding-workspace.tsx` | 98, 130 |
| `components/coding/live-coding-exercise.tsx` | 11 |
| `components/coding/use-coding-draft.ts` | 32, 59, 78 |
| `components/command-menu-dialog.tsx` | 612 |
| `components/course/material-viewer.tsx` | 166, 978, 1031 |
| `components/course/product-learning-blocks.tsx` | 250, 282 |
| `components/course/quiz-analytics-view.tsx` | 49, 65 |
| `components/course/tutor-drawer-view.tsx` | 954 |
| `components/course/zyra-attachment-composer.tsx` | 102, 190 |
| `components/dashboard/intervention-banner.tsx` | 32, 49 |
| `components/discussions/discussion-client.tsx` | 594 |
| `components/forms/admin-forms-builder.tsx` | 201, 299, 547, 634, 655, 695 |
| `components/forms/form-presets.tsx` | 44, 92, 134 |
| `components/forms/public-form-viewer.tsx` | 188, 349, 543 |
| `components/gamification/celebration-listener.tsx` | 48, 77 |
| `components/notifications/notification-bell.tsx` | 129, 148, 206 |
| `components/schedule/collaborative-booking-modal.tsx` | 110 |
| `components/schedule/session-detail-drawer.tsx` | 232 |
| `components/tutor/analytics-client.tsx` | 45 |
| `components/tutor/tutor-live-console.tsx` | 45, 70, 71, 142, 166 |
| `components/zyra/zyra-proposal-panel.tsx` | 35, 53, 81 |
| `lib/demo/assessment/quiz.ts` | 49 |
| `lib/export-spreadsheet-client.ts` | 24 |
| `lib/storage/admin-upload-client.ts` | 27, 54 |
| `lib/video/youtube.ts` | 137 |
