# Plan 020 (SPIKE): Add a course bundle exporter mirroring the existing importer

> **Executor instructions**: This is a DESIGN/SPIKE plan. Deliverable is a working export of one course into the existing bundle JSON schema plus a design note on round-trip fidelity. Follow the steps; where a step says "investigate," record findings. STOP conditions apply. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- lib/bundle-importer.ts lib/assessment-bundle-importer.ts scripts/import-bundle.ts docs/bundle`
> If any changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P3 (direction)
- **Effort**: M (coarse — spike)
- **Risk**: LOW (read-only export)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

A full course-content import path exists (`scripts/import-bundle.ts`, `lib/bundle-importer.ts`, `lib/assessment-bundle-importer.ts`, admin action `app/(admin)/admin/(academic)/courses/import-actions.ts`), but there is no export counterpart. Content can be imported from a JSON bundle but never exported — no backup, no course portability/duplication, no round-trip of the format the importer already defines (`docs/bundle/*`). The data model and importer already encode the full shape, so an exporter is disproportionately cheap and unlocks backups + course cloning.

## Current state

`lib/bundle-importer.ts` — entry point and the tables it writes (an exporter must serialize exactly these, in reverse):
```
export async function importChapterBundle(...)   // lib/bundle-importer.ts:148
```
Tables the importer touches (from the insert/select sites): `courses` (161), `chapters` (192), `concepts` (224), `conceptLocalizations` (233), `knowledgeObjects` (336), `masterTeachingDocuments` (385), `websiteMaterials` (434), `flashcardSets` (469), `flashcards` (497), `knowledgeRelationships` (520). Assessments have their own importer `lib/assessment-bundle-importer.ts`.
- The bundle JSON schema/shape is documented under `docs/bundle/*` (AGENTS.md:184 references it) and encoded in the importer's TypeScript types (`BundleChapterDiff`, `ChapterImportResult`, and the input types `importChapterBundle` accepts). Read those types — they ARE the target schema for export.
- Import granularity is per-chapter (`importChapterBundle`). Export should likely be per-course (all chapters) or per-chapter to match.

## Commands you will need

| Purpose   | Command                                          | Expected  |
|-----------|--------------------------------------------------|-----------|
| Typecheck | `bun run typecheck`                              | exit 0    |
| Lint      | `bun run lint`                                    | exit 0    |
| Run export| `bunx tsx scripts/export-bundle.ts <courseId>`   | writes a JSON bundle |
| List courses | `bunx tsx scripts/list-courses.ts`            | prints course ids (existing script) |

## Scope

**In scope**:
- `lib/bundle-exporter.ts` (create — the read-only serializer)
- `scripts/export-bundle.ts` (create — CLI wrapper: `export-bundle.ts <courseId> [outPath]`)
- `docs/bundle/export.md` (create — round-trip design note)

**Out of scope (this spike)**:
- An admin UI button for export (follow-on once the serializer is proven).
- Exporting student data / attempts / progress — bundles are content only (courses/chapters/KOs/flashcards/assessments), matching the importer.
- Modifying the importer or the bundle schema.

## Git workflow

- Branch: `advisor/020-course-bundle-export-spike`
- Commit: `feat(bundle): add read-only course bundle exporter (spike)`
- No push/PR unless instructed.

## Steps

### Step 1: Derive the exact bundle shape from the importer types

Read `lib/bundle-importer.ts` and `lib/assessment-bundle-importer.ts` input types plus `docs/bundle/*`. Write down (in `docs/bundle/export.md`) the precise JSON shape the importer consumes — that is the exporter's output contract. The goal is round-trip: `export(courseId)` → bundle → `import(bundle)` reproduces the content.

**Verify**: `docs/bundle/export.md` lists the top-level bundle keys and per-entity fields, cross-referenced to the importer types.

### Step 2: Implement the read-only serializer

Create `lib/bundle-exporter.ts` exporting `exportCourseBundle(courseId: string): Promise<Bundle>` (reuse the importer's exported types for `Bundle`). Walk the tables the importer writes, in dependency order: course → chapters → (per chapter) concepts + conceptLocalizations, knowledgeObjects, MTD, websiteMaterials, flashcardSets + flashcards, knowledgeRelationships → assessments (via a sibling `exportAssessmentBundle` mirroring `lib/assessment-bundle-importer.ts`). Select only content columns; exclude student-specific data. Use the real column names from `db/schema.ts`.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: CLI wrapper

Create `scripts/export-bundle.ts` following the style of existing `scripts/*.ts` (e.g. `scripts/list-courses.ts` for the `@/db` import + arg parsing). It takes a `courseId`, calls `exportCourseBundle`, and writes pretty JSON to `stdout` or an out-path.

**Verify**: `bunx tsx scripts/export-bundle.ts <realCourseId>` writes a JSON file with the expected top-level keys.

### Step 4: Prove round-trip on one course (the real test of the spike)

Export a real course, then (in a scratch/dev DB or with `import-bundle.ts` in a dry-run/create mode if supported) re-import it and confirm the content matches. Record the fidelity result and any gaps (fields the exporter could not reproduce) in `docs/bundle/export.md`. Do NOT run the import against production.

**Verify**: round-trip performed on at least one course; `docs/bundle/export.md` records fidelity + any gaps.

## Test plan

- If the serializer has pure sub-functions (e.g. row→bundle-entity mappers), unit-test a couple with `bun test`.
- The core verification is the Step 4 round-trip on real data (documented), since the exporter's correctness is defined by "the importer accepts it and reproduces the course."

## Done criteria

ALL must hold:
- [ ] `lib/bundle-exporter.ts` exports `exportCourseBundle` (read-only; no writes)
- [ ] `scripts/export-bundle.ts` produces a JSON bundle for a real course
- [ ] Round-trip demonstrated on one course; fidelity + gaps documented in `docs/bundle/export.md`
- [ ] `bun run typecheck` / `bun run lint` exit 0
- [ ] Only in-scope files created/modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- The importer accepts data the DB cannot fully reconstruct (e.g. transient fields, external file blobs referenced by key) — export what is reproducible, document the gap, and STOP before claiming full round-trip.
- Assessments have a materially different bundle shape that would balloon this spike — export course content first, note assessments as a documented follow-on.
- The bundle schema in `docs/bundle/*` disagrees with the importer's actual types — trust the code, note the doc drift (that is itself a finding).

## Maintenance notes

- Reviewer: confirm the exporter is strictly read-only (no `insert`/`update`/`delete`).
- Natural follow-ons: an admin "Export" button, and course cloning (export → import with new ids).
- Keep exporter and importer in lockstep: any importer schema change must update the exporter, or round-trip breaks.
