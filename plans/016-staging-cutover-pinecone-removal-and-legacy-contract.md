# Plan 016: Staging Cutover, Pinecone Removal, and Legacy Contract

Status: blocked until Plan 015 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- app components db lib scripts workers tests docs package.json bun.lock AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/015-murid-workflow-and-tutorial-pka-parity.md
- **Category**: migration, infrastructure
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Run the complete staging cutover twice, prove rollback, remove Pinecone from the staging application and repository, stop legacy writes, and leave preserved legacy tables available as read-only migration history. This plan does not deploy to production.

## Current state

At the planning snapshot, `lib/vector-store.ts:20-33` imports both Pinecone and Vectorize, `lib/inngest-functions.ts:8-10` imports the Pinecone namespace plus Vectorize mirroring, `lib/gemini.ts` requests 1024-dimension embeddings, and `db/schema.ts:1009` stores `pinecone_vector_id`. Plan 012 must create and reconcile `zyx-vectors-staging-v2` at 768 dimensions using the fixed `canonical-content-v2` Gemini Embedding 2 profile before this plan removes runtime dependencies. The existing data-bearing legacy tables and 1024 Vectorize indexes are preservation inputs and must not be dropped.

## Git workflow

- Create branch `codex/016-staging-cutover` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- all feature-flag wiring introduced by Plans 001 through 015
- remove `lib/pinecone.ts` and Pinecone-only scripts after caller inventory is zero
- `lib/vector-store.ts`, `lib/inngest-functions.ts`, `package.json`, lockfile, env schema, and docs
- remove Pinecone variables from `.env.example` and staging deployment configuration without exposing values
- remove active 1024-dimension embedding generation and old Vectorize bindings after the 768 cutover is proven
- new `scripts/staging/full-rehearsal.ts`
- new `scripts/staging/legacy-caller-inventory.ts`
- new `scripts/staging/decommission-pinecone.ts`
- `package.json`
- compatibility repositories and legacy route adapters
- all architecture, schema, feature, development, deployment, bundle, operations, and `AGENTS.md` current-state documentation
- full test suites and staging services

Out of scope: production deploy, production schema contract, production Pinecone deletion, dropping data-bearing legacy tables.

## Contract policy

1. All active reads and writes use the new Indonesian domain. Legacy tables remain untouched and read-only for reconciliation and historical fallback.
2. Do not drop a data-bearing legacy table in this plan. A later production migration may decide retention after real soak evidence.
3. Compatibility adapters may remain only for old URLs, immutable historical snapshots, or explicit legacy-baseline display. Every remaining adapter must have an owner and removal condition.
4. Repository search must find zero runtime Pinecone imports, clients, namespaces, environment reads, or provider branches.
5. Staging Pinecone decommission is a two-step operation: read-only inventory and fingerprint, then exact confirmed removal of the staging index or namespaces. No wildcard or production credential is allowed.
6. Vector data is rebuildable from Turso. Save final DB and Vectorize manifests before decommission.
7. Run two complete rehearsals with distinct run IDs. Rehearsal A includes feature rollback. Rehearsal B starts from the rolled-back application state and proves repeatability.
8. The only active canonical embedding profile after cutover is `canonical-content-v2`: `gemini-embedding-2`, 768 dimensions, cosine, with versioned normalization and task instruction.
9. `zyx-vectors-staging-v2` is the only canonical Vectorize index bound to the active staging runtime. The 1024 indexes remain unbound and unchanged as rollback evidence; deleting them is out of scope and requires later explicit approval.
10. Semantic cache may use `zyx-zyra-cache-staging`, also at 768 dimensions, but its profile, instructions, vector IDs, metadata, authorization, and lifecycle remain isolated from canonical retrieval.

## Full rehearsal sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest affected test file; both must exit 0. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Do not continue from a failed check. Record commands, exit codes, and manifest hashes in both rehearsal evidence artifacts.

1. Freeze source commit and staging resource fingerprints.
2. Create inventory and recovery export.
3. Verify all migrations and backfills are no-ops on the already migrated staging database.
4. Enable flags in dependency order: peran, Idea architecture, product, assessment, mastery, Vectorize-only, Zyra, admin and tutor workflow, then murid workflow.
5. Drain versioned Inngest work and require zero pending or failed overhaul jobs.
6. Reconcile Turso, the 768 canonical Vectorize index, the separate 768 semantic-cache index, R2 test artifacts, audit events, and Tutorial PKA manifest. Verify both 1024 index fingerprints remain unchanged.
7. Run admin, tutor, murid, active assessment, Zyra, and rollback smoke suites.
8. Turn all new flags off and prove legacy reads still work. Then turn them back on and prove no duplicate data.
9. Repeat the entire sequence with a second run ID.
10. Only after both passes, remove Pinecone code, package, env schema, staging secret references, active 1024 embedding generation, and old Vectorize bindings. Run the Pinecone decommission dry run, verify the exact staging fingerprint, then require operator confirmation for the final external deletion. Do not delete either preserved 1024 Vectorize resource.
11. Disable legacy writes in application repositories. Keep legacy read paths needed for history and route compatibility.
12. Synchronize all documentation and generate the staging go or no-go dossier.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts tests/migration tests/staging
bun run eval:ai
bun run typecheck
bun run build
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:full-rehearsal -- --run-id <runA> --with-rollback
bun --env-file=.env.staging run staging:full-rehearsal -- --run-id <runB> --with-rollback
bun --env-file=.env.staging run staging:legacy-caller-inventory -- --fail-on-write
bun --env-file=.env.staging run vectorize:reconcile -- --run-id <runB> --exact
bun --env-file=.env.staging run staging:decommission-pinecone -- --dry-run
bun --env-file=.env.staging run staging:decommission-pinecone -- --confirm <stagingFingerprint>
git diff --check
```

The final external decommission command requires an explicit operator approval at execution time even though it is planned here.

Pass only when both rehearsals have zero count loss, zero checksum mismatch, zero orphan, zero failed queue job, zero unauthorized access, zero assessment leak, zero holdout leak, exact Tutorial PKA parity, exact 768 Vectorize manifest parity, successful flag rollback, and a no-op second backfill. Every active canonical upsert and query must use `canonical-content-v2` with exactly 768 values. After code removal, repository search and dependency tree must show zero Pinecone runtime dependency, zero active 1024 embedding generation, and zero old-index binding. Legacy write callers must be zero.

## Test plan

- Run all contract, migration, and staging tests plus AI evals, typecheck, and the required breaking-change build.
- Rehearsal fixtures must cover admin, tutor, murid, multi-role, active assessment, Zyra, queue retry, R2 artifact, Vectorize exact reconciliation, flag rollback, and no-op rerun.
- Pinecone decommission tests must prove dry-run output contains one exact staging fingerprint and rejects production, wildcard, missing confirmation, and already-decommissioned states.

## Required search gates

Classify results and require zero runtime matches:

```powershell
rg -n -i "pinecone|PINECONE_|getNs\(|shouldMirrorToVectorize" app components db lib scripts workers package.json bun.lock docs AGENTS.md
rg -n "outputDimensionality\s*:\s*1024|new Array\(1024\)|zyx-vectors-staging[\"'']" app components lib scripts workers package.json docs AGENTS.md
rg -n 'role\s*[!=]==?\s*["''](teacher|student)["'']|["''](teacher|student)["'']\s*as\s*const' app components lib db
rg -n 'from\((knowledgeObjects|websiteMaterials|aiQuestionBank|studentConceptMastery)\)|insert\((knowledgeObjects|websiteMaterials|aiQuestionBank|studentConceptMastery)\)|update\((knowledgeObjects|websiteMaterials|aiQuestionBank|studentConceptMastery)\)' app components lib
```

Documentation history and explicitly named migration fixtures may contain old terms. Every allowed non-runtime match must be listed in a checked-in allowlist with a reason.

## STOP conditions

- Either rehearsal loses one row, key, snapshot, or semantic value.
- Feature rollback fails or re-enable creates duplicates.
- Any runtime caller still needs Pinecone.
- Any active runtime caller generates, upserts, or queries a 1024-dimension vector.
- The active canonical index is not `zyx-vectors-staging-v2` at exactly 768 dimensions.
- Canonical retrieval and semantic cache share a profile ID, vector IDs, or an index binding.
- The decommission fingerprint is ambiguous or not demonstrably staging-only.
- Any legacy write caller remains.
- Any data-bearing legacy table is proposed for deletion.
- Production resources appear in the command plan or evidence.

## Maintenance notes

Legacy data tables and the unbound 1024 Vectorize indexes remain a preservation boundary until a separately approved retention plan exists. After Pinecone removal, all active vector recovery documentation must point to Turso-to-768-Vectorize rebuild and never to a second vector source of truth. A future embedding model or dimension change always creates a new profile and side-by-side index.

## Rollback

Before Pinecone decommission, turn new flags off and deploy the prior staging revision. After Pinecone decommission, rollback must use the preserved Turso-to-Vectorize rebuild path, not Pinecone. Legacy tables remain available for read fallback. If Vectorize is unavailable after final decommission, disable Zyra and vector-dependent features while keeping materials, assessments, attempts, and historical data operational from Turso.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-016-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- The complete overhaul works twice in staging and survives a full flag rollback.
- All active domain names and access roles use tutor and murid conventions.
- All active learning reads and writes use Ideas and the new Indonesian schema.
- The 768-dimension `zyx-vectors-staging-v2` index is the only active canonical vector store in staging; Pinecone and 1024 embedding paths are absent from runtime code and dependencies.
- All prior database data remains preserved and operational through the new model or explicit read-only compatibility path.
- A machine-generated dossier states staging-ready only. It makes no production-readiness claim.
