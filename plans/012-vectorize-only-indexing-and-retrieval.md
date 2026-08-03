# Plan 012: 768-Dimension Vectorize-Only Indexing and Retrieval

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

Create a new 768-dimension canonical Vectorize index directly from the canonical database, re-embed every record with one fixed Gemini Embedding 2 profile, and switch staging retrieval to that index behind a flag. Preserve the existing 1024-dimension index and Pinecone path as rollback inputs until Plan 016 proves the cutover.

## Current state to reverify

- `lib/vector-store.ts` imports both Pinecone and Vectorize.
- `lib/inngest-functions.ts` currently embeds outbox rows, writes Pinecone, and conditionally mirrors to Vectorize.
- `scripts/vectorize-backfill.ts` is oriented around copying or comparing Pinecone rather than rebuilding from Turso.
- `lib/namespaces.ts` currently exposes `learning`, `practice`, and `past_exams`.
- The Vectorize Worker accepts upsert, query, and delete requests through a shared-secret proxy.
- Live inventory on 2026-08-02 shows `zyx-vectors-staging` at 1024 dimensions with cosine distance.
- `lib/gemini.ts` currently requests `outputDimensionality: 1024` and tries Embedding 2, the invalid `gemini-embedding-002`, then Embedding 001. Equal vector length does not make different embedding models compatible.
- Cloudflare Vectorize dimensions cannot be changed after index creation. Do not repurpose, truncate, pad, or overwrite `zyx-vectors-staging`.

Target canonical profile and resource:

- profile ID: `canonical-content-v2`;
- model: `gemini-embedding-2` only;
- output dimensions: exactly 768;
- metric: cosine;
- staging index: `zyx-vectors-staging-v2`;
- source: canonical Turso rows only;
- model fallback: forbidden. Retry another project key with the same model or fail the outbox item;
- normalization and task instruction: versioned fields in the profile and manifest.

The Zyra semantic cache uses its own `zyx-zyra-cache-staging` index. It is also 768 dimensions but has a separate profile ID, instruction version, vector IDs, metadata, and lifecycle. Never query or upsert one index with the other profile.

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
- `https://developers.cloudflare.com/vectorize/best-practices/create-indexes/`
- `https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2`

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
- fixed embedding profile contracts and adapters required to generate `canonical-content-v2`
- retrieval tests and staging golden queries
- `lib/env.ts`, `package.json`
- `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/DEVELOPMENT.md`, `docs/operations/production-readiness-checklist.md`, `AGENTS.md`

Out of scope: deleting Pinecone code or secrets, deleting either existing 1024 index, production index changes, semantic-cache storage, Zyra prompt changes.

## Index contract

1. Turso is the source of truth. Backfill selects approved canonical rows from Turso, embeds text with `canonical-content-v2`, and upserts `zyx-vectors-staging-v2`. It never reads Pinecone or the 1024 index.
2. Every new canonical vector is generated by `gemini-embedding-2` with `outputDimensionality: 768`. A failed request retries another project key with the same model. It never falls back to Embedding 001 or another model.
3. The embedding profile includes model, dimensions, metric, normalization, task instruction version, content serialization version, and purpose. Any profile mismatch is a hard failure before upsert or query.
4. Logical namespaces are metadata values: `canonical_ideas`, `published_articles`, `source_materials`, `itb_question_references`, `published_questions`, and `published_solutions`.
5. Use one versioned vector ID format such as `v2:<entityType>:<entityId>:<version>`. Store entity ID and version, not full canonical content, as retrieval authority.
6. Hydrate every match from Turso and reject missing, unpublished, superseded, stale, or version-mismatched rows.
7. Create `zyx-vectors-staging-v2` and all metadata indexes before its first vector upsert. Limit indexed properties to at most 10. Required allowlist: namespace, course ID, chapter ID, entity type, status, version, access class, and language.
8. `published_solutions` uses `access_class=restricted_solution` and requires an explicit server-side capability. The Worker must not accept an arbitrary client namespace as authorization.
9. Outbox payloads are versioned and provider-neutral. Completion records Vectorize vector ID, embedding profile ID, dimensions, and indexed content hash, not a Pinecone-specific column.
10. Add `FEATURE_VECTORIZE_ONLY_V1`. Off keeps the current 1024 or Pinecone rollback path. On writes and queries only `zyx-vectors-staging-v2` through `canonical-content-v2`.
11. Reconciliation uses Vectorize list operations to compare the exact vector ID set and metadata checksums with the DB manifest. Account for API pagination.
12. No new write may reach `zyx-vectors-staging` after the 768 cutover. Keep that resource unchanged and unbound from the new path until Plan 016 decides its later retirement.

## Implementation sequence

Step verification rule: after every numbered local-code step, run `bun run lint` plus the narrowest new or existing test file named by that step; both must exit 0 before continuing. After any schema step, also run `bun run db:generate` and confirm the generated migration has only the intended DDL. Before and after every remote step, run `bun --env-file=.env.staging run staging:preflight`; it must identify staging and exit 0. Record every result in the plan evidence artifact.

1. Run the staging guard and live inventory. Record the fingerprints and vector counts of `zyx-vectors-staging` and `zyx-edu` without modifying them.
2. Create `zyx-vectors-staging-v2` with exactly 768 dimensions and cosine metric if absent. If the name already exists, require exact compatibility and an approved empty or resumable manifest. Never delete or recreate an incompatible index automatically.
3. Create all metadata indexes on the new empty index before its first upsert. Existing 1024 vectors are not copied or transformed.
4. Add the explicit `canonical-content-v2` profile and remove automatic cross-model fallback from the new path. Assert exactly 768 values before every upsert and query. Preserve the old 1024 path only behind the off-state rollback adapter.
5. Add strict Worker request contracts, capability checks, bounded `topK`, metadata allowlists, structured errors, authenticated list support, and explicit selection of the v2 binding. The client cannot choose an arbitrary index or profile.
6. Replace Pinecone-oriented backfill with resumable Turso-to-`zyx-vectors-staging-v2` batches and a manifest checkpoint containing the profile ID.
7. Change the outbox worker to write only the new 768 index when the flag is on. Preserve retry and idempotency behavior. A failure of Embedding 2 records a retryable or terminal outbox state instead of changing models.
8. Rebuild all logical namespaces from the staging DB. Use no delete-all operation. Delete stale IDs only from the new index after a list-based diff has been saved and exact target IDs are validated.
9. Reconcile DB and new Vectorize ID sets, profiles, dimensions, versions, namespaces, and content hashes. Confirm the old 1024 index count and fingerprint did not change.
10. Run golden retrieval queries and restricted-solution authorization tests against the new index.
11. Enable `FEATURE_VECTORIZE_ONLY_V1=1` in staging, prove all new reads and writes use the 768 profile, then prove rollback to off without writing new 1024 vectors.

## Commands and pass criteria

```powershell
bun run lint
bun test tests/contracts/vectorize-contract.test.ts tests/contracts/vector-outbox.test.ts tests/contracts/tutor-rag.test.ts
bun run typecheck
bun --env-file=.env.staging run staging:preflight
bunx wrangler vectorize get zyx-vectors-staging
bunx wrangler vectorize create zyx-vectors-staging-v2 --dimensions=768 --metric=cosine
bunx wrangler vectorize get zyx-vectors-staging-v2
bun --env-file=.env.staging run vectorize:prepare-index -- --env staging --run-id <runId>
bun --env-file=.env.staging run vectorize:backfill -- --run-id <runId> --source db --resume
bun --env-file=.env.staging run vectorize:reconcile -- --run-id <runId> --exact
bun --env-file=.env.staging run vectorize:golden -- --run-id <runId> --course tutorial-pka
bun --env-file=.env.staging run staging:rehearse-flag -- --flag FEATURE_VECTORIZE_ONLY_V1
git diff --check
```

The create command is conditional: run it only when preflight proves the exact target is absent. Pass only when the target reports 768 dimensions and cosine, every generated and queried vector has length 768, the profile is always `canonical-content-v2`, DB and new Vectorize expected ID sets are exactly equal, missing and extra vectors equal zero after controlled cleanup, every metadata checksum matches, failed outbox rows equal zero, golden expected-ID recall at top 5 is 100 percent for the committed fixture set, restricted solution access is denied without capability in 100 percent of tests, the old 1024 index fingerprint and count are unchanged, and flag rollback restores the old read path without producing new 1024 writes.

## Test plan

- Cover exact 768 length, fixed-model retry across project keys, cross-model fallback rejection, profile mismatch, canonical-versus-cache profile isolation, provider-neutral outbox payloads, versioned vector IDs, DB hydration, stale and missing IDs, pagination, metadata allowlist, topK bounds, restricted solution capability, retry idempotency, list-based exact reconciliation, and flag rollback.
- Keep unit tests on fake Vectorize adapters. Only staging commands call the real Worker and index.

## STOP conditions

- The backfill reads Pinecone or treats vectors as canonical content.
- `zyx-vectors-staging-v2` exists with dimensions other than 768 or a metric other than cosine.
- Any new embedding is not generated by `gemini-embedding-2` under `canonical-content-v2`.
- One upsert or query vector has a length other than 768.
- The new path falls back to Embedding 001 or mixes embedding profiles.
- Metadata indexes would be created after data already exists in the new index.
- More than 10 metadata fields are configured for filtering.
- Reconciliation proposes deletion without an exact saved ID list and staging identity proof.
- A client can query `published_solutions` by choosing a namespace string.
- The exact manifest differs by one vector or version.
- A step writes to, truncates, pads, deletes, or mutates the existing 1024 index.

## Maintenance notes

Create metadata indexes before adding vectors for any future filter. Vectorize limits indexed metadata properties, so review the allowlist and full re-embedding requirement before extending it. A model, dimension, normalization, instruction, or serialization change creates a new embedding profile and requires a fresh side-by-side index; never mutate the meaning of an existing profile ID.

## Rollback

Set `FEATURE_VECTORIZE_ONLY_V1=0`. Keep both the new 768 index and the preserved 1024 index plus evidence. Do not delete either Vectorize index, Pinecone, or its code. Rollback reads may use the old path, but freeze new embedding writes until the provider mode is explicitly restored and proven not to mix profiles.

## Done criteria

- [ ] All commands in Commands and pass criteria exit 0 with the stated result.
- [ ] `artifacts/staging-overhaul/<runId>/plan-012-result.json` exists, validates, and records `status=passed` without secrets.
- [ ] `git status --short` shows no modifications outside this plan's in-scope paths, generated migration when applicable, and the `plans/README.md` status row.
- [ ] This plan's row in `plans/README.md` is changed to `DONE` only after the prior checks pass.

- `zyx-vectors-staging-v2` exists at exactly 768 dimensions with cosine distance.
- Every new canonical vector uses `gemini-embedding-2` and `canonical-content-v2`; cross-model fallback is absent.
- Staging can index and retrieve entirely through the new 768 Vectorize index from canonical DB data.
- Exact DB-to-index reconciliation is automated and repeatable.
- Restricted solution content has a server-side capability boundary.
- Existing 1024 indexes remain unchanged and available only for rollback.
- Pinecone is no longer required for staging runtime, but remains available for rollback until Plan 016.
