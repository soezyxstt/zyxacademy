# Zyx Authoring Pipeline: End-to-End Orchestration Playbook

## 1. Scope and Purpose

Use this playbook when orchestrating the complete Zyx authoring pipeline from raw course documents to a validated Source Pack, a staged Idea Bundle V3, and a validated or staged Product Bundle V4 or standalone solution collection V5, or when resuming the pipeline from an existing checkpoint.

Do not use this pipeline for standalone Question Bank authoring (`quiz_bank`) or Historical Reference ingestion (`reference_question_ingest`); those workflows have dedicated stage playbooks (`quiz` and `reference`).

For changes to existing Idea V3 or learning Product V3/V4/V5, prefer the flexible revision lifecycle in the Idea and Product stage playbooks. Obtain each relevant stage's fresh bootstrap, read `authoring.get_edit_context`, create a draft, patch stable IDs, plan the exact release, review and explicitly publish. This path uses stored admitted source evidence and does not require a new Source Pack, the original unexpired run or an Admin web visit. Use `authoring.prepare_revision_verification` before trusted V4 verification when the release includes prospective Idea dependencies. The checkpoint sequence below is for initial source-grounded authoring; it must not force a complete rebuild merely to update existing content.

## 2. Mandatory Checkpoint Sequence

Execute the pipeline in strict checkpoint order. Never skip a gate or start a downstream stage before its upstream dependency satisfies the required state:

1. **Checkpoint 0 (Bootstrap and Scope Discovery)**
   - Call `workflow.get_playbook` with `skill: "zyx-authoring-pipeline"` and `stage: "pipeline"`. For a focused resume, use that stage's matching skill and stage instead; do not combine an Idea/Product skill with the pipeline stage.
   - Call `catalog.list_courses` and `catalog.list_chapters` to lock the target `courseKey` and `chapterKey`.
   - Inspect existing checkpoints before creating duplicate artifacts:
     - Call `source.list_packs` with `courseKey` and `chapterKey` to check whether a validated Source Pack already exists.
     - Call `authoring.list_imports` for `bundleType: "idea"` and `bundleType: "product"` and `analysis.get_coverage` (once a run is started) to inspect published Ideas and existing staged bundles.

2. **Checkpoint 1 (Source Pack Stage: `source`)**
   - Fetch stage modules via `workflow.get_playbook` with `stage: "source"` if not already loaded.
   - If a valid, up-to-date Source Pack already exists in `source.list_packs` for the target chapter and documents, reuse its `packId` / `importId` / `sourcePackToken`.
   - Otherwise, list stored PDFs via `source.list_files`, read all pages via `source.read_file` (poll `source.get_read_job` when pending; request images for visual evidence), reconcile multi-document coverage, build the `zyx-source-pack.v1` archive using the current source contract, and call `source.ingest` with `storedOriginals` (or `originals` for local files) and `bootstrapToken`.
   - Gate: `source.ingest` must return `ok: true` and `persisted.importId`.

3. **Checkpoint 2 (Idea Bundle V3 Stage: `idea`)**
   - Fetch stage modules via `workflow.get_playbook` with `stage: "idea"`.
   - Start or verify an `idea_product` run via `workflow.start` using `courseKey`, `chapterKey`, `sourcePackId` (or `sourcePackToken`), and `bootstrapToken`.
   - Call `workflow.get_contract` to confirm `idea-bundle.v3` requirements.
   - Decompose the Source Pack into pedagogical `learningSections`, atomic `ideas`, complete `provenance`, and justified `relations`. Active prerequisite edges must form an acyclic graph; other relation types follow their own schema and meaning.
   - Prefer advertised `authoring.create_idea_draft` with atomic content, local keys and exact source quotes. Fetch its pinned schema only when needed. The server assembles and validates the package before staging; preserve independent atomicity and source-completeness review. Edit the returned revision with compact targeted tools.
   - For archive input, validate with `authoring.validate_idea_bundle` until `ok: true` and `valid: true`, then stage with `authoring.submit_idea_bundle` (or `authoring.restage_idea_bundle` with the last-read checksum as `expectedRevision` when updating an existing unapproved import).

4. **Checkpoint 3 (Revision-bound Idea Review and Publication)**
   - Product authoring requires referenced Ideas and `learningSections` to be published. After staging, obtain the current checksum from `authoring.get_import`.
   - With the Idea stage `bootstrapToken` and the locked `runToken`, call `authoring.get_idea_review_context` with `importId` and `expectedRevision`. Inspect every Idea, its source evidence, relations and section context. Record a real decision for each returned Idea ID and hash, then call `authoring.review_idea_revision` with those decisions and the same checksum. Approval requires every item approved. Do not invent item approvals.
   - If publication is authorized, the same admin calls `authoring.publish_idea_bundle` with the same run, bootstrap, import and checksum. The server rechecks review evidence and publication gates; an identical retry is idempotent. A stale checksum or changed scope requires fresh context and review. The older `authoring.review_idea_bundle` records only a bundle decision and is not sufficient for this headless publication path.
   - OAuth publication requires explicit `authoring:publish` consent. On `insufficient_scope`, reauthorize with the union of current scopes and `authoring:publish`, approve consent and use the new token. Existing manual connection tokens and authenticated admin sessions have their current full authoring scope; neither bypasses the admin role checks.

5. **Checkpoint 4 (Product Bundle Stage: `product`)**
   - Fetch stage modules via `workflow.get_playbook` with `stage: "product"`.
   - Verify that `compatibility.status` allows `product` authoring (`independentSubagents: true` is required).
   - Start or resume the `idea_product` run and verify published Ideas via `knowledge.search_ideas` / `analysis.get_coverage`.
   - Fetch the primary V4 schemaDocuments. Draft the requested learning products using the V4 contract, with exact Article lineage only for explicitly derived Diktat; keep existing V3 bundles in V3 unless a reviewed conversion was requested. Use the Product playbook for complete representation rules and optional flashcards.
   - For standalone Pembahasan soal, fetch the V5 solutionCollection schemas instead and author only that product. Preserve separate problem and solution provenance and review release eligibility for every example. Never disclose protected assessment answers or index these examples in public search, quiz or Zyra.
   - When a checkout is available, use the advertised `--check` preflight against the same draft JSON without a browser. Rendering, screenshots and watch mode are optional inspection tools, not V4 review or publication gates.
   - Run the independent Critic and Student POV subagent reviews against the draft files and incorporate all required revisions.
   - Prefer `authoring.create_product_draft` for supported new Article/Diktat when advertised by `productBundle.initialDraft`. Send typed content and source/Idea IDs; the server constructs and validates the package before staging. Use compact revision responses and targeted reads during edits, then full context for final review.
   - For archive-only products/assets, validate with `authoring.validate_product_bundle` until `ok: true` and `valid: true`, then stage with `authoring.submit_product_bundle`. Replacement requires `authoring.restage_product_bundle` and the last-read checksum as `expectedRevision`. Neither route establishes publication readiness; trusted verification, pedagogic review and applicable PDF evidence remain required.
   - For V4, request and read verification with `purpose: "logic"`, the default. It checks structure, references, notation and supported models without browser, screenshots or PDF. Independently review sources, calculations and reasoning; then record all eight criteria, exact revision/fingerprint, current logic plan/receipt and explicit semantic decisions for every included Article section. When final Diktat PDFs are needed, request `purpose: "pdf"` and follow `verification.pdf.execution`; unchanged current targets can reuse their authenticated PDF. No screenshot, page capture or visual inspection is required. Use a local PDF operator only when advertised for that exact environment. For V5, use each item's checksum-bound correctness, reasoning, provenance and release decisions.
   - For a V2/V3 learning-only Article and Diktat draft, discover `productBundle.legacyLocalOperator`, verify the deployed source SHA from the authorized deployment record and run its private local command for the exact checksum, original staging run and active admin. Inspect the read-back PDF and each page before the existing exact-revision review and publication gates. Assessment products and V4/V5 are excluded from this operator.

6. **Checkpoint 5 (Post-Stage Readiness and Publication)**
   - Call `authoring.get_import` with `bundleType: "product"` and `importId` to inspect `currentReadiness` (`valid`, `reviewStatus`, `pdfEvidenceStatus`, `publicationReady`).
   - Report the final status, `importId`, checksum, and remaining blockers. V4 requires current logic verification and semantic review, plus canonical current PDF evidence only when Diktat is included. Article-only V4 needs no PDF. V5 requires current review and release decisions for every item. An authorized admin can publish V5 with `authoring.publish_solution_collection` and the exact revision; staging alone is incomplete.
