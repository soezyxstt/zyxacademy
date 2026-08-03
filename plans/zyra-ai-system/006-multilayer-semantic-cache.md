# Plan 006: Build a privacy-safe exact and semantic cache

> **Executor instructions**: Execute after Idea-centered Overhaul Plan 012 establishes canonical Vectorize retrieval. Use the separate 768-dimension semantic-cache index. Cache only profile-free teaching scaffolds and never final personalized responses.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- lib/kv-cache.ts lib/tutor/cache-contract.ts lib/tutor-rag.ts lib/ai workers/zyra-control-plane tests scripts docs lib/env.ts`.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 001, 003, 005, and Idea-centered Overhaul Plan 012
- **Category**: performance, privacy
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

Repeated learning questions can save scarce Gemini quota, but an aggressive cache can return the wrong course, policy, assessment state, or learner-specific answer. The existing Tier 1 exact cache is profile-free, which is the correct foundation. This plan adds canonical exact keys, semantic candidate lookup, single-flight, and deterministic personalization boundaries.

## Current state

- `lib/tutor/cache-contract.ts` creates a student-free Tier 1 key and rejects prohibited student data.
- `lib/kv-cache.ts` calls the Cloudflare REST API and uses a daily write guard. The guard can consume an additional KV write per cache write.
- Cloudflare AI Gateway caches only identical requests unless `cf-aig-cache-key` is supplied.
- Default AI Gateway cache keys include provider authentication, so four keys can fragment logically identical cache entries.
- KV Free allows 1000 writes per day. The program policy stops before 900.
- Plan 001 provides a separate `zyx-zyra-cache-staging` index at 768 dimensions plus KV, R2, Analytics Engine, and Durable Object bindings.

## Cache layers

1. AI Gateway exact cache for profile-free provider requests using a canonical custom key.
2. Durable Object single-flight so simultaneous identical misses create one provider request.
3. KV payload cache for validated profile-free scaffolds.
4. Vectorize semantic index mapping reusable scaffold embeddings to cache entry IDs.
5. R2 only for large versioned visual artifacts or evaluation bundles, not ordinary chat text.

## Canonical key contract

Include course ID, canonical Idea IDs and versions, evidence hash, normalized intent, prompt version, policy version, response schema version, language, route class, visual capability version, assessment mode, and embedding profile. Exclude user ID, mastery values, chat history, raw selection offsets, API key alias, and free-form student profile.

## Scope

**In scope**:

- Extend `lib/tutor/cache-contract.ts` and add `lib/ai/cache/**`.
- Add control-plane cache handlers, single-flight state, KV writes, Vectorize lookup, and telemetry.
- Refactor `lib/kv-cache.ts` callers away from REST API writes for the new path.
- Configure AI Gateway custom cache key, TTL, hit status, and skip behavior.
- Add semantic-cache fixtures, calibration script, invalidation policy, and staging smoke.
- Feature flag `FEATURE_ZYRA_SEMANTIC_CACHE_V1`.
- Required docs and readiness checklist.

**Out of scope**:

- Canonical content index changes, learner profile generation, final personalized response caching, production, or deletion of legacy cache entries.

## Git workflow

- Branch: `codex/zyra-ai-006-semantic-cache`.
- Commit example: `feat(zyra): add privacy-safe semantic response cache`.

## Steps

### Step 1: Version the shared scaffold contract

Define a typed scaffold containing explanation structure, canonical claim references, teaching move, optional visual spec, examples with no learner data, validation outcome, and cache metadata. Add an explicit `personalizationAllowed=false` invariant.

**Verify**: privacy tests feed user IDs, names, history tokens, mastery values, and assessment answers into every field and require rejection.

### Step 2: Canonicalize exact keys

Normalize only semantically safe features such as whitespace, Unicode, stable Idea ordering, and approved language aliases. Do not remove numbers, operators, negation, units, or assessment-state differences.

Use the resulting hash as `cf-aig-cache-key` so four provider keys share one logical exact entry. Cache only profile-free requests. Set TTL by evidence version and policy class, bounded between 60 seconds and one month.

**Verify**: equivalent safe forms collide; different course, Idea version, number, unit, negation, policy, or assessment mode never collide.

### Step 3: Add single-flight before provider reservation

The coordinator owns a short-lived in-flight key. The first caller becomes leader; followers wait with a bounded deadline. Only the leader obtains an application provider unit and project-model lease. Followers receive the validated result or a typed retry instruction.

**Verify**: 50 simultaneous identical misses create one provider reservation and 49 followers. Leader failure releases the flight and never strands followers.

### Step 4: Add KV payload storage with one write per entry

Use the Worker KV binding, not the app's REST token, for new entries. Store payload and metadata together. Move the daily write budget to the Durable Object so a cache entry costs one KV write. Stop new writes at 900 daily while continuing reads and provider responses.

**Verify**: a synthetic day with 950 candidate writes performs at most 900 KV writes and serves remaining requests without cache persistence.

### Step 5: Add semantic candidate retrieval

Embed a profile-free retrieval instruction plus normalized query and canonical evidence class using the immutable `zyra-semantic-cache-v1` profile: Gemini Embedding 2, exactly 768 dimensions, cosine, and its own instruction version. Store vectors only after scaffold validation. Vector metadata contains cache entry ID, embedding profile ID, course, Idea versions, policy, language, route, assessment mode, and content hash, not full response text.

Do not reuse `canonical-content-v2` vectors even though they are also 768 dimensions. Equal model and vector width do not make different task instructions, content serialization, identities, or authorization boundaries interchangeable.

Retrieve candidates with server-owned metadata filters. Re-hydrate payload from KV and revalidate every version before reuse.

**Verify**: cross-course, stale version, wrong policy, active-assessment mismatch, missing KV payload, and embedding-profile mismatch all result in a miss.

### Step 6: Calibrate reuse thresholds

Create at least 200 labeled query pairs covering paraphrase, numbers, negation, units, similar titles across courses, different Idea versions, active assessments, and personalization requests. Choose thresholds from measured precision and recall, not a guessed constant.

Release gate: false reuse is zero on all forbidden classes and precision is at least 98 percent on the labeled reusable class. If the gate cannot be met, ship exact cache and keep semantic reuse disabled.

**Verify**: `bun scripts/eval-zyra-semantic-cache.ts` emits a versioned threshold report and exits nonzero below the gate.

### Step 7: Compose personalization after cache

Return the shared scaffold to the application. Any learner-specific preface, hint depth, or checkpoint is applied later by deterministic rules or Plan 008. It never changes the shared entry.

**Verify**: two murid with different profiles receive the same scaffold hash and different local composition without a second provider call or shared payload mutation.

### Step 8: Rehearse staging invalidation and rollback

Write, hit, version-bump, miss, and rollback cases against staging resources. Invalidation is version-based; do not delete broad key ranges. Disable semantic lookup independently from exact cache.

**Verify**: old entries become unreachable after version change, while rollback can still read the old exact path.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/zyra-cache-key.test.ts tests/contracts/zyra-cache-privacy.test.ts tests/contracts/zyra-single-flight.test.ts tests/contracts/zyra-semantic-cache.test.ts
bun scripts/eval-zyra-semantic-cache.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/smoke-zyra-cache.ts --run-id <runId> --max-provider-requests 20
git diff --check
```

Pass when forbidden false reuse is zero, reusable precision is at least 98 percent, 50 simultaneous misses create one provider call, cache hits use zero provider units, KV writes remain at or below 900, and no shared payload contains learner data.

## Test plan

- Exact key normalization and non-collision cases.
- Shared scaffold privacy and assessment-answer rejection.
- Single-flight leader, follower, failure, timeout, and retry.
- KV write budget and failure tolerance.
- Semantic positive and forbidden negative pairs.
- Version invalidation, missing payload, and profile mismatch.
- Four-key AI Gateway cache-key sharing.

## Done criteria

- [ ] Exact cache shares across four provider keys only when safe.
- [ ] Semantic cache uses a separate 768 index and calibrated thresholds.
- [ ] Shared payloads contain no learner-specific data.
- [ ] Cache hits consume zero provider allowance.
- [ ] KV write budget and single-flight gates pass.
- [ ] Targeted tests, eval, lint, typecheck, staging smoke, and diff check pass.
- [ ] Plan 006 evidence validates.

## STOP conditions

- Overhaul Plan 012 has not established stable canonical IDs and versions.
- Any semantic reuse occurs across course, policy, assessment mode, or stale evidence.
- Cache correctness requires storing a raw learner profile in shared storage.
- Existing 1024 Vectorize index is selected.
- The canonical 768 profile or `zyx-vectors-staging-v2` is selected for semantic cache.
- KV write counting cannot guarantee at most 900 writes.
- The labeled threshold gate fails.

## Rollback and maintenance

Disable `FEATURE_ZYRA_SEMANTIC_CACHE_V1` first; keep exact cache if its separate gate remains healthy. Preserve KV, Vectorize, and telemetry for reconciliation. Never bulk-delete the canonical Vectorize index. Any new prompt, policy, schema, visual, or embedding version creates a new cache identity.
