# Product Bundle MCP reference

## Canonical ZIP

Use exactly:

```text
manifest.json
entities/products.json
entities/dependencies.json
```

All products are drafts. Every product must use published Idea links, active source references, deterministic generation hashes, and exact dependency hashes. Questions are source ITB examples only; they are never Zyx-original questions.

## Quality gates

MCP checks typed products, checksums, source and Idea provenance, chapter scope, published Idea versions and semantic hashes, dependency freshness, holdout markers, Article compiler gates, question and solution links, flashcard atomicity, Diktat lineage, and ITB reference identity. The content gate checks Article depth and per-Idea coverage, examples, analogies, visuals, retrieval prompts, Diktat length, sections, examples, visuals, traps, retrievals, formulas, and Idea coverage.

`publicationBlocked`, stale Idea links, missing chapter, or any blocking quality issue prevents validation and submission. MCP green is necessary but not sufficient: the learner-facing preflight in [editorial-guide.md](editorial-guide.md) must also pass, including zero internal-ID leaks.

## MCP tool sequence

1. Use the same scoped `idea_product` run and fresh published Idea context. If no run exists and the request only names a course and chapter, create the validated Source Pack through `$zyx-source-pack-mcp` from stored PDFs before starting the run.
2. Build Article first, then Diktat, flashcards, ITB examples, solutions, and blueprint.
3. Call `authoring.validate_product_bundle` during each revision loop (`authoring:read`).
4. Call `authoring.submit_product_bundle` only when the report is green (`authoring:stage`).
5. For existing staged or published Product Bundles:
   - Call `authoring.list_imports { bundleType: "product" }` to inspect staged inventory (`authoring:read`).
   - Call `authoring.get_import { bundleType: "product", importId }` to inspect validation reports and review history without exposing storage keys or reviewer IDs (`authoring:read`).
   - Call `authoring.restage_product_bundle` to revalidate and replace an unreviewed or draft import with matching bundle ID and run scope (`authoring:stage`).
   - Call `authoring.discard_product_draft` to permanently remove a draft Product Bundle and staging artifacts (`authoring:withdraw`). Cannot discard published or withdrawn bundles.
   - Call `authoring.review_product_bundle` to record an immutable review decision with notes (`authoring:review`).
   - Call `authoring.withdraw_product_bundle` to execute an audited, idempotent, destructive withdrawal of a published Product Bundle (`authoring:withdraw`).
6. Stop condition: Admin reviews, edits, and publishes the staged draft via Zyx admin UI. MCP does not provide a publication tool (`authoring:publish` is not supported). Destructive lifecycle tools must never be invoked autonomously without explicit instruction.
