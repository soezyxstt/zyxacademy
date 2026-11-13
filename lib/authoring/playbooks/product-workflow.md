# Zyx Product Bundle V4: Workflow and Contract Playbook

## 1. Stage objective and compatibility

Create new Article/Diktat products as `product-bundle.v4`, `article.v4` and `diktat.v4`. V2/V3 remain readable and their existing validators remain available for explicit legacy revisions. Keep an existing bundle's version when revising it unless the operator requests a reviewed V4 conversion. A V3-to-V4 conversion reconstructs ordered parts and Diktat lineage; changing a version marker is insufficient.

For a standalone Pembahasan soal learning product, use `product-bundle.v5` with `productType: "solution_collection"`, product `schemaVersion: "solution_collection.v1"`, and nested collection `schemaVersion: "solution_collection.v1"`. Follow the V5 schema documents and semantic rules returned by `workflow.get_contract`. Do not fabricate an Article or Diktat to accompany it. V2 to V4 retain their profile-specific evidence gates and now use the same exact-revision, explicit review requirements through Admin and MCP. Assessment questions and their protected answers belong to `quiz_bank` or `reference_question_ingest`, never to a new Product Bundle. An authorized admin may publish reviewed learning products explicitly through scoped MCP or the Admin UI.

Each standalone example must be suitable for learner release independently of an assessment. Record separate, precise provenance for the problem and the solution, including source locators and rights or release evidence required by the active schema. Do not copy or infer a protected assessment answer, even when the problem itself is visible. Unknown provenance or release eligibility blocks release. Review every item for correctness, reasoning, both provenance records, and release eligibility against the exact current bundle checksum; changed content needs a new review. Never publish these products into public search, quiz or Zyra indexes.

Organize each example according to its problem type and discipline: preserve relevant givens, choices and answer format where applicable, show justified steps and assumptions, and verify the result with units, conditions or domain-specific checks. Do not force unrelated disciplines into a single numerical derivation. Use the supported Article parts and validated visual capabilities when they help explain the reasoning.

## 2. Bootstrap, scope and upstream gate

1. Call `workflow.get_playbook` for `zyx-product-bundle-mcp`, stage `product`, with actual host capabilities. Independent Critic and Student POV subagents are required.
2. Start or resume `idea_product` with the selected course, chapter, validated Source Pack and bootstrap token. Fetch `workflow.get_contract` before authoring and after contract drift.
3. Use the primary `productBundle.schemaDocuments` descriptors to retrieve complete JSON Schema from the same MCP origin. Check exact response SHA-256 and refresh the contract on HTTP 409. `productBundle.pilot` remains a compatibility alias; it is not a separate schema.
4. Read published Ideas, learning sections and active source excerpts. Inspect existing imports/products to avoid duplicate drafts. Referenced Ideas and learning sections must be published before Product staging.

For V5, fetch `productBundle.solutionCollection.schemaDocuments` and use its dedicated review and release gates. The V4 Article, Diktat, PDF and verifier instructions below apply only to V4, not to standalone collections.

Completion: the run scope, current contract, exact schemas, source anchors and published Idea versions/hashes are known. If a server only advertises a legacy default, report the contract mismatch before creating new V4 content.

## 3. Author and independently review

1. Record representation choices outside the ZIP: objective, relationship to understand, chosen representation, reason, learner action, expected observation, formative check and source anchors.
2. Build one Article with nonempty `sections`, empty top-level `blocks`, and ordered `parts` in every section block. Use `product/editorial` for mathematics, visuals and reasoning. A supplied block `contentMarkdown` must equal the projection of parts; omit it when allowing server derivation.
3. Author Diktat `units` as a selective review sheet, using `sourceElementRefs`, `ideaIds` and printable `parts`. Preserve complete Idea coverage, essential formulas, conditions and method choices. Keep sourceArticleId/version/hash and the locked product dependency current. Each top-level visual_ref requires staticMarkdown; snapshot pins are derived by the server or must match exactly. Diktat contentMarkdown must equal the official units projection.
4. Build optional atomic flashcards using `product/flashcards`. Every flashcard links to exactly one published Idea with weight 1; Article, Diktat and set Idea weights sum to 1.
5. Send the same final artifact and checksum to independent Critic and Student POV subagents. Apply required revisions and obtain their rereads of the exact merged revision before staging. Keep review records outside the ZIP.

Completion: ordered parts, local references, lineage, mathematical meaning/conditions and source coverage are complete, and both reviewers have checked the final revision. Schema success alone does not prove readability or mathematical correctness.

## 4. Package, validate and stage

For an existing V2 learning-only draft, pass `replaceImportId` and its last-read `expectedRevision` to `authoring.validate_product_bundle`, using the same verified run and bootstrap as restaging. This explicitly scoped recovery remains available when the structured-reader flag is active; new V2 submissions remain blocked.

The ZIP contains `manifest.json`, `entities/products.json` and `entities/dependencies.json`. Follow the manifest and entity schemas delivered by the contract, including entity-file and bundle checksums. Use the official projection/checksum helper when available; do not invent a serialization algorithm. Keep tokens, credentials and storage delivery URLs outside the ZIP.

1. Call `authoring.validate_product_bundle` with runToken, bootstrapToken, filename and bundleBase64. Resolve deterministic content errors until valid is true.
2. With staging authorized, submit a new draft or restage the existing import. Staging does not publish learner content.
3. Call `authoring.get_product_review_context` with the run, bootstrap, import and exact checksum for staged content, hashes, rubric and section references. Read `authoring.get_import` for current readiness. Missing verification, review or PDF evidence prevents publication where required.
4. If the unchanged draft was staged through Admin and its `stagingRunId` differs from the current run, an authorized active admin can call `authoring.adopt_product_draft_run` with that observed ID as `expectedStagingRunId` and the exact checksum. Fetch context again. Adoption is audited and invalidates prior PDF, verification and bundle review, so repeat them before publication.

## 5. Trusted rendering and exact-revision approval

For later withdrawal, read the published import and use `authoring.withdraw_product_bundle` with its exact `expectedRevision`, the bound `runToken` and fresh `bootstrapToken`. If that run expired, explicitly set `recovery: "exact_import"` and omit `runToken`; the exact import, checksum, validated course, active principal and session-bound bootstrap remain required. This withdrawal-only recovery needs no Source Pack and grants no review or publication capability. The Admin website is optional.

1. Use the trusted local V4 operator verifier for the exact import, staging run and checksum as described in `docs/bundle/product-bundle-v4.md`. Its machine-readable commands, input and result fields are in `productBundle.verification.localOperator`. Discover the current browser and runtime pins with the advertised `--capabilities` command, then provide the JSON input to `node scripts/authoring/run-product-v4-local.mjs --input <absolute-input-json-path>`. The runner enforces its exact production target and clean source revision. It derives the full verification plan and runs the application renderer locally; an author's matrix cannot remove requirements. Read the current plan and receipt through the returned evidence and `authoring.get_verification`.
2. Inspect every required browser state and PDF page from the exact revision. Test the visible parameter panel, interaction activation, keyboard, reset, domain bounds and static alternatives. PDF body remains 10.5 pt with no auto-shrink and must fit 1 to 4 A4 pages. Resolve clipping, unreadable labels, missing assets, failed/stale checks and page-budget conflicts through content or renderer fixes.
3. With review authorized, read fresh `authoring.get_import` context and submit the complete eight-criterion review, exact expectedRevision, policyVersion, contentFingerprint, current verificationPlanHash and verificationReceiptSignature, plus an explicit semanticHash decision for every section.
4. Read currentReadiness again. An admin with `authoring:publish` may explicitly call `authoring.publish_product_bundle` with the same run, bootstrap and checksum. The server repeats the publication gates and rejects stale revisions. Report the import ID, revision and any remaining blockers.

Completion: current trusted verification is ready, independent visual inspection is complete, review and PDF evidence match the same revision, and currentReadiness reports publicationReady. If any boundary fails or is unavailable, report it explicitly and retain the draft; untrusted local screenshots and agent assertions cannot replace the application-issued receipt.

For V2/V3 learning-only revisions, use the same scoped context and exact checksum. Article approval requires the current policy, fingerprint and complete anchored rubric, plus a semantic-hash decision for each existing section. Every Article retains its PDF evidence gate, using a linked Diktat or a direct Article-only export. For bundles without Articles, explicitly approve or reject the whole bundle; no Article or section is fabricated. For a legacy Article without a linked Diktat, render the Article directly without changing product scope. Never create placeholder evidence. For each linked Diktat or unlinked Article, discover `productBundle.legacyLocalOperator` and use `node scripts/authoring/run-product-legacy-local.mjs --capabilities`, then its `--input` command with the deployed SHA from the authorized deployment record, exact import, original staging run, checksum and authorized active admin. Supply the exact `diktatId` or `articleId` when there is more than one export target; omit both only for a single target. The IDs are mutually exclusive. The private operator renders locally, stores and reads back genuine evidence, and exports the PDF and every page for inspection. Inspect all pages before review. It does not issue a V4 trusted receipt or replace review and publication gates. If evidence cannot be produced or inspected, retain the draft and report the limitation. V2 bundles containing assessment products are not eligible.

## 6. V5 standalone collection review

After staging, inspect the learner rendering and every example, including its problem, answer, reasoning, and separate provenance. Call `authoring.get_solution_collection_review_context` with the last-read checksum as `expectedRevision` for the exact revision and item hashes, then `authoring.review_solution_collection` with every item's correctness, reasoning, separate provenance and release decisions. Read `authoring.get_import` for current readiness. With `authoring:publish` and the same admin identity, explicitly call `authoring.publish_solution_collection` with that exact checksum. A retry with the same revision is idempotent; stale revisions fail. Report missing or stale decisions and leave the draft unpublished. V4 section, PDF and verification receipts do not substitute for V5 item review.

For V5, author optional `hintMarkdown` separately from the solution strategy. Keep it short and spoiler-free, without an answer, selected option, complete derivation or solution code. Every item review explicitly decides all five fields: `correctness`, `reasoning`, `problemProvenance`, `solutionProvenance`, and `release`. The reasoning decision checks the hint when present.
