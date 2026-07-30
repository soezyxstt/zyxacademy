# Plan 012: Evidence-Calibrated Learner and Admin Analytics

Snapshot: `6098211`

Branch: `codex/012-analytics-calibration`

Commit: `fix(analytics): calibrate evidence and recommendations`

Priority: P1

Depends on: Plans 002, 010, and 011

Effort: L

Risk: High

Confidence: High

## Objective

Make learner diagnosis and admin insight evidence-aware. Separate observed facts, interpretations, and recommendations; remove fabricated timing and causal claims; use verified question and distractor provenance.

## Current state and evidence

- `lib/student-quiz-analytics/calculator.ts` can treat very small samples as sufficient.
- When per-question time is unavailable, the calculator substitutes overall average time, making every question appear to have a fabricated speed measurement.
- `lib/student-quiz-analytics/ai-pipeline.ts` can label one correct answer as mastery and relies on TypeScript assertions rather than runtime validation.
- Recommended resource IDs are optional and are not reliably validated or rendered as executable links.
- The admin insight route accepts sample size 1 and asks Gemini for causal diagnosis and frequency labels.
- Attempt snapshots omit some tags and distractor provenance needed by deterministic analytics.
- Analytics generation can be triggered from more than one path and incomplete attempts are not consistently rejected.

## Scope

Create or update:

- `lib/student-quiz-analytics/calculator.ts`
- `lib/student-quiz-analytics/ai-pipeline.ts`
- `lib/student-quiz-analytics/contracts.ts`
- `lib/admin-quiz-insights/calculator.ts` or the existing equivalent
- `app/api/admin/quiz-insights/[id]/analyze/route.ts`
- quiz analytics API and Inngest trigger paths found by call-site search
- attempt snapshot construction and compatibility readers
- student analytics UI components that render interpretations and resources
- `db/schema.ts` only if evidence metadata or idempotency fields are absent
- generated migrations if needed
- `lib/env.ts` for `FEATURE_ANALYTICS_DIAGNOSIS_V2`
- `tests/contracts/analytics.test.ts`
- fixtures under `tests/fixtures/ai/analytics/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md` if schema changes
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not change scoring or mastery algorithms outside evidence thresholds required for these diagnoses.

## Required output layers

Every learner or admin result must contain:

- `observed`: deterministic counts, rates, selected option IDs, verified timing availability, and source question IDs
- `interpreted`: hypotheses with evidence strength, alternative explanations, and uncertainty codes
- `recommended`: bounded action, resource ID, reason, and prerequisite state
- `evidenceSufficiency`: insufficient, limited, or sufficient, computed by code

Admin analytics must additionally distinguish item-level evidence from learner/cohort evidence.

## Implementation steps

1. Inventory every event and endpoint that starts student analytics. Select one idempotent owner, preferably the existing background event after completed submission. Other paths may read status or request retry but must not duplicate work.
2. Require `attempt.status === "completed"` before analytics generation. Add an idempotency key from attempt ID, analytics version, and question snapshot hash.
3. Extend new attempt snapshots with stable option IDs, tags, blueprint slot, question verification version, and distractor provenance needed for analysis. Add a legacy adapter that marks missing fields unknown.
4. Remove per-question speed labels when per-question timing is absent. Overall duration may be reported only at attempt level with a clear basis.
5. Define deterministic sample thresholds by claim type. One correct response may be observed, but may not establish mastery. Small samples return limited or insufficient evidence.
6. Build deterministic misconception frequency from selected distractor provenance. Unknown mapping stays unknown. Gemini may explain patterns but may not invent frequency.
7. Validate AI outputs at runtime with Zod plus referential checks. Every question, concept, distractor, and resource ID must exist in the supplied allowlist.
8. For each interpretation, require supporting observation IDs and at least one alternative explanation when evidence is limited.
9. Make recommendations deterministic where possible. Validate resource availability, access, course membership, and URL construction before returning it. Render the resource as an actual action or omit it with a reason.
10. Split admin insight into item analysis and learner/cohort analysis. Item flaws can be inferred from option distribution and verification evidence; learner misconceptions require sufficient mapped responses. Do not merge them into one causal statement.
11. Replace high, medium, and low frequency labels from Gemini with deterministic thresholds based on counts and denominators. Display numerator and denominator.
12. Add graceful states for insufficient sample, legacy question, missing timing, ambiguous distractor, analysis pending, and provider failure.
13. If schema changes are required, run and inspect Drizzle migration. Preserve existing analytics rows and version new outputs.
14. Add tests for one response, two responses, representative cohort, missing timing, duplicated trigger, unfinished attempt, invalid resource ID, legacy snapshot, and ambiguous distractor.
15. Update docs with evidence thresholds, idempotency, and observed/interpreted/recommended presentation.

## Test plan

```powershell
bun test tests/contracts/analytics.test.ts tests/contracts/question-pipeline.test.ts
bun run lint
bun run typecheck
```

If schema changed:

```powershell
bun run db:generate
bun run db:migrate
```

## Done criteria

- Analytics runs once per completed attempt and version.
- No per-question timing claim exists without per-question timing evidence.
- One correct answer is never presented as established mastery.
- Frequency is deterministic and shows its denominator.
- AI interpretations cite observation IDs and expose uncertainty.
- Resource links are validated and actionable.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if a recommendation resource cannot be validated against current access rules.
- Stop if an interpretation has no supporting observation.
- Stop if item-level and learner-level evidence cannot be separated in the current payload. Return an insufficient state.
- Stop if a migration would discard existing analytics history.
