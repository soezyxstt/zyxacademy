<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes ; APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Codebase Preview Reminder

> [!IMPORTANT]
> **READ BEFORE WRITING CODE**: This file is the authoritative source for project state, architecture, design system, and execution rules. Skim the full file before starting work.

# Brand naming

- The brand name is always written as **Zyx** (capitalized first letter, lowercase `yx`). Never `ZYX` (all-caps) except in literal filesystem paths.
- Token prefixes use the same casing: `Zyx-XXXXXXXX-{capacity}-{courseIds.length}`.

# Zyx design system (agents)

Authoritative tokens live in `app/globals.css` (`@theme inline`, `:root`, `.dark`, `@layer base`, `@layer components`). Prefer **semantic Tailwind utilities** that map to those tokens over hard-coded hex or ad hoc font stacks.

---

## Typography

### Font families

| Role | Font | Tailwind | Notes |
|------|------|----------|--------|
| **Body, UI, captions** | **Inter** (Google Fonts) | `font-sans` | Default on `body`. Use for paragraphs, labels, nav links, buttons, form text, tables. |
| **Headings & display titles** | **Lexend** (Google Fonts) | `font-heading` | Use for `h1`-`h6`, sheet titles, footer section titles, any large title that should feel “brand heading.” |

`next/font` exposes `--font-inter` and `--font-lexend` on `<html>`; `@theme` maps `font-sans` / `font-heading` to those variables.

### Heading scale (Lexend, line height = **1.1 × font size**)

Use the matching **`text-h*`** utility (or bare `h1`-`h6`, which are pre-styled in `@layer base`).

| Level | Size | Line height | Weight (base styles) |
|-------|------|-------------|------------------------|
| H1 | 56px | 61.6px | `font-bold` |
| H2 | 48px | 52.8px | `font-bold` |
| H3 | 40px | 44px | `font-bold` |
| H4 | 32px | 35.2px | `font-semibold` |
| H5 | 24px | 26.4px | `font-semibold` |
| H6 | 20px | 22px | `font-semibold` |

**When to use which**

- **H1**: Page title (one per page), hero main headline.
- **H2**: Major sections within a page.
- **H3**: Subsections, card titles on large cards.
- **H4**: Group labels, dialog section titles, dense layouts.
- **H5**: Mobile nav / compact headings, smaller section labels.
- **H6**: Eyebrows, smallest heading level; prefer **body + semibold** if it is not really a heading (accessibility).

If you need a heading **size** without a semantic heading (rare), use `font-heading` plus the right `text-h*` on a `div`/`span` and add an accessible pattern (e.g. `role="heading"` + `aria-level` only when appropriate).

### Body scale (Inter, line height = **1.4 × font size**)

| Name | Size | Line height | Typical use |
|------|------|-------------|-------------|
| `text-body-lg` | 20px | 28px | Lead paragraphs, hero subcopy, emphasized body |
| `text-body-md` | 18px | 25.2px | Secondary emphasis, large readable UI |
| `text-body-base` | 16px | 22.4px | **Default body** (`body` and `p` use this) |
| `text-body-sm` | 14px | 19.6px | Meta, captions, helper text, compact nav |

**Paragraphs**: Plain `<p>` uses `text-body-base`. Consecutive paragraphs get **`margin-top: 1em`** on the second and following (`p + p`) for vertical rhythm.

**Bold vs regular**: Use `font-medium` / `font-semibold` / `font-bold` on top of body utilities per design; the brand PDF labels “Large Text Bold,” etc.; map those to the same `text-body-*` size with the right weight.

---

## Color

Tailwind maps each `--color-*` token to utilities: **`text-{name}`**, **`bg-{name}`**, **`border-{name}`**, etc. (e.g. `text-brand-primary`, `bg-muted`, `border-border`).

### Semantic UI (Shadcn) ; prefer these in components

These adapt in **light** and **dark** via `:root` / `.dark`. Use them for layout, text hierarchy, and interactive states.

| Token / utility | Use |
|-----------------|-----|
| `bg-background` / `text-foreground` | Page surface and primary text. |
| `bg-card` / `text-card-foreground` | Cards and elevated panels. |
| `bg-popover` / `text-popover-foreground` | Popovers, dropdown surfaces. |
| `bg-muted` / `text-muted-foreground` | Subtle fills; **secondary / de-emphasized text** (descriptions, footers, hints). |
| `bg-primary` / `text-primary-foreground` | **Primary actions** (fills, key CTAs when using default button). |
| `bg-secondary` / `text-secondary-foreground` | Secondary surfaces (not the orange brand color; see below). |
| `border-border` | Default borders and dividers. |
| `bg-input` / `border-input` | Form fields (with Shadcn input patterns). |
| `ring` / `focus-visible:ring-*` | Focus rings. |
| `text-destructive` / destructive buttons | Errors and destructive actions. |

Charts use `chart-1` … `chart-5` (mapped in theme).

### Brand and accent (fixed palette ; use for marketing, badges, illustration)

| Utility | Role |
|---------|------|
| `brand-primary` | Primary brand blue (same hue as `--primary` in light/dark). Nav emphasis, logo-adjacent accents, “on brand” highlights. |
| `brand-secondary` | Brand orange; alternate CTA emphasis, warm accents. |
| `tertiary-1` … `tertiary-3` | Teal, yellow, light blue accents; sparingly (tags, charts, icons). |
| `status-info` / `status-success` / `status-warning` / `status-error` | Alerts, toasts, form validation messaging (e.g. `text-status-error`, `bg-status-success/10`). |

### Raw neutrals (from brand spec ; use when semantic tokens are not enough)

| Utility | Approx. | Use |
|---------|-----------|-----|
| `black-1` | Pure black | Rare; max contrast elements. |
| `black-2` | Near black | Dark mode base background (also drives `--background` in `.dark`). |
| `black-3` | Dark gray | Dark mode cards / layers. |
| `white` | White | Light backgrounds, inverse text on dark buttons. |
| `gray-1` … `gray-5` | Full gray ramp | Manual borders, diagrams, or Figma parity when you must reference the PDF scale. |

**Guidance**

- Prefer **`text-foreground`** for primary copy and **`text-muted-foreground`** for supporting copy instead of raw `gray-*` or default Tailwind neutrals.
- Primary buttons in product UI can use **`bg-primary`** (aligned with brand blue) or **`bg-brand-primary`** where the codebase already does; keep hover/focus consistent.
- **Dark mode**: Same brand hues; backgrounds and borders shift to **Black 2 / Black 3** and **Gray 2**-style borders via semantic tokens; do not invent new grays.

---

## Photography & imagery

Use the **`photo-*`** classes on `<img>` or `next/image` for consistent crop, radius, and aspect ratio. They assume **`object-fit: cover`** and centered focal point.

| Class | Aspect | Radius | When to use |
|-------|--------|--------|-------------|
| `photo-hero` | 16:9 (`--aspect-photo-hero`) | `--radius-photo-lg` | Full-width hero, large feature media above the fold. |
| `photo-card` | 4:3 (`--aspect-photo-card`) | `--radius-photo` | Card thumbnails, course tiles, article previews. |
| `photo-banner` | 21:9 (`--aspect-photo-banner`) | `--radius-photo-lg` | Slim full-width strips, cinematic headers. |
| `photo-thumb` | 1:1 | `--radius-md` | Avatars, small square tiles. |
| `photo-inline` | *(none ; intrinsic)* | `--radius-photo` | Inline images in articles; set `width`/`height` or max-width in the layout as needed. |

**Rules of thumb**

- Prefer **`next/image`** with explicit `width` / `height` (or `fill` in a sized container) for LCP and layout stability.
- Hero and card images should **fill** their container; use `photo-*` so cropping is predictable.
- For light borders on images, use `ring-1 ring-border` or a subtle `shadow-sm` if the design calls for separation; avoid random box-shadow values.

---

## Pills & Radius Constraints

- **No Pills**: Do NOT use pill-shaped designs (elongated elements with `rounded-full` border radius, such as pill badges, toggle pills, or pill buttons). The site owner hates pills. Avoid `rounded-full` for any non-circular elements.
- **Valid Border Radii**:
 - Buttons and interactive items: default to `rounded-lg` or `rounded-md` based on size.
 - Badges/tags: use `rounded-md` or `rounded` instead of `rounded-full`.
 - Cards/panels: use `rounded-xl`, `rounded-2xl`, or `rounded-3xl` as structured.
 - Perfect circles (e.g., avatars, 1:1 status dots, 1:1 icon containers, checkbox/radio indicators) may still use `rounded-full` as they are circles, not elongated "pills".

---

## Quick checklist for new UI

1. **Text**: Default to **`text-body-base`** / `font-sans`; headings **`font-heading`** + **`text-h*`** or semantic `h1`-`h6`.
2. **Color**: **`foreground` / `muted-foreground` / `primary` / `border`** before raw brand or `gray-*`.
3. **Images**: Pick **`photo-hero` | `photo-card` | `photo-banner` | `photo-thumb` | `photo-inline`** by layout role.
4. **Dark mode**: Test with **`.dark`**; rely on semantic tokens so components stay consistent.

---

## No Em/En Dashes

- Never use em dashes or en dashes (long hyphen characters) in any file. Use `;`, `,`, or `.` instead. This applies to code comments, UI copy, metadata descriptions, and documentation.

---

## Date & Time Handling

All date/time utilities live in **`lib/date-utils.ts`**. The library is `date-fns` (v4). Never hand-roll date formatting or arithmetic.

### SQLite / Turso date storage

SQLite stores dates as **integer epoch seconds**. Drizzle ORM's `{ mode: "timestamp" }` converts automatically, but raw `sql` queries can leak raw integers. The `normalizeDate()` adapter handles the seconds-vs-milliseconds ambiguity (detects year > 3000 and divides by 1000). Always pass raw SQLite integer timestamps through `normalizeDate()` before using them as Date objects.

### DB text columns for date-only values

Some tables store `yyyy-MM-dd` strings in `text()` columns (streaks, recommendations, analytics snapshots). Use `todayUtc()` or `formatIsoDate(date)` to produce these strings. Never use `toISOString().slice(0, 10)` or `toISOString().split("T")[0]` inline.

### Mandatory imports (never duplicate these)

| Need | Import from `@/lib/date-utils` | Notes |
|------|--------------------------------|-------|
| SQLite integer → Date | `normalizeDate(value)` | Safe for Date, string, or number input |
| Today as `yyyy-MM-dd` UTC | `todayUtc()` | For DB text columns, KV keys, rate-limit windows |
| Yesterday as `yyyy-MM-dd` UTC | `yesterdayUtc()` | For streak comparisons |
| Format Date → `yyyy-MM-dd` (local) | `formatIsoDate(date)` | Display labels, date-only DB columns |
| Format Date → `yyyy-MM-dd` (UTC) | `formatIsoDateUtc(date)` | When UTC components are needed explicitly |
| Format → `yyyy-MM-dd'T'HH:mm` | `formatDatetimeLocal(d)` | `<input type="datetime-local">` values |
| Numeric DB timestamp → ISO string | `toIsoTimestamp(val)` | Returns null for falsy/zero |
| Start of day (local) | `startOfDay(date?)` | For query boundaries in local time |
| Start of day (UTC) | `startOfDayUtc(date?)` | For query boundaries in UTC |
| N days ago | `daysAgo(n, from?)` | Date arithmetic without `setDate()` |
| N weeks ago | `weeksAgo(n, from?)` | Date arithmetic without manual offsets |
| Previous Mon–Sun range | `previousWeekRange(now?)` | Returns `{ monday, sunday }` with correct boundaries |

### Rules

1. **Never hand-roll `yyyy-MM-dd` formatting.** Use `formatIsoDate()` or `todayUtc()`.
2. **Never hand-roll `datetime-local` strings.** Use `formatDatetimeLocal()`.
3. **Never do `new Date().toISOString().slice(0, 10)`.** Use `todayUtc()`.
4. **Never use `setDate(getDate() - N)` or `setUTCDate(getUTCDate() - N)`.** Use `daysAgo(N)`.
5. **Never use `new Date(y, m, d, 0, 0, 0, 0)` for start-of-day.** Use `startOfDay()` or `startOfDayUtc()`.
6. **SQLite `strftime` in raw SQL** is acceptable for server-side queries (e.g. `strftime('%Y-%m-%d', datetime(col, 'unixepoch'))`), but prefer Drizzle's typed query builder when possible.
7. **UTC vs local**: Use UTC functions (`todayUtc`, `startOfDayUtc`, `formatIsoDateUtc`) for DB text columns and server-side logic. Use local functions (`formatIsoDate`, `formatDatetimeLocal`, `startOfDay`) for UI display and form inputs.
8. **Hydration safety**: Client components rendering dates must use the `FormattedDate` component (`components/ui/formatted-date.tsx`) or implement the same UTC-on-server / local-on-client pattern to avoid hydration mismatches.

---

## Execution Rules

1. Before writing code, read `db/schema.ts` and `lib/env.ts` for current schema/env state.
2. DB changes: edit `db/schema.ts` only, then `bun run db:generate` then `bun run db:migrate`. Never hand-edit `drizzle/`. Production push: `bun run db:push:prod`.
3. After every meaningful edit batch: `bun run lint`. Do not run `bun run build` unless there are breaking changes or it is explicitly requested by the user. Both must pass with zero new errors before the next step when run.
4. Every feature ships behind the `FEATURE_*` env flag named in `lib/env.ts`. Flag absent or `"0"` = invisible.
5. Already built, DO NOT REBUILD: KO extraction, RAG sync, question generation, quiz attempts, SM-2 flashcards, diktat PDFs, website materials, admin AI portal.
6. AI quota is spent only on tutoring, mistake feedback, and content generation. Streaks, recommendations, study paths, reflections, analytics are deterministic SQL + rules.
7. UI copy: short labels, sentence case, numbers over sentences. No exclamation marks, no filler, no em/en dashes.
8. **Auto-update docs**: Every time you add a new feature, table, env flag, or change core architecture, you MUST update the relevant docs in `docs/`:
   - `docs/features.md` for user-facing features and workflows
   - `docs/ARCHITECTURE.md` for architecture, tables, data flow, and diagrams
   - `docs/DB_SCHEMA.md` for new/removed tables and changed columns
   - `docs/DEVELOPMENT.md` for new env vars, feature flags, or dev commands
   - `docs/DEPLOYMENT.md` for deployment changes or new services
   - `docs/bundle/*` for bundle spec changes
   - `lib/env.ts` for new FEATURE_* flags
   - `docs/operations/production-readiness-checklist.md` for new validation steps
   - `AGENTS.md` Current State section for completed/verified/blocker items
   Scan `docs/` for any file whose content is made incomplete or inaccurate by the change and update it.

---

## Current State

### Completed
- **SQLite migration completed**: Turso production configured, Local SQLite dev mode configured, DB queries routed successfully.
- **R2 migration completed**: UploadThing provider mode switched to R2 by default, assets uploaded and validated.
- **AI Gateway routing completed**: Gemini client configured to route all traffic through Cloudflare AI Gateway.
- **Storage abstraction completed**: Reusable storage client (`lib/storage/index.ts`) abstracting R2 and UploadThing providers.
- **vNext Content Architecture migration completed**: Canonical Markdown-First Knowledge System implemented, schemas updated, local SQLite and production Turso databases fully migrated, MTD backfill completed, validation, extraction, assessment indexing, and policy layers fully operational.
- **Template-Based Simulation & Dual Leaderboard System completed**: Tutorial PKA simulation refactored to template-based quizzes under `simulation` category. Course leaderboards split into Kuis and Simulasi/Tryout.
- **Dedicated Admin Quiz & Exam Analytics & Insight Page completed**: Added `/admin/ai/quiz-insights` portal with real-time quantitative item/distractor breakdown, concept accuracy tracking, and on-demand Gemini AI deep pedagogical diagnostics stored in `quiz_ai_insights`.
- **Student Quiz Learning Analytics & Diagnosis System completed**: Inngest background queue (`quiz/analytics.requested`), deterministic facts calculator (`lib/student-quiz-analytics/calculator.ts`), two-tier Gemini AI diagnosis pipeline (`lib/student-quiz-analytics/ai-pipeline.ts`), and 3-Layer Student UI (`QuizAnalyticsView` & `/summary` routes) fully integrated across all course quizzes and PKA simulations.
- **Automated AI Contract Test Foundation completed**: Deterministic test harness in `tests/contracts/`, fake adapters (`fakeAi`, `fakeCache`), zero-network guards, versioned fixtures in `tests/fixtures/ai/`, and test commands (`test:ai-contracts`) fully operational.
- **Versioned Prompt Contracts, Policy Composition & Privacy-Safe Provenance completed**: `PromptExecutor` refactored into a typed boundary (`lib/prompt-executor.ts`), policy fragments (`lib/ai/policies.ts`), semantic validator contracts (`lib/ai/validation.ts`), versioned contracts (`lib/ai/contracts.ts`), bounded field-level repair engine, and privacy-safe generation trace schema (`ai_generation_traces` in `db/schema.ts`).
- **Assessment Integrity & Help Policy Protection completed**: API endpoints GET `/api/quiz/attempts` & GET `/api/quiz/attempts/[id]` protected via `serializeStudentQuizAttempt` to strip `correct_indices`, stored explanations, and grading feedback during active attempts. Deterministic `AssessmentAssistancePolicy` (`lib/assessment-assistance-policy.ts`) implemented to gate AI tutor and mistake feedback with stable reason codes.
- **Tutor Cache Isolation & Query Action Routing completed**: Shared Tier 1 KV cache isolated with student-free payloads (`lib/tutor/cache-contract.ts`), prompt version, policy version, and evidence version hashing. Query Action Router (`lib/tutor/query-action.ts`) classifies user follow-ups into `retrieve`, `reuse_previous_evidence`, `answer_from_conversation`, or `clarify` with deterministic style modifier extraction.
- **Knowledge Object Provenance & Stable Identity completed**: Source-grounded KO schema (`knowledge_object_sources`, `learning_objectives`), stable identity keys (`stableKey`), knowledgeKind and instructionalRole separation, semantic content hashing (`semanticHash`), and upsert/diff reconciliation engine (`lib/knowledge/identity.ts`) implemented behind `FEATURE_KO_PIPELINE_V2`.
- **Staged KO Extraction & Canonical Review completed**: Multi-stage source-complete pipeline implemented (`lib/knowledge/chunker.ts`, `candidate-extractor.ts`, `candidate-reconciler.ts`, `canonicalizer.ts`, `extraction-run.ts`), removing silent 30k char truncation, preserving exact source offsets and math/tables, retaining all supporting spans across chunk merges, and routing high embedding similarity without exact title match to `needs_review`.
- **Question Blueprint, Option Shuffle, and Distractor Provenance completed**: Deterministic multidimensional blueprint engine (`lib/questions/blueprint.ts`), application option shuffle with stable IDs (`lib/questions/option-shuffle.ts`), machine-readable distractor provenance engine (`lib/questions/distractor-provenance.ts`), typed assessment extractor adapter (`lib/assessment-extractor.ts`), database tables `question_generation_runs` and `distractor_provenance`, and flag `FEATURE_QUESTION_GENERATOR_V2` fully implemented.
- **Tutor Pedagogy, Diagnosis & Visual Contracts completed**: Pedagogy contracts (`lib/tutor/pedagogy-contracts.ts`), visual spec contracts (`lib/tutor/visual-contracts.ts`), deterministic visual serializer (`lib/tutor/visual-serializer.ts`), and feature flag `FEATURE_TUTOR_PEDAGOGY_V2` fully implemented.
- **Semantic Material Compiler completed**: Preflight KO validator, outline planner with typed KO exclusions (`lib/materials/compiler.ts`), non-destructive interactive layer (`lib/materials/interactive-layer.ts`), revision diff engine (`lib/materials/revision-diff.ts`), and feature flag `FEATURE_MATERIAL_COMPILER_V2` fully implemented.
- **Independent Question Verification & Critic Loop completed**: Independent solver boundary (`lib/questions/independent-solver.ts`) and pedagogical critic verification engine (`lib/questions/pedagogical-critic.ts`) fully implemented.
- **Atomic Active-Recall Flashcard Contract completed**: Flashcard V2 schema (`lib/flashcards/contracts.ts`), atomicity validator (`lib/flashcards/validator.ts`), and feature flag `FEATURE_FLASHCARD_GENERATOR_V2` fully implemented.
- **Diktat Audit, Formula Registry & PDF QA completed**: Structured audit contracts (`lib/diktat/audit-contracts.ts`), formula registry (`lib/diktat/formula-registry.ts`), fail-closed publication gating, and feature flag `FEATURE_DIKTAT_QA_V2` fully implemented.
- **Evidence-Calibrated Learner & Admin Analytics completed**: Multi-layer analytics contracts (`lib/student-quiz-analytics/contracts.ts`), deterministic evidence sufficiency calculator (`evaluateEvidenceSufficiency`), and feature flag `FEATURE_ANALYTICS_DIAGNOSIS_V2` fully implemented.
- **Golden AI Evaluations & Rollout Closure completed**: Offline golden evaluation suite (`scripts/run-ai-evals.ts`), zero-tolerance invariant scorers (`lib/ai/evals/scorers.ts`), npm script `bun run eval:ai`, and full documentation synchronization across all 15 plans completed.
- **Feature Flags Admin Monitor completed**: Added dedicated `/admin/ops/flags` dashboard with runtime `FEATURE_*` inspection (`lib/feature-flags.ts`), admin API endpoint (`/api/admin/feature-flags`), category filters, search capabilities, env copy helpers, and sidebar/admin homepage navigation links.
- **Per-Quiz Student Attempt Spreadsheet & CSV Export completed**: Added dedicated interactive spreadsheet view (`QuizAttemptsSpreadsheet`), item-response answer matrix, API route (`/api/admin/quiz-insights/[id]/attempts`), CSV export engine (Matrix & Summary formats), Admin Quiz Insights integration, and Tutor portal route (`/tutor/[courseId]/quizzes/[templateId]/attempts`).
- **Plan 001 staging safety and migration ledger completed**: Added guarded staging preflight, deterministic inventory, encrypted export and disposable restore, migration ledger tables, additive migration controls, and reconciliation evidence.

### Verified
- SQLite/Turso schema setup and connection verified.
- R2 uploads and public CDN serving verified.
- AI Gateway metrics proxying verified.
- vNext architecture pipeline and verification tests (16/16 tests passing).
- Production database schemas and MTD backfill verified successfully.
- Admin Quiz Insights database migration (`quiz_ai_insights`) and API endpoints verified.
- Student Quiz Analytics database migration (`student_quiz_analytics`), Inngest background queue, API endpoints, and 3-layer UI verified (`bun run lint` passing 0 errors).
- AI Contract Test Suite verified deterministically (75 tests across 9 contract files passing with 0 network calls).
- Versioned Prompt Contracts & Provenance verified deterministically via `bun test tests/contracts/prompt-executor.test.ts` (12/12 tests passing, bounded repair & privacy-safe hashing verified, `bun run lint` and `bun run typecheck` passing 0 errors).
- Assessment Integrity & Help Policy verified deterministically via `bun test tests/contracts/assessment-redaction.test.ts tests/contracts/tutor-rag.test.ts` (13/13 tests passing with 0 network calls, answer redaction and policy gating verified).
- Tutor Cache Isolation & Query Action Routing verified deterministically via `bun test tests/contracts/tutor-rag.test.ts` (13 passing tests across contract suite with 0 network calls, student data protection, style extraction, and action routing verified).
- Knowledge Object Provenance & Stable Identity verified deterministically via `bun test tests/contracts/ko-pipeline.test.ts` (9/9 tests passing with 0 network calls, stable identity retention, semantic hashing, superseded status tracking, and contract validation verified).
- Staged KO Extraction & Canonical Review verified deterministically via `bun test tests/contracts/ko-pipeline.test.ts` (11 passing tests across KO pipeline suite with 0 network calls, deterministic chunking > 30k chars, span preservation, and review gating verified).
- Question Blueprint, Option Shuffle, and Distractor Provenance verified deterministically via `bun test tests/contracts/question-pipeline.test.ts` (14 passing tests across question pipeline suite with 0 network calls, slot KO requirement, seeded shuffle, distractor provenances, position leakage prevention, independent solver, and critic loop verified).
- Wave 4 (Plans 006, 009, 011) verified deterministically via `bun test tests/contracts/tutor-rag.test.ts tests/contracts/material-pipeline.test.ts tests/contracts/question-pipeline.test.ts` (67 passing contract tests, 0 errors across lint & typecheck).
- Wave 5 (Plans 013, 014, 012) verified deterministically via `bun test tests/contracts/flashcard-generator.test.ts tests/contracts/diktat.test.ts tests/contracts/analytics.test.ts` (75 passing contract tests across 9 files, 0 errors across lint & typecheck).
- Wave 6 (Plan 015) verified deterministically via `bun run eval:ai` (3/3 golden evaluation zero-tolerance invariant suites passing 100%).
- Per-Quiz Student Attempt Spreadsheet & CSV Exporter verified deterministically via contract test suite (78 passing contract tests) and clean `bun run lint` (0 errors, 0 warnings).
- Plan 001 staging rehearsal verified with 97 tables before migration, 99 tables after migration, zero foreign-key violations, passed disposable restore, and only the two migration ledger tables added. Evidence: `artifacts/staging-overhaul/20260802-plan001-staging/plan-001-result.json`.
- Plan 001 code verified with `bun run lint`, `bun run typecheck`, and 12 staging contract tests passing.
- Plan 002 staging gates verified with 66 mapped users, 67 role memberships, zero parity violations, idempotent backfill rerun (`changedRows: 0`), and passing admin, tutor, murid, and multi-role Better Auth session smoke. Evidence: `artifacts/staging-overhaul/20260802-plan002-staging/plan-002-result.json`.
- Plan 003 source and Idea domain verified with 10 focused contract and SQLite constraint tests, additive migration `0053_faithful_blazing_skull.sql`, 11 new staging tables, unchanged legacy manifests, and zero foreign-key violations. Evidence: `artifacts/staging-overhaul/20260802-plan003-staging/plan-003-result.json`.
- Plan 004 product, assessment, evidence, mastery, bundle, and audit domains verified with 16 focused tests, 70 assertions, clean lint and typecheck, additive migration `0054_green_archangel.sql`, 34 new staging tables, unchanged legacy manifests, and zero foreign-key violations. Evidence: `artifacts/staging-overhaul/20260802-plan004-staging/plan-004-result.json`.
- Plan 005 deterministic legacy backfill and compatibility verified with clean lint and typecheck, 16 focused tests, additive migration `0055_cute_avengers.sql`, 568 deterministic mappings, 3,175 zero-loss exception rows, zero blocking exceptions, zero foreign-key violations, zero uncovered rows, zero snapshot mismatches, zero Tutorial PKA mismatches, and an idempotent apply. Evidence: `artifacts/staging-overhaul/20260803-plan005-legacy-backfill/plan-005-result.json`.

### Current Focus
Plan 005 deterministic legacy backfill and compatibility is complete and reconciled in staging. Plan 006 Idea Bundle V2 workflow is the next predecessor-gated plan.

### Blockers
None.

---

## Core Architectural Stack

- **Database**: Turso for production, local SQLite (`dev.db`) for development. Never attempt to use PostgreSQL or neon-client.
- **Vector Store**: Pinecone (Serverless Starter) is the primary vector database. Vectorize (Cloudflare) is conditional only (P8).
- **Primary LLM**: Google Gemini API via `@google/genai` (Gemini 2.5 Flash is the primary model).
- **AI Gateway**: Cloudflare AI Gateway routes all Gemini traffic (`CF_AI_GATEWAY_URL`). Caching enabled for Tier 1 tutor queries.
- **Storage**: Cloudflare R2 bucket (`zyx`) is the storage provider. UploadThing is deprecated and pending complete teardown (P7).

---

## UI Primitives & Layout

### Primitives (do not install new UI libraries)

| Need | Use | Import |
|---|---|---|
| Buttons | `Button` | `components/ui/button` |
| Tags, status labels | `Badge` (already `rounded-md`, never pill) | `components/ui/badge` |
| Side panels | `Sheet` | `components/ui/sheet` |
| Modals | `Dialog` | `components/ui/dialog` |
| Tabs | `Tabs` | `components/ui/tabs` |
| Inputs | `Input`, `Textarea`, `Label`, `Select` | `components/ui/*` |
| Dividers | `Separator` or `border-b border-border` | `components/ui/separator` |
| Toasts | `toast` from `components/ui/toast` | `@/components/ui/toast` |
| Scroll entrance | `Reveal` (handles reduced motion + admin bypass) | `components/ui/reveal` |
| Icons | lucide-react, default `size-4`, section icons `size-5` | `lucide-react` |
| Math | `MathText` | `components/course/math-text` |

### Layout

- Section separation: heading + `border-b border-border` + `space-y-8` between sections, `space-y-3` inside.
- Lists: `divide-y divide-border`, each row `py-3 flex items-center justify-between gap-4`. Not card grids.
- Cards only where spec says Card: `bg-card border border-border shadow-sm rounded-xl`. No nested cards.
- Mobile: single column under `sm:`, test at 380px.
- Dark mode: semantic tokens only; `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `text-primary`, `text-status-*`. Zero raw hex, zero default Tailwind palette.

### Page Ornaments

Every standalone page gets `<PageOrnaments variant="..." />` as first child inside `relative overflow-hidden`. Reuse existing variants (`testimonial`, `plans`, `about`). Dense data surfaces (admin, lesson reader) may skip.

### Motion (only allowed animations)

| Case | Spec |
|---|---|
| Hover/focus | `transition-colors duration-150` |
| Element appears | `animate-in fade-in slide-in-from-bottom-2 duration-300` |
| List stagger | same + `style={{ animationDelay: index * 50 + 'ms' }}`, cap 8 |
| Section enters | `<Reveal>` (never on admin) |
| Progress bars | `h-1.5 rounded-md bg-muted`, fill `h-full rounded-md bg-primary`, `transition-[width] duration-500 ease-out` |
| Loading | Skeletons: `bg-muted rounded-md animate-pulse`, no spinners |
| Empty | One line `text-body-sm text-muted-foreground` + optional `Button variant="outline" size="sm"` |
| Error | `TriangleAlert size-4 text-status-error` + message + `Button variant="ghost" size="sm"` Retry |

### Hard Prohibitions

- No `rounded-full` on anything that is not a perfect 1:1 circle (avatar, status dot).
- No nested cards, card-in-card, stat card grids.
- No new fonts, no gradient backgrounds (except `PageOrnaments` radial glows), no purple, no centered hero on app pages.
- No em/en dashes anywhere in the codebase. Use `;`, `,`, or `.` instead.

---

## Services & Free Tiers

| Service | Usage | Free limit |
|---|---|---|
| LLM | Gemini 2.5 Flash (4-key rotation via AI Gateway) | ~250 req/day per key |
| Embeddings | Gemini text-embedding-004 | ~1,500 req/day |
| AI Gateway | Proxy, cache, rate limiting | 100k logged req/mo |
| KV Cache | AI tutor response cache | 100k reads/day, 1k writes/day |
| R2 | Object storage | 10 GB, zero egress |
| Pinecone | Primary vector store | 2 GB Serverless Starter |
| Vectorize (opt) | Secondary vector store | ~6,500 vectors at 768 dims |
| Turso | SQLite database | 5 GB, 500M row reads/mo |
| Inngest | Background job orchestration | 50k steps/mo |
| Resend | Transactional emails | 100/day |
| FCM | Push notifications | Free |
| Sentry | Error tracking | 5k events/mo |
| UploadThing | Dev file upload fallback | 2 GB |

## Money & Quota Rules

- **AI Quota Philosophy**: AI should only be spent on:
  1. Tutor drawer explanation chat.
  2. Batched mistake feedback/explanations.
  3. Master Teaching Document chapter content generation.
- **Zero-AI Features**: Recommendations, Streaks, Study Paths, Cohort Analytics, and reflections are computed deterministically with SQL + logic. Do NOT call Gemini.
- **Write-Limit Guards**: Cloudflare Workers KV write limits must be guarded. Daily write counter under `meta:writes:{yyyy-mm-dd}` must stop writing when it approaches 900.
