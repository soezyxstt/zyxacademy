# Plan 010: Question and Assessment Integrity

Status: blocked until Plan 009 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- lib app components scripts tests docs package.json AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/009-article-and-diktat-quality-compiler.md
- **Category**: security, correctness
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Make questions and assessments measure explicit Ideas with independent difficulty, cognitive, relation, and reasoning dimensions; produce attributable per-Idea evidence without leaking protected answers or benchmarks.

## Current state to reverify

- The V2 question pipeline already has blueprints, option shuffle, distractor provenance, an independent solver, and a pedagogical critic. Preserve these verified contracts.
- `ai_question_bank` has one primary KO link, while assessment-object mappings can be many-to-many and sometimes heuristic.
- Quiz attempts preserve snapshots and active-attempt serialization strips answer-bearing fields.
- Existing quiz template categories include daily, weekly, chapter, premium, and simulation; the target domain simplifies assessment semantics to quiz and tryout while retaining compatibility metadata.

Anchor excerpts from `db/schema.ts`: `ai_question_bank.knowledge_object_id` is declared near line 604, and `student_quiz_attempts.questions_snapshot`, `answers_snapshot`, and `mastery_before` are declared at lines 753-761. Preserve those snapshots byte for byte.

## Git workflow

- Create branch `codex/010-assessment-integrity` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `lib/questions/**`
- `lib/question-generator.ts`
- `lib/assessment-extractor.ts`
- new `lib/asesmen/blueprint.ts`
- new `lib/asesmen/evidence-rubric.ts`
- new `lib/asesmen/benchmark-policy.ts`
- quiz template and attempt API routes under `app/api/quiz/**`
- `components/course/quiz-player.tsx`
- assessment admin and tutor surfaces only as required for contract visibility
- tests and fixtures under `tests/contracts/`
- new `scripts/staging/smoke-assessment-v2.ts`
- new `scripts/staging/scan-assessment-leaks.ts`
- `package.json`
- `docs/features.md`, `docs/ARCHITECTURE.md`, `docs/DB_SCHEMA.md`, `AGENTS.md`

Out of scope: mastery aggregation, Zyra responses, final UI overhaul, AI-based analytics.

## Question contract

1. Every published question has one or more `soal_ide` rows. Weights sum to 1 within `0.000001`.
2. Store difficulty, cognitive level, Idea count, required Idea relations, reasoning pattern, application level, and estimated steps independently.
3. Multiple Ideas alone never imply HOTS.
4. Each option or rubric outcome maps to per-Idea evidence contributions with weight and confidence. A distractor may identify a misconception Idea, but it is not treated as truth.
5. Objective questions can produce evidence only through a versioned deterministic rubric. Free response requires a reviewed tutor rubric or a reviewed grading result; an unreviewed AI proposal cannot change mastery.
6. Option order is snapshotted and answer grading uses stable option IDs, never rendered position.
7. Independent solver disagreement, missing evidence mapping, unresolved critic issue, or stale Idea dependency blocks publication.

## Assessment contract

- A quiz covers exactly one chapter.
- A tryout covers one or more chapters.
- Blueprint dimensions include Idea coverage, difficulty, cognitive level, reasoning pattern, relation use, question type, and item count.
- Distribution rounding must allocate exactly the requested item count. Per-dimension deviation may be at most one item from the mathematically rounded target.
- Selection is seeded and reproducible for the same blueprint, eligible pool, and seed.
- Published attempts snapshot blueprint and selected item versions.

## Benchmark and holdout policy

Exact hash duplicates are rejected. Semantic similarity scores are recorded against allowed and holdout references, but thresholds come from versioned course policy. If a threshold is absent, the item goes to `needs_review`; it never auto-publishes. Holdout content is available only to the benchmark service and never appears in prompts, previews, exports, logs, or client responses.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Extend existing question contracts instead of replacing independent solver, critic, shuffle, and distractor provenance.
2. Implement blueprint compilation and deterministic rounding.
3. Implement evidence rubric validation and per-answer evidence derivation.
4. Implement benchmark access boundary and leak-canary tests.
5. Wire new assessment writes behind `FEATURE_ASESMEN_IDE_V1` with dual-write compatibility.
6. Update active-attempt serializers for every new field and test allowlists rather than blocklists.
7. Run staging creation, publication, start, answer, submit, and summary flows using dedicated test assessments.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/question-pipeline.test.ts tests/contracts/assessment-redaction.test.ts tests/contracts/assessment-blueprint-v2.test.ts tests/contracts/idea-evidence.test.ts tests/contracts/benchmark-holdout.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:smoke-assessment-v2 -- --run-id <runId> --course tutorial-pka --fixture dedicated
bun --env-file=.env.staging run staging:scan-assessment-leaks -- --run-id <runId>
git diff --check
```

Pass only when weight sums are exact within tolerance, seeded selection is repeatable, item counts equal blueprint requests, active-attempt leak findings equal zero, holdout canaries appear nowhere outside the benchmark process, ambiguous historical mappings create no evidence, and all prior question-pipeline tests still pass.

## Test plan

- Cover single and multi-Idea questions, independent dimensions, exact weight sums, stable option IDs, partial evidence, ambiguous evidence, free-response review, deterministic blueprint rounding, solver disagreement, stale dependency, absent similarity policy, holdout leak canaries, and every active-attempt serializer.
- Extend current `tests/contracts/question-pipeline.test.ts` and `tests/contracts/assessment-redaction.test.ts` as compatibility gates.

## STOP conditions

- Difficulty is derived from Idea count alone.
- Any active response includes correct answer, solution, grading rubric, hidden evidence mapping, or holdout content.
- An unreviewed AI judgment updates evidence or mastery.
- A question with solver disagreement or stale dependency can publish.
- A quiz spans more than one chapter or a tryout has zero chapters.

## Maintenance notes

Any new assessment response field must be added to an explicit active-attempt allowlist test. Do not depend on remembering to redact new answer-bearing fields later.

## Rollback

Set `FEATURE_ASESMEN_IDE_V1=0`. Existing attempts continue through immutable legacy snapshots. Preserve new attempt and evidence rows for audit; do not rewrite submitted history.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-010-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Questions measure explicit Ideas through validated evidence rubrics.
- Assessment blueprints are exact, deterministic, and scope-correct.
- Protected content has zero exposure during active assessment and authoring.
- Existing assessment history remains unchanged.
