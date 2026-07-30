# Plan 011: Independent Question Verification and Surgical Repair

Snapshot: `6098211`

Branch: `codex/011-question-verification`

Commit: `feat(questions): add solver critic and field repair`

Priority: P1

Depends on: Plan 010

Effort: L

Risk: High

Confidence: High

## Objective

Require deterministic validation, an independent solver, and an independent critic before a generated question is publishable. Repair only fields named by stable violations and rerun all checks after repair.

## Current state and evidence

- `lib/question-generator.ts` validates and then can ask the same generation path for a fully corrected question.
- The repair prompt requests a complete regenerated object, so valid stem, provenance, reasoning type, or options can drift.
- No independent model attempts to solve the question without seeing the proposed answer.
- No critic checks source support, ambiguity, distractor plausibility, policy compliance, or whether the explanation matches the shuffled options.
- `qualityScore` is currently a constant rather than an evaluation result.

## Scope

Create or update:

- `lib/questions/deterministic-validator.ts`
- `lib/questions/independent-solver.ts`
- `lib/questions/critic.ts`
- `lib/questions/repair.ts`
- `lib/questions/quality-score.ts`
- `lib/question-generator.ts`
- `lib/question-validator.ts`
- `lib/pedagogical-validator.ts`
- `lib/env.ts` existing `FEATURE_QUESTION_GENERATOR_V2` path
- `tests/contracts/question-pipeline.test.ts`
- fixtures under `tests/fixtures/ai/questions/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not redesign analytics here. Plan 012 consumes the verified provenance.

## Required verification sequence

1. Structural and deterministic checks.
2. Independent solver sees stem and shuffled options, but not proposed answer, explanation, distractor labels, or generator rationale.
3. Critic sees source spans, blueprint slot, candidate, deterministic results, and solver result.
4. Bounded field repair if violations are repairable.
5. Full deterministic, solver, and critic rerun.
6. Accept, reject, or needs-review with coded reasons.

## Implementation steps

1. Define stable violation codes grouped by stem, option, answer, explanation, provenance, policy, math, blueprint, and ambiguity.
2. Expand deterministic validators for duplicate semantics, missing units, dimension mismatch where parsable, invalid formula syntax, unsupported source IDs, answer cardinality, and exact protected-source copying.
3. Implement an independent solver contract. Use a distinct prompt role and preferably a different configured model route when quota and router policy allow. Never include the generator answer.
4. Compare solver answer IDs to the candidate answer. A disagreement is not automatically proof the candidate is wrong; it triggers critic review or needs-review.
5. Implement the critic contract with claim-level findings and cited source spans. It must distinguish correctness, ambiguity, source faithfulness, pedagogical alignment, distractor quality, and policy.
6. Define acceptance rules in code. Critical correctness, ambiguity, provenance, or assessment-policy violations block publication regardless of model self-confidence.
7. Build surgical repair from Plan 003. Provide only violation codes, approved field paths, relevant source spans, and current values. Preserve stable IDs and all fields outside the allowlist.
8. Limit repair to one attempt. Rerun every validator and independent stage. Never accept because the repair model says it is fixed.
9. Compute a versioned quality result from explicit dimensions. Store component scores and terminal state; do not compress unknown evidence into a perfect scalar.
10. Add budget-aware behavior. If solver or critic quota is unavailable, keep the item unverified or needs-review. Do not publish it under a fallback perfect score.
11. Add fixtures for wrong keyed answer, two defensible answers, unsupported explanation, correct math with wrong unit, invalid distractor mapping, prompt injection in source, repair that changes an unapproved field, and solver disagreement.
12. Update docs with the acceptance state machine and manual-review boundary.

## Test plan

```powershell
bun test tests/contracts/question-pipeline.test.ts
bun run lint
bun run typecheck
```

Run the same seeded fixture twice and verify identical deterministic results and stable state transitions. Model calls remain faked in unit tests.

## Done criteria

- No v2 generated question publishes without deterministic validation, solver, and critic acceptance.
- Solver never receives the proposed answer.
- Repair changes only allowlisted fields and is followed by full revalidation.
- Unavailable verification produces unverified or needs-review, not quality 1.0.
- Quality components and versions are persisted.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if solver and generator cannot be isolated at the input boundary.
- Stop if acceptance depends only on an LLM confidence number.
- Stop if field repair cannot preserve stable option and provenance IDs.
- Stop if quota fallback would auto-publish unverified questions.
