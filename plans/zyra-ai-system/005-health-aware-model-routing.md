# Plan 005: Integrate health-aware four-project routing

> **Executor instructions**: This plan switches provider routing but not pedagogical behavior. Complete it before Overhaul Plan 013 begins, or serialize it after that plan. Do not send unbounded retries and do not call a provider without both application and provider leases.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- lib/gemini.ts lib/gemini-keys.ts lib/ai-router.ts lib/prompt-executor.ts lib/ai/provider lib/usage-budget-service.ts app/api tests scripts docs lib/env.ts`.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 002, 003, and 004
- **Category**: correctness, reliability
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

The router currently selects from in-memory key state and static model arrays. It cannot coordinate four serverless processes, distinguish per-project RPD, or guarantee a request is counted once. The new route must combine role allowance, distributed project lease, model-family adapter, AI Gateway metadata, health feedback, and deterministic fallback in one auditable lifecycle.

## Current state

- `lib/ai-router.ts` defines model chains directly for many task types.
- `lib/gemini-keys.ts` constructs direct and AI Gateway clients and scores process-local scheduler state.
- `lib/gemini.ts` often tries Gateway first and direct afterward.
- `app/api/admin/key-diagnostics/route.ts` reports process-local key diagnostics as though globally authoritative.
- Plan 002 supplies typed model adapters and Plan 003 supplies project-model leases.

## Routing policy

| Route class | Primary | Fallback | Premium behavior |
|---|---|---|---|
| Standard tutoring | `gemini-3.1-flash-lite` | 2.5 Flash, then 2.5 Flash-Lite | no premium |
| Difficult pedagogical diagnosis | `gemini-3.5-flash` | 3.1 Flash-Lite | premium if global and per-user pools permit |
| Interactive visual or multimodal | `gemini-3.6-flash` | 3.5 Flash, then 3.1 Flash-Lite | premium |
| Emergency small text | Gemma 4 31B | 2.5 Flash-Lite | only after its contract gate |
| Embedding | Embedding 2 | none on new index | fail closed, never mix profiles |

Ordinary user turns use at most one successful generative provider request. A premium route that cannot reserve capacity falls back before dispatch. A dispatched timeout may retry only when the adapter proves the provider did not accept the request; otherwise return a typed temporary failure or use an already-available cached scaffold.

## Scope

**In scope**:

- New `lib/ai/control-plane-client.ts` with strict request and response schemas.
- New `lib/ai/request-lifecycle.ts` composing app allowance, provider lease, dispatch, adapter, commit, and telemetry.
- Refactor `lib/gemini.ts`, `lib/gemini-keys.ts`, `lib/ai-router.ts`, and `lib/prompt-executor.ts` callers.
- AI Gateway per-request timeout, retry, cache, and privacy-safe metadata headers.
- Replace global diagnostics callers with control-plane diagnostics.
- Feature flag `FEATURE_ZYRA_PROVIDER_ROUTER_V2`.
- Contract, failure-injection, and bounded staging tests.
- Required docs and readiness gates.

**Out of scope**:

- Pedagogy prompt or response redesign, semantic cache, UI, canonical retrieval, and production.
- Sending raw user IDs or prompts to AI Gateway metadata.

## Git workflow

- Branch: `codex/zyra-ai-005-provider-router`.
- Commit example: `feat(zyra): route Gemini through distributed leases`.
- The root integrator owns shared-file conflict resolution.

## Steps

### Step 1: Add the authenticated control-plane client

Read URL and token only from validated server env. Use a strict deadline, request ID, idempotency key, typed errors, and no browser export. Validate every response. Redact URL query strings and authorization from errors.

**Verify**: tests prove client code is absent from client bundles and errors contain no token.

### Step 2: Implement the request lifecycle

Order operations:

1. Validate input and assessment policy.
2. Check exact cache classification without provider reservation.
3. Reserve application allowance.
4. Reserve project-model capacity.
5. Mark both leases dispatched.
6. Call the selected adapter through AI Gateway.
7. Commit both leases and compatibility events.
8. On pre-dispatch failure, refund in reverse order.

Use one request ID across all steps. The lifecycle returns a stable outcome enum, not raw provider errors.

**Verify**: failure-injection tests cover every boundary and reconcile both ledgers exactly.

### Step 3: Implement deterministic route classification

Classify from server-owned feature type, requested visual mode, evidence size, assessment state, and explicit user action. Do not spend an AI call deciding which AI model to call. The ordinary path defaults to 3.1 Flash-Lite.

Premium route eligibility is deterministic and logged. A user cannot force premium by including model names or prompt instructions.

**Verify**: a table-driven test covers every feature and cannot select a quarantined model.

### Step 4: Apply health-aware fallback

Ask Plan 003 for a lease on the preferred model. If it returns `fallback_allowed` before dispatch, request the fallback model within the same application allowance lease. Stop after the configured chain. Never recursively retry a chain.

3.6 timeout and latency health are project-specific. 3.5 Flash-Lite remains quarantined regardless of its high RPD until its release gate passes.

**Verify**: injected failure on project 3 routes subsequent requests to the other projects; exhaustion of premium capacity falls back to standard without charging a second user turn.

### Step 5: Configure AI Gateway safely

Send model, route class, hashed user cohort, app request ID, and feature as bounded custom metadata. Set per-request deadlines and maximum attempts. Disable Gateway cache for personalized or active-assessment responses. Do not fall back from Gateway to direct provider in a way that sends the same dispatched request twice.

**Verify**: fake Gateway tests assert headers for public scaffold, personalized, active-assessment, retryable, and non-retryable cases.

### Step 6: Replace process-local diagnostics

Keep local counters only as debug metrics. Admin-facing remaining quota, circuits, and utilization come from the control plane. Label per-key health separately from per-project model quota.

**Verify**: cold-start simulation does not reset admin quota totals.

### Step 7: Stage behind the feature flag

Run offline tests, then a bounded real-provider suite across four projects. Enable only for dedicated staging identities. Rehearse off, on, injected failure, and rollback.

**Verify**: no request lacks either lease; no application request consumes more than one user turn; provider attempts remain within the declared test cap.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/ai-request-lifecycle.test.ts tests/contracts/model-routing.test.ts tests/contracts/provider-fallback.test.ts tests/contracts/ai-gateway-metadata.test.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-provider-router.ts --run-id <runId> --max-provider-requests 40
git diff --check
```

Pass when ledger reconciliation is exact, oversubscription is zero, default route selects 3.1 Flash-Lite, premium fallback costs one user turn, one unhealthy project does not disable the other three, quarantined models receive zero traffic, and rollback returns callers to the previous provider path.

## Test plan

- Control-plane auth, timeout, malformed response, and secret redaction.
- Request lifecycle failures before and after dispatch.
- Route classification and prompt-based premium escalation attempts.
- Project isolation, premium exhaustion, total provider outage, and Gateway failure.
- Double-send prevention and idempotent retry.
- Cold-start diagnostics.

## Done criteria

- [ ] Every provider miss has an app lease and project-model lease.
- [ ] Default and premium model policies match the approved table.
- [ ] Direct fallback cannot duplicate a Gateway-dispatched request.
- [ ] Admin diagnostics use persistent control-plane state.
- [ ] Targeted tests, lint, typecheck, staging smoke, and diff check pass.
- [ ] Plan 005 evidence validates.

## STOP conditions

- A current caller performs hidden nested Gemini calls for one ordinary turn.
- Gateway response does not expose enough information to classify whether retry is safe.
- A provider can be called before both leases are dispatched.
- Overhaul Plan 013 is changing the same runtime files concurrently.
- Any test records more provider attempts than its explicit cap.

## Rollback and maintenance

Set `FEATURE_ZYRA_PROVIDER_ROUTER_V2=0`. Preserve all leases and health telemetry. Never reset counters to make rollback appear successful. New routes must declare allowance cost, model class, cache policy, assessment policy, deadline, and fallback chain in the registry.
