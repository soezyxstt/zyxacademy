# Plan 005: Deterministic Legacy Backfill and Compatibility Layer

Status: blocked until Plan 004 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- db lib scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/004-product-assessment-and-mastery-domain-expansion.md
- **Category**: migration, correctness
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Populate the new Indonesian domain from existing staging data without deleting, rewriting, or hiding any legacy record. Add compatibility repositories so old and new models can operate together during the migration.

## Current state to reverify

- Meaningful learning content is concentrated in course ID `tutorial-pka`, but the migration must include every course and every row.
- Current content spans `courses`, `chapters`, `master_teaching_documents`, `knowledge_objects`, KO sources and relations, website materials, flashcards, question banks, assessment objects, quiz templates, attempts, analytics, learning events, and concept mastery.
- Historical attempts contain snapshots that are more authoritative for history than the current question row.
- Some old assessment mappings are heuristic and may map an assessment object to all chapter KOs when no exact concept match exists. These mappings must be marked ambiguous, not silently promoted to exact Idea evidence.

Anchor excerpt from `lib/assessment-bundle-importer.ts:98-104`: when no localization matches, the current mapper selects active KOs for all referenced chapters and adds their concept IDs. Treat every mapping produced by this fallback as ambiguous during backfill.

## Git workflow

- Create branch `codex/005-legacy-backfill` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- new `lib/migrasi/pemetaan-legacy.ts`
- new `lib/migrasi/repository-kompatibilitas.ts`
- new `scripts/staging/backfill-idea-domain.ts`
- new `scripts/staging/backfill-product-domain.ts`
- new `scripts/staging/backfill-assessment-history.ts`
- new `scripts/staging/backfill-overhaul.ts`
- new `scripts/staging/reconcile-overhaul.ts`
- targeted additions to current write repositories and actions for dual-write
- `lib/env.ts`
- `package.json`
- `db/schema.ts` only if a discovered mapping field is genuinely required; follow the normal generate and migrate rule
- fixtures and tests under `tests/migration/`
- `docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`, `docs/operations/production-readiness-checklist.md`, `AGENTS.md`

Out of scope: switching reads to the new model, changing visible workflows, deleting legacy tables, generating new content.

## Mapping rules

1. Preserve legacy primary IDs as target IDs where there is a one-to-one semantic entity and no collision. Otherwise derive a deterministic target ID and record it in `peta_id_legacy`.
2. Map every course and chapter to `mata_kuliah` and `bab`, then every enrollment and tutor assignment to `pendaftaran_murid` and `penugasan_tutor`, before content child rows.
3. Map every KO to one `ide`. Preserve stable key, semantic hash, version, lifecycle status, concept link, course, chapter, learning objective references, and all provenance spans.
4. Map current KO relations to `relasi_ide` with an explicit relation-type translation table. Unknown types go to an exception ledger and block automatic publication, but the source row remains intact.
5. Map website materials to articles and their current AST sections to article blocks only when the transformation is lossless. Otherwise store the complete legacy Markdown and mark blocks `needs_review`.
6. Map flashcards and reviews losslessly. A single-KO flashcard becomes a single-Idea link with weight 1.
7. Map questions with exact KO links to `soal_ide`. Heuristic or fallback mappings are `ambiguous` and cannot produce mastery evidence until reviewed.
8. Map every quiz template, attempt, response snapshot, analytics row, and PKA simulation reference. Do not recompute or alter old grades.
9. Historical evidence may be derived only when the immutable attempt snapshot and an exact Idea mapping agree. Other history remains queryable through the compatibility repository and is listed in the exception ledger.
10. Existing concept mastery becomes a compatibility baseline. Do not copy a concept score to every Idea in that concept. Seed per-Idea mastery only from attributable evidence; otherwise show the legacy concept baseline separately until new evidence exists.
11. Every backfill is idempotent and resumable using the migration ledger. Re-running a completed batch must write zero changed rows.

## Dual-write contract

Add one transaction-scoped repository boundary for current mutations. With `FEATURE_ARSITEKTUR_IDE_V1=0`, write legacy only. With `FEATURE_ARSITEKTUR_IDE_V1=1` and a migration-only `FEATURE_DUAL_WRITE_IDE=1`, write both models in one database transaction and record an audit row. A failed target write must roll back the legacy write. Reads stay legacy until their dedicated plans.

Cover at least material publish, flashcard review, quiz attempt submission, mastery event enqueue, enrollment, tutor assignment, and Tutorial PKA stage progress.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Build fixture databases representing empty, typical, ambiguous, duplicate, orphaned, and Tutorial PKA cases.
2. Implement deterministic mapping and dry-run reports. The dry run must report counts and exception codes without writes.
3. Backfill in foreign-key order, one bounded transaction per batch, with checkpoints and target checksums.
4. Implement compatibility reads and dual writes. Do not switch existing reads.
5. Run full staging backfill, then rerun it to prove idempotency.
6. Reconcile every table, relation, JSON snapshot, and target mapping. For exceptions, require a row with source identity, reason code, preservation path, and `blocks_cutover` boolean.
7. Run Tutorial PKA-specific parity: course, chapters or subjects, registrations, enrollments, announcements, schedules, simulation stages, templates, attempts, scores, analytics, and progress.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/migration/legacy-backfill.test.ts tests/migration/tutorial-pka-parity.test.ts tests/contracts/assessment-redaction.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:backfill-overhaul -- --run-id <runId> --dry-run
bun --env-file=.env.staging run staging:backfill-overhaul -- --run-id <runId> --apply
bun --env-file=.env.staging run staging:backfill-overhaul -- --run-id <runId> --apply --expect-noop
bun --env-file=.env.staging run staging:reconcile-overhaul -- --run-id <runId> --course tutorial-pka
git diff --check
```

Pass only when every legacy row is either mapped exactly once or has a zero-loss exception record, blocking exceptions equal zero, orphan count is zero, foreign-key violations are zero, all immutable snapshot hashes are unchanged, Tutorial PKA semantic counts and scores match, and the second apply changes zero rows.

## Test plan

- Build migration fixtures for empty, typical, duplicate, ambiguous, orphaned, interrupted, resumed, and Tutorial PKA datasets.
- Assert exact source and target counts, stable IDs, snapshot checksums, exception codes, transactional dual writes, and no-op reruns.
- Use a dedicated fake failure between legacy and target writes to prove transaction rollback.

## STOP conditions

- Any source row disappears, changes checksum, or maps to multiple conflicting targets.
- An ambiguous question-to-KO mapping is treated as exact.
- Legacy concept mastery is duplicated across multiple Ideas without evidence.
- A dual-write failure commits only one side.
- Tutorial PKA attempt, grade, registration, or stage-progress parity differs by one row or value.

## Maintenance notes

Never add an ad hoc backfill outside the migration ledger. Any newly discovered legacy shape needs a versioned mapper and fixture before it is handled in staging.

## Rollback

Set `FEATURE_DUAL_WRITE_IDE=0` and `FEATURE_ARSITEKTUR_IDE_V1=0`. Continue reading and writing the untouched legacy model. Preserve target rows and mapping evidence for debugging; do not delete them.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-005-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Every legacy record has a deterministic preservation path.
- Backfill is idempotent, resumable, and fully reconciled.
- New writes can be mirrored transactionally without changing visible behavior.
- Tutorial PKA remains operational on legacy reads.
