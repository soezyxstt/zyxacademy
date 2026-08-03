# Plan 002: Establish verified model registry and provider adapters

> **Executor instructions**: Execute this plan before the Idea-centered Overhaul Plan 013 begins, or after it finishes. Never edit the same runtime files concurrently. Run every verification and stop instead of guessing when the installed SDK differs.
>
> **Drift check**: `git diff --stat 03b68ba0..HEAD -- lib/ai-router.ts lib/gemini.ts lib/gemini-keys.ts lib/prompt-executor.ts lib/ai tests scripts lib/env.ts docs`. Semantic changes from another executor are a STOP condition until rebased.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: Idea-centered Overhaul Plan 005
- **Category**: correctness, architecture
- **Planned at**: commit `03b68ba0`, 2026-08-02

## Why this matters

The current router mixes stale rate limits, invalid embedding fallbacks, and one configuration style across model generations. Live probes proved that availability, latency, and accepted configuration differ materially. A versioned registry and adapter boundary must become the only source for model IDs, quotas, capabilities, deadlines, and request configuration.

## Current state

Current anchors to reverify:

```ts
// lib/gemini.ts:39
const EMBEDDING_MODELS = ['gemini-embedding-2', 'gemini-embedding-002', 'gemini-embedding-001'];

// lib/ai-router.ts:114-126
export const RPD_LIMITS: Record<string, number> = { /* model constants */ };
export function getRpdLimit(modelId: string): number {
  return RPD_LIMITS[modelId] ?? 1500;
}
```

`gemini-embedding-002` returned 404 and is not listed by the API. `lib/gemini-keys.ts` defaults most Flash and Gemma RPM to 15 and stores scheduler state in process memory.

Verified direct probes on 2026-08-02:

- 2.5 Flash and Flash-Lite: all four projects responded in about 0.8 to 1.1 seconds.
- 3.1 Flash-Lite: all four responded in about 0.57 to 0.73 seconds.
- 3 Flash Preview: all four responded, but about 3.9 to 12.8 seconds.
- 3.5 Flash-Lite: all four exceeded the 15-second deadline. `thinkingBudget: 0` was rejected.
- 3.5 Flash: all four responded near 1.1 seconds, but a 128-token output cap could be consumed before complete text.
- 3.6 Flash: three projects responded; one timed out. Successful latency ranged from about 1.4 to 12.7 seconds.
- Gemma 4 26B produced complete text in only two of four short-form project probes.
- Gemma 4 31B completed all four around 3.0 to 3.7 seconds.
- Embedding 001 and Embedding 2 returned 768 dimensions on all four projects.
- The current runtime explicitly requests 1024 dimensions and can fall back across different embedding models. That path remains a temporary rollback concern only. The approved target follows Gemini Embedding 2 at 768 dimensions instead of forcing the new model to preserve the legacy width.

## Target registry

Create `lib/ai/provider/model-registry.ts` with typed entries containing canonical short ID, family, stability, operations, per-project RPM, TPM and RPD, deadline, thinking configuration, output floor, route classes, input capabilities, health gate, and embedding profile.

Initial policy:

- Default: `gemini-3.1-flash-lite`.
- Premium pedagogy: `gemini-3.5-flash`.
- Premium visual and multimodal: `gemini-3.6-flash`.
- Stable fallbacks: `gemini-2.5-flash`, then `gemini-2.5-flash-lite`.
- Emergency text fallback: `gemma-4-31b-it`, only after contract evaluation.
- Quarantined: `gemini-3.5-flash-lite`, `gemini-3-flash-preview`, and `gemma-4-26b-a4b-it`.
- New canonical profile: `canonical-content-v2`, `gemini-embedding-2`, 768 dimensions, cosine, owned jointly with Overhaul Plan 012.
- New semantic-cache profile: `zyra-semantic-cache-v1`, `gemini-embedding-2`, 768 dimensions, cosine, with a separate task instruction and index.
- Legacy rollback profile: 1024 dimensions, isolated from new writes and removed from active runtime by Overhaul Plan 016.
- Embedding 001: legacy provenance only. It is never a runtime fallback for either new profile.

## Commands you will need

| Purpose | Command | Expected result |
|---|---|---|
| Lint | `bun run lint` | exit 0, no new warning |
| Tests | `bun test tests/contracts/model-registry.test.ts tests/contracts/provider-adapters.test.ts tests/contracts/embedding-profile.test.ts` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Mock probe | `bun --env-file=.env.staging scripts/staging/probe-gemini-models.ts --mock` | zero network calls |
| Real probe | `bun --env-file=.env.staging scripts/staging/probe-gemini-models.ts --real --max-requests 40 --run-id <runId>` | bounded masked evidence |

## Suggested executor toolkit

- Read current official Gemini model, migration, embedding, and rate-limit documentation.
- Inspect the installed `@google/genai` types. Do not rely on training-memory API signatures.

## Scope

**In scope**:

- New `lib/ai/provider/model-registry.ts`, `provider-adapter.ts`, `gemini-generate-adapter.ts`, `gemini-interactions-adapter.ts`, `embedding-adapter.ts`, and `errors.ts`.
- Capability metadata for text, image input, accepted MIME types, maximum inline request bytes, and structured visual output.
- Refactor `lib/ai-router.ts`, `lib/gemini.ts`, and `lib/gemini-keys.ts` to consume the registry without changing live route policy yet.
- `lib/env.ts` for model-policy flags and four project aliases.
- New deterministic adapter tests and a bounded staging probe.
- Required docs and `AGENTS.md` state updates.

**Out of scope**:

- Distributed quota state, user allowances, caching, prompt redesign, UI, and production deployment.
- Creating and re-embedding `zyx-vectors-staging-v2`, owned by Idea-centered Overhaul Plan 012. This plan supplies the fixed 768 adapter contract it consumes.
- SDK upgrades unless separately approved.

## Git workflow

- Branch: `codex/zyra-ai-002-model-registry`.
- Commit example: `refactor(ai): add versioned Gemini model registry`.
- Do not push without instruction.

## Steps

### Step 1: Verify the installed SDK surface

Inspect `node_modules/@google/genai` types for `models.generateContent`, `models.embedContent`, `interactions.create`, `thinkingLevel`, HTTP timeout, and abort signal support. Record only type names and package version.

**Verify**: add a compile-only adapter test proving the selected APIs typecheck. If `interactions.create` is absent, STOP; do not upgrade ad hoc.

### Step 2: Add the registry and invariants

Implement one immutable registry. Reject unknown IDs instead of using a permissive quota default. Assert that every routed text model supports generation, every multimodal route supports image input, every embedding model declares dimensions, every project quota is positive, and quarantined models cannot be selected by ordinary routing.

Normalize `models/<id>` to the canonical short ID at the boundary. Internally store only short IDs.

**Verify**: registry tests cover all entries, prefix normalization, unknown IDs, quarantine, and exact approved limits.

### Step 3: Split request adapters by model family

Use a legacy generate-content adapter for 2.5, 3.1, and Gemma. Use the current recommended interaction surface for 3.5 and 3.6 if supported. Never send deprecated sampling parameters to 3.5 or newer. Use `thinkingLevel`, not `thinkingBudget`, where supported. Apply a per-request deadline and typed timeout result. The request contract must support an ordered mixture of text and sanitized inline image parts while rejecting image input on a model without the declared capability.

Set output floors high enough that thinking tokens cannot silently consume the visible response. The adapter returns finish reason, latency, provider request metadata, token counts, and a typed retry classification.

**Verify**: fake-provider tests assert the exact configuration shape for each family and fail when deprecated fields appear.

### Step 4: Correct embedding behavior

Remove `gemini-embedding-002`. Define two new immutable profiles, both using only `gemini-embedding-2` with `outputDimensionality: 768`:

1. `canonical-content-v2` for Overhaul Plan 012 and `zyx-vectors-staging-v2`;
2. `zyra-semantic-cache-v1` for Plan 006 and `zyx-zyra-cache-staging`.

Each profile contains purpose, model, dimensions, metric, normalization, task instruction version, content serialization version, and index alias. They deliberately have different profile IDs and instructions even though the model and dimension match. Never compare, copy, or query vectors across profiles.

Embedding failure may retry another one of the four project keys with the same model. It may not fall back to Embedding 001 or any other embedding model. Assert exactly 768 values before returning, upserting, or querying. Keep legacy 1024 behavior only through an explicitly named rollback adapter until Overhaul Plan 016; no new V2 caller may use it.

**Verify**: tests reject mixed profiles, wrong index alias, cross-model fallback, and any non-768 vector on either new path. A four-key same-model retry succeeds without changing profile identity.

### Step 5: Add a bounded staging probe

Create `scripts/staging/probe-gemini-models.ts`. It loads `.env.staging`, masks key aliases, performs at most one request per project and model, uses strict deadlines, and writes JSON evidence. It must not print API keys or full authenticated URLs.

The release gate for 3.5 Flash-Lite is at least 95 percent success and p95 below 4 seconds over a rolling 24-hour staging sample. A single manual success cannot remove quarantine.

**Verify**: mock mode runs with zero network calls; real mode refuses without an explicit `--real --max-requests` pair.

### Step 6: Preserve old callers through compatibility exports

Keep existing function signatures temporarily, but require each caller to select an explicit embedding purpose. Preserve the legacy 1024 path only for pre-cutover rollback and do not silently make it the default. Mark direct model string arrays and dimension literals outside the registry as forbidden in new code. Overhaul Plan 012 switches canonical traffic; Plan 006 switches semantic-cache traffic; Overhaul Plan 016 removes active legacy 1024 generation.

**Verify**: `rg -n "gemini-embedding-002|RPD_LIMITS" lib tests` returns no runtime matches except an explicit regression fixture. A separate inventory lists every temporary 1024 reference, its rollback-only owner, and its Plan 016 removal condition.

## Test plan

- Registry completeness, prefix normalization, unknown model rejection, and quarantine.
- Exact per-project limits and usable ceilings.
- Family-specific request configuration, multimodal part ordering, capability rejection, and timeouts.
- Output truncation, finish reason, malformed response, 429, 5xx, and timeout classification.
- Embedding dimensions, profile compatibility, task instructions, and normalization.
- Canonical-versus-cache isolation, exact 768 assertions, same-model key retry, and cross-model fallback rejection.
- Probe request cap and secret redaction.

## Done criteria

- [ ] One registry owns model IDs, limits, deadlines, capabilities, and health policy.
- [ ] Invalid `gemini-embedding-002` is removed from runtime.
- [ ] New canonical and semantic-cache embeddings are exactly 768 dimensions with separate explicit profiles.
- [ ] Neither new profile can fall back to another embedding model or access the other's index.
- [ ] Every remaining 1024 reference is explicitly rollback-only and assigned to Overhaul Plan 016 removal.
- [ ] Deprecated configuration is absent from 3.5 and 3.6 requests.
- [ ] Existing callers compile through compatibility exports.
- [ ] Targeted tests, lint, typecheck, and diff check pass.
- [ ] Plan 002 evidence records masked per-project results.

## STOP conditions

- Installed SDK lacks a required stable API and solving it requires a dependency upgrade.
- A model's live API behavior contradicts the registry contract.
- Four project aliases are not distinct.
- An existing caller depends on comparing Embedding 001 and Embedding 2 vectors.
- A new caller requires 1024 dimensions or cross-model fallback.
- Overhaul Plan 012 cannot consume `canonical-content-v2` without changing its approved index contract.
- Overhaul Plan 013 is concurrently editing the same runtime files.
- Real probe budget would exceed the requested cap.

## Rollback and maintenance

The compatibility exports allow traffic to stay on the old route policy. Roll back by disabling the new provider feature flag, not by restoring invalid model IDs. Update quota data through a versioned registry change plus contract tests; never silently edit a constant in a caller.
