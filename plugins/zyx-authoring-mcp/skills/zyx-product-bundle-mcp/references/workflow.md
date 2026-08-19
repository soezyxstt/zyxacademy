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

`publicationBlocked`, stale Idea links, missing chapter, or any blocking quality issue prevents validation and submission.

## MCP sequence

1. Use the same `idea_product` run and fresh published Idea context.
2. Build Article first, then Diktat, flashcards, ITB examples, solutions, and blueprint.
3. Call `authoring.validate_product_bundle` during each revision loop.
4. Call `authoring.submit_product_bundle` only when the report is green.
5. Admin reviews, edits, publishes, or withdraws the staged draft. MCP has no publication tool.
