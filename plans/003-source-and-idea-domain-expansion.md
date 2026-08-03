# Plan 003: Source and Idea Domain Expansion

Status: DONE. Additive source and Idea schema, contracts, and staging reconciliation passed.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- db lib tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/002-indonesian-identity-and-role-expansion.md
- **Category**: migration, architecture
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Add the canonical source and Idea domain without modifying existing KOs. `ide` becomes the future learning atom, while `concepts` remains the global cross-course registry.

## Current state verified at planning snapshot

- `knowledge_objects` currently owns course, chapter, concept, content, type, difficulty, Bloom level, provenance identity, status, and a Pinecone vector ID.
- `knowledge_object_sources` already stores source spans and offsets.
- `concepts` and `concept_localizations` already provide a global concept registry.
- `knowledge_relationships` represents KO dependencies.
- Existing extraction and canonicalization code under `lib/knowledge/` has stable identity and source-span behavior that must be preserved, not rebuilt without reason.

Anchor excerpt from `db/schema.ts:944-1015`: `concepts.canonicalSlug` is globally unique, while `knowledgeObjects` owns `courseId`, `chapterId`, `conceptId`, content, `pineconeVectorId`, status, `stableKey`, `semanticHash`, version, `knowledgeKind`, and `instructionalRole`. Reverify these exact fields before creating the target mapping.

## Git workflow

- Create branch `codex/003-source-idea-domain` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `db/schema.ts`
- generated Drizzle migration
- new `lib/ide/contracts.ts`
- new `lib/ide/identity.ts`
- new `lib/ide/dependencies.ts`
- new `lib/sumber/contracts.ts`
- targeted tests under `tests/contracts/idea-domain.test.ts`
- `lib/env.ts`
- `docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`, `docs/features.md`, `docs/bundle/idea-bundle-v2.md`, `AGENTS.md`

Out of scope: backfilling KOs, changing extraction callers, product tables, Vectorize writes, publishing UI.

## Target schema contract

Use Indonesian physical table names for new learning-domain tables. Keep `concepts` and `concept_localizations` unchanged as the explicit global-registry exception.

1. `mata_kuliah`: stable ID, code, title, status, and compatibility reference to legacy course ID.
2. `bab`: stable ID, `mata_kuliah_id`, code, title, order, status, and compatibility reference to legacy chapter ID.
3. `pendaftaran_murid`: stable ID, `pengguna_id`, `mata_kuliah_id`, status, start and end timestamps, and compatibility reference to legacy enrollment ID.
4. `penugasan_tutor`: stable ID, `pengguna_id`, `mata_kuliah_id`, status, assignment scope, and compatibility reference to the legacy tutor-course row.
5. `sumber_materi`: stable ID, course and optional chapter, source type, title, canonical URI or R2 key, version, checksum, status, creator, timestamps.
6. `potongan_sumber`: stable ID, source ID and version, text or structured payload, page and section locator, start and end offsets, checksum, embedding eligibility, timestamps.
7. `ide`: stable ID, course, chapter, optional global `concept_id`, stable key, code, canonical statement, concise explanation, optional LaTeX, knowledge kind, instructional role, difficulty metadata, version, status, schema version, semantic hash, generation hash, creator, curator, timestamps. Do not include provider-specific vector IDs.
8. `asal_ide`: Idea, source chunk, provenance role, exact offsets, source checksum, note, and uniqueness preventing duplicate spans.
9. `relasi_ide`: source Idea, target Idea, typed relation, explanation, version, status, and a uniqueness constraint. Reject self-relations and cycles for prerequisite relation types.
10. `ketergantungan_produk`: upstream entity type, ID, version and hash; downstream entity type, ID, version and hash; freshness `UP_TO_DATE | NEEDS_REVIEW | STALE`; reason and timestamps.
11. `peta_id_legacy`: legacy table and ID to target table and ID, mapping version, source checksum, target checksum, run ID, and unique legacy and target mappings.
12. Add `FEATURE_ARSITEKTUR_IDE_V1`; it remains off in this plan.

All entity contracts use Zod and reject unknown fields at import boundaries. Database status and enum-like values must be backed by TypeScript unions plus CHECK constraints where Drizzle supports them safely.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Define domain vocabulary and Zod contracts first. Add fixtures for one single-source Idea, one multi-source Idea, one cross-concept Idea, one valid prerequisite edge, and invalid self or cyclic edges.
2. Add all tables and indexes to `db/schema.ts`; generate and inspect an additive migration.
3. Implement stable ID and semantic hash helpers. Identical semantic content and provenance must produce the same stable key and checksum across runs.
4. Implement dependency freshness transitions. An upstream hash change moves descendants to `NEEDS_REVIEW`; a withdrawn upstream moves them to `STALE`; reapproval restores `UP_TO_DATE` only after downstream validation.
5. Add database constraint tests using an isolated SQLite database.
6. Migrate staging with the feature flag off and reconcile all legacy tables unchanged.
7. Update architecture and schema documentation, including the `concepts` exception.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/idea-domain.test.ts tests/contracts/ko-pipeline.test.ts
bun run typecheck
bun run db:generate
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:migrate -- --run-id <runId> --plan 003
bun --env-file=.env.staging run staging:reconcile -- --run-id <runId> --expect additive
git diff --check
```

Pass only when all old row counts and key hashes are unchanged, all target tables exist, invalid relations fail deterministically, stable hashes repeat exactly, and dependency-state fixtures produce the expected transition table.

## Test plan

- Add schema and pure contract cases for stable identity, multi-source provenance, exact offsets, tutor-authored provenance, duplicate stable keys, invalid statuses, self-relations, prerequisite cycles, and freshness propagation.
- Follow `tests/contracts/ko-pipeline.test.ts` for deterministic fixtures and zero-network guards.

## STOP conditions

- The migration changes or drops `knowledge_objects`, `knowledge_object_sources`, `knowledge_relationships`, `courses`, `chapters`, or `concepts`.
- A target Idea can exist without a course, chapter, stable key, version, status, and semantic hash.
- A published Idea can lack source provenance unless its explicit source policy is `tutor_authored` and includes an accountable curator.
- Dependency changes can leave a published descendant marked `UP_TO_DATE` without revalidation.

## Maintenance notes

Future product types must register their dependency entity type and freshness transition. Do not add provider-specific fields such as a Pinecone ID to `ide`.

## Rollback

Keep `FEATURE_ARSITEKTUR_IDE_V1=0`. New empty tables can remain. Because no backfill or caller switch occurs, rollback is application-only after verifying old-table hashes.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-003-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- The target source, Idea, provenance, relation, and dependency schema exists in staging.
- `concepts` is explicitly retained as the global registry.
- No legacy data or caller changed.
- Plan 005 has stable target contracts to backfill.
