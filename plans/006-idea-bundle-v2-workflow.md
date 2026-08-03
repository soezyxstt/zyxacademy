# Plan 006: Idea Bundle V2 Workflow

Status: blocked until Plan 005 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- lib app components scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/005-deterministic-legacy-backfill-and-compatibility.md
- **Category**: direction, security
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Replace the current loose JSON learning-bundle import with a strict ZIP-based Idea Bundle workflow: upload, validate, deduplicate, detect conflicts, stage, review, approve, and atomically publish.

## Current state to reverify

- `lib/bundle-importer.ts` imports JSON directly into legacy concepts, KOs, materials, flashcards, and relations.
- Its types include broad `any` payloads, and its dry run aborts a transaction after attempting changes.
- `components/admin/bundle-importer-tab.tsx` accepts pasted or uploaded JSON and presents simulated progress.
- `docs/bundle/` was absent at the planning snapshot, even though bundle documentation is an architecture requirement.

Anchor excerpt from `lib/bundle-importer.ts:148-157`:

```ts
export async function importChapterBundle(
  bundle: any,
  chapter: any,
  mode: ImportMode,
  log: (msg: string) => void = () => {},
  dryRun = false,
): Promise<ChapterImportResult> {
  return await db.transaction(async (tx) => {
```

The V2 boundary must replace these `any` inputs with strict contracts while preserving the legacy adapter until final cutover.

## Git workflow

- Create branch `codex/006-idea-bundle-v2` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- replace or version `lib/bundle-importer.ts` without removing the legacy adapter yet
- new `lib/bundle/idea-bundle-v2.ts`
- new `lib/bundle/zip-reader.ts`
- new `lib/bundle/validator.ts`
- new `lib/bundle/staging.ts`
- new `lib/bundle/publication.ts`
- new `app/api/admin/bundles/idea/**`
- `components/admin/bundle-importer-tab.tsx`
- `lib/env.ts`
- `tests/contracts/idea-bundle-v2.test.ts`
- fixtures under `tests/fixtures/bundles/idea-v2/`
- new `scripts/staging/test-idea-bundle.ts`
- new `scripts/staging/reconcile-bundle.ts`
- `package.json`
- `docs/bundle/idea-bundle-v2.md`, `docs/features.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`

Out of scope: generating the bundle inside Zyx, Product Bundle, authoring context export, deleting legacy importer.

## Bundle contract

The uploaded ZIP contains `manifest.json`, JSON entity files, optional Markdown, and assets. Reject path traversal, symlinks, executable content, nested archives, decompression bombs, duplicate normalized paths, and files exceeding configured limits.

`manifest.json` must include bundle ID, bundle type `idea`, schema version, course ID, source versions and checksums, entity file list and checksums, stable IDs, creator, curator if present, AI provider or model and prompt version when AI-assisted, created timestamp, and bundle checksum. Unknown manifest fields fail validation for the current schema version.

Each Idea must include stable ID, version, status, Idea content, source references, semantic hash, and generation hash. Publish requires source existence, exact span validity, relation validity, concept-reference validity, no duplicate stable keys, and no unresolved conflicts.

## Workflow and authorization

1. Admin uploads and validates.
2. Validation writes an `impor_bundle` record and immutable validation report, but never published domain rows.
3. Duplicate bundle ID plus identical checksum returns the existing import and writes no new rows.
4. Same bundle ID with a different checksum is a conflict and cannot publish.
5. Valid content is materialized in staging rows associated with the import.
6. Tutor may review Idea correctness and provenance for assigned courses. Admin may approve or reject and is the only role allowed to publish.
7. Publish occurs in one Turso transaction, writes the complete audit trail, updates dependencies, and enqueues vector work only after commit through the outbox.
8. `FEATURE_IDEA_BUNDLE_V2` controls visibility. Legacy import remains available only while this flag is off.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Write schemas, ZIP security tests, fixtures, and validation reason codes.
2. Implement pure validation with no database writes.
3. Implement import registration and staging. Real progress must come from recorded phases, not client timers.
4. Implement review authorization and immutable review events.
5. Implement atomic publication and transaction rollback tests.
6. Add admin UI using existing design primitives and no pill controls.
7. Run staging imports for valid, identical retry, conflicting retry, invalid path, invalid checksum, missing source, duplicate Idea, and partial publish failure fixtures.
8. Publish a dedicated staging-only test bundle, then reconcile domain and audit rows. Do not publish migrated Tutorial PKA content through this test.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/idea-bundle-v2.test.ts tests/contracts/bundle-security.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:test-idea-bundle -- --run-id <runId> --fixture all
bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type idea
git diff --check
```

Pass only when all invalid fixtures have stable reason codes, identical retry adds zero rows, conflicting retry cannot stage, failed publication exposes zero new published entities, valid publication exposes all entities in one commit, every mutation has actor and audit metadata, and the outbox has exactly one logical job per published entity version.

## Test plan

- Cover ZIP traversal, symlink, duplicate normalized path, checksum mismatch, oversized files, unsupported schema, missing source, invalid span, duplicate stable key, relation cycle, identical retry, conflicting retry, unauthorized review, and forced transaction failure.
- Model durable publication assertions after current material and question contract tests, but do not reuse `any` bundle payloads.

## STOP conditions

- ZIP extraction can escape its temporary directory or exceed declared limits.
- Validation mutates canonical domain rows.
- A tutor can approve or publish outside assigned courses.
- A partial bundle can become visible.
- Duplicate upload creates duplicate source, Idea, provenance, or relation rows.

## Maintenance notes

New bundle schema versions need an explicit migrator and fixture. Never loosen the current schema with permissive unknown fields to accept a newer external bundle.

## Rollback

Set `FEATURE_IDEA_BUNDLE_V2=0`. Do not delete imported evidence. If a new publication must be withdrawn, create a superseding status event and dependency transition; never erase the published version.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-006-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Idea Bundle V2 is strict, secure, idempotent, reviewable, and atomic.
- Validation and staging are separated from canonical publication.
- Every import and decision is auditable.
- Legacy importer is still available by flag rollback.
