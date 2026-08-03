# Plan 012: Add safe tutor and admin copilots

> **Executor instructions**: Execute after Overhaul Plan 014 owns the final mutation and audit boundary. Zyra may analyze and propose, but it may not bypass existing permissions or execute a mutation from free-form model output.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- app/admin app/tutor components/admin components/tutor lib/admin lib/tutor db/schema.ts lib/env.ts tests docs`. Concurrent mutation-service or audit-schema edits are a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plan 007 and Idea-centered Overhaul Plan 014
- **Category**: product, security, operations
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

Zyra can reduce setup and review work for tutor and admin, but these roles can affect many learners. The safe product is a proposal system with deterministic checks, visible diffs, fresh authorization, explicit confirmation, idempotent execution, and audit linkage. It is not an autonomous operator.

## Approved capabilities

Tutor proposals may include misconception briefs, intervention drafts, lesson improvement suggestions, question critiques, rubric drafts, and cohort summaries grounded in authorized course data. Admin proposals may include course-readiness checklists, missing-link detection, configuration diffs, quota forecasts, cache candidates, content workflow guidance, and incident triage.

No AI call is used for deterministic counts, streaks, mastery truth, permissions, or validation that SQL and rules can perform. AI explains or proposes on top of those facts.

## Proposal contract

Every proposal contains type, scope, evidence references, precondition snapshot, typed operations, learner impact, reversibility, warnings, expiration, proposer trace, and deterministic validator result. No operation is executable until the user opens a diff, passes fresh authorization, explicitly confirms, and the mutation service revalidates preconditions. Free-form model text is never converted directly into a database mutation.

## Scope

**In scope**:

- Role-specific Zyra surfaces, typed proposal schemas, proposal persistence, deterministic validation, diff preview, confirmation handoff, audit linkage, evaluation, and flags `FEATURE_ZYRA_TUTOR_COPILOT_V1` and `FEATURE_ZYRA_ADMIN_COPILOT_V1`.
- Tutor personal allowance display and admin global-capacity display through accepted Plan 004 and 013 contracts.

**Out of scope**:

- Autonomous publishing, permission changes, account deletion, secret rotation, deployment, billing, production, or a new mutation framework.

## Steps

### Step 1: Inventory permitted proposal types

Map each capability to its authorized inputs, deterministic facts, model contribution, output schema, reviewing role, mutation service if any, audit event, and rollback. Begin with read-only summaries and at most two low-risk configuration proposal types.

**Verify**: any unregistered proposal type fails closed and creates no mutation affordance.

### Step 2: Separate facts, inference, and recommendation

Compute metrics and validation deterministically. The model receives a bounded authorized fact packet and returns labeled inference plus recommendation. Every recommendation cites its evidence packet and declares uncertainty.

**Verify**: fixtures reject invented counts, cross-course evidence, unsupported claims, and recommendations presented as facts.

### Step 3: Implement proposal lifecycle

Add additive proposal storage compatible with Overhaul Plan 014. States are `draft`, `validated`, `reviewed`, `confirmed`, `applied`, `rejected`, `expired`, and `failed`. Store typed operations separately from learner-facing rationale. Proposals expire and are invalidated when a precondition version changes.

**Verify**: transition tests reject skipping review, reuse after expiration, double apply, stale precondition, and actor mismatch.

### Step 4: Integrate the existing mutation boundary

On confirmation, pass only validated typed operations to the Overhaul Plan 014 mutation service. Require fresh session authorization and exact scope. Revalidate preconditions and write an audit record linking actor, proposal, diff hash, result, and rollback metadata.

**Verify**: prompt injection, tampered client JSON, replay, permission downgrade, stale version, and partial failure cannot bypass the service.

### Step 5: Build tutor workflows

Add course-scoped misconception brief, intervention draft, question critique, and lesson-gap proposal. Tutor Zyra never shows unauthorized learner conversations or raw private images. Individual learner evidence appears only where the tutor already has explicit course access and the UI declares the scope.

**Verify**: row and course authorization tests return no cross-course data and aggregation thresholds prevent unsafe small-cohort disclosure.

### Step 6: Build admin workflows

Add setup assistant, readiness checklist, quota forecast, cache opportunity report, and configuration proposal. Admin usage is not individually capped, but every provider call consumes a global reservation and respects operational reserve. The UI distinguishes deterministic facts, AI interpretation, and actions awaiting confirmation.

**Verify**: admin cannot ask Zyra to reveal secrets, full API keys, raw provider URLs, or hidden learner answers.

### Step 7: Evaluate proposal quality and safety

Create golden scenarios for empty courses, Tutorial PKA, stale data, conflicting configuration, low evidence, permission changes, provider failure, and malicious instructions in course content.

Machine gates: direct unauthorized mutations 0; stale proposals applied 0; audit linkage 100 percent; unsupported factual claims 0; cross-course leaks 0; deterministic checks replaced by AI 0. Human reviewers score usefulness, edit burden, clarity, and reversibility.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/zyra-proposal-schema.test.ts tests/contracts/zyra-proposal-lifecycle.test.ts tests/contracts/zyra-proposal-auth.test.ts tests/contracts/zyra-tutor-copilot.test.ts tests/contracts/zyra-admin-copilot.test.ts
bun scripts/eval-zyra-copilots.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-copilots.ts --run-id <runId> --course tutorial-pka --no-auto-apply
git diff --check
```

## Done criteria

- [ ] Every AI output is read-only or a typed proposal.
- [ ] No proposal applies without fresh authorization, explicit confirmation, and precondition revalidation.
- [ ] Audit linkage and idempotency are 100 percent.
- [ ] Cross-course and secret leaks are zero.
- [ ] Tutor allowance and admin global capacity are accurately displayed.
- [ ] Low-evidence recommendations are labeled or withheld.
- [ ] Tests, eval, lint, typecheck, staging smoke, and diff check pass.

## STOP conditions

- Overhaul Plan 014 mutation and audit boundary is unavailable or failing.
- Any design executes model-produced SQL, URLs, commands, or unvalidated JSON.
- A requested capability changes permissions, secrets, deployment, billing, or account lifecycle.
- One cross-course or unauthorized learner-data fixture leaks.
- The proposal cannot be safely reversed or its impact cannot be shown before confirmation.

## Rollback and maintenance

Disable each role flag separately. Keep accepted proposals and audit records immutable. Unapplied proposals may expire naturally. New proposal types require a typed schema, deterministic validator, permission map, diff UI, precondition strategy, idempotent mutation mapping, audit event, rollback description, and adversarial fixtures.
