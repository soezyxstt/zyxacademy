# Product Bundle V2

Product Bundle V2 is the strict ZIP workflow for externally authored articles, diktat material, questions, solutions, flashcards, and assessment blueprints.

## Contract

Each bundle contains `manifest.json`, `entities/products.json`, and `entities/dependencies.json`. The manifest declares `product-bundle.v2`, course identity, creator and curator, stable entity IDs, file checksums, bundle checksum, and unresolved conflicts.

Each product declares:

- stable ID, product type, version, lifecycle status, and schema version;
- published Idea IDs, versions, semantic hashes, roles, and weights;
- active source material IDs, versions, checksums, and source excerpt IDs;
- creator, optional curator, source hash, generation hash, and optional AI metadata;
- product-specific renderable content.

Validation is pure and fail-closed. It rejects unsafe ZIP entries, unknown fields, checksum drift, duplicate IDs, missing solution questions, non-atomic flashcards, invalid assessment scope, holdout markers, and unresolved manifest conflicts. Dependencies with `NEEDS_REVIEW` or `STALE` make publication ineligible.

## Lifecycle

1. An admin uploads a ZIP at `/admin/bundles/product`.
2. The server validates the archive and writes an immutable `impor_bundle` inventory and audit event.
3. Reviewers can inspect typed previews with Idea and source traceability. Admin approval is required before publication.
4. Publication verifies current Ideas, source materials, excerpts, identities, and dependencies, then writes every product, link, dependency, vector outbox entry, publication record, item status, and audit event in one transaction.
5. Identical retries are no-ops. A changed version gets a physical versioned target ID such as `product-id:v2`; prior rows remain queryable.

The public API is feature gated by `FEATURE_PRODUCT_BUNDLE_V2`. Setting the flag to `0` hides the page and disables the routes. Legacy importers remain available as rollback paths.

## Article and diktat quality boundary

Article products are compiled through `lib/materials/compiler.ts` after Product Bundle validation. The compiler orders prerequisite Ideas, normalizes each staged block into the typed article contract, and produces deterministic AST and Markdown output. Publication requires 100 percent required block coverage, source and Idea traceability for factual content, valid math delimiters, current dependencies, and an approved reviewer state.

Diktat products are derived from the approved article representation through `compileDiktatFromApprovedArticle`. The compiler never reads raw source independently for diktat content. Its report records the source article version and hash, removed block IDs, preserved core statements, formulas, Idea IDs, and source references. Any mismatch returns a stable reason code and blocks publication.

Admin previews are available as `ArticlePreview` and `DiktatPreview` components. The local preview scripts require `--dry-run` or an explicit read-only input and do not mutate staging resources.

## Staging verification

```bash
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:test-product-bundle -- --run-id <runId> --fixture all
bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type product
```

The staging fixture exercises all seven product types, identical retry, conflicting checksum, forced transaction failure, stale dependency blocking, holdout rejection, atomic publication, and versioned re-import. Evidence is written to `artifacts/staging-overhaul/<runId>/plan-008-result.json` and `plan-008-reconcile.json`.

## Rollback

Set `FEATURE_PRODUCT_BUNDLE_V2=0` to hide the workflow. Do not delete imported versions or audit records. If a published test bundle must be withdrawn, use the normal audited lifecycle operation.
