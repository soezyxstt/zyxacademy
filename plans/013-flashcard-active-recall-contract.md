# Plan 013: Atomic Active-Recall Flashcard Contract

Snapshot: `6098211`

Branch: `codex/013-flashcard-contract`

Commit: `feat(flashcards): enforce atomic recall targets`

Priority: P2

Depends on: Plans 003 and 007

Effort: M

Risk: Medium

Confidence: High

## Objective

Make every generated flashcard test one explicit recall target, preserve source provenance, and separate initial content complexity from learner-specific recall difficulty.

## Current state and evidence

- `lib/flashcard-generator.ts` models front, back, explanation, type, model, and recall difficulty.
- It does not represent the exact recall target, key points, acceptable answer variants, prerequisite, or source spans.
- A model-assigned difficulty can be mistaken for observed learner difficulty before any review history exists.

## Scope

Create or update:

- `lib/flashcards/contracts.ts`
- `lib/flashcards/validator.ts`
- `lib/flashcard-generator.ts`
- flashcard persistence adapters and UI consumers found by call-site search
- `db/schema.ts` only if structured fields cannot fit an existing versioned payload safely
- generated migrations if required
- `lib/env.ts` for `FEATURE_FLASHCARD_GENERATOR_V2`
- `tests/contracts/flashcard-generator.test.ts`
- fixtures under `tests/fixtures/ai/flashcards/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md` if schema changes
- `docs/DEVELOPMENT.md`
- `AGENTS.md` Current State section

Do not alter SM-2 scheduling mathematics except to remove dependence on unsupported model difficulty.

## Required card contract

Each card must contain:

- one `recallTarget` with a stable ID
- prompt type and direction
- canonical answer
- atomic key points
- acceptable variants or normalization rules where appropriate
- explicit non-accepted confusions when sourced
- KO and source span IDs
- content complexity estimate and basis
- learner difficulty state derived only from review data

## Implementation steps

1. Add fixtures for a multi-fact front, ambiguous pronoun, formula recall, definition, process step, reverse card, and unsourced misconception.
2. Define a v2 card schema. A card with two independent recall targets is invalid and must be split before acceptance.
3. Change generation to receive one approved KO span and one target role. The model may propose cards but cannot invent unsupported facts or misconception labels.
4. Add deterministic atomicity checks: one interrogative intent, no unrelated conjunction of answer targets, answer key points all support the same target, and source allowlist compliance.
5. Add type-specific validation for formulas, units, ordered procedures, definitions, and cloze-like prompts.
6. Store content complexity separately from learner recall difficulty. Initial learner difficulty is unknown or neutral until review observations exist.
7. Make SM-2 and review history the owner of learner difficulty updates. If `FEATURE_FC_DIFFICULTY` invokes AI, constrain it to explaining observed patterns, not setting scheduling values.
8. Add field-scoped repair for front wording or answer variants. A repair may not change source IDs or recall target without full regeneration and revalidation.
9. Update UI consumers to display the canonical answer and key points without exposing internal provenance noise.
10. If persistence changes, migrate legacy cards as version 1 with unknown recall-target metadata. Do not fabricate source spans.
11. Update docs with atomicity and the difference between content complexity and observed recall difficulty.

## Test plan

```powershell
bun test tests/contracts/flashcard-generator.test.ts
bun run lint
bun run typecheck
```

If schema changed:

```powershell
bun run db:generate
bun run db:migrate
```

## Done criteria

- Every v2 card has exactly one recall target and approved source spans.
- Multi-target candidates split or fail; they do not publish unchanged.
- Initial learner difficulty is not a model confidence label.
- Scheduling uses review data, not unsupported AI scoring.
- Legacy cards remain readable with explicit unknown metadata.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if atomicity requires deleting manually edited cards. Preserve them as legacy and report them for review.
- Stop if an acceptable answer variant cannot be expressed deterministically. Mark for review.
- Stop if a generated misconception has no approved source.
