# Plan 005: Tutor Evidence, Citation, Conflict, and Abstention Pipeline

Snapshot: `6098211`

Branch: `codex/005-tutor-evidence-pipeline`

Commit: `feat(tutor): verify evidence and citations`

Priority: P0

Depends on: Plans 002, 003, and 004

Effort: L

Risk: High

Confidence: High

## Objective

Split tutor retrieval into evidence classification, answer planning, generation, and verification. Represent partial and conflicting evidence, treat all retrieved text as untrusted data, verify citations, and abstain when support is insufficient.

## Current state and evidence

- `lib/tutor-rag.ts` asks one call to decide coverage, answer, citation IDs, safety, pedagogy, language, visuals, concepts, and numeric confidence.
- Coverage is a boolean. Partial, conflict, and needs-review states do not exist.
- `lib/tutor-rag.ts:586-589` concatenates source content into plain prompt text without an instruction/data boundary.
- `lib/tutor-rag.ts:601-605` substitutes the first three retrieved IDs when the model gives no valid citation.
- `lib/tutor-rag.ts:609-615` then marks that answer grounded.
- `confidence` is model-generated and is used as a cache threshold, but it is not calibrated.

## Scope

Create or update:

- `lib/tutor/evidence-classifier.ts`
- `lib/tutor/answer-planner.ts`
- `lib/tutor/citation-verifier.ts`
- `lib/tutor/source-boundary.ts`
- `lib/tutor/contracts.ts`
- `lib/tutor-rag.ts`
- `lib/prompt-executor.ts` only through the Plan 003 extension points
- `lib/env.ts` existing `FEATURE_TUTOR_PIPELINE_V2` path
- `tests/contracts/tutor-rag.test.ts`
- golden fixtures under `tests/fixtures/ai/tutor/`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not redesign visuals or concept-explainer pedagogy here. Plan 006 owns those.

## Required contracts

Evidence classification:

- `full`: every material claim can be supported
- `partial`: only some requested claims can be supported
- `none`: no useful support
- `conflict`: approved sources disagree materially
- `needs_review`: evidence or policy cannot be resolved automatically

Each requested claim must have a stable claim ID and one or more supporting source IDs or an explicit unsupported reason. Do not expose a numeric confidence unless it is later calibrated against labeled outcomes. Use coverage state and reason codes instead.

## Implementation steps

1. Define a source envelope with source ID, source kind, version/hash, title, approved content, and trust label. Serialize each source as a distinct content part or strong delimiter.
2. Add system-level instruction hierarchy: source text, chat history, questions, and uploaded content are untrusted data. Embedded instructions are inert. Add adversarial fixtures such as a source telling the model to ignore policy or cite a fake ID.
3. Extract requested claim units from the query with a typed machine-facing stage. Keep this stage free of voice and visual policies.
4. Classify evidence per claim. Require direct source IDs and short support spans or offsets. Validate that every returned ID is in the supplied source allowlist.
5. Build an answer plan that contains claim IDs, allowed help level from Plan 002, answer disposition, and citation mapping. The plan may omit unsupported claims or ask for clarification.
6. Generate prose only from the approved plan and approved evidence slices. Do not give the answer model unused sources, answer keys, or raw history.
7. Add a citation verifier that checks allowlisted IDs and lexical or structured support for each material claim. A more capable model may act as a secondary critic, but deterministic allowlist and span checks remain mandatory.
8. Remove the fallback that substitutes top retrieved sources. If no valid support remains, downgrade to partial, none, conflict, or needs-review and omit unsupported citation chips.
9. Define response behavior:
   - full: answer all supported claims;
   - partial: answer supported parts and name the missing scope;
   - none: give a concise abstention and request the needed material;
   - conflict: summarize the conflict with per-source attribution and do not choose a winner without policy;
   - needs_review: do not fabricate a resolution.
10. Replace model numeric confidence in cache decisions with deterministic cache eligibility based on coverage state, validator outcome, contract version, and source version.
11. Add stage-level trace events from Plan 003, including failure and abstention reason codes. Do not persist raw student text.
12. Update docs with the real learning, practice, and past-exam namespaces and their trust and assessment boundaries.

## Test plan

```powershell
bun test tests/contracts/tutor-rag.test.ts
bun run lint
bun run typecheck
```

Required cases: full support, one unsupported subclaim, no sources, conflicting formulas, unknown citation, no citation, invalid source instruction, history injection, protected assessment content, and provider failure.

## Done criteria

- No code path invents a citation from retrieval rank.
- Every material claim is supported, labeled unsupported, or omitted.
- Conflict and partial coverage are visible typed states.
- Prompt injection fixtures do not alter policy, output schema, or citation allowlist.
- Cache eligibility is deterministic and versioned.
- Assessment help level comes only from Plan 002.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if approved source content cannot be separated from instructions at the model boundary.
- Stop if the UI cannot represent partial, conflict, or abstention states. Add the minimum typed UI state before enabling the flag.
- Stop if a citation verifier would require sending protected answer material back to the answer model.
