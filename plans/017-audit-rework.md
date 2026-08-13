# Plan 017: Audit Rework

Status: IN PROGRESS

Base: `staging` at `86b93b826ce8d348438dd96f12a8b08bd5754870`

Branch: `codex/rework-audit`

## Objective

Close the smallest set of gaps required to make the Idea-centered hybrid authoring workflow coherent:

```text
Idea -> Product -> Assessment -> Evidence per Idea -> Mastery -> Flashcard and Zyra context
```

The legacy paths remain available as compatibility paths. This plan does not rewrite the old system, deploy, or modify a remote database.

## Safety boundaries

- Do not touch the three pre-existing working-tree changes carried from `staging`:
  - `scripts/staging/test-idea-bundle.ts`
  - `tests/fixtures/bundles/idea-v2/entities/source-materials.json`
  - `tests/fixtures/bundles/idea-v2/manifest.json`
- Do not edit `db/schema.ts`, generated `drizzle/`, or run `db:generate`, `db:migrate`, or `db:push:prod` in this phase.
- Prefer existing tables, dependency rows, hashes, and feature flags. A required schema migration is a STOP condition and must be planned separately.
- Do not run staging or production writes, Vectorize backfills, R2 cleanup, or deployment commands.
- New runtime behavior must remain disabled when its existing `FEATURE_*` flag is absent or `0`.
- Use deterministic fixtures and contract tests before any environment-backed rehearsal.
- Every worker must use a disjoint write set and commit only its own changes. The parent branch integrates after reviewing the diff.

## Parallel workstreams

### A. Product contract and content lineage

Owner write set:

- `lib/bundle/product-validator.ts`
- `lib/materials/`
- `tests/contracts/product-bundle-v2.test.ts`
- `tests/contracts/material-pipeline.test.ts`
- `tests/contracts/flashcard-generator.test.ts`

Scope:

- Enforce one Idea per atomic flashcard.
- Require per-Idea relation data for multi-Idea questions without attaching every relation to the first Idea.
- Enforce Idea-link weight invariants.
- Make the smallest Product Bundle contract change needed to represent Article to Diktat lineage and ITB curation metadata.
- Reuse the existing compiler and dependency hashes. Do not introduce a new product type for an optional discussion booklet in this plan.

Exit tests:

```text
bun test tests/contracts/product-bundle-v2.test.ts tests/contracts/material-pipeline.test.ts tests/contracts/flashcard-generator.test.ts
```

### B. Canonical publication and Vectorize safety

Owner write set:

- `lib/bundle/publication.ts`
- `lib/bundle/product-publication.ts`
- `lib/vectorize/outbox.ts`
- `scripts/vectorize-manifest.ts`
- `tests/contracts/vector-outbox.test.ts`
- `tests/contracts/vectorize-contract.test.ts`

Scope:

- Map Idea, source chunk, article, question, and solution jobs to canonical Vectorize namespaces.
- Remove generic `idea` and `product` namespace failures from canonical outbox processing.
- Exclude holdout references from runtime indexing while preserving allowed-reference retrieval behavior.
- Keep publication transactionality, idempotency, and existing audit behavior unchanged.
- Enforce approved Article and dependency checks at the smallest safe publication boundary.

Exit tests:

```text
bun test tests/contracts/vector-outbox.test.ts tests/contracts/vectorize-contract.test.ts tests/contracts/idea-bundle-v2.test.ts tests/contracts/product-bundle-v2.test.ts
```

### C. Live assessment to per-Idea evidence

Owner write set:

- `lib/asesmen/`
- `lib/pemahaman/`
- `app/api/quiz/attempts/route.ts`
- `app/api/quiz/attempts/[id]/route.ts`
- New focused tests under `tests/contracts/`

Scope:

- Add a narrow compatibility adapter from the current quiz snapshot to canonical Idea links.
- When the existing assessment and mastery flags are enabled, write answer evidence per linked Idea and trigger the canonical Idea mastery recompute path.
- Preserve the existing legacy learning-event path when the canonical flags are off.
- Reject ambiguous or unreviewed evidence from affecting mastery.
- Do not alter immutable attempt snapshots or historical rows.

Exit tests:

```text
bun test tests/contracts/assessment-domain.test.ts tests/contracts/idea-evidence.test.ts tests/contracts/idea-mastery-domain.test.ts tests/contracts/mastery-idempotency.test.ts
```

The new adapter contract is included in the parent gate as `tests/contracts/live-idea-evidence.test.ts`.

## Parent integration gates

After all workstreams return:

1. Review each worker diff for write-set violations and accidental database changes.
2. Integrate only the smallest compatible changes.
3. Run focused tests for all three workstreams.
4. Run `bun run lint`.
5. Run `bun run typecheck`.
6. Run `git diff --check`.
7. Run `bun run test:ai-contracts` if the shared contract surface changed.
8. Run local-only staging fixture checks that do not write to remote resources:
   - with local `dev.db` and `ZYX_ENVIRONMENT=staging`, run `bun --env-file=.env.local run staging:compile-product-preview -- --run-id plan017-local --course mat-i --dry-run`
   - then run `bun --env-file=.env.local run staging:verify-material-quality -- --run-id plan017-local`
9. Do not run remote staging rehearsal until the parent branch passes every local gate and receives explicit approval for that environment.

Inherited checks currently observed:

- The full `bun run test:ai-contracts` suite reaches 207 passing tests but has one pre-existing failure in `idea-bundle-v2.test.ts` because the three carried staging fixture files are already dirty on the base checkout. Those files are outside this plan's write set and remain untouched.
- The local compiler preview and verifier run safely against `dev.db`, but are blocked with `CANONICAL_FIXTURE_NOT_FOUND` because the local database has no published canonical Idea fixture. The remote staging read-only check remains intentionally deferred.

## Completion checklist

- [x] Branch is isolated from `staging`.
- [x] Pre-existing user changes remain unchanged.
- [x] No database schema or migration files changed.
- [x] No production or staging database was mutated.
- [x] Article to Diktat lineage is validated.
- [x] Multi-Idea question relations are preserved correctly.
- [x] Product Bundle questions require ITB curation.
- [x] Multi-Idea Product Bundle questions require a HOT cognitive level.
- [x] Flashcards are atomic at one Idea.
- [x] High-mastery flashcard recommendations are suppressed at score 80 or higher.
- [x] Canonical Vectorize jobs use known namespaces.
- [x] Holdout content is not indexed for runtime retrieval.
- [x] Live canonical assessment evidence is flag-gated and idempotent.
- [x] Focused tests, lint, typecheck, and diff check pass.
- [x] Existing legacy paths remain available when flags are off.
- [x] Any required schema migration is documented as a separate follow-up, not silently added.
- [ ] Local material compiler rehearsal has a canonical fixture available.
- [x] External authoring handoff includes private context-pack download and machine-readable Idea and Product schemas.
- [x] Bundle review surfaces expose complete Idea evidence and Product content before approval controls.
- [x] Product validation requires compiler-quality Articles, deterministic grading options, one solution per question, and mandatory Diktat lineage.
- [x] Correct-answer markers are removed from canonical runtime and vector content.

## Rollback

Rollback is branch-only: switch back to `staging` and delete `codex/rework-audit` only after confirming its commits are not needed. No data rollback is required because this plan forbids remote database and production writes.
