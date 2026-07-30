# Plan 006: Tutor Pedagogy, Diagnosis, and Semantic Visuals

Snapshot: `6098211`

Branch: `codex/006-tutor-pedagogy-visuals`

Commit: `feat(tutor): calibrate pedagogy and visual specs`

Priority: P1

Depends on: Plans 003 and 005

Effort: L

Risk: Medium

Confidence: High

## Objective

Remove forced pedagogical claims and raw visual syntax from tutor prompts. Make analogies, misconceptions, diagnostic hypotheses, and visuals conditional on evidence and represented by typed contracts.

## Current state and evidence

- `prompts/tutor.ts` requires an analogy, simplification, common misconception, detected misconception, mathematical error, and exactly two Socratic questions.
- `lib/context-assembly.ts` provides the selected option and correct option but no student derivation or reasoning steps.
- `lib/tutor-actions.ts` requires diagnosis fields as non-null strings, forcing invention when evidence is absent.
- `lib/tutor-rag.ts` asks the answer model to emit custom `:::graph`, `:::chart`, and `:::flowchart` syntax inside an unconstrained answer string.
- `lib/markdown-compiler.ts` can convert malformed visual blocks into diagnostics while callers still render surviving content.

## Scope

Create or update:

- `prompts/tutor.ts`
- `lib/context-assembly.ts`
- `lib/tutor-actions.ts`
- `lib/tutor/pedagogy-contracts.ts`
- `lib/tutor/visual-contracts.ts`
- `lib/tutor/visual-serializer.ts`
- `lib/tutor-rag.ts`
- `lib/ast-validator.ts`
- `components/course/markdown-renderer.tsx` only where typed visual output integration requires it
- tests and fixtures under `tests/contracts/` and `tests/fixtures/ai/tutor/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `AGENTS.md` Current State section

Reuse the existing `FEATURE_TUTOR_PIPELINE_V2` flag. Do not introduce a separate rendering library.

## Required pedagogy contracts

Concept explanation fields must allow:

- direct explanation
- prerequisite reminder
- optional analogy with a stated boundary where it stops matching
- optional common misconception only when the source or verified domain rule supports it
- optional check-for-understanding

Mistake analysis must separate:

- `observed`: facts visible in submitted data
- `possibleExplanations`: nullable hypotheses with evidence labels
- `evidenceSufficiency`: insufficient, limited, or sufficient
- `diagnosticQuestion`: optional next question needed before diagnosis
- `mathematicalError`: nullable unless student work contains a verifiable step

## Required visual contract

Return prose plus `visualIntent: null | object`. The object must contain a supported type, semantic labels, data/domain values, relationships, source claim IDs, and accessibility text. Application code serializes it deterministically. The model never writes renderer syntax.

## Implementation steps

1. Add fixtures where no analogy is useful, where an analogy needs a limitation, where no misconception evidence exists, and where only a wrong option is known.
2. Change concept-explainer output fields to optional or nullable where content is not always warranted. Make the primary explanation and evidence references required.
3. Change mistake analysis to the observed/interpreted split. When only the selected option is known, permit only an observed mismatch plus one or more explicitly tentative hypotheses.
4. If student work or derivation is available in the product, add it as a separate untrusted input with explicit provenance. Do not infer that such work exists.
5. Replace the string containing exactly two questions with an array constrained by policy and context. Zero is valid when a direct post-attempt explanation is allowed; one is valid when evidence is insufficient.
6. Remove duplicate voice, language, math, and safety text from these prompts. Compose the versioned policy fragments created in Plan 003.
7. Define typed graph, chart, flowchart, and no-visual schemas. Add domain validators for finite numbers, nonempty axes, valid edges, unique node IDs, supported formula variables, and matching claim/source IDs.
8. Build a deterministic serializer from typed visual specs to the existing AST or renderer input. Escape labels and reject unknown fields.
9. If a visual fails semantic validation, repair only the visual object once or omit it. Never discard a valid textual answer solely because an optional visual failed.
10. Make the renderer surface controlled diagnostics in development and omit invalid visuals in production without presenting them as successful figures.
11. Add accessibility tests for generated labels and alt descriptions. Verify dark-mode tokens if any UI wrapper changes.
12. Update docs with optional pedagogy and semantic visual flow.

## Test plan

```powershell
bun test tests/contracts/tutor-rag.test.ts tests/contracts/prompt-executor.test.ts
bun run lint
bun run typecheck
```

Also run existing AST/compiler validation scripts that cover graph, chart, and flowchart blocks. If no targeted script exists, add the contract cases to the Bun suite instead of inventing a manual-only gate.

## Done criteria

- A wrong answer alone never produces a certain underlying misconception or derivation error.
- Analogy and misconception fields can be absent without repair.
- Analogy outputs state their useful scope and limitation.
- The model emits no raw custom visual syntax.
- Invalid optional visuals are repaired or omitted with a coded trace.
- Text answers remain valid and cited through Plan 005.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if a consumer cannot handle nullable diagnosis fields. Update that consumer within scope before enabling the flag.
- Stop if a visual cannot be tied to a supported claim or deterministic domain rule. Omit it.
- Stop if renderer changes require a new UI library.
