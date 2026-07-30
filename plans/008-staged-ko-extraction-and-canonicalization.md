# Plan 008: Staged KO Extraction and Canonicalization

Snapshot: `6098211`

Branch: `codex/008-staged-ko-extraction`

Commit: `feat(knowledge): stage extraction and canonical review`

Priority: P1

Depends on: Plan 007

Effort: L

Risk: High

Confidence: High

## Objective

Replace one-pass truncated KO extraction and aggressive name merging with a staged, source-complete pipeline that preserves provenance and sends ambiguous canonicalization to review.

## Current state and evidence

- `lib/ko-extractor.ts:746` silently slices preprocessed Markdown to 30,000 characters.
- The extraction prompt asks one response to identify, classify, name, order, and describe KOs.
- Canonicalization favors very short names and aggressively reuses existing concepts.
- High embedding similarity can auto-merge concepts; unmatched candidates can become new active concepts.
- Extraction failure can create a generic active fallback KO instead of a typed failure state.
- Validation is largely metadata-oriented and invalid candidates can still influence later stages.

## Scope

Create or update:

- `lib/knowledge/chunker.ts`
- `lib/knowledge/candidate-extractor.ts`
- `lib/knowledge/candidate-reconciler.ts`
- `lib/knowledge/canonicalizer.ts`
- `lib/knowledge/extraction-run.ts`
- `lib/ko-extractor.ts`
- review API/UI only if an existing admin review surface can be extended without a new design system
- `db/schema.ts` only if Plan 007's review/run tables need small fields identified during implementation
- generated migrations if schema changes are necessary
- `tests/contracts/ko-pipeline.test.ts`
- fixtures under `tests/fixtures/ai/knowledge/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md` if schema changes
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Use `FEATURE_KO_PIPELINE_V2`. Do not change material generation in this plan.

## Required stages

1. Canonical source normalization with version and hash.
2. Deterministic semantic chunking with overlap and absolute source offsets.
3. Candidate extraction per chunk.
4. Cross-chunk deduplication and relationship reconciliation.
5. Canonical concept resolution with evidence.
6. Validation and review-state assignment.
7. Atomic accepted-run persistence through Plan 007 stable identity logic.

## Implementation steps

1. Build a deterministic chunker that respects headings, fenced code, formulas, tables, and paragraphs. Never split a formula or table row solely to hit a token target.
2. Store start and end offsets against the canonical source version. Hash every chunk.
3. Make per-chunk extraction return candidates with knowledge kind, instructional role, source spans, exact support excerpt hashes, prerequisites, and uncertainty reason codes.
4. Permit an empty candidate list. Model failure or empty valid content must produce a failed or needs-review run, never a synthetic active KO.
5. Reconcile overlapping candidates deterministically using source overlap and normalized content before asking a model. Preserve all supporting spans when duplicates merge.
6. Canonicalization must return `existing_exact`, `existing_alias`, `new`, `ambiguous`, or `reject`, with candidate IDs and evidence. Remove arbitrary 1-to-4-word pressure; prefer clear, domain-correct names.
7. Exact normalized identity and reviewed aliases may auto-resolve. Embedding similarity alone may propose candidates but may not auto-merge an accepted concept.
8. Add collision rules for same label with different definitions, same formula symbol in different contexts, and local versus global concept scope.
9. Put ambiguous results into needs-review. Do not create an active global concept until review accepts it.
10. Extract learning objectives separately from KOs. Assign Bloom only to objective statements, with a verb and source evidence.
11. Validate the whole run before persistence: complete chunk coverage, valid offsets, no orphan references, unique stable keys, and no unresolved candidate in an accepted run.
12. Persist accepted results in one transaction using Plan 007's diff. A failed run leaves the prior accepted version active.
13. Add long-source fixtures where important content appears after character 30,000, duplicated concepts span chunks, and two similarly named concepts must remain separate.
14. Update docs with stage states, review workflow, and failure semantics.

## Test plan

```powershell
bun test tests/contracts/ko-pipeline.test.ts
bun run lint
bun run typecheck
```

If schema changes were necessary:

```powershell
bun run db:generate
bun run db:migrate
```

## Done criteria

- No canonical source content is silently truncated.
- Every candidate and accepted KO points to valid source spans.
- Embedding similarity alone never performs an irreversible merge.
- Ambiguous candidates remain reviewable and do not enter active downstream generation.
- Extraction failure preserves the prior accepted KO set.
- Bloom classifications exist only on sourced learning objectives.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if chunk offsets change across identical input and configuration.
- Stop if a candidate cannot retain its source evidence through reconciliation.
- Stop if the existing admin surface cannot represent ambiguity safely. Keep the run in needs-review and defer UI activation.
- Stop if a model response can activate a concept without deterministic validation.
