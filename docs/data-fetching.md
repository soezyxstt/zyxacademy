# Client data fetching and state

Status: `ACTIVE`

Updated: 2026-11-18

This document defines the current source standard for client server data in Zyx Academy and records the remaining migration work. The PR verification record tracks CI, browser checks, authenticated staging flows and deployment acceptance separately.

## Version and purpose

`@tanstack/react-query` is pinned to **5.108.0** in `package.json` and `bun.lock`, with `@tanstack/query-core` at the same version. The npm registry's `latest` tag was checked on 2026-11-18. This is a dated dependency check; future updates require a new registry and documentation review. The installed package supports React 18 and 19. See the [package registry](https://registry.npmjs.org/@tanstack/react-query/latest) and the [official documentation](#official-references).

TanStack Query owns reusable server responses, request status, deduplication, freshness and invalidation. It helps repeated reads share work and gives writes a consistent lifecycle. It does not reduce database work in a single request, replace server authorization, or guarantee a latency improvement. Measure request counts, payload sizes and user flows before claiming a speed gain.

Zustand is not added. Current client state has clear owners in components, feature hooks and existing context providers. Quiz answers, reading position, flashcard order, open dialogs, search input and unsaved drafts should not become copies of Query data in another store. A future shared client-only feature may justify a store after its ownership and subscription needs are clear.

## State, UI and API ownership

| Layer | Responsibility | Examples |
|---|---|---|
| Server services and routes | Session and course access, database work, transactions, grading, jobs, response contracts | `lib/student/course-access.ts`, `lib/study-path-service.ts`, `app/api/quiz/attempts/` |
| Client contracts and API functions | Parse input and unknown responses, report HTTP errors, pass cancellation, return inferred types | `lib/query/http.ts`, `lib/quiz/client.ts`, `lib/articles/progress-query.ts`, `lib/materials/client-api.ts` |
| Query and mutation factories | Define keys, request functions, freshness, retry and invalidation rules together | `lib/student/today-query.ts`, `lib/admin/ops-query.ts`, `lib/zyra/proposals-query.ts` |
| Feature hooks | Coordinate server data with local timers, queues, drafts and user actions | `hooks/use-quiz-player.ts`, `hooks/use-article-reading-progress.ts`, `hooks/use-material-reading-progress.ts`, `hooks/use-flashcard-session.ts` |
| Views | Render typed data and request user actions through those hooks or factories | Quiz, article and material readers, admin metrics, proposal panels |

Small views may call `useQuery` with a shared factory directly. Extract a feature hook when lifecycle and local state need their own tests or obscure the view. Avoid embedding endpoint construction, response casts and cache policy in JSX components.

RSC content remains server-owned. A flashcard queue received from RSC becomes the current study session's local order; a summary refresh must not replace the card being answered. Quiz drafts and deadlines retain their existing submission lock and recovery behavior. Public demo adapters keep fictional state separate from authenticated server caches.

## Query keys

Use the factories in `lib/query/keys.ts`. Private keys start with `['zyx', 'account', userId]`; public pricing starts with `['zyx', 'public']`. A key describes the owner, resource and every input that changes the response. Do not include cookies, access tokens, raw answers or other credentials.

| Response or action | Factory and variable inputs |
|---|---|
| Today's plan and completion | `student.today(userId)`, `student.completeToday(userId)` |
| Sidebar fallback and course metadata | `student.enrollments(userId)`, `student.course(userId, courseId)` |
| Study path | `student.studyPath(userId, courseId, days)` |
| Interventions | `student.interventions(userId)` |
| Quiz attempt, analytics and submission | `quizzes.attempt`, `quizzes.analytics`, `quizzes.submit`, each with `userId` and `attemptId` |
| Article progress | `articles.progress(userId, articleId, version)` |
| Material progress and chapter summary | `materials.progress(userId, materialId)`, `materials.summary(userId, chapterId)` |
| Flashcard domain and future list reads | `flashcards.all(userId)`, `flashcards.sets(userId, courseId)`, `flashcards.due(userId, courseId)` |
| Discussion counts | `discussions.counts(userId, courseId?)` |
| Zyra allowance and proposals | `zyra.allowance(userId, courseId?)`, `zyra.proposals(userId, courseId?)` |
| Admin metrics | Named `admin` factories with `userId`; usage also includes its day range |
| Admin products and leaderboard | `admin.products(userId, filters)`, `admin.leaderboard(userId, filters)` |
| Public discounts | `public.pricing()` |

Normalize filters at the domain factory. The current admin factories map the UI's `all` choice to an omitted server filter and trim/lowercase search to match the endpoint's comparison. Optional course and day values use an explicit null representation in keys. Different article versions, courses, accounts and query filters must never share a response entry. Object property order is deterministic in TanStack's key hashing; array order remains significant.

Use domain prefixes such as `student.studyPaths`, `admin.productsAll` and `zyra.proposalsAll` for related invalidation. The existence of a key factory does not mean a read has migrated: flashcard set/due factories currently provide a domain boundary while the study queue remains RSC-backed.

## Typed responses and validation

`requestJson(path, schema, init)` requests JSON with `cache: 'no-store'` and same-origin credentials. It throws `ApiError` for a failed HTTP status and `ApiResponseError` for invalid JSON or a schema mismatch. It parses before returning data to Query. Successful HTTP transport alone is not a successful domain result.

Keep schemas next to their API functions or in a browser-safe shared contract. Infer TypeScript types from the schema. Avoid `response.json() as SomeType`, permissive coercion and empty-array fallbacks that turn a malformed response into a successful empty cache. Validate the full payload used by the view, or parse a deliberate projection and discard unused fields. The proposal list follows the latter rule because its full server contract imports `node:crypto`.

Validate resource identity where the response supplies it. Quiz attempts check the attempt and student IDs; article progress checks the article, version and section; material progress checks student and material IDs; interventions check every row's student ID. Student endpoints that support `x-student-id` compare that expected actor with the authenticated session. These checks complement server authorization; a key or header never grants access.

Legacy SQL count strings are accepted only where existing endpoints or stored JSON actually return them. Conversion accepts digit strings and then enforces a nonnegative integer, rejecting null, booleans, empty strings and fractional values. Preserve documented nullable and optional fields without filling required fields with made-up defaults.

The stored quiz answer map remains an explicit unknown-value boundary because it also contains the server's attachment registry. Review code narrows each rendered answer by question type; submission code builds its own allowed answer snapshot instead of sending that registry back.

Pass the query function's `signal` to its GET. Cache cancellation and removal can then stop obsolete requests. Mutation functions do not receive an automatic AbortSignal from TanStack Query; explicit controllers, upload cancellation and keepalive behavior remain feature decisions.

## Freshness, retry and polling

`lib/query/client.ts` creates a fresh client for server execution and one stable client in the browser. Default query freshness is 30 seconds and inactive retention (`gcTime`) is five minutes. Freshness controls when data needs a refresh; inactive retention controls when an unused entry can be removed. Neither is a browser HTTP cache policy.

Default focus refetch is off. TanStack's stale mount/reconnect behavior remains available unless a feature overrides it. Safe reads may retry once for an HTTP 5xx or network `TypeError`; authentication failures, other 4xx, rate limits, invalid responses and cancellation do not retry. Mutations default to no retry. Reads with side effects or provider/job implications explicitly disable retry.

| Domain | `staleTime` | Automatic refresh | Retry |
|---|---:|---|---|
| Today's plan | 60 s | Learning invalidation; sidebar focus/visibility refresh with a 60 s success throttle | None; GET also updates streak/recommendations |
| Sidebar enrollment fallback | 0 | Enabled after Today fails; refreshed for the failed scope | At most one transient read retry |
| Sidebar course metadata | 5 min | Account/course change and stale remount | At most one transient read retry |
| Study path | 60 s | Course/day key changes and learning invalidation | None; GET may compute/persist a path |
| Article progress | 60 s | Starts from the actor's RSC progress; later read refresh and write receipts | At most one transient read retry |
| Quiz attempt review | 30 s | Every 3 s while feedback is needed, for a 30 s window; explicit retry starts another window | None; review reads record disclosures |
| Quiz analytics | 30 s | Every 4 s while status is `processing`; stops on error or terminal status | None; GET can enqueue missing analytics |
| Admin ops metrics | 55 s | Every 60 s | At most one transient read retry |
| Admin AI analytics | 25 s | Every 30 s | At most one transient read retry |
| Admin key diagnostics | 25 s | Every 30 s | At most one transient read retry |
| Admin feature flags | 20 s | Every 30 s | At most one transient read retry |
| Admin usage range | 60 s | Range change or stale remount | At most one transient read retry |
| Admin products and leaderboard | 30 s | Filters, explicit refresh and relevant mutation invalidation | At most one transient read retry |
| Zyra ops and proposal lists | 30 s | Manual ops refresh; proposal settlement invalidates actor lists | At most one transient read retry |
| Student interventions | 30 s | Learning invalidation; confirmed dismiss invalidates its account entry | At most one transient read retry |
| Discussion counts | 60 s | Every 120 s and the existing counts-changed event | At most one transient read retry |
| Zyra allowance | 30 s | Course change and the owner's `refreshKey` invalidation | None |
| Public pricing | 0 | Every 30 s; always refresh on focus | None |

All configured polling uses `refetchIntervalInBackground: false`. Domain intervals preserve the existing product cadence; a global interval is not added. Most entries inherit the five-minute inactive retention. Quiz submission mutations set `gcTime: 0` to avoid retaining settled answer payloads unnecessarily.

## Writes and invalidation

`invalidateLearningQueries` refreshes Today, study paths, interventions and the flashcard domain for the current actor. It also targets the attempt and analytics when an attempt ID is known. If Today has a pending optimistic completion, it marks Today stale without fetching over the optimistic items; the last completion settles that read. These invalidations target client summaries, not every server-rendered page.

| Write | Required behavior |
|---|---|
| Today completion | Cancel the matching read, save only the item's previous `done` value, update it optimistically, roll back only that item, and refresh after the last pending completion. Concurrent items must not restore whole-list snapshots over one another. |
| Quiz submit | Keep the immediate duplicate-submit lock, deadline handling, answer snapshot and upload wait. Use `networkMode: 'always'` and `retry: false` so an offline submission fails visibly. Mutation keys alone do not deduplicate writes. |
| Article progress | Validate the receipt and merge progress monotonically. Do not replay an uncertain elapsed-time delta. After a failed completion, further scroll events cannot resubmit it; an explicit finish action can retry with only new elapsed time. Until a read or receipt confirms completion, ordinary visibility/exit writes preserve fresh time but cap that section's depth at 89%, below the API's 90% completion threshold. Preserve small `keepalive` PUT writes during navigation and exit. Multiple section completions share summary invalidation. |
| Material progress/status | Use the extracted tracker and typed mutation adapters. Reading and status writes share a per-account/material mutation scope to preserve order. Website-material time writes use `keepalive`; canonical Article/Diktat and PDF status retain the authorized Server Action. |
| Chapter summary | Generate only on explicit request through `useChapterSummary`; validate the result and disable retries. It can spend provider allowance and is not a polling query. |
| Flashcard review | Validate the Server Action input/result; keep the current queue local. A successful write appends a review and advances SM-2, so automatic retry and offline replay remain off. |
| Intervention dismiss | Require a successful, validated acknowledgment before animating away. Failure keeps the suggestion visible; invalidate only its account entry. |
| Proposal create/review/confirm | Preserve explicit user actions and exact version preconditions. No optimistic lifecycle transition or automatic write retry. Re-read all proposal lists for the actor after settlement, including ambiguous failures. |
| Pricing settings | Validate the save result before updating the shared public pricing entry. |

`mutationOptions` and `useMutation` own request state, not server idempotency. A shared mutation `scope.id` serializes calls; it does not turn repeated requests into one operation. Keep critical cache updates in the mutation's configured callbacks. Per-call callbacks are suitable for mounted UI effects such as the dismiss animation, since they can disappear after unmount.

`queryCacheUpdated` on the existing learning activity event prevents the sidebar from repeating invalidation already performed by a migrated feature. Other event consumers and local study state remain intact. Browser `keepalive` improves the chance that a small request survives navigation; it does not guarantee delivery after the process exits. No mutation cache is persisted for later offline replay.

## Account changes and RSC boundaries

Live session consumers call `useSyncQueryAccount` only after Better Auth has a confirmed session result. A temporary pending state does not clear private data. Confirmed account changes cancel and remove another actor's queries and mutation entries while preserving public pricing. The shared `signOut` wrapper clears private state after successful sign-out. In-flight server mutations cannot be undone by cache removal; their completion callbacks check the current actor before changing a cache.

RSC-provided progress or attempt props can outlive a browser account change. `useQueryAccountCurrent` fences those consumers until navigation supplies current data. Components with account-specific local state reset through account keys. Demo adapters bypass private server reads and preserve their existing local behavior.

Keep initial course/content loading and authoritative access in RSC and server services. Do not import database modules, provider credentials or server-only contracts into client query modules. If server prefetch/hydration is added, create the server QueryClient per request and hydrate only authorized data. Avoid two independently displayed copies of one mutable response in an RSC and a client query without an explicit refresh policy.

The Query cache, Next.js route/data caches and RSC request memoization are separate. `invalidateQueries` does not invoke `revalidatePath`, refresh the Router Cache, or regenerate server HTML. Preserve existing server revalidation and `router.refresh()` where a mutation affects server-rendered content. Imperative client reads use `client.query(options)` with the same factory as their hook.

Repeated browser reads should use an authenticated GET backed by the existing server service, as the sidebar navigation extraction does. Server Actions remain useful for authorized mutations and their revalidation behavior. Introducing another client read mechanism is unnecessary for data already rendered once on the server.

## Migration coverage and remaining work

The current migration covers shared Query infrastructure; Today and sidebar reads; study paths; intervention reads/dismissal; quiz player/submission/review/analytics boundaries; article progress and material progress/status/summary logic; flashcard review and local session logic; discussion counts; Zyra allowance and proposals; pricing; admin ops, diagnostics, flags, usage, product catalog and leaderboard reads.

The product catalog panel currently appears in the admin loading visual fixture; this does not establish broad live catalog use. Article bodies and flashcard queues retain their server/local owners. The following inventory comes from repository client fetches, imported Server Action reads and their consumers. It is an ownership map, not proof that all runtime data paths have been exercised.

### Mechanisms intentionally preserved

| Flow | Current locations | Reason |
|---|---|---|
| Server content, authorization and database work | `app/**/page.tsx`, `lib/student/course-access.ts`, server repositories and jobs | Retain server access decisions, bounded projections, transactions and initial HTML. Query is a browser response cache. |
| Chat and AI streams | `components/course/tutor-drawer-view.tsx`, `components/coding/coding-help.tsx`, `components/admin/ops-ai/use-ops-ai-chat.ts`, `lib/zyra/stream-consumer.ts` | Keep partial output, cancellation, request identity and provider accounting in their stream/session layers. |
| Live quiz and terminal transport | `components/live/use-live-quiz-socket.ts`, `lib/coding/remote-runtime.ts`, `lib/coding/remote-warm.ts` | Preserve WebSocket tickets, ordered events, command state and connection cleanup. |
| File uploads, downloads and exports | `lib/storage/*-upload-client.ts`, `lib/batch-client.ts`, quiz/tryout upload adapters, `lib/export-spreadsheet-client.ts` | Preserve presigned URLs, binary bodies, upload progress and download behavior. |
| Coding drafts | `components/coding/use-coding-draft.ts` | Keep local recovery, revision conflicts and the ordered save queue; a read refresh must not overwrite unsaved code. |
| Review/publication workbenches | `components/admin/material-review-detail.tsx`, `components/admin/solution-collection-review.tsx`, bundle upload dialogs | Retain exact checksums, review receipts, reset acknowledgments and draft-safe transitions. Read projections can migrate separately. |
| Formative checks and explicit transactions | `components/course/product-learning-blocks.tsx`, `quiz-start-button.tsx`, `tryout-form.tsx`, Ops AI execution and generation actions | Evaluation, reveal, attempt creation, grading and costly work require explicit intent and existing server transaction rules. |
| Celebration delivery | `components/gamification/celebration-listener.tsx` | Preserve cross-tab locks, shown-event history, acknowledgment, visibility and backoff; these are delivery rules. |

Material reading is already extracted into typed keepalive mutations. The old `MaterialViewer` timer/API mix and its `sendBeacon` path are not listed as remaining migration work.

### Remaining read opportunities

| Domain | Remaining sources | Suggested boundary |
|---|---|---|
| Notifications | `components/notifications/notification-bell.tsx` | Account-scoped unread/history queries; validated bodies and invalidation after read actions and foreground FCM events. Preserve toast delivery. |
| Coding problem/history | `components/coding/article-coding.tsx`, `components/coding/live-coding-exercise.tsx`, `components/coding/coding-workspace.tsx` | Shared problem/version reads; history keyed by actor, course, problem and surface; poll only pending submissions. Keep runtime and editor state local. |
| Weekly schedules | `app/(student)/dashboard/schedule/schedule-client.tsx` | Replace the component's week cache with actor/course/week queries and booking invalidation. `getScheduleData` is still a Server Action read. |
| Search and learning lookups | `components/command-menu-dialog.tsx`, `components/course/term-popover.tsx`, `components/course/tutor-drawer.tsx` | Cache authorized search documents/results, concept popovers and appearance separately from search text, local Fuse indexing and dialog state. |
| Discussion pages | `components/discussions/discussion-client.tsx` | Channels, questions, thread pages, reports and AI status still use custom action reads and polling. A separate migration must preserve cursors, signed observations, read-through state and revision checks. Only count badges have migrated. |
| Tutor history/live setup | `components/course/tutor-drawer-view.tsx`, `components/tutor/tutor-live-console.tsx` | Query session/history lists, course context, quiz templates, coding problems and resumable live-session lists independently from streams and live controls. |
| Admin navigation/directories | `components/admin-sidebar.tsx`, `components/admin/users-dashboard.tsx`, `components/admin/groups-dashboard.tsx` | Typed GETs for current Server Action reads; actor, filter, page and selected-detail keys with existing mutation guards. |
| Admin browsing and management | Links manager, media library, storage browser, form builder/presets, admin form/Meet pages and short-links page | Folder, form, record and filter keys; keep local drafts, selection, upload transport and explicit save operations. |
| Admin quiz insights/jobs | `app/(admin)/admin/(eval)/quiz-insights/`, `jobs/jobs-client.tsx`, quiz-form question-bank reads | Paged keys, cancellation and foreground status polling. Job reads currently use a three-second interval; quiz-form selection loads question pages of 500. |
| Other action reads | Voucher lists, notification history, tutor activity filters, group rename status, quiz preview/grading details, tutor slot notes, social profile/follower/search adapters | Migrate each read projection and transport with its owner. Existing action TypeScript types do not supply the shared runtime response validation/cache policy. |

These are follow-up opportunities, not completed migrations or requirements to rewrite each feature in this PR. Choose work by repeated reads, stale-data risk, user impact and validation cost. Preserve domain-specific concurrency rules while extracting the read layer.

## Verification boundary

Focused tests cover key isolation, malformed responses, cancellation, retry limits, concurrent optimistic completion, late account results, quiz state/submission, article/material progress, flashcard review contracts, admin filters and proposal/dismissal behavior. Relevant suites live under `tests/unit/` and `tests/contracts/`; feature browser checks live under `tests/visual/`.

The Query lifecycle workflow runs a production build against a disposable PostgreSQL database with the full migration chain. It also runs the quiz, learning, dashboard and admin browser fixtures at 380 x 844 and 1536 x 864, and keeps the report, screenshots and traces as a CI artifact. The primary agent must inspect every required capture before visual signoff.

Record the exact commit, commands, results and remaining boundaries in the PR. Fixture responses and a disposable build database do not establish authenticated staging behavior, provider usage, database contention, navigation-exit delivery or measured performance savings. CI success and merge status do not establish deployment status.

## Official references

- [TanStack Query options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options): colocated typed keys, functions and options.
- [Query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys): serializable inputs and deterministic hashing.
- [Important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults): freshness, inactive retention and automatic refetch.
- [Query functions](https://tanstack.com/query/latest/docs/framework/react/guides/query-functions) and [cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation): error handling and AbortSignal consumption.
- [Retries](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries) and [network mode](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode): retry and offline behavior.
- [Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations) and [useMutation](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation): lifecycle callbacks, serial scopes and retry defaults.
- [Optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) and [invalidation after mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations): cancellation, rollback and reconciliation.
- [QueryClient](https://tanstack.com/query/latest/docs/reference/QueryClient) and [advanced server rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr): imperative reads, request isolation and data ownership.
- [Next.js data fetching](https://nextjs.org/docs/app/getting-started/fetching-data) and [updating data](https://nextjs.org/docs/app/getting-started/updating-data): server/client reads and Server Action boundaries. For changes in this repository, also read the installed Next.js guides under `node_modules/next/dist/docs/`.
- [Zod basics](https://zod.dev/basics): runtime parsing and inferred types.
