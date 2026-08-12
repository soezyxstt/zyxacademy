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
5. **Standard Reusable Components**: Always use standard Shadcn components from `@/components/ui/` (`Card`, `Tabs`, `Input`, `Select`, `Switch`, `Label`, `Button`, `Badge`, `Textarea`, etc.) instead of hardcoded/ad-hoc styled containers or raw unstyled inputs/checkboxes. If a Shadcn primitive is missing in `@/components/ui/`, create it as a reusable component there.
6. **Form & Layout Hierarchy**:
   - Field labels (`Label`) should be visually primary: `text-body-sm font-semibold text-foreground`.
   - Field descriptions and helper text must be distinctly smaller than labels and input content: `text-body-xs text-muted-foreground`.
   - Settings panels and main tab views must fill the container width (`w-full`) without arbitrary max-width constraints (e.g. `max-w-3xl`) unless explicitly needed for narrow dialogs.
   - Component portals (e.g. `Select`, `Dialog`, `Popover`) must not hide or close navigation sidebars or mess up page layout.

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

## R2 Object Key Convention

Every file uploaded to Cloudflare R2 MUST live under a structured, folder-style object key. Flat UUID keys, `{uuid}-{filename}` defaults, and ad hoc inline key building are forbidden.

### Rules

1. **One helper**: build every key through `lib/storage/keys.ts`. That file is the only place that sanitizes names and joins segments. Never re-implement `safeName` / `slugify` regexes inside a route, action, or component.
2. **Key shape**: `{domain}/{entity-slug}/{subfolder...}/{leaf}`.
   - `domain`: fixed lowercase top-level folder (`courses`, `blog`, `forms`, `pka`, `overhaul`, `uploads`).
   - `entity-slug`: kebab-case slug of the owning record (course id, form title, user id, run id).
   - `leaf` for user files: `{timestamp}-{short-hash}-{sanitized-original-filename}` so a re-upload of the same name never overwrites the previous object and the real filename stays visible.
   - `leaf` for generated artifacts (diktat PDF, bundle ZIP): a stable name; versioning comes from run id or checksum and the old object is deleted on replace.
3. **Preserve the real filename**: the leaf always ends with the sanitized original filename and its extension (e.g. `1719000000000-a1b2c3d4-materi-kelas.pdf`), never a bare UUID.
4. **Reject unsafe keys**: any key containing `..`, a leading `/`, or `\` is invalid and the provider must throw (`INVALID_OBJECT_KEY`).
5. **Provider enforcement**: `R2Provider.upload()` must require `options.key` and throw when it is missing. It must never fall back to a generated `${uuid}-${filename}` key.
6. **Proxy filename**: `app/api/storage/file/[...key]/route.ts` must derive the download `Content-Disposition` filename with `leafFilename(key)` (last path segment minus the `{timestamp}-{hash}-` prefix), never a UUID-strip regex.

### Canonical prefixes

| Domain | Key pattern | Where |
|--------|-------------|-------|
| Course material PDF | `courses/{course-slug}/materials/{leaf}.pdf` | `uploadCourseMaterial` (`app/(admin)/admin/(academic)/courses/actions.ts`); `/api/admin/upload-pdf` when the client sends a `courseId` |
| Generic admin PDF (no course context) | `uploads/{yyyy}/{mm}/{leaf}.pdf` | `/api/admin/upload-pdf` fallback when no `courseId` |
| Course canonical markdown | `courses/{course-slug}/canonical/{leaf}.md` | `/api/admin/material-instances` |
| Diktat PDF | `courses/{course-slug}/diktats/{title-slug}.pdf` | `lib/diktat-actions.ts` |
| Blog media | `blog/{timestamp}-{hash}-{filename}` | `/api/blog/upload` |
| Forms | `forms/{form-slug}/question-{n}/{leaf}` | `/api/forms/upload` (already correct; move its helpers into `lib/storage/keys.ts`) |
| PKA follow proof | `pka/{userId}/proofs/{leaf}` | `registerPkaAction` (`app/(student)/courses/tutorial-pka/daftar/actions.ts`) |
| Idea bundle | `overhaul/idea-bundles/{runId}/{bundleId}-{checksum16}.zip` | `lib/bundle/staging.ts` (already correct) |
| Product bundle | `overhaul/product-bundles/{runId}/{bundleId}-{checksum16}.zip` | `lib/bundle/product-staging.ts` (already correct) |
| Authoring pack | `overhaul/{runId}/authoring-context/{packId}.zip` | `lib/authoring/export.ts` (already correct) |

When a new upload flow is added, reuse a domain above or add a new row to this table, and always route the key through `lib/storage/keys.ts`. Existing legacy keys stay readable in place; only new objects are written under the new convention.

The admin Media page (`/admin/media`) hosts a read-only browser over these domain prefixes in its "Storage R2" tab (folder tree, list, and copy-to-media only); it accepts no uploads to those domains and owns no key prefix. Do not add a `drive/` write path.

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
- **Plan 006 Idea Bundle V2 workflow completed**: Added strict ZIP security, manifest and entity contracts, staged import and review workflow, atomic publication, deterministic vector outbox jobs, admin routes and panel, staging fixtures, and reconciliation evidence.
- **Plan 007 Authoring Context Pack V1 completed**: Added explicit allowlist projection, nested redaction and holdout policy, deterministic ZIP export, admin-only API and panel, private run-scoped R2 staging smoke, content scan, and audit evidence.
- **Plan 008 Product Bundle V2 completed**: Added strict typed product ZIP validation, immutable staging, traceable previews, tutor and admin review, dependency freshness gates, versioned publication, atomic product and vector outbox writes, assessment source versioning, admin routes and panel, and staging evidence.
- **Plan 009 Article and Diktat Quality Compiler completed**: Added typed article blocks, prerequisite ordering and cycle rejection, deterministic Product Bundle article compilation, approved-article-only diktat compression, stable quality-gate reason codes, traceable admin previews, and read-only staging preview scripts. Staging evidence records 100 percent article and diktat quality, deterministic output, and zero writes; the requested `tutorial-pka` identity used an explicit read-only fallback to canonical course `mat-i` because no published canonical Idea rows were available under the PKA identity.
- **Plan 010 Question and Assessment Integrity completed**: Added deterministic multi-Idea assessment blueprints, per-Idea evidence rubrics, stable option-ID grading, benchmark and holdout boundaries, active-attempt redaction, and staging lifecycle plus leak-scan evidence. The requested `tutorial-pka` identity used an explicit run-scoped fallback to canonical course `mat-i`; no cross-course fixture data was mixed.
- **Plan 011 Per-Idea Mastery and Learning Loop completed**: Added deterministic per-Idea score and confidence calculation, append-only evidence identity, replay metadata, change history, compatibility reads, deterministic recommendations, versioned Inngest recompute events, and guarded staging shadow/full/incremental replay scripts. The staging run used an explicit `tutorial-pka` to `mat-i` canonical fallback and did not modify legacy mastery rows.
- **Plan 017 policy gate slice completed**: Product Bundle questions now require ITB curation and HOT cognitive levels for multi-Idea questions, while canonical flashcard recommendations suppress Idea mastery scores of 80 or higher. No schema migration was added.
- **Structured Form Upload Storage System completed**: Form image and file uploads (public form responder uploads & admin form builder question attachments) now use a structured folder key hierarchy (`forms/[judul-forms]/question-[number]/[timestamp]-[hash]-[filename]`) handled via `lib/forms/storage-utils.ts`, `app/api/forms/upload/route.ts`, `components/forms/public-form-viewer.tsx`, and verified via `tests/contracts/form-storage.test.ts` (4/4 tests passing, 0 lint errors).
- **R2 Object Key Convention completed**: All upload flows now build keys through the single helper `lib/storage/keys.ts` (`{domain}/{entity-slug}/{subfolder...}/{leaf}` with `{timestamp}-{shorthash8}-{sanitized-filename}` leaves). `R2Provider.upload()` and `WranglerR2Provider.upload()` now require `options.key` and reject unsafe keys with `INVALID_OBJECT_KEY`. Call sites migrated to conforming prefixes (`courses/{slug}/materials|canonical|diktats`, `blog/{leaf}`, `pka/{userId}/proofs`, `uploads/{yyyy}/{mm}` fallback for `/api/admin/upload-pdf`). The admin Media page (`/admin/media`) became a read-only browser over domain prefixes in its "Storage R2" tab: `/api/admin/media/storage` lists non-`media/` objects and supports copy-to-media, `/api/storage/upload` and `driveUploader` removed, `drive_item` write actions deleted, the proxy route now uses `leafFilename(key)`. Verified via `tests/contracts/storage-keys.test.ts` + `tests/contracts/form-storage.test.ts` (15/15 passing), `bun run lint` (0 errors), and `bun run typecheck` (0 errors).
- **Admin UI shared component library completed**: Added reusable `components/admin/` components (`stat-card.tsx`, `status-badges.tsx`, `section-title.tsx`, `confirm-dialog.tsx`, `state-panels.tsx`, `option-letter.tsx`, `table.tsx`) and migrated duplicated markup across admin pages: delete-confirmation dialogs (quizzes, diktats, questions, assessments), KPI stat cards (quiz-insights list/detail, ops analytics), difficulty/status/course badges (quizzes, materials detail, assessments detail, historical questions, jobs, questions bank, diktats), section titles (meet detail, diktats, jobs), empty states (quiz-insights, jobs), table/list card wrappers (historical questions, assessments, tutorial-pka tabs, notifications history). Rules documented in AGENTS.md. Verified with `bun run lint` (0 errors), `bun run typecheck` (0 errors), and all 226 contract tests passing.
- **Push notification overhaul completed**: Added a user-facing notification inbox (`components/notifications/notification-bell.tsx`) with unread badge, popover list, per-item mark-read and mark-all-read, mounted in the marketing navbar and the app sidebar shell; wired `sendQuizPublished` into both quiz publish paths (`saveQuizTemplateAction` and `PATCH /api/quiz/templates/[id]`, draft-to-published only); added FCM delivery stats columns (`attempted`, `succeeded`, `failedCount`, `sentAt`) to `notifications` via migration `0063_wet_bug.sql` and persisted them from `sendToUser`; added `unreadCount` to `GET /api/notifications/history`; fixed `PushPermissionInit` (auth-gated, "Nanti Saja" defers 7 days instead of denying forever, honest copy, foreground toast via `onForegroundMessage` in the bell); rebuilt the admin history table with recipient name, body, delivery status (Terkirim/Sebagian/Gagal/Tanpa perangkat), and pagination; removed dead `lib/notifications/jobs.ts` and unused senders/templates; fixed docs drift. Verified with `bun run lint` (0 errors), `bun run typecheck` (0 errors), and 224/226 contract tests passing (2 pre-existing Plan 006 Idea Bundle failures, unchanged on the clean tree).
- **Owned-block spreadsheet export & Drive editor grants completed**: Reworked `lib/google-sheets.ts` so the app owns only the data block at A1 (explicit `GridRange` write with stale-tail cleanup) via `gridFingerprint`/`detectConflicts`/`readSheetGrid`/`writeOwnedBlock`, and `syncGoogleSpreadsheet` reads the live grid before any overwrite. Manual edits in the owned block, growing rows over manual cells, or growing columns over manual headers return `needsConfirmation` with `block_modified`, `manual_rows`, or `manual_columns` codes; the client confirms via `useSpreadsheetExport` (`components/admin/spreadsheet-export.tsx`) before re-sending with `confirmOverwrite: true`. Baseline stored as `last_header_count`, `last_row_count`, `last_written_fingerprint` in `export_spreadsheets` (migration `0064_fancy_nekra.sql`); legacy sheets infer the previous block from the live grid on first re-export. All three callers migrated (PKA, form, quiz attempts; PKA missing `entityType`/`entityId` bug fixed). `FEATURE_DRIVE_EDITOR_SYNC=1` grants every active admin email `writer` on exported spreadsheets and folders via `grantDriveEditorAccess`. Verified with `bun run lint` (0 errors, 1 pre-existing warning), `bun run typecheck` (0 errors), and 235/237 contract tests passing (2 pre-existing Plan 006 Idea Bundle failures, unchanged on the clean tree).
- **Meet Studio improvements completed**: Added stable public short links at `/meet/[slug]` (unique slug + `idx_meet_slug`), creator-as-host, role/course filtered email picker with additive bulk selects for co-hosts and invited emails, host/co-host/invited email persistence on `google_meet_sessions` (migration `0065_demonic_nemesis.sql`), Drive admin editor access via `lib/google-drive-permissions.ts`, and the admin Meet tab renamed to "Meet". Nav/sidebar and admin homepage updated.
- **Form Studio fixes & presets completed**: Spreadsheet export now targets a structured Drive folder (`forms/{slug}`, title `form-{slug}-responses`) and excludes SECTION rows; "Lainnya" uses a stable sentinel (`\uE000__other__`); SECTION counts excluded everywhere via continuous `questionNumberMap`; autoscroll, post-publish builder reset, shadcn Switch toggles, end-to-end `collectEmail`, schedule validation with `formatDatetimeLocal` round trips; reusable presets behind `FEATURE_FORM_PRESETS=1` (`/api/admin/form-presets` + `components/forms/form-presets.tsx`); settings fill width; matrix table removed; section header images with zoom. The builder page was refactored into `components/forms/admin-forms-builder.tsx` with a thin `app/(admin)/admin/forms/page.tsx` wrapper.
- **Media Library completed**: R2-based shared media browser at `/admin/media` (`components/admin/media-library.tsx` + `components/admin/document-viewer.tsx`) with virtual folders (`.keep` markers), move/copy/rename/replace/delete/download (recursive folder and bulk ops), and a document viewer for image/video/audio/PDF/markdown/text. Backed by `lib/media.ts`, `/api/admin/media/*`, `StorageProvider.list()` on both R2 providers, and `buildMediaKey`/`mediaLeaf` in `lib/storage/keys.ts`. Gated by `FEATURE_MEDIA_LIBRARY=1`.
- **Tautan (important links) completed**: Admin manager at `/admin/tautan` (`components/admin/links-manager.tsx`), `lib/links.ts`, `/api/admin/links/*`, and a public Linktree-style page at `/tautan` rendering only active links grouped by category, backed by the `important_links` table (migration `0065_demonic_nemesis.sql`). Gated by `FEATURE_LINK_LIBRARY=1`.
- **Sticky sidebar during modal scroll-lock fixed**: `react-remove-scroll-bar` injects `body[data-scroll-locked] { overflow: hidden !important }` on modal open. Because `app/layout.tsx` puts `overflow-x-clip` on `<html>`/`<body>`, the hidden overflow no longer propagates to the viewport, so `body` becomes a real scroll container and `position: sticky` sidebars scroll away with the page. The lock rule now uses `overflow: clip !important` (in `app/globals.css`), which still clips and removes the scrollbar but never creates a scroll container, so sticky keeps working. Verified empirically with a puppeteer reproduction (sticky `top=-600` broken under `hidden`, stays `0` under `clip`) plus `bun run lint` (0 errors, 1 pre-existing warning) and `bun run typecheck` (0 errors).
- **Media unified with read-only Storage R2 browser, File Storage page removed, sidebar restructured**: The admin Media page now has two tabs via `components/admin/media-manager.tsx` (`AdminTabs`): "Media" (existing `MediaLibrary`) and "Storage R2" (new read-only browser, `components/admin/storage-browser.tsx`). The storage tab lists every non-`media/` R2 object through `GET /api/admin/media/storage` (reusing `buildFolderTree`, `storageFolderPathOfKey`, `STORAGE_DOMAIN_LABELS` in `lib/media.ts`) and only allows copy into the media domain via `POST /api/admin/media/storage` (file and recursive folder copy, conflict-safe). The legacy `/admin/files` page and `components/admin/drive-explorer.tsx` were deleted (redundant), the dashboard File Storage card and its `driveItem` stats query were removed, and the sidebar gained a top-level "Media & Alat" group (Meet, Form Studio, Media, Tautan) replacing the File Storage position while "Sistem & Ops" keeps the ops items. Docs (`AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`), site search index, and screenshot script updated. Verified with `bun run lint` (0 errors, 1 pre-existing warning), `bun run typecheck` (0 errors), and storage contract tests 15/15 passing.

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
- Wave 5 contract surfaces (Plans 013, 014, 012) verified deterministically via `bun test tests/contracts/flashcard-generator.test.ts tests/contracts/diktat.test.ts tests/contracts/analytics.test.ts` (75 passing contract tests across 9 files, 0 errors across lint & typecheck).
- Plan 015 local contract and AI evaluation surfaces verified deterministically; staging parity remains a separate gate.
- Per-Quiz Student Attempt Spreadsheet & CSV Exporter verified deterministically via contract test suite (78 passing contract tests) and clean `bun run lint` (0 errors, 0 warnings).
- Plan 001 staging rehearsal verified with 97 tables before migration, 99 tables after migration, zero foreign-key violations, passed disposable restore, and only the two migration ledger tables added. Evidence: `artifacts/staging-overhaul/20260802-plan001-staging/plan-001-result.json`.
- Plan 001 code verified with `bun run lint`, `bun run typecheck`, and 12 staging contract tests passing.
- Zyra AI Plan 002 local registry and provider adapters verified with 15 targeted contract tests, clean lint and typecheck, exact canonical and semantic-cache 768 profile isolation, and a mock probe with 40 records and zero network calls. Real staging evidence records 39 passes and one transient 504 from a quarantined preview model; the approved one-request retry returned the same transient 504. No secrets or authenticated URLs were written, and the 3.5 Flash-Lite release gate remains insufficient-sample. Evidence: `artifacts/zyra-ai/20260805-plan002-real/plan-002-model-probe.json` and `artifacts/zyra-ai/20260805-plan002-retry-preview/plan-002-model-probe.json`.
- Zyra AI Plan 003 completed with 14 Worker tests and 50 assertions, clean Worker lint and typecheck, root lint, a local synthetic smoke with 60 accepted and 40 rejected reservations, zero over-allocation, zero synthetic provider calls, a passing authenticated Wrangler dry-run, staging deployment, safe health 200, unauthorized quota 401, authenticated diagnostics 200 JSON, and remote synthetic smoke with 60 accepted, 40 rejected, 60 committed, fairness spread 0, and zero synthetic provider calls. The runtime fix replaced unsupported global `crypto.timingSafeEqual` usage and removed `transactionSync` after async boundaries from the SQLite quota path. Evidence: `artifacts/zyra-ai/20260807-plan003-local-harness-fix/plan-003-result.json` and `artifacts/zyra-ai/20260807-plan003-final/plan-003-result.json`.
 - Zyra AI Plan 004 completed its staging-backed application canary with additive `ai_allowance_leases`, 9 focused contract tests passing, root typecheck passing, zero staging foreign-key violations, preserved legacy rows, accepted and rejected allowance behavior, cache hits at zero provider units, idempotent commit/refund, authenticated current-user summary, and strict reconciliation with zero missing compatibility events and invalid leases. The flag was enabled only in the canary process and is off afterward. Evidence: `artifacts/staging-overhaul/20260807-plan004-allowance/plan-004-result.json` and `artifacts/staging-overhaul/20260807-plan004-app-canary-v3/plan-004-application-canary.json`.
- Zyra AI Plan 005 completed with a typed control-plane client, single-dispatch request lifecycle, deterministic routing, project fallback, AI Gateway metadata, quarantine protection, root typecheck, relevant lint, and 22 focused contract tests with 63 assertions. The paced staging smoke completed 40 of 40 provider requests across four project slots, selected only `gemini-3.1-flash-lite`, recorded zero quarantined traffic, reconciled 40 committed application leases with 40 linked control-plane leases, and left zero active control-plane leases. Evidence: `artifacts/zyra-ai/20260807-plan005-provider-router-paced-v1/plan-005-provider-router.json`.
- Zyra AI Plan 006 completed with privacy-safe exact and semantic cache contracts, AI Gateway cache-key sharing, Durable Object single-flight, the 900-write budget, the separate 768-dimensional semantic profile, version invalidation, and rollback. The focused local suite passed 17 tests, the 200-pair calibration passed with zero false reuse and 100 percent precision, and staging smoke passed with 1 leader, 49 followers, 1 strict semantic match, zero cache provider units, and zero real provider calls. Evidence: `artifacts/zyra-ai/20260807-plan006-semantic-calibration/plan-006-semantic-calibration.json` and `artifacts/zyra-ai/20260807-plan006-cache-smoke-v10/plan-006-cache-smoke.json`.
- Zyra AI Plan 007 is local-ready but partial. The deterministic pedagogical state machine, typed response boundary, citation and assessment validators, safe fallback composition, one-call prompt contract, tutor integration, masked canonical failure boundary, bounded staging shadow runner, self-contained maintainer review page, strict human evidence validator, and stage-specific startup diagnostics are implemented. Canonical and tutor imports now use a scoped Zyra env contract that excludes unrelated UploadThing and Resend credentials. The focused suite passes 50 tests with 174 assertions. Machine and fixture gates remain green with zero provider calls. The latest zero-provider staging diagnostic reached the database successfully but stopped at `session_context` with `PEDAGOGY_STARTUP_ACTIVE_SESSION_MISSING`; it recorded zero provider calls, writes, trace writes, and learner side effects. One controlled remote retry and maintainer review remain pending. Evidence: `artifacts/zyra-ai/20260807-plan007-pedagogy-eval/plan-007-pedagogy-eval.json`, `artifacts/staging-overhaul/20260808-plan007-startup-diagnostics-v3/plan-007-pedagogy-startup-diagnostics.json`, and the latest masked diagnostic artifact from 2026-08-12.
- Zyra AI Plan 008 local implementation is in progress. Bounded evidence events, deterministic learner adaptation, separate explicit preferences, reset and expiry, profile-free shared scaffold protection, authenticated API ownership, additive migration `0067_zyra_continuation.sql`, 18 focused tests, and a zero-provider synthetic smoke are implemented. Remote staging reconciliation remains pending, and the feature flag remains off by default. Evidence: `artifacts/staging-overhaul/20260812-plan008-audit/plan-008-personalization.json`.
- Zyra AI Plan 009 local implementation is in progress. Typed canvas specs, capability metadata, an allowlisted expression AST, local controls and reset, accessible table fallbacks, typed response-to-cache-to-chat propagation, legacy visual compatibility, focused tests, a 16-fixture evaluation, and a zero-provider synthetic smoke are implemented. Remote staging review remains pending, and the feature flag remains off by default. Evidence: `artifacts/staging-overhaul/20260812-plan009-audit/plan-009-canvas.json` and the current canvas chat propagation contract test.
- Plan 002 staging gates verified with 66 mapped users, 67 role memberships, zero parity violations, idempotent backfill rerun (`changedRows: 0`), and passing admin, tutor, murid, and multi-role Better Auth session smoke. Evidence: `artifacts/staging-overhaul/20260802-plan002-staging/plan-002-result.json`.
- Plan 003 source and Idea domain verified with 10 focused contract and SQLite constraint tests, additive migration `0053_faithful_blazing_skull.sql`, 11 new staging tables, unchanged legacy manifests, and zero foreign-key violations. Evidence: `artifacts/staging-overhaul/20260802-plan003-staging/plan-003-result.json`.
- Plan 004 product, assessment, evidence, mastery, bundle, and audit domains verified with 16 focused tests, 70 assertions, clean lint and typecheck, additive migration `0054_green_archangel.sql`, 34 new staging tables, unchanged legacy manifests, and zero foreign-key violations. Evidence: `artifacts/staging-overhaul/20260802-plan004-staging/plan-004-result.json`.
- Plan 005 deterministic legacy backfill and compatibility verified with clean lint and typecheck, 16 focused tests, additive migration `0055_cute_avengers.sql`, 568 deterministic mappings, 3,175 zero-loss exception rows, zero blocking exceptions, zero foreign-key violations, zero uncovered rows, zero snapshot mismatches, zero Tutorial PKA mismatches, and an idempotent apply. Evidence: `artifacts/staging-overhaul/20260803-plan005-legacy-backfill/plan-005-result.json`.
- Plan 006 Idea Bundle V2 verified with clean lint, typecheck, diff check, 7 focused contract tests, additive migration `0056_elite_midnight.sql`, successful staging upload, identical retry no-op, conflict rejection, partial publication rollback, atomic publish, stable invalid-fixture reason codes, and independent reconciliation. Evidence: `artifacts/staging-overhaul/20260803-plan006-bundle-v5/plan-006-result.json` and `plan-006-reconcile.json`.
- Plan 007 Authoring Context Pack V1 verified with clean lint and typecheck, 4 focused contract tests, deterministic allowlist and redaction checks, zero scan findings, identical pack and ZIP checksums, private R2 round trip, exact test-object deletion, and audit metadata. Evidence: `artifacts/staging-overhaul/20260803-plan007-authoring-v1/plan-007-result.json` and `plan-007-scan.json`.
- Plan 008 Product Bundle V2 verified with clean lint, typecheck, diff check, 23 focused contract tests across Product Bundle, material, and question pipelines, all seven product types staged and published, identical retry no-op, conflict rejection, seven-stage rollback matrix with zero visible partial products, stale dependency blocking, holdout rejection, versioned re-import, and independent reconcile. Evidence: `artifacts/staging-overhaul/20260803-plan008-product-v3/plan-008-result.json` and `plan-008-reconcile.json`.
- Plan 010 Question and Assessment Integrity verified with clean lint, typecheck, diff check, 31 focused tests and 110 assertions, a passed staging create, publish, start, answer, submit, and summary lifecycle, and zero findings from the independent leak scan. Evidence: `artifacts/staging-overhaul/20260803-plan010-assessment-v4/plan-010-result.json` and `plan-010-leak-scan.json`.
- Plan 011 Per-Idea Mastery and Learning Loop verified with clean lint, typecheck, 16 focused contract and migration tests, a passed staging shadow with zero writes, a passed full replay, and a passed incremental no-op replay with identical hashes. Evidence: `artifacts/staging-overhaul/20260803-plan011-shadow-v2/plan-011-shadow.json` and `artifacts/staging-overhaul/20260803-plan011-recompute-v2/plan-011-result.json`.
- Zyra AI Plan 001 staging control plane verified with generated Wrangler types, authenticated dry-run, 5 Bun contract tests, additive 768-dimensional semantic-cache index, private R2 bucket with seven-day lifecycle, secret binding presence, SQLite Durable Object reconciliation, safe health output, and unauthorized-route smoke. Evidence: `artifacts/zyra-ai/20260805-plan001-final/plan-001-result.json`.
- Plan 017 policy gate slice verified with 12 focused contract tests, clean lint, typecheck, and diff check. The full branch-local Plan 017 remains in progress because the local material compiler rehearsal still lacks a canonical fixture.
- Owned-block spreadsheet export & Drive editor grants verified deterministically via `bun test tests/contracts/google-sheets.test.ts` (11/11 tests passing with 0 network calls, GRANT-001..003, FINGERPRINT-001, CONFLICT-001..005, WRITE-001..002), `bun run lint` (0 errors, 1 pre-existing warning), `bun run typecheck` (0 errors), and the full contract suite at 235/237 passing (2 pre-existing Plan 006 Idea Bundle failures).
- Meet Studio, Form Studio, Media Library, and Tautan verified with `bun run lint` (0 errors, 1 pre-existing warning), `bun run typecheck` (0 errors), migration `0065_demonic_nemesis.sql` generated and applied with a matching snapshot and journal entry, and the shared storage/env/sidebar plumbing consistent across all four feature areas.

### Current Focus
Plans 001 through 016 have passed their recorded local and staging gates, including the authorized 313-vector canonical backfill, golden retrieval, Zyra privacy checks, admin and tutor workflow, murid parity, two full Plan 016 rehearsals, rollback, re-enable, final Vectorize reconcile, and the legacy-caller inventory. Staging never provisioned Pinecone; the final decommission evidence records the deterministic not-provisioned state, while the Pinecone values in `.env.local` and `.env.prod` remain outside staging scope.
 Zyra AI Plans 005 and 006 are completed through their bounded staging gates. Plan 007 remains partial because remote shadow evidence and maintainer golden-subset review are pending; its scoped runtime env and startup diagnostics require a valid active session at the time of the diagnostic. Plan 008 local implementation is in progress under an explicit handoff override, with no staging rollout. Plan 002 remains partial only because its quarantined preview-model release gate has insufficient sample evidence; that inherited quarantine does not block the accepted Plan 005 default-route gate or Plan 006 cache gate. No production deployment occurred.

Branch-local Plan 017 (`codex/rework-audit`) is an isolated follow-up for the audited Idea, Product Bundle, canonical Vectorize, and live per-Idea evidence gaps. It is local-gate only, preserves the legacy path behind existing flags, forbids schema and remote resource writes, and must not be treated as a staging or production rollout until separately rehearsed.

### Blockers
- None for the requested staging overhaul. Production deployment and deletion remain out of scope, and the preserved 1024-dimensional Vectorize indexes remain untouched.
- Zyra AI Plan 007 startup blocker is not resolved. The latest read-only staging diagnostic reports that the configured identity is missing an active session. UploadThing and Resend credentials are not required. No session was created by this continuation, so the controlled remote shadow retry and maintainer human review remain pending.

---

## Core Architectural Stack

- **Database**: Turso for production, local SQLite (`dev.db`) for development. Never attempt to use PostgreSQL or neon-client.
- **Vector Store**: Cloudflare Vectorize is the canonical vector database for staging retrieval, using `canonical-content-v2`, Gemini Embedding 2, 768 dimensions, cosine distance, and the authenticated V2 Worker. Pinecone was never provisioned in staging; local and production Pinecone variables are preserved outside the staging cutover scope.
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

### Admin UI shared components (use these, do not re-implement)

All admin pages live under `app/(admin)/admin/` and must compose the shared components in `components/admin/` instead of re-declaring the same markup per page. A lint/typecheck clean does not excuse duplication; if a pattern below fits, use the component.

| Component | Import | Replaces |
|---|---|---|
| `AdminPageHeader` | `components/admin/page-header` | Manual page `<h1>` + description + icon blocks. Every standalone admin page uses it; do not hand-roll a page header. |
| `AdminTabs` / `AdminTabsList` / `AdminTabsTrigger` / `AdminTabsContent` | `components/admin/tabs` | Raw `Tabs` wiring for admin tab views (settings panels, detail pages). |
| `AdminStatCard` | `components/admin/stat-card` | Local `Stat`/`StatCard` KPI cards. `size` = `sm` (p-4, `text-h5`) or `md` (p-5, `text-h4`); `tone` colors the value + icon (default/brand/brand-secondary/info/success/warning/error); `iconClassName` overrides the icon color when the value stays foreground. |
| `AdminSectionTitle` | `components/admin/section-title` | Repeated heading markup: `font-heading text-h5/h6/lg ... flex items-center gap-2` with icon + optional micro-label/description. `size` = `h5`/`h6`/`lg`; `border` adds `border-b border-border pb-3`; `right` slots an action; `as` picks the heading level (default `h3`). |
| `AdminConfirmDialog` | `components/admin/confirm-dialog` | All destructive confirmation dialogs. Prefer over hand-rolled `Dialog` + "Batal"/destructive footer. `destructive={false}` yields a default confirm button; `loading` disables submit. |
| `StatusBadge` | `components/admin/status-badges` | Raw status ternaries. `tone` = muted/info/success/warning/error/brand. Prefer tone-mapped dictionaries (`statusTone`) over per-file `statusColors` class maps. |
| `DifficultyBadge` | `components/admin/status-badges` | Easy/Medium/Hard ternaries (string or numeric 3/2/1 input). Maps easy→success, medium→warning, hard→error; `prefix="Kesulitan"` for labeled variants. |
| `CourseBadge` | `components/admin/status-badges` | The brand-primary course pill `text-xs font-bold uppercase tracking-wider bg-brand-primary/8 ...`. |
| `AdminEmptyState` | `components/admin/state-panels` | Empty states. `compact` = single centered line `text-body-sm text-muted-foreground`; full = icon + title + description + optional `action`. |
| `AdminErrorState` | `components/admin/state-panels` | `TriangleAlert` + message + optional Retry button. |
| `AdminOptionLetter` | `components/admin/option-letter` | Question option letter badges; `isCorrect` renders the filled emerald variant. Never write `String.fromCharCode(65 + i)` for option badges. |
| `AdminTable` / `AdminTableHead` | `components/admin/table` | The card table wrapper `overflow-hidden rounded-xl border border-border bg-card shadow-sm` and `thead` `bg-muted/50 border-b border-border`. Works for `<table>` and grid-based list surfaces. |

Rules:
- **Difficulty = semantic status tones, never the raw emerald/amber/rose palette.** `easy`→success, `medium`→warning, `hard`→error.
- **Status badges are uppercase** (`uppercase tracking-wide`, `text-[10px] font-semibold`); display keys come from the API value, not invented labels.
- **Table/list card wrappers use `AdminTable`.** A new table surface must not re-type `overflow-hidden rounded-xl border border-border bg-card shadow-sm`.
- **Dialog edit shells** may keep the base `Dialog` family from `components/ui/dialog` (they vary too much to share), but **destructive confirmations must use `AdminConfirmDialog`**.
- **Section headings** within a page use `AdminSectionTitle`, not ad hoc `h2`/`h3` blocks; the only exception is a card header that needs bespoke chrome (e.g. `flags-client.tsx`).
- **KPI grids** are `AdminStatCard` inside a `grid`; never build a local stat-card component per page.
- Keep dialog/form shells in `components/ui/*` and `radix-ui`; do not introduce a second component library.

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
| Embeddings | Gemini Embedding 2, canonical-content-v2 | project key quota |
| AI Gateway | Proxy, cache, rate limiting | 100k logged req/mo |
| KV Cache | AI tutor response cache | 100k reads/day, 1k writes/day |
| R2 | Object storage | 10 GB, zero egress |
| Vectorize | Canonical vector store for staging | 768 dimensions, cosine, metadata allowlist |
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

## Google Spreadsheet Export & Drive Structuring
1. Never recreate a Google Spreadsheet if one already exists for the entity instance. Update content in-place.
2. Maintain structured folder placement under `Zyx Export/{domain}/...` on Google Drive.
3. Route all exports through `lib/google-sheets.ts` / `/api/admin/export-spreadsheet`.
4. **Owned-block writes**: the app owns only the data block (header row + data rows starting at cell A1). Writes use an explicit `GridRange`; cells right of the data block and rows below it are a reserved manual zone and must never be touched by the app.
5. **Conflict confirmation**: before overwriting an existing spreadsheet, `syncGoogleSpreadsheet` reads the current grid and compares it with the stored `last_written_fingerprint`. Manual edits inside the owned block, manual rows overlapped by a growing data set, and manual columns overlapped by growing headers return `needsConfirmation` with typed conflict codes (`block_modified`, `manual_rows`, `manual_columns`). The client re-sends with `confirmOverwrite: true` only after the admin confirms via `useSpreadsheetExport` (`components/admin/spreadsheet-export.tsx`).
6. **Conflict baseline**: `export_spreadsheets.last_header_count`, `last_row_count`, and `last_written_fingerprint` are the baseline. Legacy spreadsheets without metadata infer the previous block from the current grid on first re-export.
7. **Admin editor grants**: when `FEATURE_DRIVE_EDITOR_SYNC=1`, every active admin email is granted `writer` on the spreadsheet (and its folder on creation) via `grantDriveEditorAccess`.

## Zyra continuation state

- Plan 008 local implementation is in progress. Bounded evidence events, deterministic learner adaptation, separate explicit preferences, reset and expiry, profile-free shared scaffold protection, authenticated API ownership, additive migration `0067_zyra_continuation.sql`, focused contracts, and zero-provider synthetic smoke pass. Remote staging reconciliation remains pending, and the feature flag remains off by default. Evidence: `artifacts/staging-overhaul/20260812-plan008-audit/plan-008-personalization.json`.
- Plan 009 local implementation is in progress. Typed canvas specs, safe expression evaluation, local response-to-cache-to-chat propagation, feature-flag gating on server and browser, accessible fallbacks, evaluation, focused contracts, and zero-provider synthetic smoke pass. Remote visual staging review remains pending, and both canvas flags remain off by default. Evidence: `artifacts/staging-overhaul/20260812-plan009-audit/plan-009-canvas.json`.
- Plan 010 local implementation is in progress. Private sanitized image attachments, owner and course authorization, multimodal adapter routing, assessment and cache isolation, attachment cleanup, 14 focused tests, a 12-fixture evaluation, and a zero-provider synthetic smoke are implemented. Live staging image evidence and human review remain pending, and the feature flag remains off by default. Evidence: `artifacts/staging-overhaul/20260812-plan010-audit/plan-010-images.json`.
- Plan 011 local implementation is in progress. Allowance UI, bounded selection-to-ask, attachment composition, local Canvas journey, accessible pet states, 27 focused tests across the new murid surfaces, and a zero-provider synthetic smoke are implemented. Staging tester review remains pending, and the public flags remain off. Evidence: `artifacts/staging-overhaul/20260812-plan011-audit/plan-011-murid.json`.
- Plan 012 local implementation is in progress. Typed proposal records, lifecycle events, role and scope authorization, tutor and admin panels, fail-closed apply boundary, focused contracts, evaluation, and no-auto-apply synthetic smoke are implemented. Mutation-boundary integration and staging review remain pending. Evidence: `artifacts/staging-overhaul/20260812-plan012-audit/plan-012-copilots.json`.
- Plan 013 local implementation is in progress. Fixed-column privacy-safe operational events, ledger and cache aggregation, admin authorization, alerts, evaluation, and zero-provider synthetic smoke are implemented. Live telemetry parity and admin review remain pending, and the flag remains off. Evidence: `artifacts/staging-overhaul/20260812-plan013-audit/plan-013-operations.json`.
- Plan 014 is blocked at the release-gate boundary. The latest synthetic-only verifier produced a masked `blocked` artifact with no provider calls or live changes. Plan 001 through 006 evidence is absent locally, while Plan 007 active-session restoration, remote shadow and maintainer review, a clean reviewable worktree, and the approved live staging matrix remain pending. Evidence: `artifacts/staging-overhaul/20260812-plan014-audit/plan-014-result.json`.
