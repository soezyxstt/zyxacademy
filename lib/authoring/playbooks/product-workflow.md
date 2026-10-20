# Zyx Product Bundle V3: Workflow and Contract Playbook

## 1. Stage Objective

Create a `product-bundle.v3` ZIP archive containing learner-ready structured `article`, review `diktat`, and atomic `flashcard_set` / `flashcard` entities grounded in a validated Source Pack and published Ideas, verified by independent Critic and Student POV subagents, and staged via MCP for admin review and Diktat PDF verification.

## 2. Capability and Prerequisite Gate

1. **Independent Subagents Required:** `product` stage authoring requires `clientCapabilities.independentSubagents: true`. If the host cannot launch independent subagents for Critic and Student POV verification, stop before drafting and report `AUTHORING_MCP_CAPABILITY_MISSING`.
2. **Published Ideas Required:** Every Idea and `learningSectionId` referenced by the Product Bundle must already be `published` in the database (`ideaPublicationRequired: true`). Verify via `knowledge.search_ideas` and `analysis.get_coverage` before drafting.
3. **Learner Products Only:** `product-bundle.v3` permits only `article`, `diktat`, `flashcard_set`, and `flashcard`. Never include `question`, `solution`, or `assessment_blueprint` in a Product Bundle; assessment items belong exclusively to `quiz_bank` or `reference_question_ingest`.

## 3. Step-by-Step Tool Sequence

1. **Bootstrap:** Call `workflow.get_playbook` with `skill: "zyx-product-bundle-mcp"`, `stage: "product"`, and client metadata. Save `bootstrapToken`.
2. **Start Run and Read Contract:**
   - Call `workflow.start` with `workflow: "idea_product"`, `courseKey`, `chapterKey`, `sourcePackId` (or `sourcePackToken`), and `bootstrapToken`.
   - Call `workflow.get_contract` with `runToken` and `bootstrapToken` to inspect live `product-bundle.v3` rules, `pedagogyFields`, `typedVisuals`, `reviewRubric`, and `pdfEvidenceStates`.
3. **Load Upstream Context:**
   - Call `knowledge.search_ideas` (and `knowledge.get_idea` for key Ideas) to retrieve published Idea `id`, `code`, `version`, `semanticHash`, and `learningSection` mappings.
   - Call `knowledge.list_sources` and `knowledge.search_source_chunks` (or `source.get_pack`) to obtain active `sourceId`, `version`, `checksum`, and `excerptIds`.
   - Call `knowledge.list_products` and `authoring.list_imports` (`bundleType: "product"`) to check existing drafts or published products in the chapter.
4. **Draft Content (Creator Role):**
   - Reuse PDF page images from `source.read_file` using `![descriptive alt text](imageUrl)` in `contentMarkdown`, followed by the returned citation label, for example `Sumber: Judul buku, hlm. 12`. Preserve the title, PDF page number, and document checksum in source provenance. Never invent author, edition, publication year, or printed page numbering. Do not treat a page render as an isolated figure or a typed interactive visual.
   - Draft the structured `article` (with `sections`, semantic `blocks`, `pedagogy`, `workedExamplePayload`, `formativeCheckPayload`, and typed `visuals`), the linked `diktat` (1 to 4 pages A4 self-study summary), and atomic `flashcard_set` + `flashcard` items.
   - Follow `product/editorial`, `product/quality-rubric`, `product/flashcards`, and `product/derivation-audit`.
5. **Independent Subagent Verification (Critic and Student POV):**
   - Spawn an independent **Critic** subagent to audit the draft against all 8 rubric criteria, derivation steps (`product/derivation-audit`), and zero internal ID leakage.
   - Spawn an independent **Student POV** subagent to read the Article and Diktat cold as a learner, testing whether every symbol is defined before use, every worked example step is justified, and every formative check is solvable from the preceding explanation.
   - Apply all revisions required by Critic and Student POV before packaging.
6. **Validate and Stage:**
   - Call `authoring.validate_product_bundle` with `runToken`, `filename`, `bundleBase64`, and `bootstrapToken`.
   - Note the distinction between `valid` and `publicationReady`:
     - `valid: true` means deterministic content, schema, scope, and quality policy checks passed.
     - Before staging and review, `PEDAGOGIC_REVIEW_MISSING` and `PDF_EVIDENCE_MISSING` will keep `publicationReady: false`; this is expected prior to submission.
   - Once `valid: true`, call `authoring.submit_product_bundle` (or `authoring.restage_product_bundle` with `importId` to update an existing draft).
7. **Pedagogic Review and Post-Stage Inspection:**
   - When authorized with `authoring:review`, call `authoring.review_product_bundle` with `importId`, `runToken`, `decision`, `policyVersion`, `contentFingerprint` (matching the staged bundle), and anchored `criteria` across all 8 rubric items.
   - Call `authoring.get_import` (`bundleType: "product"`, `importId`) to inspect `currentReadiness`. Final publication and Diktat PDF rendering happen through the admin review UI (`/admin/materials/review/product/[slug]`).

## 4. `product-bundle.v3` Archive Contract

The ZIP archive contains `manifest.json`, `entities/products.json`, and `entities/dependencies.json`.

### 4.1 `manifest.json` Schema

```json
{
  "bundleId": "product-bundle-ma1101-bab01-v1",
  "bundleType": "product",
  "schemaVersion": "product-bundle.v3",
  "courseId": "<courseId>",
  "creatorId": "$UPLOADER",
  "curatorId": "$APPROVING_REVIEWER",
  "createdAt": "2026-09-05T00:00:00.000Z",
  "conflicts": [],
  "entityFiles": [
    {
      "path": "entities/products.json",
      "entityType": "products",
      "checksum": "<sha256-of-products-json>",
      "stableIds": ["article-ma1101-bab01", "diktat-ma1101-bab01", "fcset-ma1101-bab01", "fc-ma1101-bab01-01"]
    },
    {
      "path": "entities/dependencies.json",
      "entityType": "dependencies",
      "checksum": "<sha256-of-dependencies-json>",
      "stableIds": ["dep-diktat-article-ma1101-bab01"]
    }
  ],
  "bundleChecksum": "<sha256-of-deterministic-manifest-and-entity-files>"
}
```

### 4.2 Lineage and Dependency Rules

1. **Article to Diktat Lineage:** Every `diktat` must specify `sourceArticleId`, `sourceArticleVersion`, and `sourceArticleHash` matching the `article.id`, `article.version`, and `article.generationHash` in the same bundle, plus a matching `UP_TO_DATE` entry in `entities/dependencies.json` (`upstreamEntityType: "product"`, `downstreamEntityType: "diktat"`).
2. **Idea Links Weight Rule:** On every `article`, `diktat`, and `flashcard_set`, `ideaLinks` weights must be positive and sum to `1`. Each individual `flashcard` must link to exactly one Idea (`ideaLinks.length === 1` with `weight: 1`).
3. **Zero Internal ID Leakage:** Learner-visible fields (`title`, `contentMarkdown`, `learningObjective`, `explanation`, `prompt`, `answer`, visual labels, and hints) must never contain internal IDs (`idea-...`, `source-...`, `ex-...`, `ls-...`, `blk-...`, `sec-...`) or raw JSON/enum codes.
