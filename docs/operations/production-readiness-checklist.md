# Production Readiness Checklist

This document tracks system validation gates and pre-deployment readiness checks for the Zyx platform.

## Pre-Deployment Validation Gates

- [ ] **Linting**: `bun run lint` passes with 0 errors and 0 new warnings.
- [ ] **Type Checking**: `bun run typecheck` (`tsc --noEmit`) passes with 0 errors.
- [ ] **AI Contract Suite**: `bun run test:ai-contracts` passes deterministically with 0 network calls.
- [ ] **Assessment Integrity Gate**: `bun test tests/contracts/assessment-redaction.test.ts tests/contracts/tutor-rag.test.ts` passes; GET `/api/quiz/attempts` and `/api/quiz/attempts/[id]` redact `correct_indices` and stored explanations for active attempts.
- [ ] **Targeted Contract Check**: `bun test tests/contracts/prompt-executor.test.ts` executes and passes.
- [ ] **Tutor Cache Isolation & Query Action Router Gate**: `bun test tests/contracts/tutor-rag.test.ts` passes; Tier 1 shared KV cache is strictly student-free and follow-up queries are classified into `retrieve`, `reuse_previous_evidence`, `answer_from_conversation`, or `clarify`.
- [ ] **Knowledge Object Staged Extraction & Provenance Gate**: `bun test tests/contracts/ko-pipeline.test.ts` passes; sources > 30k chars are chunked without truncation, math/tables are preserved, cross-chunk spans are retained, embedding similarity without exact match flags `ambiguous`, and invalid extractions leave previous KO state untouched.
- [ ] **Question Blueprint & Distractor Provenance Gate**: `bun test tests/contracts/question-pipeline.test.ts` passes; blueprint slots require sourced KO IDs, options are shuffled deterministically in application code with stable IDs, distractor provenances persist method, score, and uncertainty (`ambiguous` persisted as unknown), and new questions remain unverified (`qualityScore: null`).
- [ ] **Prompt Contract Boundary**: All prompt stage executions verify policy composition, semantic validators, bounded repair allowlists, and privacy-safe provenance traces in `ai_generation_traces`.

## Architectural Guidelines & Boundaries

- All AI contract tests must execute under zero-network conditions using `fakeAi` and `fakeCache`.
- No raw student data or user identifiers permitted in shared cache entries (`shared:` or `tutor:` keys) or generation traces (`ai_generation_traces` stores hashes only).
- Every AI test fixture must maintain schema version `1.0` and reference a valid `requirementId`.
- No pill-shaped UI elements (`rounded-full` prohibited except on 1:1 circular elements).
- No em dashes or en dashes in any codebase file.

