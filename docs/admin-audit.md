# Admin Page Audit

> Generated: 2026-07-07
> Scope: `app/(admin)/` (routes) + `components/admin/` (shared components) + `components/admin-sidebar.tsx`

---

## 1. Inventory & Size

| Area | Files | Total Lines | Total Size |
|------|-------|------------|------------|
| Route layout & wrappers | 4 | ~50 | ~1.4 KB |
| Routes (page.tsx) | 18 | ~12,000 | ~350 KB |
| Client components (\*-client.tsx) | 11 | ~15,000 | ~470 KB |
| Server actions (actions.ts) | 7 | ~1,800 | ~72 KB |
| Shared admin components (components/admin/) | 10 | ~6,500 | ~184 KB |
| **Total** | **50** | **~35,350** | **~1,077 KB** |

---

## 2. Critical Hotspots

### 2.1 Largest Files

| File | Lines | Size | Complexity |
|------|-------|------|------------|
| `ai/(content)/materials/[id]/detail-client.tsx` | 3,019 | 152 KB | **Critical** - single-file monolith handling KO display, editing, chapter management, flashcard gen, quiz pool gen, publish workflows |
| `ai/(content)/materials/materials-client.tsx` | ~2,600 | 95 KB | **Critical** - ingestion wizard, document upload, analysis, curation, publish, tab switching |
| `components/admin/drive-explorer.tsx` | 1,305 | 38 KB | **High** - file browser, DnD, rename, bulk delete, context menus |
| `ai/(eval)/questions/questions-client.tsx` | 871 | 41 KB | **High** - question bank filtering, bulk ops, inline CRUD, QC warnings |
| `components/admin/bundle-importer-tab.tsx` | 647 | 31 KB | **High** - complex stepper, drag-drop, terminal, error resolution UI |
| `app/(admin)/admin/(academic)/courses/import-actions.ts` | 932 | 34 KB | **High** - JSON error parser, bundle import server logic |

### 2.2 Duplication Hotspots

| Pattern | Location 1 | Location 2 | Overlap |
|---------|-----------|-----------|---------|
| Drag-drop JSON file upload + paste + settings card | `bundle-importer-tab.tsx` (647 lines) | `assessment-bundle-importer-tab.tsx` (397 lines) | ~60% structural overlap (same layout, same card pattern, same file reader, same terminal, same checkbox settings) |
| Course/chapter selector with checkboxes | `courses-dashboard.tsx` (chapters modal) | `pdf-materials-tab.tsx` (chapter selector) | ~40% layout overlap (same checkbox grid, same `handleChapterToggle`, same `courseChapters` filter) |
| Course selector `<Select>` with option list | Found in 8+ files | - | Duplicated in `materials-client.tsx`, `pdf-materials-tab.tsx`, `assessments-client.tsx`, `questions-client.tsx`, `quizzes-client.tsx`, `jobs-client.tsx`, `diktats-client.tsx`, `courses-dashboard.tsx` |
| PDF upload to R2 | `materials-client.tsx` (lines 210-239) | `assessments-client.tsx` (same pattern) | ~80% overlap |
| Delete confirmation dialog | `courses-dashboard.tsx`, `tokens-dashboard.tsx`, `questions-client.tsx`, `quizzes-client.tsx`, `diktats-client.tsx` | All | Identical pattern: `<Dialog>` + `<DialogHeader>` + `<DialogTitle>` + `<DialogDescription>` + `<DialogFooter>` with Batal/Hapus |
| Filter bar with Select dropdowns | `questions-client.tsx` (5 filters) | `assessments-client.tsx` (3 filters) | Similar grid layout, same Select pattern |

---

## 3. Inconsistencies Found

### 3.1 Card Patterns (3 variants in use)

| Variant | Example locations | Pattern |
|---------|------------------|---------|
| **Standard Card** | `bundle-importer-tab.tsx`, `pdf-materials-tab.tsx` | `<Card>` + `<CardHeader>` + `<CardTitle>` + `<CardContent>` |
| **Inline div** | `courses-dashboard.tsx` (lines 255, 301) | `rounded-xl border border-border bg-card p-6 shadow-sm` |
| **Large rounded** | `tokens-dashboard.tsx` (line 117) | `rounded-2xl border border-border bg-card p-6 shadow-sm` |

### 3.2 Table Patterns (3 variants)

| Variant | Locations | Notes |
|---------|-----------|-------|
| Native `<table>` | `courses-dashboard.tsx`, `pdf-materials-tab.tsx`, `blog/page.tsx` | Different header styles, different cell padding (px-4 vs px-6) |
| Div grid with divide-y | `tokens-dashboard.tsx`, `ops-client.tsx`, `generation-jobs.tsx` | Row-per-item with flex layout |
| Custom card grid | `quizzes-client.tsx` | `grid gap-5 sm:grid-cols-2` |

### 3.3 Tab/Toggle Patterns (4 variants)

| Variant | Locations |
|---------|-----------|
| `<Tabs>` (radix) | `courses/page.tsx`, `assessment detail` |
| `<AdminTabNav>` (link-based) | Used across some admin sub-pages |
| Custom `<button>` group | `materials-client.tsx` (learning/assessment/website toggle) |
| Inline toggle with `cn()` | `ast-inspector-client.tsx` |

### 3.4 Layout Wrapper Patterns

| Pattern | Locations |
|---------|-----------|
| Route group `layout.tsx` with `max-w-6xl px-4 py-8` | `(academic)/layout.tsx`, `(content)/layout.tsx`, `(eval)/layout.tsx` |
| Inline wrapper in page | `blog/page.tsx` uses `max-w-6xl mx-auto space-y-8 p-6` directly |
| No wrapper | `admin/ops/page.tsx` delegates to `<OpsClient>` |

### 3.5 State Update Patterns

| Pattern | Locations | Risk |
|---------|-----------|------|
| `router.refresh()` | `courses-dashboard.tsx`, `tokens-dashboard.tsx`, `materials-client.tsx` | Causes full re-fetch, no optimistic UI |
| `setLocalXxx()` optimistic | `questions-client.tsx`, `quizzes-client.tsx`, `jobs-client.tsx` | Better UX but inconsistent usage |
| `useQuery` with `@tanstack/react-query` | `ops-client.tsx` only | Only one page uses react-query for auto-refresh |

### 3.6 Form Element Patterns (mixed)

| Element | Material | Source |
|---------|----------|--------|
| Native `<select>` | `materials-client.tsx` (lines 778, 831) | Inconsistent with design system |
| Shadcn `<Select>` | Most other files | Preferred by design system |
| Native `<textarea>` with custom classes | `bundle-importer-tab.tsx` (line 236) | Inconsistent with `<Textarea>` component |
| `<Input>` component | Most files | Consistent |

---

## 4. Dead Code / Unused

| Item | Location | Notes |
|------|----------|-------|
| `components/admin-navbar.tsx` | `components/` | Defined, zero imports across app pages |
| `components/admin/refresh-analytics-button.tsx` | `components/admin/` | Imported only in admin dashboard page |
| `components/admin/web-analytics-charts.tsx` | `components/admin/` | Check if actually imported in web-analytics/page.tsx |

---

## 5. Architecture Issues

### 5.1 Server Action Proliferation
- 7 separate `actions.ts` files, each with 200-900 lines
- Some actions are used by only one component (e.g., `import-actions.ts` used only by `bundle-importer-tab.tsx`)
- Action files mix domain logic with `"use server"` boundary

### 5.2 No Standard Admin CRUD Pattern
- Questions: `fetch("/api/admin/questions")` + optimistic `setLocalQuestions()`
- Courses: `saveCourse()` server action + `router.refresh()`
- Quizzes: `fetch("/api/quiz/templates")` + optimistic `setTemplates()`
- Tokens: `generateEnrollmentToken()` server action + `router.refresh()`

### 5.3 Client Component Size
- Three files exceed 1,000 lines (`detail-client.tsx`, `materials-client.tsx`, `drive-explorer.tsx`)
- These mix data fetching, UI rendering, form state, animation, and business logic in a single component
- No extraction of sub-components or custom hooks

### 5.4 Layout Proliferation
- 4 layout files (`(admin)/layout.tsx`, `(academic)/layout.tsx`, `(content)/layout.tsx`, `(eval)/layout.tsx`)
- Academic layout is 241 B (trivial - just a `max-w-6xl px-4 py-8` wrapper)
- Could be merged into one layout

---

## 6. Recommendations (Priority Order)

### P0 - Split Monoliths
Break down the 3 largest files:
- `detail-client.tsx` (3019 lines) -> KO section, Chapter section, Flashcard section, Quiz Pool section
- `materials-client.tsx` (~2600 lines) -> IngestionWizard, AnalysisStep, CurationStep, DocumentUpload
- `drive-explorer.tsx` (1305 lines) -> FolderTree, FileTable, ContextMenu, RenameDialog

### P1 - Merge Duplicate Importer Components
- Extract a shared `AdminJsonImporter` base component from `bundle-importer-tab.tsx` and `assessment-bundle-importer-tab.tsx`
- The two differ only in server action target and result rendering

### P2 - Standardize UI Patterns
- Pick one card variant (`rounded-xl border border-border bg-card`; drop `rounded-2xl`)
- Pick one table pattern (prefer div-based `divide-y` over native `<table>` for consistency)
- Pick one tab pattern (prefer `<Tabs>` radix for interactive; `<AdminTabNav>` for navigation)
- Standardize on `<Select>` (shadcn) everywhere; remove native `<select>`

### P3 - Create Shared CRUD Hooks
- `useAdminCrud<T>` with common patterns: loading, delete dialog, optimistic update, toast notifications
- Would eliminate 5+ identical delete-dialog patterns

### P4 - Merge Layout Wrappers
- Consolidate `(academic)`, `(content)`, `(eval)` layouts into one layout at `(admin)/admin/` level
- They all do the same thing: `max-w-6xl px-4 py-8`

### P5 - Adopt TanStack Query Consistently
- Extend react-query usage from `ops-client.tsx` pattern to other admin pages
- Enables auto-refresh, caching, and eliminates manual `router.refresh()` calls

### P6 - Remove Dead Code
- Delete or re-purpose `components/admin-navbar.tsx`
- Verify `web-analytics-charts.tsx` usage and remove if orphaned

---

## 7. File-by-File Summary

```csv
File, Lines, Issues
app/(admin)/layout.tsx,19, OK
app/(admin)/admin/page.tsx,383, Dashboard metrics query could use a dedicated API instead of inline SQL
app/(admin)/admin/(academic)/layout.tsx,8, Trivial; merge candidate
app/(admin)/admin/(academic)/courses/page.tsx,81, OK
app/(admin)/admin/(academic)/courses/actions.ts,331, Duplicate CATEGORY_OPTIONS with courses-dashboard.tsx
app/(admin)/admin/(academic)/courses/import-actions.ts,932, MONOLITH: JSON parser + import logic; extract JSON error tools
app/(admin)/admin/(academic)/tutorial-pka/,~7 files, OK (simple route pages)
app/(admin)/admin/ai/(content)/layout.tsx,9, Trivial; merge candidate
app/(admin)/admin/ai/(content)/materials/materials-client.tsx,~2600, CRITICAL: split into sub-components
app/(admin)/admin/ai/(content)/materials/[id]/actions.ts,~300, OK
app/(admin)/admin/ai/(content)/materials/[id]/detail-client.tsx,3019, CRITICAL: largest file in admin
app/(admin)/admin/ai/(content)/assessments/assessments-client.tsx,432, Duplicate PDF upload pattern
app/(admin)/admin/ai/(content)/assessments/[id]/detail-client.tsx,516, OK (moderate)
app/(admin)/admin/ai/(content)/ast-inspector/ast-inspector-client.tsx,613, OK (standalone tool)
app/(admin)/admin/ai/(content)/diktats/diktats-client.tsx,519, OK (moderate)
app/(admin)/admin/ai/(eval)/layout.tsx,8, Trivial; merge candidate
app/(admin)/admin/ai/(eval)/questions/questions-client.tsx,871, Extract QuestionRow; standardize filter bar
app/(admin)/admin/ai/(eval)/quizzes/quizzes-client.tsx,677, Extract create form into sub-component
app/(admin)/admin/ai/(eval)/jobs/jobs-client.tsx,336, OK
app/(admin)/admin/blog/page.tsx,88, Inconsistent page shell (no route group wrapper)
app/(admin)/admin/notifications/,~3 files, OK
app/(admin)/admin/ops/ops-client.tsx,254, Good pattern (react-query); reference for P5
components/admin/bundle-importer-tab.tsx,647, DUPLICATE: ~60% overlap with assessment-bundle-importer
components/admin/assessment-bundle-importer-tab.tsx,397, DUPLICATE: mirror of bundle-importer-tab
components/admin/courses-dashboard.tsx,555, Inline table with inline editing row pattern
components/admin/tokens-dashboard.tsx,432, OK
components/admin/pdf-materials-tab.tsx,371, Chapter selector overlaps with courses-dashboard
components/admin/drive-explorer.tsx,1305, Split into file-tree and file-table sub-components
components/admin/markdown-editor.tsx,~400, OK
components/admin/tab-nav.tsx,38, OK (link-based tabs)
components/admin/refresh-analytics-button.tsx,~40, Low utility; could be inline
components/admin/web-analytics-charts.tsx,~100, Verify usage
components/admin-sidebar.tsx,214, OK
components/admin-navbar.tsx,43, DEAD CODE: not imported anywhere
```
