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
4. Only granular, non-foundational capabilities use the retained category 4 `FEATURE_*` env flags in `lib/env.ts`. Foundational behavior is always-on; an absent optional flag keeps that capability hidden.
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

Keep this section concise. Detailed feature behavior belongs in `docs/features.md`, architecture in `docs/ARCHITECTURE.md`, schema state in `docs/DB_SCHEMA.md`, environment setup in `docs/DEVELOPMENT.md`, deployment state in `docs/DEPLOYMENT.md`, and operational gates in `docs/operations/production-readiness-checklist.md`.

### Stable platform

- Turso is the remote database and local SQLite is the development database.
- Staging migration `0067_zyra_continuation.sql` was applied on 2026-08-12 after encrypted export and disposable restore validation. Reconciliation recorded 164 tables, 7 additive tables, zero removed tables, and zero foreign-key violations.
- Cloudflare R2 is the default storage provider. UploadThing remains only as a compatibility fallback.
- Gemini traffic uses Cloudflare AI Gateway. Canonical retrieval uses the isolated 768-dimensional Cloudflare Vectorize profile.
- The Idea-centered overhaul Plans 001 through 016 are complete. Their implementation history remains available in Git; the working tree keeps only the compact program index and active Plan 017.
- Deterministic AI contracts, assessment redaction, cache isolation, content provenance, question verification, analytics, and golden evaluations are established and documented in `docs/`.

### Active work

- The external authoring workflow is split into validated Source Pack, Idea Bundle, and Product Bundle skills. All bundled skill packagers and validators use JavaScript. Dedicated packagers include only contract files, reject symlinks and extras, force ZIP mode `0644`, and validate before writing. Source Pack validation independently verifies original binaries, deterministic Markdown counts, semantic markers, structured visual explanations, and a persisted quality report. Idea and Product skills keep a preference-only Authoring Learning Profile from explicit operator corrections, with no Revision Pack. Product authoring copies direct ITB examples from Source Pack, keeps benchmark identity separate from the dedicated allowed source reference and exact event label exported by Context Pack, and never emits Zyx-original questions. Product Bundle exposes only draft, published, and withdrawn. Publication projects ITB questions into the active bank, and provenance survives quiz, tryout, PKA, review, and live snapshots. Migration `0068_typical_warbird.sql` is generated; local migration remains blocked by the pre-existing migration ledger mismatch for `ai_allowance_leases`. Focused contracts, skill validation, lint, and typecheck pass; authenticated staging lifecycle and responsive visual review remain pending.
- A provider-neutral Authoring MCP V1 foundation is available at `/api/mcp/authoring`. It is always available after deployment and uses Streamable HTTP, Better Auth admin sessions, OAuth discovery with PKCE, and a per-session connection-token fallback. HMAC-scoped course and chapter choices use a key derived from `BETTER_AUTH_SECRET`; no static MCP token, manual actor ID, or feature flag is required. It exposes exactly two workflows: Idea plus Product Bundle or quiz bank. Canonical quality modules now add Source Pack original-binary verification, deterministic content audits, Idea coverage and duplicate gates, Product content-density gates, published-Idea scope checks, and persisted quality reports before staging. The new instruction skills are `zyx-source-pack-mcp`, `zyx-idea-bundle-mcp`, and `zyx-product-bundle-mcp`; they guide agents without duplicating enforcement. Valid Idea and Product submissions enter the existing review inventory; valid quiz drafts enter `ai_question_bank` as `generated` with deterministic retry identity. MCP has no publish tool. Local MCP contracts, quality tests, lint, and typecheck pass; provider OAuth connection, persistent run audit, and UI handoff remain pending.
- The admin interface enforces full-width left-aligned page headers without route-group width constraints, uses solid semantic card surfaces over the shared gradient and math ornament background, reserves sidebar width in desktop flow, limits back navigation to detail views, streamlines bundle-centered navigation, and uses Idea Bundle and Product Bundle display names without version suffixes. The repair is local-only; lint and typecheck pass, while desktop, dark mode, and 380px mobile visual review remain pending.
- The student dashboard shows Minimal, Essential, and Premium package previews to students without an active enrollment while retaining token activation.
- Plan 017 audit rework is in progress. It is local-only until a separate staging review authorizes remote actions.
- Zyra AI Plans 001 and 003 through 006 have completed their recorded gates. Plan 002 remains partial because the quarantined preview model has insufficient successful samples.
- Zyra AI Plan 007 is local-ready but still needs a controlled staging shadow and maintainer review.
- Zyra AI Plans 008 through 013 have local implementations and focused evidence. Their additive schema is present in staging after migration 0067, but live rollout, parity checks, and human review remain pending.
- Zyra murid UX repair is local-only: legacy graphs render through the bounded parser, math tutoring uses equation-first LaTeX with safe raw-equation recovery, empty or irrelevant RAG evidence falls back to scoped general teaching, quiz review supplies verified page context, the drawer supports viewport expansion, and the draggable hideable pet is an expressive application-owned fox-like Zyra companion. Focused tests and local lint pass; staging visual review remains pending.
- Zyra canvas and multimodal UX repair is local-only: responsive Recharts plots, visual-language intent detection, interactive quadratic concept recovery, and post-response deterministic graph recovery work with or without canonical RAG evidence; direct Interactions routing, gateway-compatible image fallback, response-based allowance accounting, distinct provider errors, and private attachment previews with history hydration are implemented. Focused contracts pass; staging visual and live image review remain pending.
- Zyra AI Plan 014 remains blocked until predecessor human and live staging gates pass.
- Public Zyra continuation flags remain disabled unless explicitly enabled for an approved rollout.
- Meet, Form Studio, Media, and Tautan repairs are local-ready. Focused contracts, lint, and typecheck pass; live Google Meet member provisioning, Drive permission sync, spreadsheet export, and responsive visual review remain staging gates.

### Blockers

- The Plan 007 staging identity has no active session for the controlled shadow run.
- Production deployment, destructive database contraction, and feature rollout are outside the current authorization.
- The preserved legacy 1024-dimensional vector indexes remain rollback assets and must not be modified without a separate cutover decision.

---

## Core Architectural Stack

- **Database**: Turso for production, local SQLite (`dev.db`) for development. Never attempt to use PostgreSQL or neon-client.
- **Vector Store**: Cloudflare Vectorize is the canonical vector database for staging retrieval, using `canonical-content-v2`, Gemini Embedding 2, 768 dimensions, cosine distance, and the authenticated V2 Worker. Pinecone was never provisioned in staging; local and production Pinecone variables are preserved outside the staging cutover scope.
- **Primary LLM**: Google Gemini API via `@google/genai`. The default routed model is `gemini-3.1-flash-lite`; model policy and fallbacks live in `lib/ai/provider/model-registry.ts`.
- **AI Gateway**: Cloudflare AI Gateway routes supported Gemini `generateContent` traffic (`CF_AI_GATEWAY_URL`). Interactions traffic uses the direct Google endpoint. Caching is enabled for eligible Tier 1 tutor queries.
- **Storage**: Cloudflare R2 bucket (`zyx`) is the default storage provider. UploadThing remains a compatibility fallback while its configured call paths exist.

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
