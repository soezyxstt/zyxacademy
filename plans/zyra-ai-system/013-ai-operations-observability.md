# Plan 013: Add AI operations observability

> **Executor instructions**: Build operational truth from the accepted quota ledger, provider results, cache events, and privacy-safe product outcomes. Do not scrape provider consoles or present an estimated value as an authoritative provider balance.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- app/admin/ops components/admin lib/ai lib/zyra workers/zyra-control-plane db/schema.ts lib/env.ts tests docs`. Serialize shared schema and admin navigation edits.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 003, 004, 005, 006, 010 and Idea-centered Overhaul Plan 014
- **Category**: operations, reliability, security
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

Four projects, several models, user allowances, semantic cache, image preprocessing, and premium routing create failure modes that a single usage number cannot explain. Admin needs an operational view of Zyx as a whole. Murid and tutor need only their own allowance. The system must distinguish recorded Zyx usage, reserved safety capacity, observed provider health, and unknown external consumption.

## Truth model

For each Jakarta day and project-model slot, display:

- configured provider limit from the versioned registry;
- Zyx committed requests;
- active reservations and expired leases;
- Zyx safety reserve and usable ceiling;
- Zyx-computed remaining usable capacity;
- provider success, 429, 5xx, timeout, and latency windows;
- last successful request and circuit state;
- `external usage unknown` when no authoritative provider balance API exists.

Never label `configured limit minus Zyx usage` as the provider account's exact remaining quota. Key views use masked aliases and fingerprints only. Admin can see global and project-slot views; tutor and murid can see only their Plan 004 allowance summary.

## Data placement

- Durable Object SQLite: live reservations, counters, circuit state, and short coordination state.
- Analytics Engine: high-volume privacy-safe request, routing, cache, image, and latency events.
- Turso: durable usage ledger, configuration versions, evaluation summaries, and audit links.
- AI Gateway analytics: provider gateway traffic and cache diagnostics, joined only by privacy-safe request correlation.
- KV: never the authoritative usage ledger.

## Scope

**In scope**:

- Versioned event schemas, Analytics Engine writer, aggregated queries, admin operations route, personal allowance components, alerts, runbooks, retention decisions, and `FEATURE_ZYRA_AI_OPS_V1`.
- Metrics for provider pool, project slot, cache, pedagogy, image input, Canvas, allowance, and proposal safety.

**Out of scope**:

- Billing estimates, production monitoring, raw prompt inspection, raw learner conversations, full hashes, API keys, or replacing Sentry.

## Steps

### Step 1: Define event contracts and privacy allowlist

Version events for lease, provider attempt, route decision, cache result, teaching validation, image preprocessing, proposal lifecycle, and learner outcome. Allow only masked project alias, model, route class, bounded role, course pseudonym, latency bucket, size bucket, stable reason code, and version fields. Store no prompt, response, selected text, image description, filename, object key, full user ID, full hash, key suffix, or secret-bearing URL.

**Verify**: schema snapshots reject every forbidden field and redact unknown error objects.

### Step 2: Write events reliably without blocking tutoring

Use Worker execution-context lifetime extension for telemetry writes where appropriate. Operational writes may fail open for the learner request, but failure counters and Sentry signals must expose sustained loss. Durable usage commit remains fail-closed and is not replaced by Analytics Engine.

**Verify**: Analytics failure does not lose committed quota state or fail a valid response; ledger failure follows Plan 003 and 004 safety rules.

### Step 3: Build authoritative aggregations

Create server-only queries for current capacity, trends, health, cache efficiency, allowance utilization, premium reserve, and image failures. Reconcile Durable Object commits against Turso ledger counts for closed days. Mark partial or delayed Analytics data visibly.

**Verify**: synthetic reconciliation covers duplicate event, missing event, delayed event, timezone boundary, active lease, expired lease, and unknown external usage.

### Step 4: Build admin operations UI

Add one dense admin route using existing layout primitives. Sections include global status, model pool, four project slots, route health, exact and semantic cache, allowance distribution, premium reserve, image pipeline, pedagogical safety, and recent alerts. Avoid stat-card grids and nested cards. Provide a time range, model filter, project alias filter, and downloadable privacy-safe diagnostic JSON.

The key table shows alias, masked fingerprint, health, recent result, and Zyx-recorded usage. It never displays secret value or claims exact provider balance.

**Verify**: admin authorization, empty state, partial telemetry, delayed data, dark mode, 380 px, keyboard, and large dataset tests pass.

### Step 5: Add personal usage surfaces

Expose only the authenticated actor's allowance summary to murid or tutor. Include committed provider-backed turns, total interactions, cache-saved turns, premium use, next Jakarta reset, and stable restriction reason. Do not expose global capacity details, project aliases, or another user's usage.

**Verify**: horizontal privilege tests have zero cross-user or admin-data exposure.

### Step 6: Add actionable alerts and runbooks

Alert on quota oversubscription, unexplained reconciliation drift, all-project degradation, elevated 429 or timeout, premium reserve breach, cache isolation rejection, semantic cache quality regression, attachment authorization failure, sanitizer failure spike, assessment leak, telemetry loss, and proposal-safety rejection. Each alert links to a versioned runbook and rollback flag.

**Verify**: injected incidents fire exactly one deduplicated alert with no private payload, and recovery closes it.

### Step 7: Validate operational decisions

Run synthetic load spanning four projects, standard and premium models, cache hits, image turns, failures, and role allowances. Compare generated dashboards to raw privacy-safe evidence.

Machine gates: quota oversubscription 0; reconciliation drift after grace period 0; unmasked key material 0; forbidden telemetry fields 0; cross-user usage leaks 0; alert detection 100 percent for critical fixtures; dashboard aggregate accuracy 100 percent for deterministic fixtures.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/zyra-telemetry-schema.test.ts tests/contracts/zyra-ops-aggregation.test.ts tests/contracts/zyra-ops-auth.test.ts tests/contracts/zyra-ops-alerts.test.ts tests/contracts/zyra-usage-ui.test.tsx
bun scripts/eval-zyra-operations.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-operations.ts --run-id <runId> --synthetic-only
git diff --check
```

## Done criteria

- [ ] Admin can distinguish configured limit, Zyx usage, reserve, usable capacity, health, and unknown external usage.
- [ ] Four project slots and model pools reconcile without oversubscription.
- [ ] Murid and tutor see only their own exact allowance.
- [ ] No raw key, prompt, response, learner text, image data, or identity-bearing metadata reaches telemetry.
- [ ] Image, cache, pedagogy, quota, and proposal failures have actionable alerts.
- [ ] Aggregate accuracy and critical alert detection reach 100 percent on deterministic fixtures.
- [ ] Tests, eval, lint, typecheck, staging smoke, and diff check pass.

## STOP conditions

- A dashboard requirement depends on exposing a raw key, learner prompt, image, or object key.
- The UI would label a Zyx estimate as exact provider remaining quota.
- Analytics Engine becomes authoritative for reservations or user billing.
- Reconciliation cannot distinguish delayed telemetry from quota drift.
- An admin route bypasses Overhaul Plan 014 authorization.

## Rollback and maintenance

Disable `FEATURE_ZYRA_AI_OPS_V1` to hide the UI while preserving ledger and privacy-safe events. Telemetry writers must have their own kill switch. Do not delete Durable Object counters or ledger rows during rollback. New metrics require an owner, definition, privacy classification, source of truth, latency expectation, alert threshold, and runbook.
