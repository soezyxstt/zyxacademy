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
- [ ] **Assessment Integrity V2 Gate**: the Plan 010 contract suite passes; exact blueprint counts, quiz and tryout chapter scope, stable option grading, per-Idea evidence, free-response review gating, benchmark thresholds, and holdout leak canaries are all enforced.
- [ ] **Per-Idea Mastery Gate**: Plan 011 engine, idempotency, flashcard compatibility, and migration tests pass; staging shadow writes zero rows; full and incremental replay hashes match; duplicate evidence rows and legacy row mutations are zero; deterministic paths make zero AI calls.
- [ ] **Prompt Contract Boundary**: All prompt stage executions verify policy composition, semantic validators, bounded repair allowlists, and privacy-safe provenance traces in `ai_generation_traces`.
- [ ] **Staging identity gate**: `bun --env-file=.env.staging run staging:preflight` identifies staging, rejects production equality, and emits no secrets.
- [ ] **Staging recovery gate**: The keyed inventory, encrypted export, disposable restore, migration ledger, foreign-key check, and additive reconciliation all pass for the active plan.
- [ ] **Staging evidence gate**: `artifacts/staging-overhaul/<runId>/plan-NNN-result.json` exists before a plan is marked `DONE`.
- [ ] Plan 002 `pengguna`, `peran`, and `pengguna_peran` migration is additive and foreign-key clean.
- [ ] Plan 002 legacy role parity is exact, the idempotent rerun changes zero rows, and all `teacher` and `student` literals are classified.
- [ ] Plan 002 auth smoke has active staging admin, tutor, murid, and multi-role sessions before `FEATURE_PERAN_V2=1` is enabled.
- [ ] If staging lacks a pre-seeded multi-role identity, `staging:seed-peran-smoke` adds only a deterministic tutor membership to an existing active staging admin and records a keyed, non-secret artifact.
- [ ] Plan 003 adds the 11 source and Idea tables only; before and after manifests preserve legacy row and primary-key hashes, foreign-key violations are zero, and `FEATURE_ARSITEKTUR_IDE_V1` remains off.
- [ ] Plan 004 adds the 34 product, assessment, evidence, mastery, bundle, and audit tables only; before and after manifests preserve legacy row and primary-key hashes, foreign-key violations are zero, and `FEATURE_PRODUK_IDE_V1`, `FEATURE_ASESMEN_IDE_V1`, and `FEATURE_PEMAHAMAN_IDE_V1` remain off.
- [x] Plan 005 staging backfill passed with 568 deterministic mappings, 3,175 zero-loss exception rows, zero blocking exceptions, zero foreign-key violations, zero uncovered rows, zero snapshot mismatches, and zero Tutorial PKA mismatches. Evidence: `artifacts/staging-overhaul/20260803-plan005-legacy-backfill/plan-005-result.json`.
- [x] Plan 005 idempotency rerun passed with `changedRows: 0`; immutable attempt snapshots and legacy PKA grades remained unchanged.
- [x] Plan 006 local contract gates passed: strict ZIP security and Idea Bundle validation tests, lint, typecheck, and diff check.
- [x] Plan 006 staging workflow passed for valid upload, identical retry, conflicting retry, invalid archive and bundle fixtures, forced partial publication rollback, atomic publish, and independent reconcile. Evidence: `artifacts/staging-overhaul/20260803-plan006-bundle-v5/plan-006-result.json` and `plan-006-reconcile.json`.
- [x] Plan 007 local authoring context contracts passed with deterministic projection, nested redaction canaries, holdout exclusion, and zero scan findings.
- [x] Plan 007 staging export passed with identical pack and ZIP checksums, private run-scoped R2 round trip, complete export audit metadata, exact test-object deletion, and independent content scan. Evidence: `artifacts/staging-overhaul/20260803-plan007-authoring-v1/plan-007-result.json` and `plan-007-scan.json`.
- [x] Plan 008 Product Bundle V2 staging passed all typed product fixtures, identical retry, conflict rejection, seven-stage rollback rehearsal, dependency blocking, holdout rejection, versioned re-import, atomic publication, and independent reconcile. Evidence: `artifacts/staging-overhaul/20260803-plan008-product-v3/plan-008-result.json` and `plan-008-reconcile.json`. The flag remains disabled outside staging.
- [ ] Plan 017 audit rework local gate passes with required ITB-curated questions, HOT multi-Idea questions, one-Idea flashcards, mastery-based flashcard suppression, normalized multi-Idea relations, Article to Diktat lineage checks, canonical Vectorize namespace routing, holdout exclusion, and flag-gated live per-Idea evidence. No schema migration, remote write, Vectorize backfill, R2 cleanup, or deployment is allowed in this phase.
- [ ] Before enabling Plan 005 dual-write, verify `FEATURE_ARSITEKTUR_IDE_V1=1` and `FEATURE_DUAL_WRITE_IDE=1` only in a controlled canary. Keep both flags at `0` for rollback and keep legacy reads authoritative.
- [x] Plan 012 canonical index uses `canonical-content-v2`, Gemini Embedding 2, 768 dimensions, cosine metric, eight allowlisted metadata indexes, and exact Turso to Vectorize manifest reconciliation.
- [x] Plan 012 backfill and golden retrieval ran only after explicit operator authorization to transfer canonical staging content to Gemini and Vectorize.
- [x] Plan 013 proves current-version hydration, course and enrollment scope, active-attempt answer safety, restricted-solution capability, and student-free shared cache payloads.
- [x] Plan 014 proves the complete admin and tutor workflow, six transition audit envelopes, course scope, and zero legacy writes.
- [x] Plan 015 proves Tutorial PKA manifest parity, dedicated murid read-model access, no answer fields, immutable historical snapshots, and zero historical mutations.
- [x] Plan 016 requires two distinct staging rehearsals, full rollback and re-enable, zero active legacy write callers, and either an exact staging-only legacy fingerprint or a deterministic not-provisioned fingerprint. Operator confirmation is required only when a staging Pinecone target exists.
- [x] Plan 016 final dossier is staging-only and passes `staging:finalize-cutover` only when Plan 012 through Plan 015 result artifacts, both rehearsal artifacts, the zero-caller inventory, and the confirmed decommission state all pass.

## Architectural Guidelines & Boundaries

- All AI contract tests must execute under zero-network conditions using `fakeAi` and `fakeCache`.
- No raw student data or user identifiers permitted in shared cache entries (`shared:` or `tutor:` keys) or generation traces (`ai_generation_traces` stores hashes only).
- Every AI test fixture must maintain schema version `1.0` and reference a valid `requirementId`.
- No pill-shaped UI elements (`rounded-full` prohibited except on 1:1 circular elements).
- No em dashes or en dashes in any codebase file.

