# Plan 004: Tutor Cache Isolation and Query Action Routing

Snapshot: `6098211`

Branch: `codex/004-tutor-cache-routing`

Commit: `fix(tutor): isolate cache and classify follow-up actions`

Priority: P0

Depends on: Plans 002 and 003

Effort: M

Risk: Medium

Confidence: High

## Objective

Make the shared tutor cache strictly student-free and replace unconditional history-based query rewriting with a typed action router that separates retrieval intent from response style.

## Current state and evidence

- `lib/tutor-rag.ts:128-130` keys shared answers by course, chapter, and normalized query only.
- `lib/tutor-rag.ts:499-510` loads user and Zyra history.
- `lib/tutor-rag.ts:512-523` asks a model to rewrite every follow-up into one query string.
- `lib/tutor-rag.ts:530-595` uses that rewritten text for shared cache lookup, retrieval, and generation while passing raw history to the answer prompt.
- `lib/tutor-rag.ts:626-627` can cache that history-influenced answer for seven days.
- The file header claims the cached prompt contains zero student data, but the live call path contradicts that claim.

## Scope

Create or update:

- `lib/tutor/query-action.ts`
- `lib/tutor/cache-contract.ts`
- `lib/tutor-rag.ts`
- `lib/zyra/zyra-context-builder.ts` and `lib/zyra/token-budget.ts` only to remove or route duplicate production logic
- `lib/env.ts` for `FEATURE_TUTOR_PIPELINE_V2`
- `tests/contracts/tutor-rag.test.ts`
- `docs/features.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not redesign citation validation or answer generation in this plan. That belongs to Plan 005.

## Required query action contract

Return one action:

- `retrieve`: new academic content needs evidence search
- `reuse_previous_evidence`: same topic, only presentation or depth changed
- `answer_from_conversation`: conversational clarification needs no source search
- `clarify`: topic cannot be determined safely

Return separate fields:

- `contentFocus`: evidence-search text only
- `responseModifiers`: typed values such as simpler, analogy, more detail, worked example, or language preference
- `topicContinuity`: same, changed, or uncertain
- `reasonCodes`: deterministic or validated codes

Do not mix style phrases into `contentFocus`.

## Implementation steps

1. Write failing tests for two different users with identical queries and different histories. Assert that a shared cache write contains no history, profile, user ID, session ID, or personalized wording.
2. Extract cache-key creation into `cache-contract.ts`. Include course, chapter, normalized academic query, prompt contract version, policy version, output schema version, and evidence-set version. Do not include raw text in the key.
3. Split tutor work into a cache-safe base stage and an optional user-scoped continuity stage. The shared base stage receives only trusted assessment mode, academic query, and evidence.
4. If personalization is needed, apply it after the shared result in an uncached response or a user-and-session-scoped cache with a short documented TTL. Default to no personalized cache.
5. Build the query action router. Prefer deterministic detection for empty, explicit style-only, and clear topic-change cases. Use a small machine-facing contract only for ambiguous cases.
6. For `reuse_previous_evidence`, persist only source IDs and evidence version in user-scoped session state. Rehydrate current source content server-side. Never treat prior AI prose as evidence.
7. For `clarify`, skip retrieval and answer generation. Return one short clarification request with no fabricated topic.
8. Keep response modifiers out of retrieval query and shared key. Apply them only after evidence is chosen.
9. Reconcile `lib/zyra/zyra-context-builder.ts` with the live path. Either route the production tutor through one explicit context-layer API or mark and remove the unused duplicate. Preserve the cache-safe boundary.
10. Add metrics for action, cache tier, and cache rejection reason. Do not log the raw query or history.
11. Update docs to show cache-safe, session-scoped, and untrusted-history boundaries.

## Test plan

```powershell
bun test tests/contracts/tutor-rag.test.ts
bun run lint
bun run typecheck
```

Required cases: cross-user collision, same-user new session, style-only follow-up, ambiguous pronoun, new topic, missing prior evidence, prompt-like history, and flag-off compatibility.

## Done criteria

- Shared generation receives no student history or learner profile.
- Shared cache keys include generation contract and evidence version.
- Style-only follow-ups do not trigger retrieval.
- Prior AI messages are conversation state, never evidence.
- Ambiguous follow-ups clarify instead of guessing.
- Duplicate Zyra context logic has one documented production owner.
- Tests, lint, and typecheck pass.

## STOP conditions

- Stop if a shared answer cannot be produced without student-specific data. Move it to a user-scoped uncached stage.
- Stop if the action router needs raw answer keys to classify a request.
- Stop if consolidation with `lib/zyra/*` weakens the cache boundary.
