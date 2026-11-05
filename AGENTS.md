# Agent instructions for Zyx Academy

This file contains durable rules for work in this repository. Read the relevant sections before acting, but use source code and `docs/` as the authority for current feature behavior and deployment status. Do not treat this file as a release ledger.

## Naming and writing

- The brand is **Zyx**, never `ZYX`, except in literal filesystem paths.
- Token prefixes use `Zyx-XXXXXXXX-{capacity}-{courseIds.length}`.
- Use short, sentence-case UI copy. Prefer numbers over long explanations. Do not add exclamation marks.
- Do not use sparkle icons in UI.
- Treat filler descriptions as visible copy that only labels a self-evident demo, sample, preview, or mock; explains that static marketing content is not account or usage data; repeats a heading, card, input placeholder, or visible control; narrates an obvious click or selection; or restates values already shown next to it. Remove the copy entirely, including its wrapper, spacing, `caption`, `meta`, or reserved height.
- On landing and marketing surfaces, assume the composition already establishes demo context. Do not add labels such as "Simulasi", "Contoh", or "Pratinjau", or disclaimers such as "bukan metrik" and "bukan data pengguna", unless omitting them could cause a real safety, legal, authority, or accuracy misunderstanding.
- Keep copy when it communicates non-obvious product behavior, access or eligibility terms, a price unit users must decide on, safety or accuracy boundaries, dynamic state, required action or format, recovery guidance, or instructional content. Keep these statements as short as possible and do not duplicate a placeholder.
- Before finalizing a surface, audit nearby rendered copy for the same pattern. Do not replace removed filler with another generic caption or helper paragraph.
- Never use em dashes or en dashes in code, copy, metadata, or documentation. Use commas, semicolons, or periods instead.

## Working agreement

- Keep a change inside the requested surface. Reuse existing flows and components instead of rewriting adjacent systems.
- Check `git status --short` before editing. Preserve unrelated worktree changes. Never use reset or checkout to discard them.
- Audits and reviews are read-only unless implementation is explicitly requested.
- Before any staging, production, database, storage, Google Drive, or other external mutation, verify the exact environment and target, inspect it read-only first, and obtain explicit authorization when the action is not already part of the request.
- Distinguish verified local structure or tests from unverified runtime, visual, OAuth, staging, production, or external-service behavior.
- Do not expose secrets in source, logs, reports, or documentation. Keep environment-specific credentials in the appropriate `.env` file.

## Before changing code

1. Read `db/schema.ts` and `lib/env.ts` before changing database, environment, or server behavior.
2. For Next.js APIs, routing, or framework behavior, read the relevant guide in `node_modules/next/dist/docs/` first. This project uses Next.js 16.3 and its APIs may differ from older examples.
3. Search for an existing route, server action, helper, component, feature flag, and test before creating a new one.
4. Read the relevant document in `docs/` before changing a documented contract.
5. If a new user-facing capability or material behavior change could be always-on or flag-gated, ask before implementing it. A flag needs a key, rationale, default, scope, rollback path, owner, and removal condition. Do not add or remove a `FEATURE_*` flag silently.

## Source of truth map

| Concern | Source of truth |
|---|---|
| Documentation index and status registry | `docs/README.md` |
| Design tokens and base styles | `app/globals.css` |
| Shared UI primitives | `components/ui/` |
| Shared admin UI | `components/admin/` |
| Universal page header | `components/page-header.tsx` |
| Database schema | `db/schema.ts` and `docs/DB_SCHEMA.md` |
| Environment variables and feature flags | `lib/env.ts`, `lib/feature-flags.ts`, `docs/DEVELOPMENT.md` |
| Product behavior and workflows | `docs/features.md` |
| Data flow and boundaries | `docs/ARCHITECTURE.md` |
| Deployment and rollout | `docs/DEPLOYMENT.md` |
| Operational gates | `docs/operations/production-readiness-checklist.md` and `docs/operations/zyra-ops-runbooks.md` |
| Bundle contracts | `docs/bundle/` |
| Date handling | `lib/date-utils.ts` |
| Object storage keys | `lib/storage/keys.ts` |

## Repository invariants

- The application uses Next.js, React, Bun scripts, Drizzle, Better Auth, Inngest, and Gemini provider adapters. Follow the existing adapter and environment boundaries.
- Staging and production use separate Neon PostgreSQL branches. The adapter requires PostgreSQL, including local development and CI; it never falls back to SQLite or Turso. Verify the exact branch and environment before any database action.
- Staging and production explicitly use separate private Neon object-storage buckets with `STORAGE_PROVIDER_MODE=neon`. R2 remains the adapter default when no mode is set, not the serving production configuration. UploadThing remains only where its compatibility call paths still exist. Preserve source Turso/R2 and the rollback units in `docs/operations/neon-migration.md` and `docs/operations/neon-production-cutover.md`.
- Canonical retrieval uses the current Vectorize adapter and namespace. Do not delete legacy vector resources or change the retrieval cutover as part of an unrelated task.
- Long-running ingestion, generation, synchronization, and recomputation work should use the existing job or Inngest path rather than blocking a request.
- Reuse established KO extraction, RAG sync, question generation, quiz attempts, SM-2 flashcards, diktat, website-material, and admin AI flows unless the task explicitly changes one of them.

## UI and design system

Use the tokens and components already defined in `app/globals.css`. Prefer semantic utilities over hard-coded colors, arbitrary font stacks, and one-off styles.

### Component reuse and layout efficiency

- Before creating any UI, search the existing pages and `components/` for a reusable component or pattern. This applies to cards, search bars, select fields, filters, wrappers, tables, dialogs, buttons, tooltips, empty states, and layout shells.
- If the behavior already exists, compose or extend that implementation. If a new variant is needed, add a backwards-compatible variant to the existing component without changing the behavior of its current consumers.
- For a broadly useful component that is not already in the repository, check the installed Shadcn primitives before implementing it from scratch. Add the primitive to `components/ui/` when it is genuinely reusable. Keep niche one-off UI local to its feature.
- Before implementing a page, inspect at least one comparable page in the same surface, such as marketing, admin, or student. Follow its established component, spacing, typography, and interaction patterns unless the task explicitly changes the pattern.
- Prefer the smallest useful component. Remove decorative UI, redundant wrappers, filler descriptions, and helper text that do not improve comprehension or function.
- Optimize vertical space first. Keep related search, select, filter, and action controls in one inline row when the viewport allows it, and use the fewest rows that remain readable and accessible. Let the main content receive the available height.
- Use cards selectively. Prefer a simple padded list or section when a card would only add a border, padding, and margin around the same content. Use cards when they create a meaningful grouping, hierarchy, or interaction boundary.
- Apply less cards to every Admin, Tutor, and Student route, including detail pages, tabs, dialogs, loading states, and empty states. Use the Student `/courses` catalogue and its document and video lists as density references. Inspect the rendered feature components as well as the page file.
- Less cards does not mean no cards. Keep a small number of clear section surfaces, such as Admin dashboard categories, editor groups, or independent tasks. Put repeated records inside one shared surface as divided rows or a table instead of one card per record. Do not put decorative cards inside another card.
- Remove redundant wrappers and repeated headings before reducing padding or text size. Keep readable typography, touch targets, keyboard focus, and useful whitespace. Let toolbars wrap and long labels wrap on narrow screens instead of clipping essential information.
- Apply minimal copy to every role and state. Delete self-evident page subtitles, repeated action instructions, decorative counts, and captions that restate a visible label or value. Preserve learning content, access terms, units, validation, destructive consequences, dynamic status, and recovery guidance. Never replace removed copy with another generic sentence.
- Prefer an existing Shadcn primitive or shared feature component for each interaction. Keep component behavior and accessibility intact when simplifying its surface; do not replace controls with styled native elements just to reduce markup.
- Prefer compact controls for frequent actions. Use an icon-only button with an accessible `aria-label` and the existing `Tooltip` primitive when the icon is unambiguous. Use an overflow menu for secondary actions instead of a row of verbose buttons. Do not hide primary or ambiguous actions behind an icon without a visible label.

### Typography standard

The following visual sizes are the approved cross-surface baseline. Keep semantic HTML separate from visual size. For example, `PageHeader` remains an `h1` element while using the compact page-title size.

| Role | Standard | Token or implementation |
|---|---:|---|
| Marketing hero H1 | 56 px | `text-h1`; responsive marketing hero uses `text-h2 md:text-h1`, 48 to 56 px |
| Marketing hero H2 | 48 px | `text-h2` |
| Product page title | 24 px | `font-heading text-h5`; use `PageHeader` |
| App section title | 16 px | `font-heading text-body-base font-bold`; follow the compact Student dashboard pattern |
| Dense card or subsection title | 14 px | `font-heading text-body-sm` when a 16 px section title is too large |
| Main body text | 16 px | `text-body-base` |
| Primary sidebar items, inputs, selects, and buttons | 14 px | `text-body-sm`; use the semantic token instead of raw `text-sm` |
| Field labels | 14 px | `text-body-sm font-semibold` |
| Tabs, supportive text, descriptions, and helper text | 12 px | `text-body-xs` |
| Micro UI | 10 px | `text-body-2xs`; only for compact status, badge, kbd, uppercase metadata, and similar non-prose elements. |

- Marketing headings must follow the 48/56 px responsive scale. Do not use raw `text-5xl`, `text-6xl`, or arbitrary heading sizes for a standard marketing heading.
- New page-level headings, tabs, controls, and descriptions must use the roles above. Do not introduce page-specific font sizes or arbitrary values without an explicit exception.
- Use `text-body-2xs` (10 px) only for compact status, badge, kbd, uppercase metadata, and similar non-prose elements. Do not use it for readable prose or form controls.
- Use a smaller size only when the information is genuinely metadata or a compact status. Do not make primary navigation, form controls, or readable prose smaller for visual density.

- Body and UI text use `font-sans`; headings use `font-heading`. Use `text-body-*` and `text-h*` when an explicit scale is needed.
- Prefer `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `bg-primary`, `border-border`, and the `status-*` tokens. Use brand tokens for intentional marketing or accent treatment.
- Use the existing `photo-hero`, `photo-card`, `photo-banner`, `photo-thumb`, and `photo-inline` classes for imagery. Prefer `next/image` with explicit dimensions or a sized `fill` container.
- Use `PageHeader` from `@/components/page-header` for every Admin and Student page header. Do not hand-roll a page header or add an obvious subtitle.
- Use Shadcn primitives from `components/ui/`. If a primitive is missing, add a reusable component there instead of using a raw control throughout a page.
- Admin pages should use the shared components in `components/admin/` when the pattern fits:

  | Need | Component |
  |---|---|
  | Header | `PageHeader` or `AdminPageHeader` |
  | Tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `components/ui/tabs.tsx` |
  | KPI cards | `AdminStatCard` or `AdminStatStrip`/`AdminStatStripItem` |
  | Section headings | `AdminSectionTitle` |
  | Destructive confirmation | `AdminConfirmDialog` |
  | Status and difficulty | `StatusBadge`, `DifficultyBadge`, `CourseBadge` |
  | Empty and error states | `AdminEmptyState`, `AdminErrorState` |
  | Tables | `AdminTable`, `AdminTableHead` |
  | Question option letters | `AdminOptionLetter` |

### State-invariant typography

- Interactive controls (selects, inputs, buttons, combobox triggers) must use `text-body-sm` at all states. Never change font size or font weight between selected/unselected, checked/unchecked, active/inactive, or open/closed states. State changes may only affect color, background, border, or icon.
- Checkbox and combobox list-item labels must keep the same font size and weight across checked and unchecked states. Changing `font-medium` on selection is a bug.
- Badges, prose, relationship rows, and descriptive metadata retain `text-body-xs` even when nearby controls use `text-body-sm`. Do not widen badge or prose typography as a side effect of fixing control typography.

### Tabs and route transitions

- `components/ui/tabs.tsx` is the only reusable content-tab primitive. Do not create surface-specific wrappers such as Admin or Tutor tabs, and do not hand-roll a button group that behaves as tabs.
- Page-level tabs use the compact content-width strip: `bg-muted/40`, a border, `rounded-xl`, wrapping items, and active triggers with `bg-card` plus `shadow-xs`. Do not make tab lists or triggers fill the available width with `w-full`, `flex-1`, grids, or equal-width columns.
- Page-level tab state must be URL-addressable. Use `useUrlTab` for controlled tabs, or the built-in `defaultValue` URL synchronization in `Tabs`. Give nested tab sets distinct `paramKey` values so they cannot overwrite each other.
- Small transient widgets such as popovers and editor palettes may keep local state, but must use the same `Tabs` primitive with `syncUrl={false}` so they do not pollute the page URL.
- Numeric tab badges are reserved for actionable state such as pending review work, validation issues, or a live selection count. Do not add totals merely to decorate content categories, history, catalog, or roster tabs.
- `PageTransition` is applied by `ApplicationShell` and `SiteMain`, so Admin, Tutor, Student, and Marketing page content share the same route entrance and reduced-motion behavior. Do not add another page-level transition wrapper. Use `Reveal` only for deliberate section-level scroll entrance.

### Inline responsive filter toolbars

- Keep related search, select, filter, and action controls in one inline row when the viewport allows it. Use `flex flex-wrap items-center gap-2` on the toolbar container and `shrink-0` on fixed-width controls.
- Set `min-w` on the search input low enough that the toolbar wraps cleanly at 380px without horizontal overflow. Prefer `min-w-[140px]` over wider values for two-control toolbars.
- When a toolbar has more than two fixed-width controls, allow the controls group to wrap independently with `flex-wrap`.

### Grouped KPI strips

- Use `AdminStatStrip` and `AdminStatStripItem` from `components/admin/stat-card` for grouped KPI metrics on admin pages. Do not create local stat-card variants or nest `AdminStatCard` inside a grid for the same purpose.
- KPI strip labels use `text-body-sm`. KPI values use `font-heading text-h5`. KPI captions use `text-body-xs`. Do not change these across states.

### Dialog and modal surface gating

- Student-facing modals, onboarding prompts, feedback popups, and browser permission requests (such as push notification permission) must never mount on Admin surfaces (`app/(admin)`).
- Global layout components that trigger interactive modals must explicitly verify the user role (`role !== 'admin'`) and surface route before mounting.
- Admin pages must remain free from blocking consumer-facing popups.

### Defensive media, images, and fallbacks

- Never render raw `<img>` tags for user uploads or remote storage objects without error handling and fallback UI.
- When a media object fails to load (such as a 500 error from storage proxy or a missing object key), display a structured fallback component (for example a status badge "Bukti Belum Tersedia" or a styled thumbnail placeholder), never a raw broken browser image icon.
- Use standard Lucide React icons instead of raw Unicode glyphs or special symbols that risk rendering as unrendered box characters `[]` across different operating systems.

### Error state presentation and sanitization

- Never expose raw JSON error objects (such as OAuth refresh failures) or raw internal backend enum strings (such as `PRODUCT_BUNDLE_VALIDATION_FAILED`) directly to user-facing UI.
- Use `AdminErrorState` or structured error banners with human-readable Indonesian copy explaining the issue, along with an actionable recovery button (such as "Hubungkan Ulang Akun", "Periksa Format Berkas", or "Coba Lagi").
- Distinguish between client validation errors, permission denials, and server connectivity failures with appropriate UI treatments.

### Mandatory empty states and data integrity

- Never render bare unstyled text floating in empty space (such as plain text "Belum ada data") when a list or table is empty. Always use `AdminEmptyState` with a relevant icon, title, description, and primary action button where applicable.
- Table metric cells must never be left blank. Render a formatted zero, `-`, or `N/A` with consistent alignment.

### Table headers, navigation labels, and density

- Table headers (`AdminTableHead`, `<th>`) must use sentence-case (for example "Token string", "Kapasitas kelompok", "Tanggal kedaluwarsa"). Never use all-caps uppercase table headers.
- Sidebar navigation labels must be concise enough to fit within the standard desktop sidebar without ugly ellipsis truncation. When badges (such as `BETA`) are present, keep the preceding text short so both label and badge remain legible.
- Do not use unstyled native browser controls such as `<input type="file">`. Use styled upload dropzones or button triggers from the design system.
- Long lists containing heavy rendering elements (such as LaTeX mathematical formulas in Question Bank) must use pagination or a compact row mode instead of rendering unbounded lists into the DOM.

### Apples-to-apples ranking

- Overview or cross-course aggregate views must never rank individual students across courses. Per-course or single-course views may rank students.
- When an overview aggregates metrics per entity (e.g. per course), include all entities eligible for the view from the source table, even those with zero activity, so the administrator sees the full scope.
- Sort overview rows alphabetically by entity label unless an explicit metric sort is requested.
- Count unique users across the visible set using a single Set, not by summing per-entity unique counts which double-count shared users.
- Do not use pill-shaped UI. `rounded-full` is allowed only for a true 1:1 circle such as an avatar or status dot. Use `rounded-md` or `rounded-lg` for controls and badges, and `rounded-xl` or larger for structured cards.
- Do not create nested cards, local stat-card variants, new fonts, purple themes, or gradient backgrounds. `PageOrnaments` radial glows are the exception.
- Dense admin and lesson-reader surfaces may skip `PageOrnaments`. Marketing and other standalone pages should use an existing ornament variant inside `relative overflow-hidden`.
- Prefer semantic dark-mode tokens. Test responsive layouts at 380px when the change affects UI. Use `Reveal` for scroll entrance on non-admin pages and respect reduced motion.

## Date and time handling

All date logic belongs in `lib/date-utils.ts` and uses `date-fns` v4.

| Need | Use |
|---|---|
| Raw SQLite timestamp to `Date` | `normalizeDate(value)` |
| UTC date string for DB text, keys, or windows | `todayUtc()`, `yesterdayUtc()`, `formatIsoDateUtc()` |
| Local display date | `formatIsoDate(date)` |
| `datetime-local` form value | `formatDatetimeLocal(date)` |
| Start of day | `startOfDay()` or `startOfDayUtc()` |
| Date arithmetic | `daysAgo()`, `daysFrom()`, `weeksAgo()`, `previousWeekRange()` |
| Jakarta business-day boundaries | `jakartaDay()`, `startOfJakartaDayUtc()`, `nextJakartaReset()` |
| Numeric DB timestamp to ISO | `toIsoTimestamp(value)` |

Do not hand-roll `yyyy-MM-dd`, `datetime-local`, start-of-day, or date arithmetic. Do not use `new Date().toISOString().slice(0, 10)`, `setDate`, or `setUTCDate` for these cases. Pass raw SQLite integers through `normalizeDate()`. Client components that render dates should use `FormattedDate` or the same UTC-on-server and local-on-client pattern.

## Object storage and R2 keys

Build every new object key through `lib/storage/keys.ts`. Do not duplicate slug, filename, or path sanitization in routes, actions, or components.

- Use the shape `{domain}/{entity-slug}/{subfolder...}/{leaf}`.
- User-upload leaves use `userFileLeaf()`, preserving the sanitized original filename after a timestamp and short hash. Managed media may use `mediaLeaf()` according to the existing Media Library contract.
- Reject empty, leading-slash, backslash, or `..` keys with `assertSafeKey()` or `assertSafeObjectKey()`. The provider must throw `INVALID_OBJECT_KEY` for unsafe keys.
- `R2Provider.upload()` requires an explicit key. It must not fall back to a UUID or generated filename.
- Storage proxy downloads use `leafFilename(key)` for `Content-Disposition`.
- Existing legacy objects remain readable in place. New writes use the current convention.

Common prefixes:

| Use | Prefix or builder |
|---|---|
| Course material PDF | `courses/{course-slug}/materials/{leaf}` |
| Course canonical Markdown | `courses/{course-slug}/canonical/{leaf}` |
| Generic admin upload | `uploads/{yyyy}/{mm}/{leaf}` |
| Blog media | `blog/{timestamp}-{hash}-{filename}` |
| Form uploads | `forms/{form-slug}/question-{n}/{leaf}` via `buildFormStorageKey()` |
| PKA proof | `pka/{userId}/proofs/{leaf}` |
| Media Library | `media/{folderPath}/{leaf}` via `buildMediaKey()` |
| Idea bundle | `overhaul/idea-bundles/{runId}/{bundleId}-{checksum16}.zip` |
| Product bundle | `overhaul/product-bundles/{runId}/{bundleId}-{checksum16}.zip` |
| Authoring Context Pack | `overhaul/{runId}/authoring-context/{packId}.zip` |
| Zyra attachment | `zyx-attachments/{yyyy-MM-dd}/{attachmentId}.{extension}` via `buildZyraAttachmentKey()` |

## AI, quota, and feature boundaries

- Spend AI quota only on tutoring, mistake feedback, and content generation. Recommendations, streaks, study paths, reflections, analytics, and other deterministic features must use SQL and rules.
- Keep provider routing, allowance accounting, cache isolation, provenance, and assessment redaction in their existing modules. Do not bypass those boundaries from a new route or component.
- Use feature flags only for genuinely optional, risky, expensive, environment-specific, or reversible behavior. Stable foundational behavior should be always-on.
- A temporary migration or provider flag needs an owner, explicit rollback, expiry or removal issue, and a decision about whether it belongs in the admin catalog.

## Database and external mutations

- For schema changes, edit `db/schema.ts`, then run `bun run db:generate` and `bun run db:migrate` against a verified authorized target. Never hand-edit generated files under `drizzle/` or `drizzle-postgres/`.
- Use `bun run db:push:prod` only for an explicitly authorized production push. Do not mutate a related-looking table or environment without tracing the actual authorization and data path.
- For remote maintenance, confirm the exact environment file and hostname, run a guarded read-only query first, and record the before and after result for any authorized write.
- Do not perform destructive data contraction, vector cutover, deployment, or feature rollout as an implicit part of a focused code task.
- Google Spreadsheet exports update the existing spreadsheet for the entity. The app owns only the explicit data block starting at A1; preserve manual rows and columns outside it. Compare the stored fingerprint and require typed conflict confirmation before overwriting manual edits. Route exports through `lib/google-sheets.ts` and `/api/admin/export-spreadsheet`.

## Visual capture dengan sesi staging

Untuk screenshot halaman terproteksi (misal audit visual `/admin`) terhadap data staging, ikuti prosedur di `docs/operations/visual-audit-capture.md`. Jangan bereksperimen dari nol. Aturan yang paling sering salah dan sudah ditetapkan di sana:

- Gunakan build produksi (`next build` + `next start`) dengan env staging yang sudah diverifikasi. Staging kini memakai Neon PostgreSQL; instruksi Turso lama bukan konfigurasi staging aktif.
- Sesi didapat read-only dengan pola `scripts/staging/smoke-auth.ts`: SELECT satu sesi admin aktif, tandatangani cookie secara lokal. Tidak ada mutasi database.
- Token sesi bisa dirotasi pengguna staging yang aktif. Ambil token segar tepat sebelum setiap navigasi dan pakai sekali.
- Nama cookie (`better-auth.session_token` vs `__Secure-...`) ditentukan lewat probe `get-session`, bukan ditebak.
- Jangan pernah mencetak isi `.env.staging`, token, atau nilai cookie. Simpan screenshot di `artifacts/` dan matikan server lokal setelah selesai.


## Documentation and validation

Update only documents made relevant or inaccurate by the change:

| Change | Document |
|---|---|
| Documentation hierarchy or status change | `docs/README.md` |
| User-facing workflow | `docs/features.md` |
| Architecture or data flow | `docs/ARCHITECTURE.md` |
| Schema | `docs/DB_SCHEMA.md` and, when setup changes, `docs/DATABASE.md` |
| Environment or commands | `docs/DEVELOPMENT.md` |
| Deployment or rollout | `docs/DEPLOYMENT.md` |
| Bundle contract | the matching file under `docs/bundle/` |
| Operational validation | `docs/operations/production-readiness-checklist.md` or the matching runbook |

Documentation index maintenance:

- Whenever creating, modifying, renaming, or deleting any `.md` file under `docs/` or `plans/`, update `docs/README.md` in the same change to keep the master documentation hierarchy and lifecycle status registry accurate.
- Maintain explicit status tags for every document (`ACTIVE`, `TRANSITIONAL / LEGACY`, `HISTORICAL CHECKPOINT`, `OPEN / IN PROGRESS`, `COMPLETED / RESOLVED`).
- When an audit is added, record it under `docs/audit/` and mark it `OPEN / IN PROGRESS`. When all findings are fixed and verified, retire the obsolete audit file and record its resolution in `docs/README.md`.

Validation should be pragmatic and proportional:

- Do not run `bun run lint` or `bun run typecheck` for minor edits, documentation, UI tweaks, or non-crucial changes.
- Run `bun run lint` and `bun run typecheck` only when changes are substantial, complex, cross-cutting (e.g. database schema, core library changes, widespread refactors), or when explicitly requested.
- Run focused tests when the changed logic warrants them.
- Use `git diff --check` before handoff when verifying whitespace or formatting.
- Run `bun run build` only when requested or when the change affects a build or runtime boundary.

Report pre-existing failures separately from regressions introduced by the change. Do not claim staging, production, visual, OAuth, or external-service success without actually exercising that boundary.

### Visual quality checks with Playwright

Visual quality sign-off is a primary-agent responsibility. The primary agent must personally run the Playwright check, open and inspect every required screenshot, compare the result with the requested behavior and nearby established UI, and report the evidence. Do not hand off execution, screenshot inspection, or the final visual judgment to a worker, subagent, or another model. A worker may implement UI code, but its claim that the UI looks correct is not evidence of visual verification.

Run a visual quality check for every new user-facing feature and for any frontend change that materially affects layout, navigation, responsive behavior, typography, color, spacing, imagery, or interactive state. Small copy-only changes that cannot alter layout, non-UI work, and test-only changes are exempt. When uncertain whether a change is material, run the check.

Use this process:

1. Run `bun run test:visual:install` once when Chromium or its system libraries are unavailable.
2. Identify every changed route and every changed state before running the check. Use deterministic local data or an explicitly authorized non-production environment. Never use production credentials or personal data for screenshots.
3. Run `VISUAL_CHECK_PATHS=/route-one,/route-two bun run test:visual`. Use `PLAYWRIGHT_BASE_URL` only to target an already-running authorized environment. Use `PLAYWRIGHT_STORAGE_STATE` only with a local, ignored authentication state file that contains no production session.
4. The default check must produce and inspect screenshots at 380 by 844 and 1536 by 864. The 1536 by 864 viewport represents the effective CSS workspace of a common 1920 by 1080 laptop display at 125 percent scaling. If the changed behavior has a breakpoint between those widths, add a focused Playwright spec and inspect the affected breakpoint too.
5. For changed interactive UI, add or update a focused spec under `tests/visual/` that captures every affected state, such as closed and open, empty and populated, loading and complete, validation error and success, or enabled and disabled. Do not treat the default route screenshot as sufficient for stateful UI.
6. Open every screenshot from `artifacts/visual-quality/results/` directly as the primary agent. The HTML report at `artifacts/visual-quality/report/` is supporting evidence, not a replacement for direct image inspection.
7. Fix failures and rerun the same route, state, and viewport set until it passes. Do not accept a new screenshot merely because the UI change was intentional.

A visual quality check passes only when all of these criteria are met:

- Each required route and state has one inspected screenshot at every required viewport.
- Playwright reports zero HTTP responses with status 400 or higher, zero unexpected route redirects, zero uncaught page errors, and zero console errors attributable to the change.
- `document.documentElement.scrollWidth` does not exceed `clientWidth` at any checked viewport.
- No content is clipped, overlapped, unintentionally hidden, or pushed outside its container. No text or control is truncated unless the established component intentionally truncates it.
- Typography, spacing, colors, radii, imagery, and component choice follow the tokens and reuse rules in this file and match the surrounding product surface.
- The primary action, reading order, hierarchy, and state changes are visually clear. Changed controls retain visible labels or accessible icon treatment and a visible keyboard focus state.
- Loading, empty, error, success, open, selected, and disabled states touched by the change remain distinguishable without layout jumps that obscure or displace the task.
- The primary agent records the command, exit status, inspected route and state matrix, viewport list, screenshot paths, and any boundary that could not be verified in the final handoff.

The generic runner in `tests/visual/visual-check.spec.ts` captures default route states and enforces HTTP, redirect, runtime-error, and horizontal-overflow gates. It does not replace feature-specific interaction specs or human visual judgment. Keep generated reports, traces, and screenshots under ignored `artifacts/visual-quality/`; do not commit them unless the user explicitly requests a baseline artifact.

## Multi-model worker delegation

When the task involves global multi-model delegation (e.g., parallel subagents or worker dispatch), the delegating agent must:

1. Request validation commands (`bun run lint`, `bun run typecheck`, `bun run build`) only when the delegated worker's changes are crucial, broad, or explicitly require verification. For small or non-crucial edits, workers do not need to run full validation suites.
2. When validation is requested, record every command exit status and failure output. A zero exit code is success; non-zero is failure.
3. Do not declare the task complete until requested validation passes or failures are explicitly reported with their exit codes.

If a worker is asked to validate but cannot run a command (missing binary, environment issue), it must report the failure with the reason and a non-zero exit status.

## Keeping this file maintainable

- Add a rule here only when it is durable, cross-cutting, and likely to prevent repeated mistakes.
- Put feature details, release notes, migration history, free-tier limits, and temporary blockers in the appropriate `docs/` file or Git history.
- When a current implementation changes, update the source-of-truth document and remove stale wording here. Keep this file focused on decisions an agent must know before editing.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
