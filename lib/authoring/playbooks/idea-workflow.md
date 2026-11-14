# Zyx Idea Bundle V3: Workflow and Contract Playbook

## 1. Stage Objective

Transform a validated Source Pack into an `idea-bundle.v3` ZIP archive containing pedagogical `learningSections`, atomic `ideas`, byte-accurate `provenance` (`sourceMaterials`, `sourceChunks`, `ideaProvenance`), and an acyclic `relations` DAG, then validate, stage, review and publish the exact revision through authorized MCP tools.


## Existing-content revisions, V3 and later

For edits to existing content, use the flexible revision tools advertised by the current workflow contract. This path supports Idea V3 and learning Product V3/V4/V5 only; do not create compatibility work or convert a bundle below V3 implicitly.

1. Obtain the current compatible stage bootstrap, then call `authoring.get_edit_context` with the import and exact observed revision. Inspect stable IDs, existing source evidence, lineage, review context and blockers.
2. Call `authoring.create_revision` to fork a live artifact or editable draft into a durable draft. The old publication stays live. Existing source evidence supplies the edit scope; no new Source Pack or expired original run is required. Use the returned draft execution identity for applicable trusted V4 verification.
3. Call `authoring.patch_revision` with bounded set/add/remove/move operations addressed by stable IDs. The server rebuilds hashes and the ZIP. Continue with the returned successor import ID and revision after every accepted edit. A stale revision requires rereading and explicit reconciliation, never a blind retry with a substituted checksum.
4. Call `authoring.plan_release` with the exact draft entries. A release can refer to multiple Idea and Product artifacts and profiles. Inspect changed units, preserved evidence, affected dependents, current blockers and next actions. Changed derived content still needs its applicable trusted verification; no receipt is synthesized.
5. Independently review the actual changed content and affected reasoning or source context. Submit the explicit profile-specific evidence through `authoring.review_revision`. Reuse only the server-confirmed unchanged decisions attributed to the same reviewer; do not approve unseen changed units.
6. Replan after review and verification. With explicit publication authorization and `authoring:publish`, call `authoring.publish_release` using the exact manifest entries and plan hash. Atomic replacement must leave the previous live release intact on failure. No Admin website visit is required.
7. Use `authoring.list_revisions` for history. `authoring.restore_revision` creates a new draft from historical authored content against the observed current baseline. Restoration never publishes automatically or rewrites historical artifacts; follow the same plan, evidence, review and publication steps.

The archive construction and Source Pack workflow below remains the path for initial authoring. The new editing workflow must not be replaced with repeated ZIP upload or run adoption merely to edit existing content. Runtime schemas are authoritative; if these tools are absent on an older server, report the missing capability and do not claim that the new workflow is deployed.

## 2. Step-by-Step Tool Sequence

1. **Bootstrap:** Call `workflow.get_playbook` with `skill: "zyx-idea-bundle-mcp"`, `stage: "idea"`, and client metadata. Save `bootstrapToken`.
2. **Lock Scope and Start Run:**
   - Discover `courseKey` and `chapterKey` via `catalog.list_courses` and `catalog.list_chapters`.
   - Locate the validated Source Pack via `source.list_packs` (or use the `sourcePackToken` / `packId` from `source.ingest`).
   - Call `workflow.start` with `workflow: "idea_product"`, `courseKey`, `chapterKey`, `sourcePackId` (or `sourcePackToken`), and `bootstrapToken`.
   - Call `workflow.get_contract` with `runToken` and `bootstrapToken`.
3. **Read Source Pack and Existing Course Ideas:**
   - Call `source.get_pack` with `packId` and `runToken` to inspect all documents, then call `source.get_pack` per `documentId` to read the full canonical Markdown and `markdownSha256`.
   - Call `knowledge.search_course_ideas` and `knowledge.search_ideas` with `runToken` to inspect any existing published Ideas in the course and chapter so you avoid duplicate codes or conflicting stable keys.
   - Call `authoring.list_imports` (`bundleType: "idea"`) to check whether an Idea Bundle import already exists for this chapter.
4. **Construct `idea-bundle.v3` Archive:**
   - Follow the decomposition rules in `idea/decomposition` and the exact file schemas below.
5. **Validate and Stage:**
   - Call `authoring.validate_idea_bundle` with `runToken`, `filename`, `bundleBase64`, and `bootstrapToken`.
   - Resolve all blocking issues and warnings until `ok: true` and `valid: true`.
   - Call `authoring.submit_idea_bundle` (or `authoring.restage_idea_bundle` with `importId` and the caller's last-read checksum as `expectedRevision` if replacing an existing unapproved staged bundle). Before changing a draft, read `authoring.get_import` and inspect `import.reviewReset` counts. Explicitly acknowledge deletion of saved reviews by passing its `fingerprint` as `reviewResetFingerprint`. If the reset is required or stale, reload and decide again. Unchanged content does not reset reviews.
   - Read the current checksum, then call `authoring.get_idea_review_context` with the locked `runToken`, `bootstrapToken`, `importId`, and `expectedRevision`.
   - Review each Idea and its provenance. With `authoring:review`, call `authoring.review_idea_revision` using every current Idea hash and an explicit item decision. Missing or failed decisions cannot grant approval.
   - With explicit publication authorization and `authoring:publish`, call `authoring.publish_idea_bundle` using the same exact checksum and admin identity. A matching retry is idempotent. A stale checksum requires fresh context and review.
   - Read back the published Ideas before authoring products. No Admin website visit is required. An insufficient-scope response provides the OAuth resource and required grant; reauthorize with the union of existing and required scopes instead of silently granting permission.
   - For authorized withdrawal, use `authoring.withdraw_idea_bundle` with `authoring:withdraw`, the bound run and bootstrap, import ID and exact checksum. Read current status afterward. Matching retries are idempotent; entities still owned by another published import remain active.
   - If an old published import has no usable run, fetch a fresh Idea bootstrap, omit `runToken`, and explicitly pass `recovery: "exact_import"` with the import ID and observed checksum. Withdrawal recovery needs no Source Pack and grants no authoring, review or publication bypass.

## 3. `idea-bundle.v3` Archive Contract

The ZIP archive must contain `manifest.json` and six entity files under `entities/`:
- `entities/source-materials.json`
- `entities/source-chunks.json`
- `entities/learning-sections.json`
- `entities/ideas.json`
- `entities/idea-provenance.json`
- `entities/idea-relations.json`

### 3.1 Attribution and Identity Placeholders

- Always set `creatorId: "$UPLOADER"` and `curatorId: "$APPROVING_REVIEWER"` in `manifest.json` and entity records. Never invent user UUIDs or ask the operator for internal user IDs.
- Use the locked course code/ID and chapter ID convention consistent with the run scope. When `manifest.courseId` and `chapterId` are validated against the run token, if a scope mismatch occurs, align `courseId` and `chapterId` with the validator diagnostic.

### 3.2 `manifest.json` Schema

```json
{
  "bundleId": "idea-bundle-ma1101-bab01-v1",
  "bundleType": "idea",
  "schemaVersion": "idea-bundle.v3",
  "courseId": "<courseId>",
  "creatorId": "$UPLOADER",
  "curatorId": "$APPROVING_REVIEWER",
  "createdAt": "2026-09-01T00:00:00.000Z",
  "conflicts": [],
  "entityFiles": [
    {
      "path": "entities/source-materials.json",
      "entityType": "source_materials",
      "checksum": "<sha256-of-file-bytes>",
      "stableIds": ["source-doc-ma1101-bab01-001"]
    },
    {
      "path": "entities/source-chunks.json",
      "entityType": "source_chunks",
      "checksum": "<sha256-of-file-bytes>",
      "stableIds": ["chunk-ma1101-bab01-001"]
    },
    {
      "path": "entities/learning-sections.json",
      "entityType": "learning_sections",
      "checksum": "<sha256-of-file-bytes>",
      "stableIds": ["ls-ma1101-bab01-01"]
    },
    {
      "path": "entities/ideas.json",
      "entityType": "ideas",
      "checksum": "<sha256-of-file-bytes>",
      "stableIds": ["idea-ma1101-bab01-001"]
    },
    {
      "path": "entities/idea-provenance.json",
      "entityType": "idea_provenance",
      "checksum": "<sha256-of-file-bytes>",
      "stableIds": ["prov-ma1101-bab01-001"]
    },
    {
      "path": "entities/idea-relations.json",
      "entityType": "idea_relations",
      "checksum": "<sha256-of-file-bytes>",
      "stableIds": ["rel-ma1101-bab01-001"]
    }
  ],
  "bundleChecksum": "<sha256-of-deterministic-manifest-and-entity-files>"
}
```

### 3.3 Entity File Requirements

1. **`entities/source-materials.json`:**
   - Each item maps 1-to-1 to a document in the bound Source Pack (`id`, `courseId`, `chapterId`, `sourceType: "markdown"`, `title`, `canonicalUriOrR2Key`, `version: 1`, `checksum` matching `markdownSha256`, `status: "active"`, `creatorId: "$UPLOADER"`).
2. **`entities/source-chunks.json`:**
   - Verbatim substrings extracted from the corresponding Source Pack document Markdown (`id`, `sourceMaterialId`, `sourceVersion: 1`, `content`, `startOffset`, `endOffset`, `pageNumber` or `sectionLocator`, `checksum` = SHA-256 of `content`, `embeddingEligible: true`).
   - `startOffset` and `endOffset` must be accurate character/byte offsets into the Source Pack document Markdown, and `content` must be a non-empty excerpt supporting the linked Ideas.
3. **`entities/learning-sections.json`:**
   - Ordered pedagogical subtopics (`bagian_pembelajaran`) for the chapter (`id`, `courseId`, `chapterId`, `stableKey`, `title`, `slug`, `orderIndex` contiguous `0..N-1`, `learningObjective`, `estimatedMinutes`, `ideaIds` listing all Ideas belonging to that section, `version: 1`, `status: "draft"`).
   - Every Idea in `entities/ideas.json` must belong to at least one `learningSection`, and every `learningSection` must reference valid Idea IDs.
4. **`entities/ideas.json`:**
   - Atomic knowledge units (`id`, `courseId`, `chapterId`, `learningSectionId`, `stableKey`, `code`, `canonicalStatement`, `conciseExplanation`, optional `latex`, `knowledgeKind`, `instructionalRole`, `difficultyMetadata`, `sourcePolicy: "source_grounded"`, `version: 1`, `status: "draft"`, `schemaVersion: "1.0"`, `semanticHash`, `generationHash`, `creatorId: "$UPLOADER"`).
5. **`entities/idea-provenance.json`:**
   - Links every Idea to at least one `sourceChunkId` (`id`, `ideaId`, `sourceChunkId`, `provenanceRole: "primary" | "supporting" | "example" | "counterexample"`, `rationale` or `excerptConfidence`). Every Idea must have at least one `"primary"` provenance link.
6. **`entities/idea-relations.json`:**
   - Directed edges between Ideas (`id`, `sourceIdeaId`, `targetIdeaId`, `relationType: "prerequisite" | "elaborates" | "contrasts" | "applies_to" | "special_case_of" | "equivalent_to"`, `explanation`, `status: "active"`).
   - The `prerequisite` subgraph must be a strict Directed Acyclic Graph (DAG) with zero self-loops and zero cycles.
