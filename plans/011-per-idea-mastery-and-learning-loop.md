# Plan 011: Per-Idea Mastery and Learning Loop

Status: blocked until Plan 010 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- lib app scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/010-question-and-assessment-integrity.md
- **Category**: correctness, migration
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Compute murid understanding per Idea from attributable evidence, keep mastery score separate from confidence, and drive deterministic flashcard and study recommendations without AI quota.

## Current state to reverify

- `learning_events` stores `conceptName`, optional KO ID, correctness, and weight.
- `student_concept_mastery` stores mastery score, confidence, evidence count, trend, and timestamps per concept name.
- Current mastery, recommendations, study paths, streaks, reflections, and analytics are deterministic and must remain AI-free.
- Quiz submission and flashcard review currently emit concept or KO-level events, not normalized per-Idea evidence.

Anchor excerpt from `db/schema.ts:2084-2101`: `learning_events` stores `student_id`, `course_id`, optional `concept_name`, optional `ko_id`, event type, correctness, and weight. There is no stable Idea evidence or rubric version in the current event.

## Git workflow

- Create branch `codex/011-idea-mastery` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `lib/mastery-engine.ts`
- `lib/mastery-store.ts`
- `lib/mastery-recompute.ts`
- `lib/adaptive-quiz.ts`
- `lib/material-progress.repository.ts`
- `lib/zyra/mastery-memory.ts`
- new `lib/pemahaman/engine.ts`
- new `lib/pemahaman/evidence.ts`
- new `lib/pemahaman/recommendations.ts`
- `lib/inngest-functions.ts`
- quiz and flashcard submission writers
- murid mastery APIs under `app/api/student/mastery/**`
- contract and migration tests
- new `scripts/staging/shadow-idea-mastery.ts`
- new `scripts/staging/recompute-idea-mastery.ts`
- `package.json`
- docs and `AGENTS.md`

Out of scope: AI diagnosis, UI redesign, deleting concept mastery, changing historical grades.

## Algorithm contract

1. `bukti_ide_jawaban` and other `bukti_pembelajaran` rows are append-only and idempotent by source event plus Idea plus rubric version.
2. Only evidence with `derivation_status=verified` updates mastery.
3. Compute mastery score from normalized evidence score, evidence weight, confidence, recency policy, and evidence-type policy. Store the exact algorithm version and input watermark.
4. Compute confidence separately from effective evidence count, evidence diversity, recency, and agreement. More low-quality events may not falsely create high confidence.
5. A recompute from the append-only evidence log must reproduce the stored score and confidence exactly.
6. Store every change in `perubahan_pemahaman` with before and after values, reason, evidence IDs, algorithm version, and time.
7. Preserve legacy concept mastery as a read fallback for Ideas with no attributable historical evidence. Label it as concept-level baseline, not Idea mastery.
8. Flashcard scheduling remains SM-2 compatible where currently used. Mastery changes priority and recommendation reason, but never deletes cards or review history.
9. Recommendations, streaks, study paths, and cohort analytics remain deterministic. No Gemini call is allowed in these paths.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Characterize the current mastery engine with frozen fixtures before changing it.
2. Implement the pure per-Idea engine and golden transition fixtures for correct, incorrect, partial, stale, diverse, conflicting, and ambiguous evidence.
3. Add idempotent evidence writers for quiz answers, flashcard reviews, material completion, and reviewed tutor grading.
4. Version Inngest events and add idempotency keys. A retry must not create duplicate evidence or changes.
5. Add full and incremental recompute. Both must produce byte-identical state for the same watermark.
6. Add compatibility reads: Idea state first, explicit concept baseline second, unknown last.
7. Add deterministic recommendation priorities and explanation reason codes.
8. Run shadow computation in staging for Tutorial PKA without changing visible mastery. Compare output distributions and investigate every large delta, but do not force equality because Idea attribution is more precise.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/idea-mastery-engine.test.ts tests/contracts/mastery-idempotency.test.ts tests/contracts/flashcard-generator.test.ts tests/migration/mastery-compatibility.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:shadow-idea-mastery -- --run-id <runId> --course tutorial-pka
bun --env-file=.env.staging run staging:recompute-idea-mastery -- --run-id <runId> --course tutorial-pka --mode full
bun --env-file=.env.staging run staging:recompute-idea-mastery -- --run-id <runId> --course tutorial-pka --mode incremental --expect-noop
git diff --check
```

Pass only when full and incremental hashes match, duplicate event retries add zero rows, every stored state matches a fresh recompute, mastery and confidence stay in 0 through 100, ambiguous evidence changes no score, no AI calls occur, all historical legacy mastery rows remain unchanged, and every shadow delta has a reason code.

## Test plan

- Freeze current-engine fixtures, then add correct, incorrect, partial, stale, diverse, conflicting, ambiguous, duplicate, out-of-order, full recompute, incremental recompute, and legacy fallback cases.
- Use fake clocks and provider guards so results are deterministic and zero-network.

## STOP conditions

- A concept score is copied to multiple Ideas as if it were direct evidence.
- Mastery and confidence use the same value or update rule.
- An Inngest retry creates duplicate evidence.
- Any deterministic learning path calls Gemini.
- Historical attempt or review rows are modified to fit the new algorithm.

## Maintenance notes

Changing the mastery algorithm requires a new algorithm version, golden transitions, and a full replay comparison. Never update old change-history rows in place.

## Rollback

Set `FEATURE_PEMAHAMAN_IDE_V1=0`. Existing concept mastery and recommendation paths remain authoritative. Keep new evidence and shadow states for later recompute; do not delete them.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-011-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Per-Idea mastery is reproducible, explainable, and confidence-calibrated.
- Historical data is preserved and used only where attribution is defensible.
- Learning-loop recommendations are deterministic and retry-safe.
