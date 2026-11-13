# Zyx Authoring Pipeline: End-to-End Orchestration Playbook

## 1. Scope and Purpose

Use this playbook when orchestrating the complete Zyx authoring pipeline from raw course documents to a validated Source Pack, a staged Idea Bundle V3, and a validated or staged Product Bundle V4 or standalone solution collection V5, or when resuming the pipeline from an existing checkpoint.

Do not use this pipeline for standalone Question Bank authoring (`quiz_bank`) or Historical Reference ingestion (`reference_question_ingest`); those workflows have dedicated stage playbooks (`quiz` and `reference`).

## 2. Mandatory Checkpoint Sequence

Execute the pipeline in strict checkpoint order. Never skip a gate or start a downstream stage before its upstream dependency satisfies the required state:

1. **Checkpoint 0 (Bootstrap and Scope Discovery)**
   - Call `workflow.get_playbook` with `skill: "zyx-authoring-pipeline"` (or the active stage skill) and `stage: "pipeline"`.
   - Call `catalog.list_courses` and `catalog.list_chapters` to lock the target `courseKey` and `chapterKey`.
   - Inspect existing checkpoints before creating duplicate artifacts:
     - Call `source.list_packs` with `courseKey` and `chapterKey` to check whether a validated Source Pack already exists.
     - Call `authoring.list_imports` for `bundleType: "idea"` and `bundleType: "product"` and `analysis.get_coverage` (once a run is started) to inspect published Ideas and existing staged bundles.

2. **Checkpoint 1 (Source Pack Stage: `source`)**
   - Fetch stage modules via `workflow.get_playbook` with `stage: "source"` if not already loaded.
   - If a valid, up-to-date Source Pack already exists in `source.list_packs` for the target chapter and documents, reuse its `packId` / `importId` / `sourcePackToken`.
   - Otherwise, list stored PDFs via `source.list_files`, read all pages via `source.read_file` (poll `source.get_read_job` when pending; request images for visual evidence), reconcile multi-document coverage, build the `source-pack.v1` archive, and call `source.ingest` with `storedOriginals` (or `originals` for local files) and `bootstrapToken`.
   - Gate: `source.ingest` must return `ok: true` and `persisted.importId`.

3. **Checkpoint 2 (Idea Bundle V3 Stage: `idea`)**
   - Fetch stage modules via `workflow.get_playbook` with `stage: "idea"`.
   - Start or verify an `idea_product` run via `workflow.start` using `courseKey`, `chapterKey`, `sourcePackId` (or `sourcePackToken`), and `bootstrapToken`.
   - Call `workflow.get_contract` to confirm `idea-bundle.v3` requirements.
   - Decompose the Source Pack into pedagogical `learningSections`, atomic `ideas`, complete `provenance`, and an acyclic `relations` DAG.
   - Validate with `authoring.validate_idea_bundle` until `ok: true` and `valid: true` with zero blocking issues.
   - Stage with `authoring.submit_idea_bundle` (or `authoring.restage_idea_bundle` with the last-read checksum as `expectedRevision` when updating an existing unapproved import).

4. **Checkpoint 3 (Revision-bound Idea Review and Publication)**
   - Product authoring requires referenced Ideas and `learningSections` to be published. After staging, obtain the current checksum from `authoring.get_import`.
   - With the Idea stage `bootstrapToken` and the locked `runToken`, call `authoring.get_idea_review_context` with `importId` and `expectedRevision`. Inspect every Idea, its source evidence, relations and section context. Record a real decision for each returned Idea ID and hash, then call `authoring.review_idea_revision` with those decisions and the same checksum. Approval requires every item approved. Do not invent item approvals.
   - If publication is authorized, the same admin calls `authoring.publish_idea_bundle` with the same run, bootstrap, import and checksum. The server rechecks review evidence and publication gates; an identical retry is idempotent. A stale checksum or changed scope requires fresh context and review. The older `authoring.review_idea_bundle` records only a bundle decision and is not sufficient for this headless publication path.
   - OAuth publication requires explicit `authoring:publish` consent. On `insufficient_scope`, reauthorize with the union of current scopes and `authoring:publish`, approve consent and use the new token. Existing manual connection tokens and authenticated admin sessions have their current full authoring scope; neither bypasses the admin role checks.

5. **Checkpoint 4 (Product Bundle Stage: `product`)**
   - Fetch stage modules via `workflow.get_playbook` with `stage: "product"`.
   - Verify that `compatibility.status` allows `product` authoring (`independentSubagents: true` is required).
   - Start or resume the `idea_product` run and verify published Ideas via `knowledge.search_ideas` / `analysis.get_coverage`.
   - Fetch the primary V4 schemaDocuments. Draft article.v4 with ordered parts, authored diktat.v4 units and exact lineage; keep existing V3 bundles in V3 unless a reviewed conversion was requested. Use the Product playbook for complete representation rules and optional flashcards.
   - For standalone Pembahasan soal, fetch the V5 solutionCollection schemas instead and author only that product. Preserve separate problem and solution provenance and review release eligibility for every example. Never disclose protected assessment answers or index these examples in public search, quiz or Zyra.
   - Run the independent Critic and Student POV subagent reviews against the draft files and incorporate all required revisions.
   - Validate with `authoring.validate_product_bundle` until `ok: true` and `valid: true` (deterministic content validity). Note that `publicationReady` will remain `false` until pedagogic review and Diktat PDF evidence are completed after staging.
   - Stage with `authoring.submit_product_bundle` for a new bundle. Replacement requires `authoring.restage_product_bundle` and the caller's last-read checksum as `expectedRevision`.
   - For V4 with `local_playwright`, run the Product playbook's local operator `node scripts/authoring/run-product-v4-local.mjs --input /absolute/path/input.json` for the exact draft checksum and original staging run. The operator requests and executes the attempt locally, including browser and PDF work, then exports the signed receipt and read-back artifacts. No hosted worker is enqueued; polling alone cannot complete a pending local attempt. Read `authoring.get_verification` after local execution for the current content and plan. Inspect required states and PDF pages. When review is authorized, use fresh authoring.get_import context to record all eight criteria, exact revision/fingerprint, current plan/receipt, and explicit semantic decisions for every section. For V5, inspect every item and use its current checksum-bound correctness, reasoning, provenance and release decisions; V4 PDF evidence is not its gate.
   - For a V2/V3 learning-only Article and Diktat draft, discover `productBundle.legacyLocalOperator`, verify the deployed source SHA from the authorized deployment record and run its private local command for the exact checksum, original staging run and active admin. Inspect the read-back PDF and each page before the existing exact-revision review and publication gates. Assessment products and V4/V5 are excluded from this operator.

6. **Checkpoint 5 (Post-Stage Readiness and Publication)**
   - Call `authoring.get_import` with `bundleType: "product"` and `importId` to inspect `currentReadiness` (`valid`, `reviewStatus`, `pdfEvidenceStatus`, `publicationReady`).
   - Report the final status, `importId`, checksum, and remaining verification/review blockers. V4 requires current trusted verification, PDF evidence and exact-revision review; V5 requires current review and release decisions for every item. An authorized admin can publish V5 with `authoring.publish_solution_collection` and the exact revision; staging alone is incomplete.
