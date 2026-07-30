# Plan 001: Automated AI Contract Test Foundation

Snapshot: `6098211`

Branch: `codex/001-ai-contract-tests`

Commit: `test(ai): add deterministic contract harness`

Priority: P0

Effort: L

Risk: Low

Confidence: High

## Objective

Create the deterministic test harness required by every later plan. The suite must test contracts and behavioral invariants without network calls, real Gemini quota, Turso, Pinecone, KV, or production data.

## Current state and evidence

- `package.json` has lint and typecheck commands but no standard test command.
- `scripts/acceptance-test.ts` exercises a parallel Zyra context builder, not the live `askTutorRag` cache, citations, assessment safety, repair, or rendering path.
- The repository contains ad hoc `scripts/test-*.ts` files, so later agents have no single regression gate.

## Scope

Create or update:

- `package.json`
- `bunfig.toml` only if Bun test configuration is actually needed
- `tests/helpers/ai-fixtures.ts`
- `tests/helpers/fake-ai.ts`
- `tests/helpers/fake-cache.ts`
- `tests/contracts/prompt-executor.test.ts`
- `tests/contracts/assessment-redaction.test.ts`
- `tests/contracts/tutor-rag.test.ts`
- `tests/contracts/ko-pipeline.test.ts`
- `tests/contracts/question-pipeline.test.ts`
- `tests/contracts/analytics.test.ts`
- `tests/contracts/diktat.test.ts`
- `tests/fixtures/ai/*.json`
- `docs/DEVELOPMENT.md`
- `docs/operations/production-readiness-checklist.md`
- `AGENTS.md` Current State section

Do not alter production behavior in this plan. Do not add Playwright, Jest, or Vitest unless Bun's built-in runner cannot provide module mocking and deterministic fake timers for these modules.

## Implementation steps

1. Read `AGENTS.md`, `db/schema.ts`, `lib/env.ts`, and current scripts that begin with `scripts/test-`.
2. Add `test` and `test:ai-contracts` scripts using `bun test`. Make the focused command target `tests/contracts`.
3. Build a fake AI adapter that accepts a queued sequence of outputs and records system instruction, user content, schema, use case, and attempt count. It must never import a live API key.
4. Build fake cache and repository adapters with explicit namespaces for shared, user, and session data. Add a helper that fails a test if raw student text appears in a shared cache write.
5. Define immutable fixture families for:
   - full, partial, absent, and conflicting source coverage;
   - invalid, unknown, and unsupported citations;
   - prompt injection embedded in source text and chat history;
   - active attempt, completed attempt, and ordinary study context;
   - style-only follow-up, topic change, ambiguous follow-up, and clarification request;
   - KO source spans across multiple chunks and an ambiguous canonical match;
   - single-answer and multiple-answer questions with duplicate options;
   - one-item, two-item, and representative analytics samples;
   - malformed PDF audit output and renderer failure.
6. Write characterization tests around current pure helpers only. Mark future behavior with `test.todo` and a stable requirement ID such as `AI-TUTOR-CIT-001`. Do not write permanently skipped tests.
7. Add a fixture schema version to every JSON fixture. Reject an unknown fixture version so later schema changes are intentional.
8. Add a no-network guard for tests. Any call to Gemini, Turso, Pinecone, KV, Inngest, R2, or Resend must throw with a clear service name.
9. Document how to add a fixture, update an intentional expectation, run one file, and distinguish unit contract tests from model quality evaluations.
10. Add the new commands and validation gate to the production-readiness checklist and record the verified baseline in `AGENTS.md`.

## Test plan

Run in this order:

```powershell
bun run lint
bun run typecheck
bun run test:ai-contracts
```

Also run one contract file directly to prove targeted execution:

```powershell
bun test tests/contracts/prompt-executor.test.ts
```

## Done criteria

- `bun run test:ai-contracts` is deterministic across two consecutive runs.
- The test process makes zero network requests.
- Every fixture has a schema version and requirement ID.
- Future behaviors required by Plans 002 through 014 have named placeholders.
- Lint and typecheck pass with no new warnings or errors.
- Documentation explains the new test boundary.

## STOP conditions

- Stop if Bun's runner cannot mock the needed module boundary. Document the exact limitation before proposing another test dependency.
- Stop if a test requires production credentials or production database contents.
- Stop if the harness requires changing production behavior. Move that change to its owning later plan.
