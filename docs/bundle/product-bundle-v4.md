# Product Bundle V4

Status: `ACTIVE`, source contract. Updated: 2026-10-22.

New Article/Diktat authoring uses `product-bundle.v4`, `article.v4` and `diktat.v4` by default. Existing V3 bundles keep their version during legacy revisions unless a reviewed V4 conversion is requested. V2/V3 retain their readers and strict contracts. There is no additional feature flag or database migration. This document describes the local implementation, not deployment, installation on every host, or permission to publish a particular bundle.

## Machine-readable schema delivery

Function plots support optional `yBounds: { min, max }` for the initial and reset vertical display range in the reader and static export. Bounds must be finite, increasing and numerically representable. Mathematical domains and exclusions remain unchanged. Equal-axis scaling may expand the view to preserve physical scale. Omission preserves automatic fitting.

`workflow.get_contract` exposes primary `productBundle.schemaDocuments` and retains `productBundle.pilot.schemaDocuments` as a compatibility alias, with exact same-origin GET paths, SHA-256 checksums and byte lengths. `/api/authoring/contracts/product-v4` lists those documents. Each `?schema=<name>` returns the full JSON Schema generated from the running Zod validator, including Product envelopes, dependencies, ordered parts, Diktat units, visual controls and bindings, review context and PDF evidence. The public endpoint contains type definitions only; it does not return any run or course data and requires no credential.

Use the checksum-pinned path returned by MCP and verify the response bytes. A stale pin returns HTTP 409; refresh the playbook and contract before continuing. `product` is the shared structural schema, so apply the explicit V4 `semanticRules` as well. JSON Schema cannot encode every cross-reference, lineage, security, model or readiness refinement. Complete validation still uses `authoring.validate_product_bundle`; validation success alone does not establish visual quality or publication readiness.

## Article representation

The Product envelope, sections, Idea links, source references and locked dependencies remain authoritative. A V4 Article has nonempty `sections`, empty top-level `blocks`, and 1 to 100 ordered `parts` per block. Stable IDs identify learning elements. IDs for parts, worked steps and relations must be unique across the Article.

| Kind | Required representation |
| --- | --- |
| `markdown` | `id`, `kind`, `markdown` |
| `math_unit` | `id`, `kind`, `meaningMarkdown`, exactly one of `latex` or nonempty `relations` |
| `visual_ref` | `id`, `kind`, `visualId`; optional `focusRefs` to Article elements |
| `worked_example` | `id`, `kind`, `title`, `problemMarkdown`, nonempty `steps`, `verificationMarkdown` |

A math unit may declare `conditionsMarkdown`, local `symbolDefinitions`, local `symbolRefs`, and layout `statement`, `derivation`, `cases` or `comparison`. Each relation has `id`, `latex`, `meaningMarkdown` and optional conditions. Cases require `conditionLatex` per relation. Symbols have `id`, `latex`, `meaningMarkdown` and optional conditions. Symbol references resolve within that math unit, not a global symbol registry.

Each worked step requires `id`, `operationMarkdown`, `reasonMarkdown`, `sourceElementRefs` and ordered leaf parts, plus optional conditions. Step references must resolve to previously available elements. Forward or missing references fail validation. Visual references resolve to the Article registry; their focus references must resolve to Article elements.

`parts` determines reading order. `materializeArticleParts` derives the compatibility Markdown, placing meanings, conditions and symbol definitions next to their formulas, and leaving visual markers in their authored positions. The validator derives referenced visual IDs before generation hashing. An omitted projection is filled; a differing supplied projection is rejected. Compiler, persisted metadata, reader and search carry the same element identities. Invalid V4 metadata fails closed instead of falling back to a legacy layout.

## Mathematical and scientific rendering

KaTeX with mhchem typesets marked mathematical prose, chemistry and units. Generated values use coefficient-times-power notation where appropriate. Axis scale exponents are displayed separately from quantity labels; physical units are upright and separated from symbols. Literal code and escaped currency remain literal. Arbitrary unmarked prose is not automatically rewritten as mathematics.

Application code owns visual execution. Agents submit validated data, never executable JavaScript, author SVG, arbitrary HTML or persistent image URLs. Supported visual families are the existing bounded Learning Canvas kinds, analytic epsilon-delta graphs, `geometry_2d`, and `source_figure`. The V4 epsilon-delta board uses pinned JSXGraph; analytic delta derivation and numerical resolution checks remain independent of that library. Geometry uses validated references and equal physical axis scale. Unsupported or unrepresentable states fail or expose the accessible fallback.

Source figures refer to a stored asset ID, material ID and source checksum. Extraction binds the original PDF, page, normalized crop, SourcePack document and source visual. Preview and print variants carry checksums and transformation metadata. The stored manifest becomes usable only after both variants are written and checked. Learner delivery resolves through course access checks and a same-origin image route. Unknown rights prevent publication use. Delivery URLs are temporary and excluded from durable fingerprints.

## Authored Diktat and static export

V4 requires its source Article in the same bundle, matching `sourceArticleId`, `sourceArticleVersion` and `sourceArticleHash`, plus its locked dependency. Publication requires the authored Diktat for that Article. The review path supports one Article and at most one Diktat per V4 bundle; a publication-ready bundle contains both.

A Diktat has 1 to 100 units. Each unit requires `id`, nonempty `sourceElementRefs`, nonempty `ideaIds`, and ordered `parts`. IDs include nested worked steps and relations. References resolve to source Article elements; aggregate Idea coverage matches the Article. Essential formulas and their conditions must survive compression. Worked steps cannot refer to unknown elements. These structural checks support, but do not prove, semantic equivalence.

Diktat parts reuse Article Markdown, math units and worked examples. A top-level `visual_ref` adds `staticMarkdown` as an accessible caption, not as a replacement for the graphic. The server derives a `staticSnapshot` containing renderer version, visual hash and default-state hash when absent from a draft; a supplied stale pin is rejected. Static export renders actual validated plots, analytic epsilon/delta bands, diagrams, vectors, tables, chemistry and geometry. Source figures require trusted checksum-verified PNG or JPEG bytes supplied by the server. Missing assets, invalid math or unsupported export states fail closed.

`contentMarkdown` remains the derived textual projection. PDF compilation resolves graphical exports separately and validates lineage again. The print profile remains A4, 10.5 pt body text, 1 to 4 pages, without automatic shrinking. V4 units use a 1 mm paragraph gap while retaining the body font size and line height. Browser readiness checks wait for fonts and assets, reject math errors, clipped visual labels, horizontal overflow and units taller than the printable page. Oversized content requires splitting or revising its scope. Every generated PDF page must be inspected and represented in the verification receipt. PDF text extraction, screenshots and fixed typography do not establish tagged-PDF accessibility or educational effectiveness.

## Trusted verification and explicit review

V4 verification and publication reject obvious unmarked mathematical notation in learner prose, including absolute-value expressions, equations, caret exponents, scientific e notation and Unicode mathematical glyphs. Authors must supply explicit math delimiters. Numeric e notation is rejected even inside math delimiters or authored LaTeX; use explicit multiplication by a power of ten. Valid unit macros that normalize scientific input remain supported. Correctly formatted math, code, currency, function-expression models and typed numeric table data are preserved; the guard does not rewrite prose or replace semantic review.

Structural validity allows a draft to be staged. It is not publication readiness. The server derives the complete requirement matrix from the stored bundle and dependency closure, including structure, model, web states at 380 by 844 and 1536 by 864, and printable pages. An agent cannot remove checks by submitting its own matrix or declaring a check not applicable.

The plan binds the configured remote browser provider and exact Chromium version, exact content, import and run scope, live Idea/source/product dependencies, renderer source and package versions, fonts, contract, playbook, assets, print profile and policy. Any applicable change invalidates the old plan. Application-owned execution persists actual artifacts before issuing an HMAC-authenticated receipt. Artifact bytes are read back and checked. Local or agent reports remain reported evidence and cannot satisfy trusted readiness. Missing, failed, untested, stale or contradictory evidence blocks readiness.

V4 approval requires the exact revision, quality-policy fingerprint, current verification plan and receipt signature, a complete criterion rubric, and an explicit current semantic decision for every section. Legacy whole-bundle approval cannot silently approve V4 sections. Publication repeats these checks and claims the unchanged import snapshot inside the transaction; stale content, evidence or concurrent replacement must not receive approval or publication from an earlier snapshot.

## Validation and operational boundaries

The test suite contains contract, model, lineage, HMAC/receipt, artifact-readback, dependency, explicit-review and local SQLite compare-and-swap checks. Primary-agent browser and PDF inspection remains separate evidence. Static-family fixtures generate small compiled documents for numerical plots, derivations, tables, chemistry, diagrams, vectors, geometry and a real PDF-derived source figure. Exact current command outcomes and screenshot/PDF paths belong in the local verification report, not this contract.

Server playbooks and plugin build/host checks have separate provenance. Updating repository guidance does not establish that every installed plugin, active OAuth connection or external executor is current. Fresh live bootstrap and scoped read-only tool calls are required for each host. No deployment or remote mutation is implied by local tests.

Implementation authorities: `lib/materials/article-parts.ts`, `diktat-v4.ts`, `diktat-static-visual.ts`, `diktat-print-readiness.ts`, `lib/bundle/product-validator.ts`, `product-diktat-pdf.ts`, `product-v4-verification.ts`, `product-v4-verification-service.ts`, `product-v4-review.ts`, and the [system design](../../plans/article-diktat-authoring-system-design.md). Operational acceptance and chapter rollout remain tracked separately from this active contract.

## Python Article parts

Article parts also accept `code_example` with Python source and a runnable boolean,
and `coding_exercise` with a canonical problem ID/version locator. They contain
no reference solution or private test payload. Publishing resolves every exercise
against a published coding problem in the same course. Diktat printable parts
retain their existing contract. See [coding contract](../coding-foundation.md).
