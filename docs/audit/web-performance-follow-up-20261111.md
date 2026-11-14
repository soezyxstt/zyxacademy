# Web performance follow-up, 2026-11-11

Status: `OPEN / IN PROGRESS`.

## Scope and evidence

Read-only Terra max reviews inspected baseline `0a7f6eb8` and a changing shared worktree. Subsequent local implementation is under integration. Findings describe code paths, not measured production bottlenecks or quantified speedups. The user prohibited lint, typecheck, builds, browsers and resource-heavy processes. No test runner or external mutation was used for this follow-up. Whitespace checks are separate from type, runtime, authorization and visual verification.

## Local changes under integration

- Material catalogues omit article bodies and legacy Markdown. Reader metadata has a narrow projection; personal progress remains user-scoped.
- Quiz history uses summary columns and loads snapshots for the selected attempt. Review queries select only needed columns.
- Student onboarding uses relevant-course batch projections. Sidebar reuses enrollment from Today; server-render and API requests remain separate. Today completion uses an idempotent atomic JSONB update. Admin users/groups have server-side pagination, search, filters and aggregates; group detail is loaded on demand.
- Server translators load only their namespace. The root retains complete server-supplied initial catalogs to avoid blank loading states and missing namespaces during cross-surface navigation. Account language priority remains unchanged. Tutor preload is interaction-driven; automatic marketing/account prefetch is reduced.
- Thumbnail requests return queued status without server polling; card and compact-row clients retry at most four times with backoff and cancel timers on unmount. New keys include source identity and revision; jobs serialize per material with bounded requeue IDs. Legacy thumbnail revision provenance remains unknown.
- Video pages reuse action access results, lazy-load management/player modules, and lazy-load thumbnails. Management dialogs stay mounted after first opening and reject dismissal while saving to preserve pending uploads. Ops AI mounts on first opening and stays mounted thereafter to preserve streams and drafts.
- Question authoring loads course/chapter-scoped Idea choices on demand. Course settings use a dedicated projection. Course overview shares its outline promise inside Suspense boundaries.
- Marketing about/plans heroes render without Reveal hiding initial content.
- Tutor academic schedules require both ownership/course scope and date overlap. A missing end date is treated as an event at its start. A regression case was added but not executed.
- Diktat cleanup skips deletion when the previous key equals the just-uploaded key.

## Remaining boundaries

- Authenticated timing, query counts, pool pressure, payload sizes, JavaScript transfer, playback, focus behavior, pagination interactions, locale transitions, streaming and screenshots remain unverified.
- Root locale still waits for session and account preference to preserve precedence. Client surface-specific catalog splitting remains open: the proposed root lazy catalog boundary could hide the entire application, so initial catalogs remain supplied by the server. KaTeX CSS remains global because multiple public and application surfaces need it.
- Full quiz-bank discussion pagination remains open; the existing review component has no page navigation. Snapshot projection does not bound the number of discussion rows.
- Conditional PostHog SDK chunking was rejected during integration: a lazy provider with a null Suspense fallback blocked the entire application subtree. The stable official provider is retained, with one-time initialization; SDK import cost remains open.
- Existing legacy thumbnails have no source revision provenance. Do not infer that their image matches a replacement PDF.
- Previous live inspection reported Vercel production `iad1` and Neon project `aws-ap-southeast-1`. The local `sin1` configuration does not establish a serving-region change.

## Acceptance before release

When resource-intensive verification is authorized, use deterministic nonproduction accounts and the same dataset and deployment for comparisons. Verify material payload redaction and access, assessment answer release and ownership, account switches and concurrent Today completion, query/payload bounds, locale navigation, thumbnail recovery, video dialogs and playback, and all affected responsive states. Record before/after measurements separately from code findings. Keep this audit open until these boundaries are exercised.


## Audit corrections after commit 1e284f0f

A second static review identified six issues: attempt review bypassing discussion release, stale versioned Diktat thumbnails, recovery event suppression, actionable stale admin search results, sidebar fallback hidden by stale Today data, and obsolete static test assertions. Local fixes have been integrated through static review without running test suites or external effects.

Diktat output keys now identify rendered PDF bytes; retained old PDFs are rollback artifacts, not public downloads. The generic storage proxy fails closed for unreferenced `courses/{course}/diktats/...pdf` keys. Restoring a historical artifact requires restoring its authorized active reference. Static contracts were updated for alias-scoped thumbnail lookups, queue responses, gateway counts and account-scoped sidebar context. Acceptance remains open until runtime access, queue recovery and UI error behavior are exercised.


Attempt review release now gates the page, direct detail/list APIs and student analytics GET/POST. Locked review retains scores and basic summary while withholding snapshots and diagnosis; the summary route redirects to the authorized review state. Diktat PDFs use content-addressed keys and new covers do not reuse unverifiable legacy thumbnails. Recovery IDs advance every 10 seconds with singleton worker suppression while a run is active; later recovery still requires another request. Admin result actions are disabled for stale query identities and failed requests show retry; sidebar fallback takes precedence on Today errors within its account/route/error scope. These changes are code-reviewed only, not verified at runtime.
