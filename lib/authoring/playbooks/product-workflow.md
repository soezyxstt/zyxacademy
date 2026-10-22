# Zyx Product Bundle V4: Workflow and Contract Playbook

## 1. Stage objective and compatibility

Create new Article/Diktat products as `product-bundle.v4`, `article.v4` and `diktat.v4`. V2/V3 remain readable and their existing validators remain available for explicit legacy revisions. Keep an existing bundle's version when revising it unless the operator requests a reviewed V4 conversion. A V3-to-V4 conversion reconstructs ordered parts and Diktat lineage; changing a version marker is insufficient.

Product bundles contain only `article`, `diktat`, `flashcard_set` and `flashcard`. Questions and assessments use `quiz_bank` or `reference_question_ingest`. Publication is an admin UI action, never an MCP action.

## 2. Bootstrap, scope and upstream gate

1. Call `workflow.get_playbook` for `zyx-product-bundle-mcp`, stage `product`, with actual host capabilities. Independent Critic and Student POV subagents are required.
2. Start or resume `idea_product` with the selected course, chapter, validated Source Pack and bootstrap token. Fetch `workflow.get_contract` before authoring and after contract drift.
3. Use the primary `productBundle.schemaDocuments` descriptors to retrieve complete JSON Schema from the same MCP origin. Check exact response SHA-256 and refresh the contract on HTTP 409. `productBundle.pilot` remains a compatibility alias; it is not a separate schema.
4. Read published Ideas, learning sections and active source excerpts. Inspect existing imports/products to avoid duplicate drafts. Referenced Ideas and learning sections must be published before Product staging.

Completion: the run scope, current contract, exact schemas, source anchors and published Idea versions/hashes are known. If a server only advertises a legacy default, report the contract mismatch before creating new V4 content.

## 3. Author and independently review

1. Record representation choices outside the ZIP: objective, relationship to understand, chosen representation, reason, learner action, expected observation, formative check and source anchors.
2. Build one Article with nonempty `sections`, empty top-level `blocks`, and ordered `parts` in every section block. Use `product/editorial` for mathematics, visuals and reasoning. A supplied block `contentMarkdown` must equal the projection of parts; omit it when allowing server derivation.
3. Author Diktat `units` as a selective review sheet, using `sourceElementRefs`, `ideaIds` and printable `parts`. Preserve complete Idea coverage, essential formulas, conditions and method choices. Keep sourceArticleId/version/hash and the locked product dependency current. Each top-level visual_ref requires staticMarkdown; snapshot pins are derived by the server or must match exactly. Diktat contentMarkdown must equal the official units projection.
4. Build optional atomic flashcards using `product/flashcards`. Every flashcard links to exactly one published Idea with weight 1; Article, Diktat and set Idea weights sum to 1.
5. Send the same final artifact and checksum to independent Critic and Student POV subagents. Apply required revisions and obtain their rereads of the exact merged revision before staging. Keep review records outside the ZIP.

Completion: ordered parts, local references, lineage, mathematical meaning/conditions and source coverage are complete, and both reviewers have checked the final revision. Schema success alone does not prove readability or mathematical correctness.

## 4. Package, validate and stage

The ZIP contains `manifest.json`, `entities/products.json` and `entities/dependencies.json`. Follow the manifest and entity schemas delivered by the contract, including entity-file and bundle checksums. Use the official projection/checksum helper when available; do not invent a serialization algorithm. Keep tokens, credentials and storage delivery URLs outside the ZIP.

1. Call `authoring.validate_product_bundle` with runToken, bootstrapToken, filename and bundleBase64. Resolve deterministic content errors until valid is true.
2. With staging authorized, submit a new draft or restage the existing import. Staging does not publish learner content.
3. Read `authoring.get_import` for verificationContentHash, current content identity and review context. The verification request returns its derived plan. Missing verification, review or PDF evidence is expected before those stages, but it prevents publicationReady.

## 5. Trusted rendering and exact-revision approval

1. Request `authoring.verify_product_bundle` with the current import, content hash and plan hash required by the tool. Poll `authoring.get_verification` for that exact plan. The server derives structure, model, mobile/desktop interaction and print checks; an author's matrix cannot remove requirements.
2. Inspect every required browser state and PDF page from the exact revision. Test the visible parameter panel, interaction activation, keyboard, reset, domain bounds and static alternatives. PDF body remains 10.5 pt with no auto-shrink and must fit 1 to 4 A4 pages. Resolve clipping, unreadable labels, missing assets, failed/stale checks and page-budget conflicts through content or renderer fixes.
3. With review authorized, read fresh `authoring.get_import` context and submit the complete eight-criterion review, exact expectedRevision, policyVersion, contentFingerprint, current verificationPlanHash and verificationReceiptSignature, plus an explicit semanticHash decision for every section.
4. Read currentReadiness again. Report import ID, exact revision, publicationReady and remaining blockers. Only the admin UI can publish.

Completion: current trusted verification is ready, independent visual inspection is complete, review and PDF evidence match the same revision, and currentReadiness reports publicationReady. If any boundary fails or is unavailable, report it explicitly and retain the draft; local screenshots and agent assertions cannot replace a server receipt.
