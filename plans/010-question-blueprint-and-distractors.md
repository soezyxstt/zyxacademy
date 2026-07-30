# Plan 010: Question Blueprint, Option Shuffle, and Distractor Provenance

Snapshot: `6098211`

Branch: `codex/010-question-blueprint`

Commit: `feat(questions): enforce blueprint and distractor provenance`

Priority: P1

Depends on: Plans 002, 003, and 007

Effort: L

Risk: High

Confidence: High

## Objective

Create a deterministic multidimensional assessment blueprint, generate questions against explicit slots, shuffle options in application code, and persist machine-readable distractor provenance.

## Current state and evidence

- `lib/question-generator.ts` prompts for exactly four options and examples use `correctIndices: [0]`.
- Distribution language is advisory and narrow enums collapse richer reasoning types.
- Options are not shuffled after generation, while question order is shuffled elsewhere.
- `lib/question-validator.ts` mainly checks shape, KaTeX, KO, and policy constraints.
- `lib/distractor-mapper.ts` uses lexical overlap with a fixed threshold and does not persist score, evidence, method version, or uncertainty.
- Generated questions are persisted with `qualityScore: 1.0`, which is not a measured quality result.

## Scope

Create or update:

- `lib/questions/blueprint.ts`
- `lib/questions/contracts.ts`
- `lib/questions/option-shuffle.ts`
- `lib/questions/distractor-provenance.ts`
- `lib/question-generator.ts`
- `lib/assessment-extractor.ts`
- `lib/question-validator.ts`
- `lib/pedagogical-validator.ts`
- `lib/distractor-mapper.ts`
- `db/schema.ts`
- generated Drizzle migrations
- `lib/env.ts` for `FEATURE_QUESTION_GENERATOR_V2`
- `tests/contracts/question-pipeline.test.ts`
- fixtures under `tests/fixtures/ai/questions/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md`
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not implement the independent solver or critic here. Plan 011 owns acceptance verification.

## Required blueprint dimensions

Each slot must identify:

- learning objective and KO IDs
- cognitive process from the objective, not copied blindly from KO metadata
- difficulty target and basis
- reasoning or procedural pattern
- item format and answer cardinality
- misconception or error family targeted by each distractor
- source/provenance requirements
- assessment context and release policy

The batch planner must produce counts for every required cross-dimension cell and deterministic tolerances for small batches.

## Implementation steps

1. Inventory all consumers of question fields, `correctIndices`, `distractorMap`, tags, Bloom, difficulty, and `qualityScore`.
2. Define a versioned blueprint schema. Reject impossible combinations before spending AI quota.
3. Build deterministic slot allocation from requested count and policy. Use a seeded random source only where multiple valid allocations exist; persist the seed and blueprint version.
4. Change generation to accept one explicit slot at a time or a small set of homogeneous slots. The model does not choose the distribution.
5. Expand reasoning and procedural categories only where current content supports them. Add `other` plus review instead of forcing a wrong narrow enum.
6. Generate stable option IDs separately from display positions. Permit the model to identify correct option IDs, not final numeric indices.
7. Shuffle options in application code with a stored seed after structural validation. Recompute `correctIndices`, distractor positions, and explanation references from stable option IDs.
8. Add deterministic checks for unique normalized options, answer cardinality, correct-option presence, no position leakage, valid formula rendering, and blueprint match.
9. Replace opaque distractor mapping with structured provenance: targeted misconception/error family, supporting KO/source IDs, mapping method, score, version, and uncertainty state.
10. Lexical or embedding similarity may suggest a mapping but must not become a categorical diagnosis below a reviewed threshold. Persist ambiguous as unknown.
11. Add a question generation run record and link accepted questions to prompt, blueprint, source, shuffle, and validator versions. Replace default `qualityScore: 1.0` with nullable/unverified until Plan 011 produces an acceptance result.
12. Run and inspect schema migration. Add backward-compatible readers for legacy questions.
13. Add batch tests for exact counts, small-batch tolerances, deterministic seeded shuffle, multi-answer remapping, duplicate values, unknown distractor evidence, and legacy compatibility.
14. Refactor assessment extraction to return typed `accepted`, `needs_review`, or `failed` results. A parse/provider failure must not insert a generic valid-looking classification. Align extracted difficulty to the blueprint scale through one explicit adapter and preserve the raw sourced label.
15. Add assessment-extraction fixtures for unknown procedural pattern, scale mismatch, malformed provider output, and evidence-free classification.
16. Update docs with blueprint dimensions and machine-readable provenance.

## Test plan

```powershell
bun run db:generate
bun run db:migrate
bun test tests/contracts/question-pipeline.test.ts
bun run lint
bun run typecheck
```

Inspect generated SQL and verify it does not change unrelated quiz attempt data.

## Done criteria

- Batch coverage is enforced by code, not prompt wording.
- Correct answer display position is determined only by application shuffle.
- Stable option IDs survive shuffle and all dependent indices are remapped correctly.
- Every mapped distractor has method, evidence, score, and version; ambiguous mappings remain unknown.
- New questions are not labeled quality 1.0 before independent verification.
- Migration, tests, lint, and typecheck pass.

## STOP conditions

- Stop if a blueprint slot has no sourced objective or KO.
- Stop if option shuffle can desynchronize answer, explanation, or distractor references.
- Stop if a schema migration rewrites existing correct indices without a verified mapping.
- Stop if product requirements for multiple-answer items are ambiguous.
