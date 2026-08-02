# Plan 002: Indonesian Identity and Role Expansion

Status: DONE. Staging role seed, parity reconciliation, and multi-role auth smoke passed.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- db lib app tests scripts docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/001-staging-safety-and-migration-ledger.md
- **Category**: migration, security
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Replace the single English access-role value with a multi-role Indonesian domain model while keeping every existing account and session operational. Canonical access roles become `admin`, `tutor`, and `murid`.

## Current state verified at planning snapshot

- `db/schema.ts` stores one `user.role` value typed as `admin | teacher | student`, defaulting to `student`.
- `lib/auth.ts` exposes the same single role through Better Auth.
- Tutor layouts already use `/tutor` URLs but authorize `teacher` or `admin`.
- The repository has many `student` and `teacher` strings that are not all access roles. Examples include table fields, UI copy, analytics variables, and `tutor_chat_messages.role = student | ai`.
- One person must be able to hold multiple roles in the target design.

Anchor excerpts:

```ts
// db/schema.ts:28
role: text("role").$type<"admin" | "teacher" | "student">().default("student"),

// lib/auth.ts:34-38
role: { type: "string", required: false, defaultValue: "student" },
```

## Git workflow

- Create branch `codex/002-indonesian-role-expansion` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `db/schema.ts`
- generated Drizzle migration
- new `lib/auth/peran.ts`
- new `lib/auth/authorization.ts`
- `lib/auth.ts`
- targeted auth session and authorization tests under `tests/contracts/`
- new `scripts/staging/backfill-peran.ts`
- new `scripts/staging/seed-peran-smoke.ts`
- new `scripts/staging/reconcile-peran.ts`
- new `scripts/staging/smoke-auth.ts`
- new `scripts/staging/classify-role-literals.ts`
- `package.json`
- `app/(admin)/layout.tsx`, `app/(tutor)/layout.tsx`, `app/(tutor)/tutor/layout.tsx`
- `docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`, `docs/features.md`, `AGENTS.md`

Out of scope: mass UI copy changes, renaming all learner tables, renaming chat speaker roles, deleting `user.role`, changing course data.

## Target contract

1. Add `pengguna` as the Indonesian domain identity table with a one-to-one primary-key and foreign-key relationship to Better Auth `user.id`. It stores domain status and audit timestamps, not duplicated passwords, OAuth accounts, sessions, email, or secret material. Use `RESTRICT` for destructive identity deletion during the migration.
2. Add `peran` with stable codes `admin`, `tutor`, `murid` and immutable IDs.
3. Add `pengguna_peran` with `(pengguna_id, peran_id)` uniqueness, created time, source, and optional course-independent audit actor. A user may have several rows.
4. Keep Better Auth infrastructure tables and the legacy `user.role` column during expand. `user`, `session`, `account`, and `verification` are explicit authentication-infrastructure exceptions to Indonesian physical naming. The role column becomes a compatibility projection, not the authorization source after the feature flag switches.
5. Map `teacher -> tutor`, `student -> murid`, `admin -> admin`. Unknown or null legacy values must be reported and must not be guessed.
6. Add `FEATURE_PERAN_V2`. Off means legacy authorization. On means all authorization uses `hasPeran()` and `hasAnyPeran()` over memberships, with an explicit admin override where current behavior already has one.
7. Do not change `tutor_chat_messages.role` in this plan. It is a conversation-speaker contract, not an access role.
8. Add a lintable inventory script that classifies every remaining literal `teacher` or `student` as `access-role`, `schema-legacy`, `chat-speaker`, `fixture`, `identifier`, or `copy`. Unclassified occurrences fail the plan.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Add schema tables and `FEATURE_PERAN_V2`; generate an additive migration.
2. Add pure role mapping and authorization helpers with unit tests.
3. Backfill one `pengguna` row per Better Auth user, then backfill memberships inside one transaction per batch. Use stable deterministic membership IDs so reruns are idempotent.
4. Run parity queries: every Better Auth user maps to exactly one `pengguna`; every legacy role maps to at least one membership; no user is lost.
6. Switch only the top-level admin and tutor layout gates behind `FEATURE_PERAN_V2`. Keep downstream callers on legacy paths until Plan 014.
7. Run staging sign-in and session-refresh smoke tests for one account of each role and one multi-role account. Use seeded or existing staging accounts; if staging has no pre-seeded multi-role identity, add one deterministic tutor membership to an explicitly selected existing active staging admin with `staging:seed-peran-smoke --email <existingAdminEmail>` or `--user-id <existingAdminUserId>`. Never use production credentials.
8. Document the role vocabulary and the temporary compatibility column.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/peran.test.ts tests/contracts/auth-authorization.test.ts
bun run typecheck
bun run db:generate
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:migrate -- --run-id <runId> --plan 002
bun --env-file=.env.staging run staging:backfill-peran -- --run-id <runId>
bun --env-file=.env.staging run staging:seed-peran-smoke -- --run-id <runId> --email <existingAdminEmail>
bun --env-file=.env.staging run staging:reconcile-peran -- --run-id <runId>
bun --env-file=.env.staging run staging:smoke-auth -- --roles admin,tutor,murid,multi
git diff --check
```

Pass only when `pengguna` count and mapped user count equal legacy user count, unsupported legacy-role count is zero, duplicate membership count is zero, all four auth smoke cases pass, and rerunning the backfill changes zero rows.

## Test plan

- Add exact mapping, unknown role, multi-role, idempotent backfill, admin override, assigned tutor, unassigned tutor, murid denial, and session-refresh cases.
- Model authorization assertions after current contract tests under `tests/contracts/`, and keep remote sign-in out of unit tests.
- Require one negative test proving the chat speaker value `student` is not treated as an access role.

## STOP conditions

- Any account lacks a deterministic role mapping.
- A migration deletes or rewrites `user`, `session`, `account`, or `verification`, or duplicates authentication credentials into `pengguna`.
- Any current admin or tutor loses access with the flag on.
- Any `teacher` or `student` literal remains unclassified.
- A multi-role account cannot access both of its intended surfaces.

## Maintenance notes

Keep `user.role` only as a temporary compatibility projection. Any new authorization caller added before Plan 014 must use the helper and be added to the literal classification manifest.

## Rollback

Set `FEATURE_PERAN_V2=0` in staging and redeploy. Legacy `user.role`, assignments, and enrollments remain untouched. The new membership rows may remain for diagnosis; do not delete them during rollback.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-002-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Canonical domain identity and authorization use `pengguna` plus `admin`, `tutor`, and `murid` memberships.
- Every existing user and assignment has an exact compatibility mapping.
- Legacy authorization remains available by flag rollback.
- No chat speaker or unrelated identifier was changed by a blind replacement.
