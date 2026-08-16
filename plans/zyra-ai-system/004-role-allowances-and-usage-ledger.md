# Plan 004: Enforce murid, tutor, and admin allowances

> **Executor instructions**: This plan performs an additive database migration. Execute only after Idea-centered Overhaul Plan 005 and only when no other executor is editing `db/schema.ts` or running staging migrations. Preserve every existing AI usage row.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- db/schema.ts lib/usage-budget-service.ts lib/prompt-executor.ts lib/date-utils.ts lib/auth tests scripts docs lib/env.ts package.json`. Any schema or role-contract mismatch is a STOP condition.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plan 003 and Idea-centered Overhaul Plan 005
- **Category**: correctness, migration
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

The current allowance check counts historical events and records usage after generation. Concurrent requests can all pass before any event is written, and usage-write failures are swallowed. A transactional application allowance must reserve before provider dispatch, remain idempotent across retries, and preserve existing usage history.

## Current state

Anchors to reverify:

```ts
// lib/usage-budget-service.ts:9
tutorPerDay: 30,

// lib/usage-budget-service.ts:38
static async canUseFeature(userId: string, limit = 30): Promise<boolean>

// lib/prompt-executor.ts:124
UsageBudgetService.canUseFeature(userId, options?.quotaLimit ?? 30)
```

`lib/usage-budget-service.ts` excludes `cache:hit` events, uses an inline UTC date string at line 79, and uses inline `setDate` pruning at line 122. `db/schema.ts` already contains `ai_usage_events` and `ai_generation_traces`. These rows must remain queryable.

## Approved allowance policy

| Peran | Provider-backed turns per Jakarta day | Total interactions | Per-minute | Premium maximum |
|---|---:|---:|---:|---:|
| murid | 20 | 60 | 8 | 2 |
| tutor | 50 | 150 | 12 | 5 |
| admin | no individual cap | 300 abuse guard | 20 | global pool only |

Rules:

- Exact or semantic cache hit costs 0 provider-backed turns but counts as one total interaction.
- Deterministic actions cost 0 provider turns.
- One ordinary request reserves one turn. Premium routing does not charge extra to the user.
- Failed validation before provider dispatch refunds the application reservation.
- Timeout or unknown state after dispatch commits the turn.
- Admin has no individual daily provider allowance, but Plan 003 global project-model ceilings still apply.
- Role resolution uses active `admin`, `tutor`, or `murid` membership from the overhaul compatibility layer. AI chat speaker roles remain `user` and `assistant`.

## Scope

**In scope**:

- Add an authoritative additive table such as `ai_allowance_leases` in `db/schema.ts`. Do not repurpose or delete `ai_usage_events`.
- Add unique idempotency, user-day, status, and lease indexes.
- Refactor `lib/usage-budget-service.ts` into reserve, commit, refund, cache-hit, and remaining operations.
- Add named Jakarta-day helpers to `lib/date-utils.ts` if the overhaul has not already provided them.
- Integrate the allowance boundary into `lib/prompt-executor.ts` without switching model routing.
- Add authenticated usage summary APIs for the current user.
- Add migration, contract, concurrency, and staging reconciliation scripts.
- Update all schema, feature, architecture, development, deployment, and readiness docs required by `AGENTS.md`.

**Out of scope**:

- Cloudflare provider quota internals, model selection, UI, learner personalization, and production.
- Rewriting or deleting legacy `ai_usage_events`.
- Changing academic mastery or assessment data.

## Git workflow

- Branch: `codex/zyra-ai-004-allowance-ledger` from accepted Plan 003 plus Overhaul Plan 005.
- Commit example: `feat(zyra): add transactional role allowances`.
- Never commit `.env.staging` or generated evidence.

## Steps

### Step 1: Freeze the usage baseline

Create a read-only staging manifest for counts, primary-key hashes, per-user totals, request types, and min/max timestamps from `ai_usage_events` and `ai_generation_traces`. Mask user IDs.

**Verify**: `bun --env-file=.env.staging scripts/staging/manifest-ai-usage.ts --phase before --run-id <runId>` exits 0 and writes no database rows.

### Step 2: Add the allowance lease schema

Add an expand-only table with opaque lease ID, idempotency key, user ID foreign key, resolved peran, feature, app-day, units, premium flag, status, control-plane lease ID, created, dispatched, resolved, and expiry timestamps. Use enums or checked application contracts for `reserved`, `dispatched`, `committed`, and `refunded`.

Do not backfill one lease per legacy event. Legacy events remain historical reporting input; the new table becomes authoritative when `FEATURE_ZYRA_ALLOWANCE_V2` is enabled.

**Verify**: `bun run db:generate` produces only additive DDL. Inspect the generated migration. Then `bun run db:migrate` on the guarded staging target exits 0.

### Step 3: Implement transactional reservation

Resolve active access-role membership server-side. Within one database transaction, enforce per-minute, total interaction, provider-turn, and premium limits; insert or return the idempotent lease; and return remaining counts. Deny when persistence is unavailable. Do not fail open.

Use `FEATURE_ZYRA_ALLOWANCE_V2`. Off preserves the old behavior. On routes through the new service.

**Verify**: 50 concurrent reserve attempts for one murid result in exactly 20 provider reservations, never 21. Sixty-one cache-hit interactions result in exactly 60 accepted interactions and zero provider units.

### Step 4: Implement terminal transitions

Application lease transitions mirror Plan 003 semantics. Refund only if no provider dispatch occurred. Duplicate commit or refund returns the original terminal state. A dispatched timeout commits.

When control-plane reservation fails after application reservation, refund the application lease. When application persistence fails after control-plane reserve but before dispatch, refund the control-plane lease.

**Verify**: failure-injection tests reconcile application leases with control-plane leases at every boundary.

### Step 5: Preserve reporting compatibility

Continue writing `ai_usage_events` as a derived compatibility event after a successful terminal transition. A failure to write the compatibility event is recorded for repair but does not change the authoritative lease. Add a reconciliation job that identifies missing compatibility events by lease ID and repairs idempotently.

**Verify**: after repair, committed application leases equal compatibility provider events for the test run; old rows remain byte-for-byte represented in the baseline manifest.

### Step 6: Add current-user summary

Expose a server-only service and authenticated API returning app day, provider turns used and remaining, total interactions used and remaining, premium used and remaining, cache saves, and next reset timestamp. A murid or tutor can read only their own summary. Admin cannot use this endpoint to enumerate users.

**Verify**: authorization tests cover self, other user, unauthenticated, multi-role, and admin cases.

### Step 7: Reconcile staging and rehearse rollback

Run dedicated test identities for murid, tutor, admin, and multi-role. Toggle the feature on, exercise reserve and terminal states, toggle off, then verify old history and new leases remain readable.

**Verify**: before and after legacy counts and hashes match; new authoritative counters reconcile exactly.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/ai-allowance.test.ts tests/contracts/ai-allowance-concurrency.test.ts tests/contracts/ai-allowance-auth.test.ts tests/contracts/ai-allowance-reconciliation.test.ts
bun run typecheck
bun run db:generate
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run db:migrate
bun --env-file=.env.staging scripts/staging/reconcile-ai-usage.ts --run-id <runId> --strict
git diff --check
```

Pass when oversubscription is zero, all accepted requests have one authoritative lease, legacy row counts and hashes do not change, cache hits consume zero provider turns, terminal transitions are idempotent, and `FEATURE_ZYRA_ALLOWANCE_V2` rollback preserves old and new history.

## Test plan

- All roles, multi-role resolution, role changes during a day, and missing membership.
- Per-minute, total, provider, and premium boundaries.
- Cache hits, deterministic actions, validation failure, provider dispatch, timeout, and retry.
- Fifty concurrent requests for one user and multiple users.
- Database failure, control-plane failure, and compatibility-event repair.
- Jakarta midnight and provider Pacific midnight separation.

## Done criteria

- [ ] Murid default is 20 fresh turns and tutor default is 50.
- [ ] Admin is globally constrained without an individual provider cap.
- [ ] New allowance reservations are transactional and fail closed.
- [ ] Existing usage and trace data is unchanged.
- [ ] API ownership checks pass.
- [ ] Migration, targeted tests, lint, typecheck, staging reconciliation, and diff check pass.
- [ ] Plan 004 evidence validates.

## STOP conditions

- A prior overhaul changed the user or peran schema without a stable compatibility repository.
- Migration contains DROP, rename, destructive update, or legacy-row rewrite.
- Another executor is running a schema migration.
- One concurrency test accepts more than the configured limit.
- A provider request can occur without an authoritative application lease.
- Reconciliation cannot account for every test lease.

## Rollback and maintenance

Set `FEATURE_ZYRA_ALLOWANCE_V2=0`. Preserve the additive table and all leases. Do not delete test leases; identify them by dedicated test accounts and run ID. Future allowance changes require policy versioning so historical decisions remain explainable.
