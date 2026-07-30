# Zyx AI Reliability Remediation Plan Index

Snapshot: `6098211`

Prepared: 2026-07-30

Purpose: replace overloaded prompts and weak AI-only controls with explicit contracts, deterministic policy, staged generation, evidence-aware validation, and measurable rollout gates. These plans are written for sequential execution by a less capable implementation model.

Finding coverage: [AUDIT-TRACEABILITY.md](./AUDIT-TRACEABILITY.md)

## Non-negotiable execution rules

1. Execute one numbered plan at a time. Do not combine branches or skip prerequisites.
2. Start each plan from a clean worktree at snapshot `6098211` or rebase the remaining plan against the latest accepted predecessor.
3. Use the branch name stated in the plan. The repository branch prefix is `codex/`.
4. Before editing a Next.js route, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
5. Before any edit, reread `AGENTS.md`, `db/schema.ts`, and `lib/env.ts`.
6. Database changes go through `db/schema.ts`, `bun run db:generate`, and `bun run db:migrate`. Never hand-edit `drizzle/`.
7. New behavior must be invisible when its `FEATURE_*` flag is absent or `"0"`, except unconditional security redaction explicitly identified in Plan 002.
8. After each meaningful edit batch run `bun run lint`. Before handoff run the targeted tests and `bun run typecheck`. Do not run a production migration or deploy.
9. Do not use em dash or en dash characters in any changed file. Keep the brand spelling as `Zyx`.
10. Update the documentation files named by each plan. Do not defer documentation to an unspecified later task.
11. Commit only files in the plan's scope. Use the commit subject shown in the plan.
12. Stop on any STOP condition. Record the blocker instead of inventing a schema, product rule, or migration result.

## Verified baseline

- `bun run lint` exits 0 with two existing warnings in `app/api/admin/quiz-insights/[id]/analyze/route.ts` for `_firstErr` and `_secondErr`.
- `bunx tsc --noEmit --incremental false` exits 0.
- There is no configured unit test script or `*.test.*` suite. Existing `scripts/test-*.ts` files are ad hoc checks.
- `lib/prompt-executor.ts` validates JSON shape with Zod and performs one broad rewrite repair. It has no semantic validator interface.
- `lib/tutor-rag.ts` mixes history, retrieval, evidence coverage, assessment policy, answer generation, citations, visuals, style, and confidence in one path.
- `lib/ko-extractor.ts` truncates input to 30,000 characters and deletes all chapter KOs before reinsertion.
- `lib/question-generator.ts` asks the model for fixed answer positions and persists generated questions with `qualityScore: 1.0`.
- Active attempt rows store answers server-side, but both quiz attempt GET routes return full attempt records without status-based redaction.

## Execution order

| Order | Plan | Priority | Depends on | Outcome |
|---|---|---|---|---|
| 001 | [Automated AI contract test foundation](./001-ai-contract-test-foundation.md) | P0 | None | Deterministic tests and fixtures exist before behavior changes. |
| 002 | [Assessment answer protection and help policy](./002-assessment-integrity-and-help-policy.md) | P0 | 001 | Active attempts cannot expose answers; one deterministic help policy exists. |
| 003 | [Prompt contracts, policy composition, and provenance](./003-prompt-contracts-and-provenance.md) | P0 | 001 | Shared prompt stages have typed identities, validators, repair codes, and trace metadata. |
| 004 | [Tutor cache isolation and query action routing](./004-tutor-cache-and-query-routing.md) | P0 | 002, 003 | Student history cannot poison shared cache; style follow-ups do not force retrieval. |
| 005 | [Tutor evidence, citation, conflict, and abstention pipeline](./005-tutor-evidence-and-citation-pipeline.md) | P0 | 002, 003, 004 | Coverage is multi-state, citations are verified, sources are untrusted data, and unsupported claims abstain. |
| 006 | [Tutor pedagogy, diagnosis, and semantic visuals](./006-tutor-pedagogy-and-visuals.md) | P1 | 003, 005 | Explanations adapt to evidence; diagnoses are hypotheses; visuals are typed and deterministic. |
| 007 | [Knowledge object provenance and stable identity](./007-ko-provenance-and-stable-identity.md) | P0 | 001, 003 | KOs carry source spans and stable IDs; type and teaching role are distinct. |
| 008 | [Staged KO extraction and canonicalization](./008-staged-ko-extraction-and-canonicalization.md) | P1 | 007 | Long sources are chunked, candidates are reconciled, ambiguous merges require review. |
| 009 | [Semantic material compiler](./009-semantic-material-compiler.md) | P1 | 007, 008 | The model plans semantic blocks; application code serializes validated Markdown. |
| 010 | [Question blueprint, option shuffle, and distractor provenance](./010-question-blueprint-and-distractors.md) | P1 | 002, 003, 007 | Question coverage is multidimensional and persisted provenance is machine-readable. |
| 011 | [Independent question verification and surgical repair](./011-question-verification-and-repair.md) | P1 | 010 | A solver and critic verify questions; repair touches only invalid fields. |
| 012 | [Evidence-calibrated learner and admin analytics](./012-learning-analytics-calibration.md) | P1 | 002, 010, 011 | Observations, interpretations, and recommendations are distinct and sample-aware. |
| 013 | [Atomic active-recall flashcards](./013-flashcard-active-recall-contract.md) | P2 | 003, 007 | Each card tests one recall target and difficulty is evidence-based. |
| 014 | [Diktat audit, formula registry, and PDF QA](./014-diktat-audit-and-pdf-qa.md) | P1 | 003, 007, 009 | Author and reviewer are separated; formula and rendered-page QA fail closed. |
| 015 | [Golden evaluations, shadow rollout, and documentation closure](./015-golden-evals-and-rollout.md) | P0 gate | 002 through 014 | All pipelines have behavioral thresholds, rollout telemetry, rollback steps, and accurate docs. |

## Cross-plan quality gates

Every plan must demonstrate:

1. Shape validity: output passes Zod or deterministic schema validation.
2. Semantic validity: evidence, policy, math, IDs, and visual rules have coded checks.
3. Privacy: logs and caches contain no raw student history unless explicitly user-scoped and retention-approved.
4. Assessment integrity: protected answers are removed before generation and before serialization.
5. Failure behavior: parsing, model, and audit failures become typed unavailable, partial, conflict, or needs-review states. They never become a synthetic success.
6. Traceability: prompt, policy, schema, validator, evidence set, model, retry, and repair versions are reconstructable without storing raw sensitive input.

## Explicitly deferred findings

The audit found three issues that should not be silently mixed into this prompt remediation package:

- Generation job counters can be inconsistent after failures. Create a separate operations plan after this package.
- Content-quality reconciliation has unrelated state bugs. Handle it in a separate maintenance plan.
- End-to-end ingestion atomicity beyond KO replacement is broader than prompt architecture. Plan 007 fixes KO identity and transaction safety only; a full ingestion transaction redesign needs its own approved scope.

Do not address these deferred items while executing Plans 001 through 015.
