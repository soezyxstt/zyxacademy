# Plan 004: Product, Assessment, and Mastery Domain Expansion

Status: DONE. Plan 003 passed; Plan 004 implementation, local gates, and staging reconciliation passed on 2026-08-02.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- db lib tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/003-source-and-idea-domain-expansion.md
- **Category**: migration, architecture
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Add the normalized target schema for learning products, assessments, answers, per-Idea evidence, mastery, bundle lifecycle, and auditability. Keep all current tables intact until later plans prove parity.

## Current state verified at planning snapshot

- `website_materials` stores one generated material artifact per chapter with Markdown, AST, hashes, coverage, and publication status.
- `ai_question_bank` primarily links each question to one KO, while `assessment_objects` has separate concept and KO joins.
- `quiz_templates` combines quiz configuration, selection rules, and publish state.
- `student_quiz_attempts` preserves question and answer snapshots, which must remain immutable.
- `learning_events` and `student_concept_mastery` aggregate by `conceptName`, not stable Idea ID.
- Flashcards can link to one KO and have separate progress and review tables.

Anchor excerpt from `db/schema.ts:2110-2124`:

```ts
export const studentConceptMastery = sqliteTable("student_concept_mastery", {
  conceptName: text("concept_name").notNull(),
  masteryScore: integer("mastery_score").notNull(),
  confidence: integer("confidence").notNull(),
  evidenceCount: integer("evidence_count").notNull(),
});
```

The target keeps score and confidence separate but changes the stable key from a concept name to an Idea ID.

## Git workflow

- Create branch `codex/004-product-assessment-domain` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `db/schema.ts`
- generated Drizzle migration
- new `lib/produk/contracts.ts`
- new `lib/asesmen/contracts.ts`
- new `lib/pemahaman/contracts.ts`
- new `lib/bundle/contracts.ts`
- `lib/env.ts`
- targeted schema and contract tests
- `docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`, `docs/features.md`, `docs/bundle/product-bundle-v2.md`, `AGENTS.md`

Out of scope: legacy data backfill, content generation, bundle UI, mastery computation, Vectorize.

## Target schema contract

Add these Indonesian physical tables with stable IDs, versions, status, source and generation metadata, creator and curator, and timestamps where applicable.

1. Article and material: `artikel`, `artikel_ide`, `blok_artikel`, `diktat_materi`, `diktat_ide`.
2. Questions and solutions: `soal`, `soal_ide`, `soal_relasi_ide`, `pembahasan_soal`, `diktat_pembahasan`, `item_diktat_pembahasan`.
3. Protected references: `soal_itb_referensi`, `benchmark_soal`. A reference has `authoring_visibility = allowed | holdout`; holdout content can never be exported into authoring context.
4. Flashcards: `set_flashcard`, `flashcard`, `flashcard_ide`, `kemajuan_flashcard_murid`, `review_flashcard`.
5. Assessment definition: `blueprint_asesmen`, `asesmen`, `cakupan_asesmen`, `item_asesmen`. Enforce a quiz to exactly one chapter and a tryout to one or more chapters.
6. Assessment execution: `percobaan_asesmen`, `jawaban_murid`, `bukti_ide_jawaban`. Keep immutable rendered-question, option-order, response, grading-policy, and content-version snapshots.
7. Learning state: `bukti_pembelajaran`, `pemahaman_ide`, `perubahan_pemahaman`, `rekomendasi_flashcard`.
8. Bundle workflow: `impor_bundle`, `item_impor_bundle`, `review_bundle`, `publikasi_bundle`, `audit_mutasi`. Bundle ID plus checksum must be unique and publication must reference one approved import.
9. Add `FEATURE_PRODUK_IDE_V1`, `FEATURE_ASESMEN_IDE_V1`, and `FEATURE_PEMAHAMAN_IDE_V1`; all stay off.

## Mandatory invariants

- Every published article, diktat material, question, solution, and flashcard references at least one published Idea.
- `soal_ide.weight` is greater than 0 and the weights per question sum to 1 within `0.000001` at validation time.
- Multi-Idea status is independent from difficulty, cognitive level, reasoning pattern, and required Idea relations.
- `pemahaman_ide.skor` and `pemahaman_ide.keyakinan` are separate values from 0 to 100.
- An answer evidence row records Idea ID, score contribution, weight, confidence, evidence source, rubric version, and derivation status. Ambiguous evidence is stored but cannot change mastery.
- Publication is atomic. A bundle cannot expose only some approved entities.
- All dependent products carry the upstream generation hash needed to compute freshness.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Write strict Zod contracts and invariant fixtures before DDL.
2. Add schema tables in coherent sections of `db/schema.ts`; add indexes for course, chapter, status, version, attempt, murid, Idea, due date, and bundle checksum.
3. Add isolated database tests for uniqueness, required joins, immutable attempt snapshots, quiz and tryout scope, role-separated mastery fields, and atomic publication references.
4. Generate and inspect the migration. It must be additive only.
5. Apply to staging with all new flags off and reconcile all old tables.
6. Update diagrams and data dictionary. Explicitly map old English tables to future Indonesian tables but label the mapping as not backfilled until Plan 005.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/product-domain.test.ts tests/contracts/assessment-domain.test.ts tests/contracts/idea-mastery-domain.test.ts tests/contracts/bundle-v2.test.ts
bun run typecheck
bun run db:generate
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:migrate -- --run-id <runId> --plan 004
bun --env-file=.env.staging run staging:reconcile -- --run-id <runId> --expect additive
git diff --check
```

Pass only when every invariant has both a passing valid fixture and a failing invalid fixture, migration DDL is additive, legacy counts and primary-key hashes are identical, and all new feature flags remain off in staging.

## Test plan

- Add valid and invalid fixtures for every target table family, weight sums, quiz and tryout coverage, immutable snapshots, holdout visibility, publication atomicity, mastery ranges, and dependency hashes.
- Use current material, question, flashcard, and assessment contract tests as structural patterns while keeping the new tests provider-free.

## STOP conditions

- A published product can have zero Idea links or a stale dependency hash.
- A historical response can be updated in place after attempt submission.
- Mastery score and confidence are conflated into one field.
- A holdout reference lacks a database-enforced visibility state.
- The generated migration rewrites any legacy table.

## Maintenance notes

All future product tables must use the shared version, lifecycle, audit, and dependency contracts. A reviewer should scrutinize nullable foreign keys and every cascade rule for historical-data loss.

## Rollback

Leave new flags off and revert the application revision. New empty tables may remain. Verify the Plan 001 manifest against all pre-existing tables.

## Done criteria

- [x] All commands in Commands and pass criteria exit 0 with the stated result.
- [x] `artifacts/staging-overhaul/20260802-plan004-staging/plan-004-result.json` exists, validates, and records `status=passed` without secrets.
- [x] The Plan 004 commits contain no changes outside this plan's in-scope paths; unrelated unstaged Plan 012 and Plan 016 work was preserved and excluded.
- [x] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- [x] The complete target product, assessment, evidence, mastery, bundle, and audit schema exists in staging.
- [x] Publication and historical immutability invariants are test-covered.
- [x] No legacy data or runtime caller has changed.
- [x] Plan 005 can perform deterministic backfill into stable tables.
