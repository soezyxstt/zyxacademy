# Indonesian and English web app completion plan

Status: `OPEN / IN PROGRESS`
Date: 2026-10-24
Stage: local source implementation and release candidate checks are complete. The tracked inventory contains 307 route, page, layout, and handler candidates, currently labeled 8 passed, 2 partial, and 297 not run. The release candidate build, typecheck, lint, catalog checks, focused contracts, 52-capture public route matrix, 26 focused state screenshots, and 8 route-metadata browser checks passed. CP7 remains partial only for data-dependent and breadth boundaries: populated demo states and some synthetic PKA enrollment data are unavailable, the full 307-route role/state matrix is not exercised, and live external-provider/request-time cache behavior was not validated. CP8 is blocked: no rollout is authorized, and the read-only staging check found migration 0098 pending.

## 1. Outcome and finish line

Deliver a finished Indonesian and English application experience across public, student, tutor, and admin surfaces. A person can select a language, complete every supported app workflow, receive system messages, and use Zyra in that language. Selection survives navigation, authentication, and later visits. Existing learning records and authored content keep their identity.

Prioritize the parts the application must control. Full translation of the academic library is a separate editorial program, not a prerequisite for completing this release. Do not describe this release as a fully translated course library.

The release is finished only when CP0 through CP8 pass. A translated sidebar or one English dashboard is an intermediate checkpoint, not completion. Maintain a route and state inventory so missing surfaces cannot disappear behind a percentage estimate.

### Must ship

- Application-owned interface copy in both languages across all supported roles and routes, including mobile navigation, dialogs, tooltips, accessibility labels, validation, loading, empty, success, permission, quota, and error states.
- Language selection, server rendering, account persistence, deterministic preference resolution, and state-preserving switching.
- Consistent Zyra response language across grounded, general, image, follow-up, failure, and quota paths; language isolation in every answer cache.
- Localized system-generated email, push notifications, and new inbox messages.
- Translated public static marketing pages, authentication pages, relevant consent screens, metadata, and discoverable public language URLs.
- Localized reader and assessment controls around original-language materials, without changing content or assessment identity.
- Bilingual search controls, category labels, navigation lookup, and recovery states.
- Release evidence, deployment checks, rollback instructions, and an explicit list of original-language content.

### Content that retains its published language

PDFs, historical exams and solutions, Article prose, Diktat exports, flashcard fronts/backs, quiz questions/options/solutions, video speech/subtitles, blog bodies, testimonials, announcements, form questions, institution names, and user-entered text remain as authored unless an approved translation already exists.

Translate the surrounding interface and application-generated descriptions. Preserve the original wording of source records and historical evidence. Do not translate an assessment on demand, change numbers or notation, or silently create a second question identity. An English interface must not imply English course content.

Provide a concise content-language indication at a useful boundary, such as course/material details or the reader, only where needed to explain the language difference. Zyra can explain eligible material in English under the existing assessment policy. Do not add repeated warning banners to every row or block.

## 2. Verified starting points

Source, contract, local production-build, public-route, and read-only staging-schema evidence are available. No staging or production deployment, provider call, real email, or broad role/state route verification is claimed.

| Concern | Evidence and implication |
|---|---|
| Framework | Next.js 16.3, React 19, Bun, Better Auth, Drizzle/SQLite/Turso, and `next-intl`. Paired JSON catalogs are loaded through `lib/i18n/catalogs.ts`. |
| Root shell | `app/layout.tsx` resolves `html lang` at request time and loads the selected catalogs. The public shell passed the captured 13-path matrix in both locales and viewports. Full locale switching and role-route behavior still require CP7 browser review. |
| Routing | `proxy.ts` rewrites only prefixes listed in `lib/public-locale-routes.ts`, removes caller-supplied `x-app-locale`, and sets the trusted header from the validated path. `next.config.ts` sets `skipProxyUrlNormalize: true`; the rewrite builds from the incoming request URL and preserves its origin. |
| Account | `account_locale_preferences` is a dedicated user-keyed table with an `id`/`en` check constraint. Drizzle migration `0098_workable_blue_blade.sql` is additive. The guarded read-only staging check found neither its migration-ledger entry nor the table, so it remains pending there. No migration was applied. |
| Display | `lib/i18n/locale.ts` supports `id` and `en`, formats default locales as `id-ID` and `en-US`, and resolves explicit public URL, account preference, cookie, supported `Accept-Language`, then Indonesian. `lib/date-utils.ts` continues to own Jakarta business-day boundaries. |
| Zyra prompts | Response language is an allowlisted `id`/`en` value. Explicit English/Indonesian modifiers override the requested value; recent student history is the fallback when the request omits it. The exact and semantic cache identities include response language and prompt/policy/schema versions. |
| Zyra interface default | The tutor drawer sends its interface locale as `responseLanguage` through the shared `buildTutorChatRequest` path for typed, retry, image, and selection requests. Explicit conversation overrides are held in memory for at most 32 sessions and clear on drawer remount, reload, account, course, or interface-locale changes; the account interface locale persists across visits. The request-language contract and broader Zyra contracts passed; overall role/route/state coverage remains partial under CP7. |
| Content | Canonical `ide`, `artikel`, and `soal` records have stable identities, versions, and provenance. Do not restructure these contracts for interface translation. |
| Communications | System email and push wrappers resolve the recipient preference at dispatch, render from server-safe Indonesian/English catalogs, and record locale for newly generated notification payloads. Broadcast and tutor-authored content remain unchanged. Existing history and previously delivered email are not rewritten. |
| Search | `lib/search/contracts.ts` retains its Indonesian category keys. Display adapters localize category labels and support bilingual app-navigation aliases without claiming cross-language academic retrieval. |
| Public discovery | A finite allowlist in `lib/public-locale-routes.ts` includes the homepage, selected informational/demo routes, and blog slugs. The local production-build matrix covered 13 paths, both locales, and 380x844 and 1536x864 viewports: 52 of 52 returned HTTP 200 with matching `html lang`, canonical URL, no runtime or HTTP errors, and no overflow. The primary agent inspected all 52 captures. Populated demo states and blog article slugs were unavailable; cache behavior was not measured. |

The canonical release candidate build exited 0. Its aggregate source hash changed from `8361abef603be736dc1fe4cfe18d3b4d08d5f6153acbc82019b076b53861988c` before the build to `4642103d78b6b6c35125854e2e1dc257e09ae4e2d30abbb3f182c444814959ed` afterward because `bun run build` regenerated `lib/compute/product-v4-build-runtime.json` via `scripts/authoring/prepare-web-verification.ts`; the exact delta is recorded in `artifacts/bilingual/production-build-final-release-candidate-delta.json`. TypeScript exited 0, ESLint exited 0 with 262 warnings, and the catalog gate checked 23 namespaces and 6,426 static calls. Locale resolution passed 4 tests / 17 assertions; MCP boundary contracts passed 7 / 29; CP5 passed 17 / 85; Zyra passed 48 plus 8 request/SSE cases; and course overview passed 10 / 47. Browser verification includes 52 public captures inspected by the primary reviewer, 26 accepted focused state screenshots, and 8 passed metadata cases at 380 px and 1536 px. The main focused suite passed 20 tests and skipped 2; the boundary suite passed 4 and skipped 2 unavailable PKA fixtures. The combined accepted manifest contains 78 SHA-256 capture records. Metadata browser checks verified the sign-out document title/description, both locale variants of the web manifest with stable installed identity, and account-locale metadata on representative `/admin/courses` and `/admin/questions` routes; these checks cover metadata only, not the full page workflows. Remaining CP7 gaps are populated/demo data, the full 307 route/role/state matrix, and live external-provider/cache behavior. The archived original-worktree baseline has TypeScript exit status 0 and ESLint exit status 1 from one pre-existing render-purity error in `components/admin/voucher-management-tab.tsx`; that `Date.now()` render issue is fixed in the current source. CP8 remains unauthorized and staging migration 0098 is pending.

## 3. Product and technical decisions

### 3.1 Locale and preference

Support exactly `id` and `en`; use `id-ID` and `en-US` for default presentation formats. English is written in clear international English with one consistent spelling convention. Indonesian remains the fallback.

Use `next-intl` with paired, namespaced JSON catalogs and server/client integration. Load only relevant namespaces into client boundaries. Do not use runtime machine translation for interface strings. Catalog namespaces currently include `core`, `common`, `auth`, `student`, `studentCourse`, `studentExtras`, `learning`, `zyra`, `admin`, `adminAcademic`, `adminOps`, `adminEval`, `adminForms`, `adminMedia`, `tutor`, `consent`, `notifications`, `search`, `publicForms`, `marketing`, `schedule`, and `ui`.

Preference resolution:

1. Explicit public URL language controls that public page's rendering and metadata, regardless of cookies or account preference.
2. For unprefixed application routes, use the authenticated account preference when known.
3. Otherwise use the explicit locale cookie.
4. Otherwise match supported browser preferences, then fall back to Indonesian.

An explicit switch updates the browser cookie and, when authenticated, the account preference. Visiting a shared public language URL alone does not overwrite an account preference. New accounts inherit a valid explicit selection; existing accounts without a selection continue through the normal fallback chain rather than being mass-updated. Never change language based on IP geolocation.

Use the implemented `account_locale_preferences` row, keyed by `user.id`, with constrained `locale` and `updated_at` columns. This keeps presentation settings independent of authorization and per-course Zyra learning preferences. The authenticated action writes only the current user's preference. The additive Drizzle migration is `drizzle/0098_workable_blue_blade.sql`. It is present in source, but production migration is not authorized by this plan.

Account reads belong in authenticated layouts or the existing session boundary, not in static asset handling or the coarse proxy. Resolve locale before rendering. Do not add a database query to every asset request or a full client-side loading screen just to choose a language. Document how the account preference is mirrored into the browser cookie at sign-in and on subsequent authenticated requests.

### 3.2 Routing and public pages

Keep `/dashboard`, `/courses`, `/profile`, `/settings`, `/tutor`, `/admin`, API endpoints, MCP endpoints, OAuth callbacks, and existing entity links stable.

Expose `/id/...` and `/en/...` through the finite allowlist in `lib/public-locale-routes.ts`: `/`, `/about`, `/plans`, `/testimonial`, `/blog`, `/privacy`, `/terms`, `/demo`, `/demo/article`, `/demo/diktat`, `/demo/flashcards`, `/demo/quiz`, `/demo/zyra`, and individual `/blog/{slug}` paths. The Proxy rewrite is same-origin and sets `x-app-locale` only after stripping a supported prefix. Unlisted paths are not rewritten. Existing unprefixed application paths remain stable. The public route subset and focused metadata checks passed; the full role/route/state matrix remains incomplete.

Public translated pages need correct `html lang`, title/description, Open Graph locale, canonical URL, language alternatives, and sitemap entries. Publish language alternatives only for real translations. Blog shells may be bilingual while article bodies remain original; do not advertise an untranslated body as an English translation. Confirm public/protected course discovery before touching its sitemap entries. Authentication and protected pages do not gain duplicate indexable URLs.

Explicit URL language must be part of public cache identity. Authenticated/cookie-dependent HTML must not leak between locales or users through shared caching. Do not force the entire public site dynamic merely to support application preferences.

### 3.3 Switching without losing work

Use a clearly labeled language menu with native names, Bahasa Indonesia and English, rather than flags. Place it in public navigation and the shared account menu/settings; make it available on every role surface.

Switch labels through a stable client provider without remounting the application shell, quiz attempt, reader, editor, or tutor provider. Synchronize server-rendered content through a controlled refresh only after the affected surface can preserve its state. Do not key stateful providers or pages by locale.

Before enabling switching on a surface, verify preservation of query parameters, hash, selected tab, filters, draft inputs, selected files, quiz answers/timer/attempt ID, reader position, flashcard position, chat draft/history, and pending requests. Avoid persisting sensitive drafts merely for localization. Where a route requires refresh, use its existing draft/state mechanisms or defer that refresh until a safe boundary while updating client labels immediately. Document the surface-specific mechanism; a blanket `router.refresh()` is not sufficient evidence.

If saving the account preference fails, keep the prior effective selection and draft state, show a localized retry action, and do not leave cookie, account, and rendered locale silently inconsistent. The account-level interface locale persists across visits. Zyra's conversation-specific response-language override is memory-only, bounded to at most 32 sessions, and clears on drawer remount, reload, account change, course change, or interface-locale change. A running AI response retains the language captured when its request started; the next request uses the current interface locale or an in-memory conversation override.

### 3.4 Translation boundaries

Use the registered namespaces listed in Section 2. Keep this product glossary consistent across catalogs and technical documentation:

| Term | Indonesian UI | English UI | Boundary |
|---|---|---|---|
| Course | Mata kuliah | Course | Preserve course titles and stable IDs. |
| Chapter | Bab | Chapter | Preserve chapter titles and order. |
| Idea | Idea | Idea | Product object name and stable identity. |
| Article | Artikel | Article | Product format; authored Article text stays as published. |
| Diktat | Diktat | Diktat | Product format and exported PDF stay in their published language. |
| Quiz | Kuis | Quiz | Controls may localize; questions, options, and answers stay unchanged. |
| Practice test | Tryout | Practice test | Preserve the assessment identity and authored attempt content. |

Keep literal brand/product names where appropriate. Preserve role keys and machine values even when the visible label differs.

Use stable message keys and ICU interpolation/plurals. Do not build sentences by joining translated fragments. Keep dynamic names, scientific symbols, technical IDs, stored enum values, JSON keys, URLs, and role codes unchanged. Map display enums through translation keys at the UI boundary.

Return stable error codes and bounded parameters from server actions/APIs where feasible, then render localized copy. Preserve compatibility with existing consumers; never translate machine-readable error codes or expose raw provider errors. Global errors that render outside providers need small self-contained catalogs and a safe locale fallback.

Translate units and labels, not prices, quota arithmetic, UTC storage, deadlines, or Jakarta daily reset rules. Preserve authored mathematical notation, decimal conventions inside source prose, and assessed answers. Apply locale formatting to app-generated dates/numbers only.

### 3.5 Zyra language contract

Keep interface language, response language, and evidence language distinct. Default responses to interface language. An explicit request to answer in English or Indonesian overrides that response language for the conversation until another explicit request or interface switch changes it. Ordinary mixed-language typing does not continually flip the preference. The account interface locale is persisted across visits, but conversation-specific overrides are held only in memory, capped at 32 conversations, and cleared when the tutor drawer remounts, the page reloads, the account or course changes, or the interface locale changes. Do not persist chat content or infer sensitive learner traits.

Pass the resolved response language as an allowlisted field through requests, classification, prompt composition, structured pedagogy, general teaching, image turns, greetings/clarification, fallbacks, checkpoint feedback, and canvas labels/alt text. Preserve source titles, citations, formulas, and assessment restrictions. Historical messages stay in their original language.

Reuse existing response modifiers and reconcile conflicting hard-coded prompts. Explicit `English` or Indonesian language modifiers override the requested response language; absent modifiers, the request value is used, then a recent explicit student modifier, then Indonesian. The shared tutor chat request path passes the interface locale and request/SSE contract tests pass. Broad role/route/state coverage remains part of CP7; request-language and Zyra contract suites passed. Keep Indonesian source retrieval available for English questions through the existing topic-focus classification path. Verify retrieval quality against a fixed set of equivalent bilingual questions. Do not assume multilingual embeddings alone establish equivalent results or add a second provider request solely for interface translation.

Audit every cache that can return learner-facing prose: KV exact answers, remote exact/semantic scaffolds, provider cache identity, summaries, and persisted derived output. The exact tutor key and remote semantic identity currently include response language and prompt/policy/schema versions. Keep the current request language per conversation in bounded in-memory state, pass it on every request, and version prompt/policy/cache identities when their output contract changes. The account interface locale persists across visits; explicit conversation overrides do not survive a drawer remount or reload. Source-language summaries remain source-language artifacts and must not be served as locale-specific responses. Never reinterpret old Indonesian entries as English. Preserve profile isolation, quota accounting, canonical claim validation, and attempt-specific cache bypasses.

### 3.6 Communications and search

Resolve the recipient's language before rendering system emails or notifications. Group multicast recipients by language and render once per locale. Keep delivery accounting, retries, opt-outs, and idempotency intact. Background jobs need an explicit locale policy and server-safe catalogs, with no Next.js/React imports leaking into Deno compute. Render at dispatch using the recipient's current preference; retries reuse the original delivery locale and idempotency identity.

New system notifications store their rendered delivery language or equivalent bounded metadata for audit. Existing notifications and already-sent emails remain as delivered. Broadcast text and tutor-authored announcements remain original-language content. Translate unsubscribe pages, email footers, subjects, buttons, and system wrappers; do not change token signatures or opt-out behavior.

Translate search controls and labels without changing indexed identity or permissions. Use bilingual aliases for app navigation and stable category-to-label mappings. Keep academic result titles in their published language. Cross-language academic retrieval beyond Zyra is an explicitly separate enhancement unless existing search already supports it and passes verification; do not promise translated results. Preserve all role and enrollment filtering.

## 4. Ordered work packages and acceptance gates

Each checkpoint updates its inventory, evidence, remaining issues, and exact validation results. Finish each complete workflow before moving to the next translation batch. Do not accumulate untranslated error states for a final cleanup sprint.

| Checkpoint | Deliverables | Acceptance gate |
|---|---|---|
| CP0. Freeze scope and baseline | Inventory every supported route, shared component, role, state, outbound template, AI branch, and public entry point. Classify text as app-owned, authored, third-party, or machine contract. Record baseline failures, canonical public URL map, locale resolution, and implementation batches. | Every reachable supported surface has an owner/batch and verification method. Original-language exceptions are explicit. No new major scope decision is hidden in a later phase. |
| CP1. Foundation | Install compatible i18n dependency; catalogs, glossary, server/client resolution, additive preference table/action, cookie synchronization, language menu, locale-aware formatting, provider-free error support, and message checks. | First visit, reload, login/logout, expired session, multiple tabs/devices, invalid locale, and preference-write failure behave predictably. No wrong-language flash on the representative rendered route. |
| CP2. Complete student workflows | Translate auth, shell, dashboard, catalogue, course/reader controls, video/material controls, quizzes/reviews, flashcards, mastery/study paths, schedules, groups, profile/settings, notifications, feedback/forms, and eligible PKA/live flows from inventory. | A student completes representative workflows in both languages, including failures, with intact progress and drafts. Unsupported feature flags are not enabled just for this work; test retained features with deterministic fixtures. |
| CP3. Complete Zyra | Implement response-language contract across every execution branch, all answer caches, UI/composer/allowance states, canvas accessibility, and fixed bilingual retrieval/safety cases. | Both languages pass grounded/general/image/follow-up/error/quota and assessment cases. No cross-language cache hit, extra translation-only model call, fabricated citation, or quota-policy regression. |
| CP4. Tutor and admin completion | Translate all tutor/admin routes and shared tools, editors, authoring/review controls, operational errors, consent screens, permissions, and file/export controls. Translate generated operational export headers if app-owned; preserve authored content and machine-import contracts. | Both roles complete their inventoried workflows in both locales. No raw codes, destructive-action ambiguity, or changed role/enrollment checks. Student popups remain absent from admin. |
| CP5. Communications and search | Localize new system notifications/emails, background dispatch, footers/unsubscribe, search shell/categories/navigation aliases, and role-aware results. Focused local evidence: 17 tests, 0 failures, 85 assertions for notification preferences, recipient-localized templates, and CMDK search scope. | Mixed-language recipient fixtures receive correct localized templates exactly once; opt-outs and signed links pass. Search permissions remain intact and original-language titles stay faithful. Full integrated acceptance remains pending. |
| CP6. Public experience | Translate static public content, demos' application-owned scripted copy, auth-adjacent surfaces, supported shared forms, metadata, canonical public locale URLs, sitemap/robots behavior, and manifest language treatment. | Direct links render the requested language independent of cookies, alternatives exist only for translated pages, old links work, and OAuth returns to the original protected path. Third-party Google screens remain provider-controlled. |
| CP7. Release candidate verification | Full inventory reconciliation, translation review, meaningful contracts, role/locale/state browser runs, responsive image inspection, lint/typecheck/build and deployment-boundary documentation. | Zero unclassified app-owned translation omissions or release-blocking regressions. Local success is recorded separately from staging/external success. |
| CP8. Authorized rollout and closeout | Prepare exact migration/deployment/rollback targets, inspect authorized nonproduction targets, validate staging, obtain authorization for remaining production actions, deploy and smoke both locales, then update canonical docs and status. | Production smoke and rollback readiness are evidenced. If deployment is not authorized or an external gate is unavailable, report implementation complete with release blocked; do not mark the whole release completed. |

CP3 can follow CP1 for a technical spike, but student workflow completion stays a distinct required gate. Tutor/admin and public work remain required for the final app release, even though student and Zyra delivery comes first.

## 5. Verification plan

### Contract and integration checks

- Validate identical key structure, ICU arguments/plural branches, and usable nonempty strings in both catalogs. Missing keys fail release checks. Indonesian fallback is defensive runtime recovery, not a substitute for translation completion.
- Maintain a bounded literal audit with documented exemptions for authored content, proper names, technical values, and tests. Human review decides whether copy is natural; an ASCII or dictionary regex cannot prove localization.
- Test precedence, unsupported locales, cookie/account synchronization, account separation, failed writes, concurrent switches, session expiry, public URL overrides, and stable old redirects.
- Test locale-specific server/client cache identity and React Query keys only where payloads contain localized text. Locale-independent grades/progress must not duplicate or reset.
- Test bilingual mapped API/auth errors and provider-free root/global errors. Include client navigation and hard reload, not just one rendering path.
- Test all Zyra prose-cache tiers and explicit-language overrides with fixed fixtures; evaluate grounded retrieval/citations and protected assessment behavior in both languages. Live model calls require an explicitly authorized environment and bounded spend.
- Test recipient-localized dispatch and retry behavior using fake email/push transports. Real delivery requires separately authorized recipients and environment.

### Browser and visual checks

Build a route/role/state matrix from CP0. Exercise all inventoried routes in both locales with deterministic local data or an explicitly authorized nonproduction environment. Use representative interaction tests for each shared component plus specific tests for unique flows; no claim of whole-app coverage based only on screenshots of the homepage.

Required interaction coverage includes language switching with a quiz answer and timer, reader scroll/selection, a chat draft and streaming response, profile/editor drafts, selected upload files, search filters, URL tabs, notification actions, OAuth return paths, and destructive confirmation dialogs. Verify Arabic numerals, math rendering, translated canvas labels, keyboard navigation, focus retention, document language, and accessible names.

Use the repository Playwright process at 380x844 and 1536x864, plus any affected intermediate breakpoints. The primary agent inspects every required screenshot directly. Require no new HTTP failures, unexpected redirects, uncaught errors, attributable console errors, horizontal overflow, clipped labels, or inaccessible controls. Record route/state/locale, command, exit status, screenshots, and unresolved boundaries.

Run focused tests throughout. Because the final change crosses schema, core libraries, rendering, routing, and workers, run `bun run lint`, `bun run typecheck`, relevant contract/worker-boundary tests, and `bun run build` for the release candidate. Record baseline failures separately with exit statuses; unresolved blockers cannot be called a passing release. Run `git diff --check` before handoff.

## 6. Rollout and rollback

Recommended foundational behavior is always-on when released; no new feature flag is required for translations themselves. Before implementation, resolve the repository-required always-on versus flag decision with the user if it has not already been authorized. This is a recommendation, not approval to add/remove a flag. If a temporary rollout flag is selected, record key, rationale, default, scope, owner, rollback, and removal condition.

Ship additive preference storage before code depends on it. Use generated Drizzle migrations and an exact verified target. Do not rewrite existing academic records, source files, vector namespaces, grades, or notification history. Version changed AI prompt/cache identities instead of deleting shared caches.

For rollback, restore the previous application build/public routing behavior, retain additive preference rows, and stop reading new locale-specific keys. The previous build remains able to read existing records. Do not drop tables or purge content as rollback. Review any changed notification metadata and background dispatch compatibility before release.

Observe bounded aggregate locale, stable error codes, wrong-language cache violations, and dispatch failures through existing telemetry. Do not log prompts, source prose, account identities, preference cookies, tokens, or email bodies to measure language adoption. Define the rollback trigger as broken auth/navigation, lost work, cross-user/locale output leakage, assessment-policy regression, or a material new error rate.

Update `docs/features.md`, `docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`, and relevant development/deployment guidance when implementation makes them inaccurate. Register every changed or new plan/document in `docs/README.md`. Implementation evidence and deployment evidence are separate checklist items.

## 7. Deliberately separate follow-up program

After CP8, reviewed academic translations can proceed one complete chapter at a time. That program needs canonical translation/version relationships, editorial review, source-version invalidation, bilingual mathematical terminology, translated asset/PDF verification, question-equivalence review, and multilingual indexing. Define those contracts before adding translation tables to academic entities or changing Product/Idea Bundle schemas.

This release does not depend on that program. It must already provide a complete bilingual app around original-language learning materials and allow policy-compliant explanations in either language.

## 8. Completion record

- [x] Source-grounded plan and bounded release scope prepared.
- [x] CP0 inventory and baseline accepted. The tracked 307-record source inventory, authored-content exemptions, locale map, and archived original-worktree TypeScript/ESLint baseline are recorded.
- [ ] CP1 foundation passes.
- [ ] CP2 student workflows pass.
- [ ] CP3 Zyra passes.
- [ ] CP4 tutor/admin workflows pass.
- [ ] CP5 communications/search pass.
- [ ] CP6 public experience passes.
- [ ] CP7 release candidate checks pass. The release candidate build, typecheck, lint, catalog, focused contracts, 52 public captures, 26 focused state screenshots, and 8 metadata browser checks passed. CP7 remains open for unavailable populated demo/PKA data, broad 307-route role/state coverage, and unexercised live external-provider/cache behavior; 297 route records remain not run.
- [ ] CP8 staging/production rollout and closeout pass. No deployment is authorized. Read-only inspection found staging migration 0098 pending; no migration or deployment was performed.

No implementation estimates are used as acceptance criteria. Estimate each batch after CP0 identifies the actual shared-component reuse and baseline failures. If time is constrained, release named intermediate milestones honestly while keeping the final app-completion checklist open.
