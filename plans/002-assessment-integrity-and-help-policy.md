# Plan 002: Assessment Answer Protection and Help Policy

Snapshot: `6098211`

Branch: `codex/002-assessment-integrity`

Commit: `fix(assessment): protect answers and enforce help policy`

Priority: P0

Depends on: Plan 001

Effort: L

Risk: High

Confidence: High

## Objective

Close active-attempt answer leaks immediately, then define one deterministic Assessment Assistance Policy used by tutor, mistake feedback, quiz review, and analytics entry points.

## Current state and evidence

- `app/api/quiz/attempts/route.ts:183-191` stores correct indices and explanations in `questionsSnapshot`.
- The POST response redacts them at `app/api/quiz/attempts/route.ts:234-249`, but GET at `app/api/quiz/attempts/route.ts:254-273` returns full rows.
- `app/api/quiz/attempts/[id]/route.ts:24-75` returns `...attempt` for both in-progress and completed attempts.
- `lib/tutor-rag.ts` infers Socratic-only behavior from whether retrieval happened to return practice or past-exam material. It has no active attempt or submission state.
- `lib/mistake-feedback.ts` can reveal the correct answer without consulting a shared policy.

## Scope

Create or update:

- `lib/assessment-assistance-policy.ts`
- `lib/assessment-serialization.ts`
- `app/api/quiz/attempts/route.ts`
- `app/api/quiz/attempts/[id]/route.ts`
- `lib/tutor-rag.ts`
- `lib/mistake-feedback.ts`
- the API/action callers that provide attempt context to those modules
- `lib/env.ts` for `FEATURE_ASSESSMENT_ASSISTANCE_POLICY`
- `tests/contracts/assessment-redaction.test.ts`
- `tests/contracts/tutor-rag.test.ts`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not redesign question generation, grading, or analytics in this plan. The answer redaction is an unconditional security fix. New help-mode behavior is feature-flagged.

## Required policy contract

Define typed inputs:

- activity kind: `study | practice | quiz | simulation | exam`
- attempt state: `none | in_progress | submitted | completed | expired`
- answer release state: `hidden | rationale_only | released`
- match state between the student's request and protected item: `none | weak | strong | exact`
- course override, if an existing course policy explicitly supplies one

Return an allowed help level:

- `full_explanation`
- `concept_hint`
- `socratic_only`
- `clarify_context`
- `refuse_answer_reveal`

The result must include stable reason codes. The model does not choose this result.

## Implementation steps

1. Read the Next route-handler guide and inspect every consumer of both attempt GET endpoints.
2. Add one serializer for attempt list/detail responses. For `in_progress`, remove at minimum `correct_indices`, `explanation`, grading summaries, correct-option labels, and any feedback that reveals them. For completed attempts, return only fields permitted by the release state.
3. Replace direct `NextResponse.json(attempts)` and `...attempt` serialization with the serializer. Keep server-side snapshots unchanged because grading needs them.
4. Add tests for list and detail endpoints using owner, non-owner, in-progress, completed, and unknown attempt cases. Assert recursively that protected keys and known answer values are absent.
5. Implement the pure policy function with exhaustive switch logic. Unknown input must fail closed to `clarify_context` or `refuse_answer_reveal`.
6. Add `FEATURE_ASSESSMENT_ASSISTANCE_POLICY` to `lib/env.ts`. When disabled, preserve legacy help behavior but retain unconditional API redaction.
7. Pass trusted activity and attempt state from server-side context into tutor and feedback calls. Never derive this state from the student's text or retrieved source type.
8. Before tutor generation, remove protected answer keys and solution text when the policy forbids release. Do not rely on a system prompt to hide data already supplied to the model.
9. Add a deterministic post-validator for the allowed help mode. At minimum, block exact answer indices, exact correct option text, and stored explanation text in protected modes. Use stable violation codes.
10. Make mistake feedback use the same policy. It may identify an observed mismatch but must not reveal protected answers during an in-progress attempt.
11. Update product and architecture docs with a policy matrix. Document that retrieval source type is evidence metadata, not assessment state.

## Test plan

```powershell
bun test tests/contracts/assessment-redaction.test.ts tests/contracts/tutor-rag.test.ts
bun run lint
bun run typecheck
```

Manually inspect JSON fixtures for one active and one completed attempt. Do not use real student data.

## Done criteria

- Neither attempt GET endpoint exposes protected answer data for an in-progress attempt.
- Ownership checks remain intact.
- All tutor and mistake-feedback help modes come from the deterministic policy.
- Protected data is absent from model input when release is forbidden.
- Unknown state fails closed.
- The flag-off path preserves old pedagogy but not the answer leak.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if product owners have not defined when completed-attempt answers may be released. Default to hidden and record the decision needed.
- Stop if a client depends on leaked keys during an active attempt. Record the consumer and redesign its contract; do not retain the leak.
- Stop if a course policy conflicts with platform-wide exam integrity. Require an explicit policy decision.
