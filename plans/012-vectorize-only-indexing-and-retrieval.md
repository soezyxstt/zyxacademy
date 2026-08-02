# Plan 012: Vectorize-Only Indexing and Retrieval

Status: blocked until Plan 011 passes.

> **Executor instructions**: Read this entire plan before editing. Execute each numbered step in order. Run the stated verification before continuing. If a STOP condition occurs, stop and report it; do not improvise. Update this plan's row in plans/README.md only after every done criterion passes.
>
> **Drift check, run first**: `git diff --stat 03b68ba0e66ee90f41fe92886b15f81a7a36ec3c..HEAD -- lib workers scripts tests docs package.json bun.lock AGENTS.md`. If an in-scope file changed, compare the Current state section to live code. Any semantic mismatch is a STOP condition until the plan is revised.

## Status metadata

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/011-per-idea-mastery-and-learning-loop.md
- **Category**: migration, infrastructure
- **Planned at**: commit `03b68ba0e66ee90f41fe92886b15f81a7a36ec3c`, 2026-08-02

## Objective

Build a complete Vectorize index from the canonical database and switch staging retrieval to Vectorize-only behind a flag. Pinecone code and packages remain dormant until Plan 016 proves the cutover.

## Current state to reverify

- `lib/vector-store.ts` imports both Pinecone and Vectorize.
- `lib/inngest-functions.ts` currently embeds outbox rows, writes Pinecone, and conditionally mirrors to Vectorize.
- `scripts/vectorize-backfill.ts` is oriented around copying or comparing Pinecone rather than rebuilding from Turso.
- `lib/namespaces.ts` currently exposes `learning`, `practice`, and `past_exams`.
- The Vectorize Worker accepts upsert, query, and delete requests through a shared-secret proxy.

Anchor excerpts:

```ts
// lib/vector-store.ts:20-33
import { getNs, upsertChunkVector, deleteSectionVectors } from '@/lib/pinecone';
import { vectorizeUpsert, vectorizeQuery, vectorizeDelete } from '@/lib/vectorize-client';

// lib/namespaces.ts:1-4
export const VECTOR_NAMESPACES = { learning: "learning", practice: "practice", past_exams: "past_exams" };
```

Use current Cloudflare documentation during implementation:

- `https://developers.cloudflare.com/vectorize/reference/client-api/`
- `https://developers.cloudflare.com/vectorize/reference/metadata-filtering/`
- `https://developers.cloudflare.com/vectorize/best-practices/list-vectors/`

## Git workflow

- Create branch `codex/012-vectorize-only` from the integrated predecessor commit. For Plan 001, branch from the planning snapshot after preserving the user's intentional old-plan deletions.
- Use conventional commits matching repository history, for example `feat(scope): concise outcome` or `fix(scope): concise outcome`.
- Commit per verified logical unit. Do not push or open a PR unless the operator explicitly requests it.
- Do not restore deleted former plans. Apart from updating this plan's status row, do not edit another plan file.

## Scope

- `lib/vector-store.ts`
- `lib/vectorize-client.ts`
- `lib/namespaces.ts`
- `lib/inngest-functions.ts`
- `workers/vector-api/index.ts`
- `workers/vector-api/wrangler.toml`
- replace `scripts/vectorize-backfill.ts` with DB-to-Vectorize rebuild behavior
- new `scripts/vectorize-reconcile.ts`
- new `scripts/vectorize-prepare-index.ts`
- new `scripts/vectorize-golden.ts`
- new `scripts/staging/rehearse-flag.ts`
- new `lib/vectorize/contracts.ts`
- retrieval tests and staging golden queries
- `lib/env.ts`, `package.json`
- `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/DEVELOPMENT.md`, `docs/operations/production-readiness-checklist.md`, `AGENTS.md`

Out of scope: deleting Pinecone code or secrets, production index changes, Zyra prompt changes.

## Index contract

1. Turso is the source of truth. Backfill selects approved canonical rows from Turso, embeds text, and upserts Vectorize. It never reads Pinecone.
2. Logical namespaces are metadata values: `canonical_ideas`, `published_articles`, `source_materials`, `itb_question_references`, `published_questions`, and `published_solutions`.
3. Use one versioned vector ID format such as `v1:<entityType>:<entityId>:<version>`. Store entity ID and version, not full canonical content, as retrieval authority.
4. Hydrate every match from Turso and reject missing, unpublished, superseded, stale, or version-mismatched rows.
5. Create metadata indexes before initial upsert. Limit indexed properties to at most 10. Required allowlist: namespace, course ID, chapter ID, entity type, status, version, access class, and language.
6. `published_solutions` uses `access_class=restricted_solution` and requires an explicit server-side capability. The Worker must not accept an arbitrary client namespace as authorization.
7. Outbox payloads are versioned and provider-neutral. Completion records Vectorize vector ID and indexed content hash, not a Pinecone-specific column.
8. Add `FEATURE_VECTORIZE_ONLY_V1`. Off keeps the current path. On writes and queries Vectorize only.
9. Reconciliation uses Vectorize list operations to compare the exact vector ID set and metadata checksums with the DB manifest. Account for API pagination.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Create metadata indexes in the staging Vectorize index before any rebuild. If vectors predate the indexes, schedule complete re-upsert.
2. Add strict Worker request contracts, capability checks, bounded `topK`, metadata allowlists, structured errors, and authenticated list support for reconciliation.
3. Replace Pinecone-oriented backfill with resumable DB-to-Vectorize batches and a manifest checkpoint.
4. Change the outbox worker to direct Vectorize writes when the flag is on. Preserve retry and idempotency behavior.
5. Rebuild all logical namespaces from staging DB. Use no delete-all operation. Delete stale IDs only after list-based diff has been saved and exact target IDs are validated.
6. Reconcile DB and Vectorize ID sets, versions, namespaces, and content hashes.
7. Run golden retrieval queries and restricted-solution authorization tests.
8. Enable `FEATURE_VECTORIZE_ONLY_V1=1` in staging and prove rollback to off.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/vectorize-contract.test.ts tests/contracts/vector-outbox.test.ts tests/contracts/tutor-rag.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run vectorize:prepare-index -- --env staging --run-id <runId>
bun --env-file=.env.staging run vectorize:backfill -- --run-id <runId> --source db --resume
bun --env-file=.env.staging run vectorize:reconcile -- --run-id <runId> --exact
bun --env-file=.env.staging run vectorize:golden -- --run-id <runId> --course tutorial-pka
bun --env-file=.env.staging run staging:rehearse-flag -- --flag FEATURE_VECTORIZE_ONLY_V1
git diff --check
```

Pass only when DB and Vectorize expected ID sets are exactly equal, missing and extra vectors equal zero after controlled cleanup, every metadata checksum matches, failed outbox rows equal zero, golden expected-ID recall at top 5 is 100 percent for the committed fixture set, restricted solution access is denied without capability in 100 percent of tests, and flag rollback restores the old path without data writes.

## Test plan

- Cover provider-neutral outbox payloads, versioned vector IDs, DB hydration, stale and missing IDs, pagination, metadata allowlist, topK bounds, restricted solution capability, retry idempotency, list-based exact reconciliation, and flag rollback.
- Keep unit tests on fake Vectorize adapters. Only staging commands call the real Worker and index.

## STOP conditions

- The backfill reads Pinecone or treats vectors as canonical content.
- Metadata indexes are created after data without a complete re-upsert.
- More than 10 metadata fields are configured for filtering.
- Reconciliation proposes deletion without an exact saved ID list and staging identity proof.
- A client can query `published_solutions` by choosing a namespace string.
- The exact manifest differs by one vector or version.

## Maintenance notes

Create metadata indexes before adding vectors for any future filter. Vectorize limits indexed metadata properties, so review the allowlist and re-upsert requirement before extending it.

## Rollback

Set `FEATURE_VECTORIZE_ONLY_V1=0`. Keep the rebuilt Vectorize index and evidence. Do not delete Pinecone or its code. Retry any failed outbox entries only after restoring their provider mode explicitly.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-012-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- Staging can index and retrieve entirely through Vectorize from canonical DB data.
- Exact DB-to-index reconciliation is automated and repeatable.
- Restricted solution content has a server-side capability boundary.
- Pinecone is no longer required for staging runtime, but remains available for rollback until Plan 016.
