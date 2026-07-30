# Plan 003: Prompt Contracts, Policy Composition, and Provenance

Snapshot: `6098211`

Branch: `codex/003-prompt-contracts`

Commit: `feat(ai): add versioned prompt contracts and provenance`

Priority: P0

Depends on: Plan 001

Effort: L

Risk: Medium

Confidence: High

## Objective

Turn `PromptExecutor` into a typed generation boundary with composable policy layers, semantic validators, bounded repair, and privacy-safe provenance. This plan supplies infrastructure only; it does not migrate every prompt.

## Current state and evidence

- `lib/prompt-executor.ts:6-10` defines only version, system instruction, user prompt, and optional response schema.
- `lib/prompt-executor.ts:78-107` stops at JSON and Zod validation.
- `lib/prompt-executor.ts:127-142` places the full prompt and invalid response into a broad repair prompt and omits the native response schema on retry.
- `db/schema.ts:1820-1833` stores model and token usage but lacks policy version, schema version, validator version, input hash, evidence hash, retry count, and repair outcome.
- Student-facing style, safety, math, and visual rules are duplicated across prompt files.

## Scope

Create or update:

- `lib/ai/contracts.ts`
- `lib/ai/policies.ts`
- `lib/ai/validation.ts`
- `lib/ai/provenance.ts`
- `lib/prompt-executor.ts`
- `lib/gemini.ts` only for typed role or content-part support
- `db/schema.ts`
- generated migration files produced by Drizzle commands
- `lib/env.ts` for `FEATURE_AI_CONTRACT_V2`
- `tests/contracts/prompt-executor.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/DB_SCHEMA.md`
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not migrate tutor, KO, question, material, flashcard, or diktat prompts yet. Keep the current executor API available while the flag is off.

## Required contracts

`PromptContract` must identify:

- stage ID and prompt version
- policy fragment IDs and versions
- input schema version
- output schema version
- semantic validator set and version
- repairable field allowlist
- maximum attempts
- use case and model configuration identity
- whether the output may enter a shared cache

`GenerationTrace` must store or emit:

- sanitized input hash, not raw input
- evidence-set hash when applicable
- stage, prompt, policy, schema, and validator versions
- model and route used
- input and output token counts
- retry count
- terminal outcome and violation codes
- latency and cache result when available

## Implementation steps

1. Add versioned policy fragments for machine-facing JSON, student-facing Zyx voice, language choice, math notation, assessment help, and visual intent. Do not compose student style into classifier or verifier stages.
2. Define a semantic validator interface that receives typed input, typed output, and trusted context, then returns stable codes with field paths and severity.
3. Extend `PromptExecutor` behind `FEATURE_AI_CONTRACT_V2`. Run Zod first, then semantic validators. Return a discriminated result such as success, rejected, quota, provider failure, or invalid contract.
4. Replace prose-only repair context with a bounded repair request containing violation codes, allowed field paths, current field values, and minimal relevant evidence. Do not include unrelated history or secrets.
5. Preserve the original response schema in repair calls. Reject repairs that change fields outside the allowlist by comparing normalized before and after values.
6. Add a hard maximum of one repair by default. A contract may set zero. Do not silently loop.
7. Add schema columns or a dedicated generation trace table in `db/schema.ts`. Prefer a dedicated table if nullable additions would make `aiUsageEvents` ambiguous. Store hashes and version metadata, never raw prompt or student messages.
8. Run Drizzle generation and local migration. Inspect generated SQL before applying it locally.
9. Keep usage-budget accounting compatible. A repair must record its token cost and relationship to the original generation.
10. Add contract tests for success, JSON failure, Zod failure, semantic failure, permitted field repair, forbidden cross-field mutation, schema preserved on repair, provider failure, quota failure, and provenance written exactly once per attempt.
11. Document the contract lifecycle and version-bump rules. A behavior or output schema change requires a new version and cache invalidation in downstream plans.

## Test plan

```powershell
bun run db:generate
bun run db:migrate
bun test tests/contracts/prompt-executor.test.ts
bun run lint
bun run typecheck
```

Inspect the migration to confirm it changes only the intended AI provenance schema.

## Done criteria

- Legacy callers behave unchanged when the flag is absent or `"0"`.
- A migrated fixture can use composed policies and semantic validators.
- Repair preserves the response schema and cannot modify unapproved fields.
- Trace records reconstruct the generation contract without raw sensitive content.
- Token usage includes retries.
- Migration, tests, lint, and typecheck pass.

## STOP conditions

- Stop if provenance design requires storing raw student messages or full source text.
- Stop if the migration contains unrelated table changes.
- Stop if a repair cannot be bounded to explicit fields. Return a typed rejection instead.
- Stop if policy composition would apply student-facing prose rules to machine-only stages.
