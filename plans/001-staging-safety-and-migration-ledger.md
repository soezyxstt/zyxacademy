# Plan 001: Staging Safety and Migration Ledger

Status: DONE.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- db lib scripts tests docs package.json .gitignore AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: migration, security
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Create the fail-closed staging execution layer that every later migration uses. This plan does not overhaul learning data yet. It makes remote staging changes identifiable, recoverable, and measurable without exposing credentials.

## Current state verified at planning snapshot

- `drizzle.config.ts` and `db/migrate.ts` load the default environment, so they do not prove that a remote migration targets staging.
- `db/migrate.ts` disables foreign keys during migration and does not run a post-migration `foreign_key_check`.
- `scripts/sync-turso-db.ts` drops every staging table before copying production. It is destructive and is forbidden for this program.
- `.env.staging` contains staging service variables, but existing scripts do not share one identity guard.
- The Vectorize Worker has distinct staging bindings in `workers/vector-api/wrangler.toml`.

Anchor excerpt from `db/migrate.ts:1-13`:

```ts
loadEnvConfig(process.cwd());
await db.run(sql`PRAGMA foreign_keys = OFF;`);
await migrate(db, { migrationsFolder: "./drizzle" });
await db.run(sql`PRAGMA foreign_keys = ON;`);
```

This has no explicit staging identity and no `finally` or foreign-key reconciliation.

Reverify these claims before editing. If the source commit differs, inspect the named files and record drift in the result artifact.

## Git workflow

- Create branch `codex/001-staging-safety-ledger` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `package.json`
- `.gitignore`
- local `.env.staging` only for adding `ZYX_ENVIRONMENT=staging` and `ALLOW_STAGING_MUTATION=1`; never commit this file or expose its other values
- `lib/env.ts`
- new `lib/staging/staging-guard.ts`
- new `lib/staging/migration-ledger.ts`
- new `scripts/staging/preflight.ts`
- new `scripts/staging/inventory.ts`
- new `scripts/staging/export.ts`
- new `scripts/staging/reconcile.ts`
- new `scripts/staging/migrate.ts`
- new `scripts/staging/restore-export.ts`
- new `tests/staging/staging-guard.test.ts`
- new `tests/staging/manifest.test.ts`
- `scripts/sync-turso-db.ts`
- `db/schema.ts`
- generated Drizzle migration from `bun run db:generate`
- `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, `docs/operations/production-readiness-checklist.md`, `AGENTS.md`

Out of scope: production access, schema renames, content backfill, Vectorize writes, Inngest events, R2 deletes.

## Required design

1. Add `migration_runs` and `migration_checkpoints` to `db/schema.ts`. A run records plan number, source commit, schema version, masked database fingerprint, phase, status, started and completed timestamps, row-count manifest hash, and error code. Checkpoints are append-only.
2. All staging scripts must be invoked with `bun --env-file=.env.staging`. The guard must additionally require `ZYX_ENVIRONMENT=staging` and `ALLOW_STAGING_MUTATION=1` for writes.
3. Compute resource fingerprints from normalized host, account, database, bucket, Worker, Inngest environment, and Vectorize index identifiers. Output hashes and safe labels only. Never output tokens, DSNs, query strings, or secret values.
4. Refuse execution if any staging database URL, Worker name, R2 bucket or prefix, Vectorize index, auth URL, or Inngest environment equals its production counterpart when both are available. Refuse names containing a production-only label unless an explicit allowlist committed in `lib/staging/staging-guard.ts` identifies the staging resource.
5. `staging:inventory` must record schema SQL hashes, table row counts, primary-key set hashes, foreign-key violations, and high-value semantic counts. High-value counts include users, sessions, enrollments, tutor assignments, courses, chapters, KOs, materials, flashcards, quizzes, attempts, answers or snapshots, mastery, PKA registration, PKA stage progress, announcements, and schedules.
6. `staging:export` serializes schema and table data as deterministic JSONL, then encrypts the payload with authenticated encryption using a staging export key supplied outside Git. Store only the encrypted archive and a non-sensitive SHA-256 cipher manifest under `artifacts/staging-overhaul/<runId>/backup/`. Sort rows by the declared primary key. Use keyed hashes for row and primary-key manifests so low-entropy personal values cannot be guessed from plain hashes. Redact secret-bearing configuration fields. Fail if the export key is absent. The export is read-only.
7. `staging:restore-export` may decrypt and restore only to an empty disposable database whose fingerprint differs from staging and production. It must never overwrite the active staging database or print decrypted rows.
8. `staging:migrate` must create a running ledger record, apply generated migrations, re-enable foreign keys in a `finally` block, run `PRAGMA foreign_key_check`, record the result, and fail unless it is empty.
9. Change `scripts/sync-turso-db.ts` to require a destructive-operation phrase and a separate command name. The overhaul commands must never call it.
10. If a credential is stored directly in a Wrangler config, replace it with a binding or secret reference and rotate it outside source control before the first remote test. Do not copy the old value into logs, plans, fixtures, or commits.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Add the guard and read-only preflight. Unit test masking, production equality detection, missing marker detection, and write opt-in.
2. Add inventory and export. Run both against staging before any schema change.
3. Add the ledger tables in `db/schema.ts`; run `bun run db:generate`. Review the generated migration for additive DDL only.
4. Add the guarded staging migration runner and package scripts.
5. Apply the ledger migration to staging, then run a second inventory.
6. Restore the export into a disposable empty database and reconcile it against the pre-migration manifest. Destroying that disposable database is outside this plan; report its identifier to the operator.
7. Update operational documentation and `AGENTS.md` current state.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/staging/staging-guard.test.ts tests/staging/manifest.test.ts
bun run typecheck
bun run db:generate
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:inventory -- --run-id <runId> --phase before
bun --env-file=.env.staging run staging:export -- --run-id <runId>
bun --env-file=.env.staging run staging:restore-export -- --run-id <runId> --target disposable
bun --env-file=.env.staging run staging:migrate -- --run-id <runId> --plan 001
bun --env-file=.env.staging run staging:inventory -- --run-id <runId> --phase after
bun --env-file=.env.staging run staging:reconcile -- --run-id <runId> --expect additive
git diff --check
```

Pass only when all commands exit 0, the export manifest verifies, `foreign_key_check` returns zero rows, every pre-existing table has the same row count and primary-key hash, only ledger tables are new, and the disposable restore has identical schema and data hashes.

## Test plan

- Model guard tests after the small pure contract tests in `tests/contracts/`; avoid network in unit tests.
- Cover masked output, missing staging marker, resource equality, production-like labels, write opt-in, deterministic row ordering, missing export key, authenticated-encryption tampering, empty tables, composite keys, and disposable-target refusal.
- The staging restore test must use only an explicitly empty disposable database.

## STOP conditions

- Any staging identifier is missing, ambiguous, or matches production.
- A command would print a secret or full authenticated URL.
- The generated migration drops, renames, or rewrites an existing table.
- Export verification fails or the disposable restore differs by one row.
- Foreign-key violations are nonzero.
- The current worktree contains changes outside the intentional old-plan deletions and Plan 001 scope that overlap these files.

## Maintenance notes

All later remote scripts must import the same staging guard and artifact writer. Reviewers should reject any new one-off environment loader or command that bypasses this boundary.

## Rollback

Keep the application flags unchanged. The ledger tables are additive and may remain after rollback. If migration fails, restore the previous application revision and use the pre-migration inventory to verify that all pre-existing tables and keys are unchanged. Do not restore the export over active staging.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-001-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- A new executor cannot mutate staging without explicit `.env.staging`, staging marker, and write opt-in.
- Complete before and after manifests exist and reconcile with zero data loss.
- A recovery export has been proven restorable to an empty database.
- Later plans can call one standard preflight, inventory, migrate, reconcile, and evidence pipeline.
