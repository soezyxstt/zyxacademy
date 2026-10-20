# Zyx Authoring Pipeline: End-to-End Orchestration Playbook

## 1. Scope and Purpose

Use this playbook when orchestrating the complete Zyx authoring pipeline from raw course documents to a validated Source Pack, a staged Idea Bundle V3, and a validated or staged Product Bundle V3, or when resuming the pipeline from an existing checkpoint.

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
   - Stage with `authoring.submit_idea_bundle` (or `authoring.restage_idea_bundle` when updating an existing unapproved import).

4. **Checkpoint 3 (Human Admin Publication Gate for Idea Bundle)**
   - **Hard Stop:** MCP cannot publish an Idea Bundle (`authoring.review_idea_bundle` only records review decisions `approved` or `rejected`).
   - Product Bundle V3 validation (`authoring.validate_product_bundle`) requires all referenced Ideas and `learningSections` to be `published` in the database.
   - If the staged Idea Bundle has not yet been published by an admin in `/admin/materials/review`, pause the pipeline after staging/reviewing the Idea Bundle, report the `importId`, `bundleId`, and checksum to the operator, and wait for admin publication before proceeding to Checkpoint 4.

5. **Checkpoint 4 (Product Bundle V3 Stage: `product`)**
   - Fetch stage modules via `workflow.get_playbook` with `stage: "product"`.
   - Verify that `compatibility.status` allows `product` authoring (`independentSubagents: true` is required).
   - Start or resume the `idea_product` run and verify published Ideas via `knowledge.search_ideas` / `analysis.get_coverage`.
   - Draft the structured Article (`sections`, semantic `blocks`, `pedagogy`, `workedExamplePayload`, `formativeCheckPayload`, typed `visuals`), linked `diktat`, and atomic `flashcard_set` / `flashcard` items.
   - Run the independent Critic and Student POV subagent reviews against the draft files and incorporate all required revisions.
   - Validate with `authoring.validate_product_bundle` until `ok: true` and `valid: true` (deterministic content validity). Note that `publicationReady` will remain `false` until pedagogic review and Diktat PDF evidence are completed after staging.
   - Stage with `authoring.submit_product_bundle` (or `authoring.restage_product_bundle`).
   - If the operator requested MCP-assisted pedagogic review and the principal has `authoring:review` scope, record the 8-criterion anchored review via `authoring.review_product_bundle` using the exact `policyVersion` and `contentFingerprint` returned by staging.

6. **Checkpoint 5 (Post-Stage Readiness and Admin Handoff)**
   - Call `authoring.get_import` with `bundleType: "product"` and `importId` to inspect `currentReadiness` (`valid`, `reviewStatus`, `pdfEvidenceStatus`, `publicationReady`).
   - Report the final status, `importId`, `contentFingerprint`, and any remaining admin UI actions (Diktat PDF render verification and final publication in `/admin/materials/review/product/[slug]`).
