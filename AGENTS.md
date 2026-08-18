# Agent instructions for Zyx Academy

This file contains durable rules for work in this repository. Read the relevant sections before acting, but use source code and `docs/` as the authority for current feature behavior and deployment status. Do not treat this file as a release ledger.

## Naming and writing

- The brand is **Zyx**, never `ZYX`, except in literal filesystem paths.
- Token prefixes use `Zyx-XXXXXXXX-{capacity}-{courseIds.length}`.
- Use short, sentence-case UI copy. Prefer numbers over long explanations. Do not add exclamation marks or filler descriptions.
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

- The application uses Next.js, React, Bun scripts, Drizzle, Better Auth, Turso or local SQLite, Cloudflare R2, Inngest, and Gemini provider adapters. Follow the existing adapter and environment boundaries.
- Turso is the remote database and local SQLite is the development database. Do not introduce PostgreSQL or `neon-client` for application data.
- Cloudflare R2 is the default storage provider. UploadThing remains only where its compatibility call paths still exist.
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
| Micro UI | 10 px | Only for compact status, badge, kbd, uppercase metadata, and similar non-prose elements. Add a named token before introducing another shared micro size. |

- Marketing headings must follow the 48/56 px responsive scale. Do not use raw `text-5xl`, `text-6xl`, or arbitrary heading sizes for a standard marketing heading.
- New page-level headings, tabs, controls, and descriptions must use the roles above. Do not introduce page-specific font sizes or arbitrary values without an explicit exception.
- Existing `text-body-2xs` usages are legacy debt because that token is not defined in `app/globals.css`. Do not copy them into new work; normalize them to the approved role when the surrounding surface is changed.
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
  | Tabs | `AdminTabs`, `AdminTabsList`, `AdminTabsTrigger`, `AdminTabsContent` |
  | KPI cards | `AdminStatCard` |
  | Section headings | `AdminSectionTitle` |
  | Destructive confirmation | `AdminConfirmDialog` |
  | Status and difficulty | `StatusBadge`, `DifficultyBadge`, `CourseBadge` |
  | Empty and error states | `AdminEmptyState`, `AdminErrorState` |
  | Tables | `AdminTable`, `AdminTableHead` |
  | Question option letters | `AdminOptionLetter` |

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

- For schema changes, edit `db/schema.ts`, then run `bun run db:generate` and `bun run db:migrate`. Never hand-edit generated files under `drizzle/`.
- Use `bun run db:push:prod` only for an explicitly authorized production push. Do not mutate a related-looking table or environment without tracing the actual authorization and data path.
- For remote maintenance, confirm the exact environment file and hostname, run a guarded read-only query first, and record the before and after result for any authorized write.
- Do not perform destructive data contraction, vector cutover, deployment, or feature rollout as an implicit part of a focused code task.
- Google Spreadsheet exports update the existing spreadsheet for the entity. The app owns only the explicit data block starting at A1; preserve manual rows and columns outside it. Compare the stored fingerprint and require typed conflict confirmation before overwriting manual edits. Route exports through `lib/google-sheets.ts` and `/api/admin/export-spreadsheet`.

## Documentation and validation

Update only documents made relevant or inaccurate by the change:

| Change | Document |
|---|---|
| User-facing workflow | `docs/features.md` |
| Architecture or data flow | `docs/ARCHITECTURE.md` |
| Schema | `docs/DB_SCHEMA.md` and, when setup changes, `docs/DATABASE.md` |
| Environment or commands | `docs/DEVELOPMENT.md` |
| Deployment or rollout | `docs/DEPLOYMENT.md` |
| Bundle contract | the matching file under `docs/bundle/` |
| Operational validation | `docs/operations/production-readiness-checklist.md` or the matching runbook |

After a meaningful code edit batch:

1. Run `bun run lint`.
2. Run focused tests and `bun run typecheck` when the changed surface warrants them.
3. Use `git diff --check` before handoff.
4. Run `bun run build` only when requested or when the change affects a build or runtime boundary.

Report pre-existing failures separately from regressions introduced by the change. Do not claim staging, production, visual, OAuth, or external-service success without actually exercising that boundary.

## Keeping this file maintainable

- Add a rule here only when it is durable, cross-cutting, and likely to prevent repeated mistakes.
- Put feature details, release notes, migration history, free-tier limits, and temporary blockers in the appropriate `docs/` file or Git history.
- When a current implementation changes, update the source-of-truth document and remove stale wording here. Keep this file focused on decisions an agent must know before editing.
