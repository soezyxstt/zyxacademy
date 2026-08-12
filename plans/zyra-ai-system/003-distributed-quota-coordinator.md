# Plan 003: Implement distributed project and model quota leases

> **Executor instructions**: Work only inside the new Zyra control-plane Worker. Do not integrate the Next.js application or edit the database in this plan. Run concurrency tests before any staging deployment.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- workers/zyra-control-plane plans/zyra-ai-system`. Any incompatible Plan 001 change is a STOP condition.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 001 and 002 contract definitions
- **Category**: correctness, infrastructure
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

Process-local counters reset on cold start and diverge across serverless instances. With four independent Google projects, Zyx must reserve provider capacity atomically per project and model, then commit or refund it exactly once. A leaked or double-counted reservation directly reduces tutoring capacity or allows provider quota oversubscription.

## Current state

`lib/gemini-keys.ts` stores request timestamps, request dates, successes, failures, and circuit state in a JavaScript `Map`. `app/api/admin/key-diagnostics/route.ts` exposes that process-local snapshot. Neither is a distributed source of truth.

Plan 001 provides an authenticated Worker, SQLite-backed `ZyraQuotaCoordinator`, KV, R2, Vectorize, and Analytics Engine bindings. Plan 002 provides the typed model registry. Generate the Worker's serializable model contract from one checked source; do not create a drifting quota table.

## Lease contract

Every provider miss follows:

1. `reserve` atomically chooses a healthy project slot and creates a short-lived lease.
2. `dispatch` marks that a provider request is about to be sent.
3. `commit` records the provider attempt and outcome exactly once.
4. `refund` releases a lease only when no provider request was sent.
5. `expire` resolves abandoned leases conservatively. Unknown dispatch state counts as committed.

Required lease fields are opaque lease ID, idempotency key, hashed user ID, role, feature, route class, canonical model, project alias, state, provider-day and app-day labels, timestamps, cache status, and provider outcome code. Store no prompt, answer, API key, raw project ID, or student text.

Use one global coordinator object for the initial 30-active-murid scale. Do not split counters across objects until measured contention requires it, because cross-object transactions would weaken guarantees.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Tests | `bun test workers/zyra-control-plane/tests/quota-clock.test.ts workers/zyra-control-plane/tests/quota-state.test.ts workers/zyra-control-plane/tests/quota-concurrency.test.ts workers/zyra-control-plane/tests/quota-privacy.test.ts` | all pass |
| Lint | `bun run lint` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Dry run | `wrangler deploy --dry-run --env staging --config workers/zyra-control-plane/wrangler.jsonc` | exit 0 |
| Smoke | `bun --env-file=.env.staging scripts/staging/smoke-zyra-quota.ts --run-id <runId> --synthetic-concurrency 100` | zero over-allocation |

## Scope

**In scope**:

- `workers/zyra-control-plane/src/quota/**`.
- Durable Object handlers for reserve, dispatch, commit, refund, diagnostics, and health samples.
- SQLite schema owned by the Durable Object.
- Alarm-based lease resolution.
- Pure `bun:test` unit and concurrency tests.
- Worker staging smoke and evidence scripts.

**Out of scope**:

- Turso schema, app usage allowance, UI, semantic cache, Gemini calls, and production.
- Persisting raw request or learner content.

## Git workflow

- Branch: `codex/zyra-ai-003-quota-coordinator` from accepted Plan 001 plus the Plan 002 registry contract.
- Commit example: `feat(zyra): add distributed quota lease coordinator`.

## Steps

### Step 1: Define provider and application clocks

Provider RPD resets at the provider-defined Pacific day boundary. User allowances reset on `Asia/Jakarta` boundaries. Implement named time utilities with injected clocks and DST tests. Never derive either day inline in route handlers.

**Verify**: clock tests cover both sides of midnight, Pacific DST transitions, Jakarta midnight, and UTC date changes.

### Step 2: Add SQLite tables and indexes

Create internal tables for leases, daily project-model counters, minute buckets, health state, and idempotency responses. Use constraints so terminal lease states cannot transition again and counters cannot become negative.

**Verify**: schema tests reject duplicate idempotency keys, negative counters, and invalid transitions.

### Step 3: Implement atomic reservation

In one SQLite transaction, filter project slots by quarantine, circuit state, RPM, RPD usable ceiling, and active reservations. Score candidates by daily utilization, minute utilization, active leases, recent failure rate, then least-recent use. Break exact ties with deterministic rotation, not randomness.

Initial 3.5 Flash usable capacity is 64 across four slots. Initial 3.6 Flash usable capacity is 48 until its release gate passes. Premium exhaustion returns `fallback_allowed` and consumes no premium counter.

**Verify**: 100 concurrent reservations never exceed any project-model ceiling and distribute within 15 percentage points when all projects are equally healthy.

### Step 4: Implement dispatch, commit, refund, and expiration

Callers mark `dispatched` immediately before the provider call. A lease can be refunded only from `reserved`. Provider timeout after dispatch commits one attempt because the provider may have received it. Duplicate terminal requests return the original result.

Use alarms to resolve expired reserved leases. Expired dispatched leases become `expired_committed`.

**Verify**: transition tests cover retry, duplicate delivery, timeout, Worker restart, and alarm replay with exact counters.

### Step 5: Add circuit and health state

Track per project-model latency, 429, 5xx, timeout, malformed response, and success. Open a circuit after the configured consecutive threshold or rolling failure rate. Half-open with one probe after cooldown. RPD exhaustion stays open until the next provider-day boundary.

Health updates are idempotent by provider attempt ID. An application validation failure is not a provider health failure.

**Verify**: tests cover open, half-open, close, RPD rollover, and one unhealthy project while the other three remain available.

### Step 6: Emit privacy-safe telemetry

Write one Analytics Engine point per lease transition using hashed user, role, feature, model, project alias, outcome, latency bucket, and cache status. Do not write prompts or answers. Analytics failure must not roll back a valid quota transaction.

**Verify**: telemetry tests reject raw email, raw user ID, and free-form text dimensions.

### Step 7: Deploy and run staging concurrency smoke

Deploy only after local tests pass. Use synthetic leases without Gemini calls for concurrency. Then perform a separately approved bounded provider smoke through Plan 002 adapters.

**Verify**: evidence reconciles lease terminal counts exactly with counters and bounded provider attempts.

## Test plan

- Pacific and Jakarta day boundaries.
- Atomic selection and fairness under 100 concurrent reservations.
- RPM, RPD, safety ceiling, and premium reserve enforcement.
- Idempotent retry and terminal transition rules.
- Alarm replay and restart recovery.
- Circuit breaker and one-project isolation.
- Telemetry privacy and analytics failure tolerance.

## Done criteria

- [ ] Atomic reserve, dispatch, commit, refund, and alarm expiration exist.
- [ ] Project-model quotas are isolated across four slots.
- [ ] Provider and app day boundaries have deterministic tests.
- [ ] Premium reserve and fallback behavior are enforced.
- [ ] Circuit state persists across Worker restarts.
- [ ] Staging evidence shows zero over-allocation and exact reconciliation.
- [ ] All local gates and `git diff --check` pass.

## STOP conditions

- Correctness requires a transaction across more than one Durable Object.
- A provider call can occur without first marking its lease dispatched.
- Existing Worker configuration uses a different storage backend or lifecycle declaration than Plan 001.
- Concurrency tests over-allocate by one request.
- Any telemetry field contains raw user or prompt data.
- A remote test would consume more provider quota than declared.

## Rollback and maintenance

Disable application callers; preserve the Durable Object namespace and lease ledger. Never delete quota state during rollback. A new model or quota change requires a versioned registry update and replay of concurrency tests before activation.
