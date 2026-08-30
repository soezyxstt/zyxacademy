# Product Bundle V2

Product Bundle V2 is the strict ZIP workflow for externally authored articles, diktat material, ITB example questions, solutions, flashcards, and assessment blueprints. Every question entering through this workflow is an ITB example. Zyx original questions are created through the normal bank question workflows and never through Product Bundle.

## Contract

Each bundle contains `manifest.json`, `entities/products.json`, and `entities/dependencies.json`. The manifest declares `product-bundle.v2`, course identity, creator and curator, stable entity IDs, file checksums, bundle checksum, and unresolved conflicts.

Each product declares:

- stable ID, product type, version, `draft` status, and schema version;
- published Idea IDs, versions, semantic hashes, roles, and weights;
- active source material IDs, versions, checksums, and source excerpt IDs;
- creator, optional curator, source hash, generation hash, and optional AI metadata;
- product-specific renderable content.

Validation is pure and fail-closed. It rejects unsafe ZIP entries, unknown fields, checksum drift, duplicate IDs, missing solution questions, non-atomic flashcards, invalid assessment scope, holdout markers, and unresolved manifest conflicts. Dependencies with `NEEDS_REVIEW` or `STALE` make publication ineligible.

Every staged product must be complete enough to publish after admin inspection while remaining `draft`. External agents can use `$UPLOADER` and `$APPROVING_REVIEWER`; publication resolves those sentinels without exporting private user identity IDs. Legacy bundles containing `published` entities remain readable for compatibility, but new authoring must emit `draft`. A `withdrawn` entity cannot re-enter a draft bundle.

Additional product invariants are explicit in the bundle contract:

- every product Idea-link weight is finite, positive, and the product total is one;
- a flashcard references exactly one Idea;
- every question product declares one required `itbSource` with `referenceId` and a human-readable `eventName`, such as `UTS Matematika I ITB 2024`;
- the source reference is included in `itbCuration`, and publication accepts only `allowed` references whose stored `sourceLabel` exactly matches `itbSource.eventName`;
- a multi-Idea question declares a relation for every linked Idea, with an optional rationale, and uses the `analyze`, `evaluate`, or `create` cognitive level;
- every Diktat declares its source Article ID, version, and generation hash, and a matching product dependency exists.
- an Article passes the strict semantic compiler and required block coverage gate during upload;
- multiple-choice options use `{ id, text, isCorrect }`, carry stable unique IDs, and have a valid deterministic key;
- every question in the bundle has exactly one solution;
- correct-answer markers are excluded from Vectorize payloads and Zyra runtime hydration.

## Lifecycle

1. An admin uploads a ZIP at `/admin/materials/review?section=product` (the legacy `/admin/bundles/product` route redirects there). The first request validates and returns a complete editable projection without writing R2 or Turso.
2. The workspace maps product counts, dependencies, Idea and source traceability, options, reasoning, relations, curation, and every content block. Admins edit the renderable content and allowed relationship metadata in place while identity, source, version, and attribution fields remain locked.
3. Explicit save resubmits the original ZIP and browser draft. The server allowlist-merges edits, recomputes generation hashes and checksums, refreshes Article to Diktat lineage and product dependency hashes, repeats strict validation, then stores a draft ZIP and inventory.
4. A draft may be replaced with the same bundle ID and a new checksum, deleted, or published directly by an admin. Internal review evidence is created at publication and is not a separate public state.
5. Publication verifies current Ideas, source materials, excerpts, identities, and dependencies, then writes every product, link, dependency, canonical vector outbox entry, publication record, item status, and audit event in one transaction. Article, question, and solution content is routed to `published_articles`, `published_questions`, and `published_solutions`; Diktat, flashcard, and blueprint products do not use a generic `product` namespace.
6. A published bundle cannot be replaced or deleted. Withdrawal keeps history, marks canonical products inactive or retired according to the target table contract, marks the bundle and items withdrawn, and queues vector deletion for article, question, and solution content.
7. Identical retries are no-ops. A changed product version gets a physical versioned target ID such as `product-id:v2`; prior rows remain queryable.

Question publication writes the canonical `soal` row and an `ai_question_bank` compatibility projection with `origin: itb_example`, the event name, and the source reference. This makes the question available to existing quiz, tryout, PKA, and live-quiz paths without losing attribution. Withdrawal retires both projections. Attempt and submission snapshots retain the provenance so historical review keeps the original citation.

The only public lifecycle is:

```text
draft -> published -> withdrawn
```

The workflow is always-on. Learner and bank provenance labels render whenever provenance metadata exists. Legacy importers remain available as rollback paths.

## ITB question source contract

Each question uses this dedicated source block in addition to curation dimensions:

```json
{
  "productType": "question",
  "itbSource": {
    "referenceId": "itb-reference-id",
    "eventName": "UTS Matematika I ITB 2024"
  },
  "itbCuration": [
    {
      "referenceId": "itb-reference-id",
      "dimensions": {
        "difficulty": "similar",
        "format": "similar",
        "terminology": "similar",
        "reasoningPattern": "similar"
      },
      "curatorNote": "Reference verified against the source event."
    }
  ]
}
```

`itbSource` identifies the paper that must be cited. `itbCuration` records quality comparison and may contain additional allowed references, but those additional references are not treated as the question source. Missing source data, a holdout reference, a source not included in curation, or an event-name mismatch blocks publication.

The Authoring Context Pack exposes the required source metadata as `referenceId` and `sourceLabel` on each allowed benchmark summary. Its `id` remains the benchmark ID and is not valid as `itbSource.referenceId`. External authoring must match the exact event label against the source document, copy `referenceId` into `itbSource.referenceId`, and copy `sourceLabel` into `itbSource.eventName`.

## Article and diktat quality boundary

Article products are compiled through `lib/materials/compiler.ts` after Product Bundle validation. The compiler orders prerequisite Ideas, normalizes each staged block into the typed article contract, and produces deterministic AST and Markdown output. Publication requires 100 percent required block coverage, source and Idea traceability for factual content, valid math delimiters, and current dependencies. Per-reviewer block status and notes are advisory admin metadata stored in `review_item_bundle`. Pending or `changes_requested` blocks trigger a warning but do not block approval or publication.

Block review metadata is never serialized into `manifest.json` or an entity file. It therefore does not affect product generation hashes, file checksums, or `manifest.bundleChecksum`. Restaging or discarding a draft clears its block review rows so decisions cannot attach to a replacement artifact.

Diktat products are derived from the approved article representation through `compileDiktatFromApprovedArticle`. The compiler never reads raw source independently for diktat content. Its report records the source article version and hash, removed block IDs, preserved core statements, formulas, Idea IDs, and source references. Any mismatch returns a stable reason code and blocks publication.

Every external Diktat product carries the Article lineage fields. Product Bundle validation and publication require the corresponding Article dependency. The existing `diktat_materi` and `artikel` tables remain unchanged; lineage is represented in the bundle and audit boundary without a schema migration.

The admin pre-staging workspace previews every supported product type, including each Article block and full Diktat content. The local preview scripts require `--dry-run` or an explicit read-only input and do not mutate staging resources.

## Staging verification

```bash
bun --env-file=.env.staging run staging:preflight
bun --env-file=.env.staging run staging:test-product-bundle -- --run-id <runId> --fixture all
bun --env-file=.env.staging run staging:reconcile-bundle -- --run-id <runId> --type product
```

The staging fixture exercises all seven product types, identical retry, draft replacement, forced transaction failure, stale dependency blocking, holdout rejection, atomic publication, and versioned re-import. A new lifecycle run must also exercise draft deletion and withdrawal. Evidence is written to `artifacts/staging-overhaul/<runId>/plan-008-result.json` and `plan-008-reconcile.json`.

## Rollback

Use the legacy importers as the rollback path. Do not delete imported versions or audit records. If a published test bundle must be withdrawn, use the normal audited lifecycle operation.
