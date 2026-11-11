# Demo performance, 2026-11-11

Status: `OPEN / IN PROGRESS`.

## Evidence and scope

Three Terra max static audits inspected commit `ee96794e`. No database, browser, test runner, build, lint or typecheck was used. Source proves redundant work, not measured latency, transfer size or a production bottleneck. The user prohibited CPU/RAM-heavy verification. Subsequent local implementation remains subject to static integration review and runtime acceptance.

## Findings and local work

- Every demo view waits for all-course summaries, then selected views read snapshots and resolve course/chapter again. Under four fully mapped snapshots the old summary code could issue 37 SELECT statements; this is a conditional source count, not runtime evidence. Request-scoped deduplication and narrower summary reads are implemented locally, with runtime acceptance pending.
- Today, document lists and quiz gateways load full product experiences. View-specific metadata/body loaders and reduced client props are implemented locally, with runtime acceptance pending.
- Flashcard sets/pages and quiz pages repeatedly invoke the full resolver. Specialized loading, initial-page reuse and bounded concurrency are implemented locally, with runtime acceptance pending. Tokens, revisions, question order, Free eligibility, publication and first-chapter boundaries must remain unchanged.
- Per-page grading submits serially. Bounded concurrency must keep result ordering and avoid displaying or persisting partial success.
- Demo student pages statically import unrelated client features. Modules now load on demand with visible loading state. Demo route transitions and Reveal wrappers expose ready content immediately, including locale-prefixed paths.
- Session overlay reads are reused per browser tab, course and revision. Reset updates active subscribers; restored history revalidates storage. Storage errors retain a fallback.
- Root catalog loads and server translators share request-scoped catalog reads. PostHog receives public configuration from the server instead of importing environment validation in its client provider.

## Deliberately retained boundaries

The complete initial message catalog remains server-supplied because the root persists across client navigation. Its 23 source files total 359097 bytes in Indonesian and 354835 bytes in English; these are source-file sizes, not compressed network payload. Full surface splitting and conditional SDK chunking remain open until a design preserves namespace availability, official context and initial events without hiding the application subtree. Telemetry is not disabled.

Shell scope and revision checks remain authoritative. A browser overlay cache must never become server-shared user state. Public content caching must not bypass publication revocation, Free scope, alias ambiguity, quiz token validity or answer redaction.

## Acceptance still required

When resource-intensive verification is authorized, compare identical nonproduction fixtures before and after: first visit and client navigation, one and multiple quiz pages, multiple flashcard sets, reset and history restoration, language changes, invalid revisions and revoked publication. Record query counts and durations, shell/section readiness, RSC and JS bytes, grading request duration and concurrency, visual states at 380 x 844 and 1536 x 864, and errors. Static whitespace checks do not establish runtime, accessibility, visual or performance success.


## Local integration checkpoint

View loaders now select metadata, documents, article, Diktat, flashcards or quiz explicitly. Collectors reuse the first matching card page and limit set/page concurrency to two; grading likewise limits concurrent page submissions to two, preserves order, and saves a result only after all pages succeed. Existing source contracts were updated to follow the specialized resolver arguments and selection checks. Regression suites were added but not executed. The old 37-SELECT estimate must not be interpreted as a measured before/after saving.

Before merge, CI must verify application types, worker import boundaries and affected tests. Local lint/typecheck/build/test/browser remain prohibited. Review and checks do not replace responsive screenshots or authenticated/nonproduction runtime acceptance.

CI on `fbc361a6` passed the application type stage but failed selected test types and the worker import audit. Local follow-up corrects fixture literal/spy/mock typing and separates framework-neutral auth cores from server-only RSC cache wrappers. CI must be rerun on the updated head; no local heavy checks were run.

Independent review of `fbc361a6` found obsolete context-path source assertions and a metadata placeholder being inserted as a nonexistent document. Local corrections follow the context resolver explicitly and add catalogue fallbacks only for products present in the validated collection. A regression test was added but not executed.

Independent client review found early submission rejection while a peer remained in flight and loss of cached progress after failed storage revalidation. The grading helper now waits for all batch outcomes before rejecting, and overlay invalidation marks values stale without deleting the last known state. Added regression cases are not executed locally.

Re-review found a stalled grading peer could still retain the submit lock. Page fetches now receive the batch AbortSignal, peers abort on failure, and every batch has a 30-second deadline before settling. Regression cases cover peer cancellation and deadline expiry. CI on `2432a759` passed worker boundaries and application/selected-test types, then stopped at an obsolete answer-leak source assertion; that assertion now checks per-template release and marker redaction. Remaining checks are not assumed green.
