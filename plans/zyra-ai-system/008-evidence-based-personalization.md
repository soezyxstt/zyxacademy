# Plan 008: Personalize Zyra from learner evidence

> **Executor instructions**: Personalization may change presentation and hint strategy, not canonical truth, mastery scores, grades, or assessment policy. Execute only after Overhaul Plan 011 and AI Plan 007. Run this schema migration alone.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- db/schema.ts lib/student-quiz-analytics lib/zyra lib/tutor sessions tests scripts docs lib/env.ts package.json`.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 004 and 007, Idea-centered Overhaul Plan 011
- **Category**: product, privacy, migration
- **Status**: IN PROGRESS, local implementation and contract gates pass; staging reconciliation is pending
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

Zyx contains attempts, mastery evidence, flashcard reviews, hint history, and tutoring interactions. Personalization should use those signals to choose pacing, representation, and diagnostic depth. It must not turn weak evidence into a permanent label, leak profiles into shared cache, or use AI to recalculate deterministic learning analytics.

## Current state

- Overhaul Plan 011 separates per-Idea mastery and confidence.
- Existing tutor flow has a deterministic personalized addendum and premium personalized tier.
- `lib/tutor/cache-contract.ts` forbids learner data in shared cache.
- Quiz analytics already separates deterministic facts from AI diagnosis.
- No single versioned learner adaptation profile is the declared source for Zyra presentation choices.

## Learner adaptation contract

Separate three layers:

1. Observed evidence: attempts, response latency buckets, selected hint level, flashcard outcomes, explicit preferences, and teach-back results.
2. Derived deterministic features: evidence sufficiency, recent representation success, preferred pace, repeated misconception candidates, and support intensity.
3. Adaptation decision: selected explanation length, representation, vocabulary level, hint starting point, and checkpoint type.

Never store a diagnosis as fact. Each inferred field has confidence, evidence count, last updated time, expiry, and reason codes. Explicit learner preferences override inferred presentation preferences but never override safety.

## Scope

**In scope**:

- Add additive `zyra_learner_profiles` and `zyra_learning_events` tables or equivalent versioned structures in `db/schema.ts`.
- New `lib/zyra/personalization/**` for evidence loading, deterministic aggregation, adaptation decisions, redaction, and expiry.
- Integrate safe adaptation input into Plan 007 composition after shared cache retrieval.
- Add learner controls to view, reset, and set explicit preferences through authenticated APIs. UI rendering waits for Plan 010.
- Add deterministic backfill only for evidence that already exists; unknown stays unknown.
- Tests, migration, staging reconciliation, docs, and `FEATURE_ZYRA_PERSONALIZATION_V1`.

**Out of scope**:

- Recomputing mastery, recommendations, grades, or assessment analytics with Gemini.
- Shared cache storage, cross-course profile inference without evidence, or production.
- Demographic inference and sensitive-trait profiling.

## Git workflow

- Branch: `codex/zyra-ai-008-personalization`.
- Commit example: `feat(zyra): add evidence-based learner adaptation`.

## Steps

### Step 1: Inventory allowed evidence

Create an explicit allowlist mapping each source table and field to purpose, retention, freshness, and sensitivity. Exclude free-form private text unless the learner just submitted it in the current tutoring turn. Do not ingest raw chat history into a long-lived vector profile.

**Verify**: a checked test manifest rejects any unlisted source field.

### Step 2: Add additive profile and event schema

Store learner, course, Idea scope, event kind, evidence reference, bounded derived values, confidence, version, timestamps, and expiry. Keep explicit preferences separate from inferred fields. Use foreign keys and indexes needed for one learner and course query.

Do not modify historical attempt or analytics rows. Backfill only references and aggregates; never rewrite source evidence.

**Verify**: generated migration is additive and the before manifest for preservation-critical tables is unchanged after migration.

### Step 3: Implement deterministic aggregation

Aggregate with documented minimum evidence. One wrong answer cannot establish a persistent misconception. Separate mastery from confidence. Decay or expire stale presentation inferences. Expose reason codes for every adaptation.

**Verify**: table-driven cases cover insufficient evidence, conflicting signals, old evidence, explicit override, cross-course isolation, and multi-Idea evidence.

### Step 4: Compose after shared cache

Use the profile to choose block ordering, analogy domain, explanation length, hint starting point, and checkpoint type. Never mutate or key the shared scaffold by raw profile values. Personalized AI generation is reserved for explicit high-value cases and uses Plan 004 premium limits.

**Verify**: two learners share one scaffold hash but receive different deterministic composition. Shared cache payload bytes remain identical.

### Step 5: Add outcome feedback

Record whether the learner answered the checkpoint, requested another explanation, advanced hint level, or demonstrated correct teach-back. Use outcomes to update future adaptation. Thumbs-up is optional feedback, not the sole learning metric.

**Verify**: repeated successful outcomes reduce support gradually; one failure does not jump to maximum support.

### Step 6: Add learner control and reset

Authenticated learners can read a plain-language summary, set explicit representation and pacing preferences, and reset inferred presentation preferences. Reset does not delete attempts, mastery, grades, or audit evidence.

**Verify**: ownership and reset tests prove one learner cannot access another profile and shared historical truth remains intact.

### Step 7: Stage and reconcile

Use dedicated test learners with contrasting evidence patterns. Compare adaptation decisions to committed expected fixtures. Verify no profile field appears in KV, Vectorize, AI Gateway metadata, or another learner's response.

**Verify**: privacy scan reports zero cross-boundary fields and source-table hashes remain unchanged.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/zyra-profile-evidence.test.ts tests/contracts/zyra-adaptation.test.ts tests/contracts/zyra-profile-privacy.test.ts tests/contracts/zyra-profile-auth.test.ts
bun run typecheck
bun run db:generate
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run db:migrate
bun --env-file=.env.staging scripts/staging/smoke-zyra-personalization.ts --run-id <runId> --course tutorial-pka
git diff --check
```

Pass when all adaptation decisions have evidence reason codes, insufficient evidence remains unknown, cross-course and cross-user leakage is zero, shared scaffold bytes stay profile-free, resets preserve learning truth, and migration reconciliation shows no source-row change.

## Done criteria

- [ ] Observed, inferred, and explicit-preference data are separate.
- [ ] Mastery and confidence remain owned by Overhaul Plan 011.
- [ ] Shared caches and vectors contain no learner profile.
- [ ] Adaptation has evidence thresholds, confidence, expiry, and reason codes.
- [ ] Learner ownership and reset controls pass.
- [ ] Migration, tests, lint, typecheck, staging smoke, privacy scan, and diff check pass.

## STOP conditions

- Overhaul Plan 011 has not produced stable mastery and confidence contracts.
- Migration rewrites source attempts, mastery, analytics, or chats.
- An adaptation requires inferring a sensitive trait.
- Shared cache correctness requires adding learner fields.
- One user can read or influence another user's profile.
- Another executor is editing or migrating `db/schema.ts`.

## Rollback and maintenance

Set `FEATURE_ZYRA_PERSONALIZATION_V1=0`. Return to profile-free Plan 007 composition. Preserve profile and event rows for audit; do not delete learning evidence. Future evidence sources require allowlist, retention, sensitivity, minimum-count, expiry, and privacy tests.
