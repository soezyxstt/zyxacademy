# Plan 009: Semantic Material Compiler

Snapshot: `6098211`

Branch: `codex/009-semantic-material-compiler`

Commit: `feat(materials): compile validated semantic blocks`

Priority: P1

Depends on: Plans 007 and 008

Effort: L

Risk: High

Confidence: High

## Objective

Replace one-shot Markdown generation with a staged pipeline: coverage plan, semantic block generation, validation, and deterministic serialization. Make source conflicts and intentional exclusions first-class.

## Current state and evidence

- `lib/material-generator.ts` asks one model call to select pedagogy, cover KOs, write prose, and serialize custom Markdown.
- KO content is truncated before inclusion and every KO is effectively expected to appear.
- `lib/ko-coverage-auditor.ts` treats missing KOs as omissions without a typed exclusion reason.
- `lib/markdown-compiler.ts` and `lib/ast-validator.ts` already provide useful AST and validation infrastructure.
- Malformed or unknown blocks can become diagnostics while a surviving partial document is still publishable.

## Scope

Create or update:

- `lib/material/outline-planner.ts`
- `lib/material/semantic-blocks.ts`
- `lib/material/block-generator.ts`
- `lib/material/block-validator.ts`
- `lib/material/deterministic-serializer.ts`
- `lib/material-generator.ts`
- `lib/ko-coverage-auditor.ts`
- `lib/markdown-compiler.ts`
- `lib/ast-validator.ts`
- `lib/material-storage.ts`
- `lib/env.ts` for `FEATURE_MATERIAL_COMPILER_V2`
- `tests/contracts/material-compiler.test.ts`
- fixtures under `tests/fixtures/ai/material/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not rebuild the renderer or add a new Markdown library.

## Required semantic model

An outline must contain ordered sections with learning objectives, included KO IDs, excluded KO IDs plus reason, prerequisite references, conflict groups, and intended block roles.

Supported semantic blocks should include only currently renderable needs, for example paragraph, definition, formula, worked example, procedure, misconception, warning, comparison, table, code, and visual intent. Every factual block carries source span IDs.

## Implementation steps

1. Characterize current compiler and renderer behavior with fixtures for valid blocks, unknown blocks, malformed blocks, missing KO coverage, and source conflict.
2. Add a deterministic preflight that rejects inactive, needs-review, or provenance-less v2 KOs.
3. Build an outline planner that decides inclusion, order, prerequisites, and exclusions. Exclusion reasons must be typed: duplicate, out_of_scope, prerequisite_elsewhere, unsupported, conflict, or editorial.
4. Detect source conflicts before prose generation. Preserve both supported variants with source IDs. Do not ask the author model to silently choose one.
5. Generate each semantic block independently from its approved KO spans and objective. Do not send the entire course or unrelated KOs.
6. Validate every block for schema, source IDs, allowed claims, math parseability, visual contract, and role-specific requirements.
7. Allow one field-scoped repair through Plan 003. If still invalid, mark the material run failed or needs-review. Never drop a required block and publish a partial document as success.
8. Serialize validated blocks deterministically into the existing AST or canonical Markdown. The serializer owns custom syntax, escaping, ordering, and stable IDs.
9. Update coverage auditing to distinguish planned exclusion from accidental omission and unsupported content. Report coverage by objective and KO.
10. Change publish gating so compiler diagnostics with error severity block publication. Warnings may pass only when an explicit policy allowlists the code.
11. Store outline, semantic block version, serializer version, source set hash, validation results, and material run state for reproducibility.
12. Add fixtures for duplicate KOs, conflicting formulas, one invalid optional enrichment, one invalid required core block, and serializer round trip.
13. Update architecture and feature docs with the new stages and rollback to legacy when the flag is off.

## Test plan

```powershell
bun test tests/contracts/material-compiler.test.ts tests/contracts/ko-pipeline.test.ts
bun run lint
bun run typecheck
```

Run existing Markdown/AST validation scripts identified by repository search. Compare deterministic output hashes across two identical runs.

## Done criteria

- Models never serialize raw custom Markdown syntax in the v2 path.
- Every factual block has approved source spans.
- Conflict and exclusion states are explicit and visible to reviewers.
- Required invalid blocks block publication.
- Identical semantic blocks and serializer versions produce identical output.
- Flag-off behavior remains available for rollback.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if the renderer cannot accept a deterministically serialized supported block without losing meaning.
- Stop if a conflict has no product-approved presentation rule. Mark needs-review.
- Stop if publication can proceed after an error-severity compiler diagnostic.
- Stop if a generated block needs evidence outside its approved source spans.
