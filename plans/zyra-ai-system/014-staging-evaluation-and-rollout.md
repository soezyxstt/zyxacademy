# Plan 014: Prove the complete Zyra system in staging

> **Executor instructions**: This is a release gate, not an implementation catch-all. Begin only after AI Plans 001 through 013 and Idea-centered Overhaul Plan 016 are integrated. Use `.env.staging` and live staging services only. Do not deploy production.
>
> **Drift check**: record `git rev-parse HEAD`, `git status --short`, accepted plan evidence IDs, migration state, Worker versions, resource aliases, and feature flags. Any missing or invalid predecessor evidence is a STOP condition.

## Status

- **Priority**: P0 gate
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 001 through 013 and Idea-centered Overhaul Plan 016
- **Category**: validation, rollout, operations
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

Passing isolated tests does not prove that database, Cloudflare, Inngest, AI Gateway, four Gemini projects, Vectorize, R2, quotas, cache, multimodal input, teaching policy, and UI behave as one system. This plan validates staging with preserved Tutorial PKA data, explicit canaries, rollback rehearsals, and machine-generated evidence.

## Scope

**In scope**:

- Predecessor evidence validation, staging backup and identity guard, migrations, Worker and host deployment, end-to-end evaluation, controlled feature enablement, fault injection, rollback rehearsal, manual review, and final recommendation.

**Out of scope**:

- Production traffic, production migrations, new features, relaxed gates, deleting legacy data, or declaring production safety from mock tests.

## Entry gates

1. Repository is clean except this plan's generated ignored artifacts.
2. All predecessor plans are `DONE` with valid evidence bound to the integrated commit.
3. Overhaul Plan 016 proves Pinecone removal and canonical Vectorize cutover.
4. Live staging reports `zyx-vectors-staging-v2` at exactly 768 dimensions and cosine, and `canonical-content-v2` is the only active canonical embedding profile.
5. `zyx-zyra-cache-staging` reports exactly 768 dimensions and uses only `zyra-semantic-cache-v1`; it shares no IDs or binding with canonical retrieval.
6. A restorable staging database backup and object inventory exist.
7. Tutorial PKA record counts, stable identities, chat history, attempts, analytics, and attachment metadata baseline is recorded.
8. Four distinct project aliases and model registry match live staging secrets without printing them.
9. Private R2 attachment bucket has no public access and has the approved 7-day lifecycle.
10. `bun run lint`, targeted contracts, `bun run typecheck`, and `git diff --check` pass.

## Rollout flags

Keep independent flags for provider registry, distributed quota, allowances, router, cache, pedagogy, personalization, Canvas, image input, murid UI, pet, tutor copilot, admin copilot, and operations UI. Missing or `0` is off. The integrator records the exact flag matrix at every stage.

## Steps

### Step 1: Validate identity, backups, and predecessor evidence

Run staging guards before any remote action. Validate resource aliases and fingerprints without logging secrets. Export the approved database backup, schema manifest, Tutorial PKA invariants, R2 attachment inventory, Vectorize metadata, Worker versions, and feature flags.

**Verify**: restore validation succeeds in an isolated staging-compatible target and all baseline counts reconcile.

### Step 2: Deploy dark infrastructure

Apply additive staging migrations through the repository commands, deploy the control-plane Worker with no application traffic, and deploy application code with all new behavior flags off. Run health and authorization probes for Durable Objects, KV, R2, Vectorize, Analytics Engine, AI Gateway, Turso, and Inngest.

**Verify**: existing text tutoring and Tutorial PKA workflows remain operational; no new provider traffic is created by disabled features.

### Step 3: Run offline and mock gates

Run all contract suites, golden pedagogy, Canvas, image, cache, quota, routing, proposal, and operations evaluations. Mock results are necessary but are not live-provider evidence.

**Verify**: all zero-tolerance gates pass and the evidence labels mock versus real clearly.

### Step 4: Run bounded live-provider matrix

Use synthetic staging users and explicit request caps. Exercise every healthy project-model slot, embedding profile, standard and premium route, provider error class, cache tier, text turn, image turn, Canvas response, active assessment, tutor proposal, and admin proposal. Do not auto-apply proposals.

**Verify**: request count never exceeds the declared cap; secrets and learner data are absent from evidence.

### Step 5: Enable dedicated synthetic cohort

Enable distributed quota, registry, and operations first. Then enable cache and pedagogy for synthetic accounts. Add Canvas and image input only after their privacy gates pass. Finally enable murid UI and copilots for named staging testers.

At every stage, compare error rate, p50 and p95 latency, provider consumption, cache quality, assessment safety, and rollback readiness to the accepted baseline.

**Verify**: no flag activation changes users outside the named staging cohort.

### Step 6: Run staged canaries

Within staging testers, advance 5, 25, 50, then 100 percent by stable actor hash. Hold each stage long enough to cover concurrency, a Jakarta midnight reset where practical, and at least the declared minimum request sample. If the sample cannot be collected safely within quota, extend time rather than lower gates.

Promotion gates at every stage:

- provider quota oversubscription 0;
- active canonical or semantic-cache vectors with a dimension other than 768: 0;
- cross-model or cross-profile embedding writes: 0;
- active reads or writes to preserved 1024 indexes: 0;
- active-assessment direct-answer leaks 0, including screenshot inputs;
- invalid or stale citations 0;
- cross-user, cross-course, cross-policy, or image cache leaks 0;
- unauthorized attachment reads 0;
- accepted EXIF or GPS retention 0;
- requests above the 16 MB application payload cap 0;
- allowance accuracy 100 percent;
- default chat p95 at most 5 seconds excluding the first cold start;
- cache-hit p95 at most 800 ms;
- injected provider-failure fallback succeeds in one visible turn at least 99 percent;
- supported clear-image teaching responses valid at least 95 percent;
- serious or critical accessibility violations 0;
- Tutorial PKA invariant drift 0.

### Step 7: Rehearse fault isolation and rollback

Inject one failure at a time: project 429, timeout, provider 5xx, quota Worker error, KV unavailable, Vectorize unavailable, Analytics unavailable, R2 upload failure, sanitizer rejection, expired attachment, Inngest delay, malformed model output, and stale admin proposal. Verify expected fallback and quota outcome.

Then disable flags in reverse dependency order and restore the previous application runtime while keeping additive data. Do not delete chats, attachments, leases, ledger events, cache objects, proposals, audits, or canonical content.

**Verify**: previous text runtime works, new tables remain readable, and re-enabling the canary does not duplicate or corrupt state.

### Step 8: Perform human product review

Review at least 20 text dialogues and 20 image dialogues across Tutorial PKA, math, physics, and chemistry. Include novice and advanced explanations, uncertainty, misconceptions, handwriting, charts, active assessments, visual interaction, mobile layout, pet behavior, tutor proposals, and admin setup guidance.

Use a fixed rubric for correctness, grounding, scaffolding, answer restraint, use of learner evidence, image observation accuracy, uncertainty calibration, visual usefulness, cognitive load, latency, and distinct Zyra identity. Record reviewer identity and disagreements. The implementation model cannot be the sole reviewer.

### Step 9: Produce a release decision

Generate `artifacts/zyra-ai/<runId>/plan-014-result.json` and a concise Markdown summary. Result is `PASS`, `FAIL`, or `BLOCKED`; never `mostly pass`. Every failure links to exact evidence, owning plan, rollback state, and retest requirement. PASS authorizes only a future production rollout proposal, not production deployment.

## Commands and pass criteria

```powershell
bun run lint
bun run test:ai-contracts
bun run eval:ai
bun scripts/eval-zyra-pedagogy.ts
bun scripts/eval-zyra-canvas.ts
bun scripts/eval-zyra-images.ts
bun scripts/eval-zyra-operations.ts
bun run typecheck
bun --env-file=.env.staging scripts/staging/run-zyra-release-gate.ts --run-id <runId> --max-provider-requests <approvedCap> --synthetic-users-only
git diff --check
```

## Done criteria

- [ ] All entry gates and predecessor evidence validate against the integrated commit.
- [ ] Live staging services and four project-model pools pass bounded tests.
- [ ] All zero-tolerance privacy, assessment, authorization, cache, and quota gates pass.
- [ ] Latency, fallback, image quality, accessibility, and Tutorial PKA gates pass.
- [ ] Staging canaries reach 100 percent of named testers without invariant drift.
- [ ] Fault injection and reverse-order rollback rehearsal pass.
- [ ] Human review meets the fixed rubric with documented evidence.
- [ ] Final evidence is machine-generated, privacy-safe, and declares staging only.

## STOP conditions

- A production-like target appears in any command or resource alias.
- Backup or restore validation fails.
- Predecessor evidence is missing, handwritten, or bound to another commit.
- One zero-tolerance gate fails.
- Canary capacity would exceed provider or free-tier safety reserve.
- Tutorial PKA data, stable identities, chats, attempts, or analytics drift.
- Rollback requires destructive schema or data deletion.

## Rollback and maintenance

Disable flags in reverse dependency order: copilots and murid UI, image input and Canvas, personalization and pedagogy, cache, router, allowances, distributed quota, then registry compatibility. Keep the control plane deployed but unreachable from disabled callers. Preserve all additive data and private attachment lifecycle. Open a new remediation plan for every failed gate; do not edit thresholds to obtain PASS.
