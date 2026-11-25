# Zyx Idea Bundle V3: Workflow and Contract Playbook

## 1. Stage Objective

Transform a validated Source Pack into an `idea-bundle.v3` ZIP archive containing pedagogical `learningSections`, atomic `ideas`, exact UTF-16 source spans in `provenance` (`sourceMaterials`, `sourceChunks`, `ideaProvenance`), and an acyclic `relations` DAG, then validate, stage, review and publish the exact revision through authorized MCP tools.


## Existing-content revisions, V3 and later

For edits to existing content, use the flexible revision tools advertised by the current workflow contract. This path supports Idea V3 and learning Product V3/V4/V5 only; do not create compatibility work or convert a bundle below V3 implicitly.

1. Obtain the current compatible stage bootstrap, then call `authoring.get_edit_context` with the import and exact observed revision. Use compact responses and a stable target while drafting; read full source evidence, lineage and review context before review.
2. Call `authoring.create_revision` to fork a live artifact or editable draft into a durable draft. The old publication stays live. Existing source evidence supplies the edit scope; no new Source Pack or expired original run is required. Use the returned draft execution identity for applicable trusted V4 verification.
3. Call `authoring.patch_revision` with bounded set/add/remove/move operations addressed by stable IDs. The server rebuilds hashes and the ZIP. Continue with the returned successor import ID and revision after every accepted edit. A stale revision requires rereading and explicit reconciliation, never a blind retry with a substituted checksum.
4. Call `authoring.plan_release` with the exact draft entries. A release can refer to multiple Idea and Product artifacts and profiles. Inspect changed units, preserved evidence, affected dependents, current blockers and next actions. Changed derived content still needs its applicable trusted verification; no receipt is synthesized.
5. Independently review the actual changed content and affected reasoning or source context. Submit the explicit profile-specific evidence through `authoring.review_revision`. Reuse only the server-confirmed unchanged decisions attributed to the same reviewer; do not approve unseen changed units.
6. Replan after review and verification. With explicit publication authorization and `authoring:publish`, call `authoring.publish_release` using the exact manifest entries and plan hash. Atomic replacement must leave the previous live release intact on failure. No Admin website visit is required.
7. Use `authoring.list_revisions` for history. `authoring.restore_revision` creates a new draft from historical authored content against the observed current baseline. Restoration never publishes automatically or rewrites historical artifacts; follow the same plan, evidence, review and publication steps.

Prefer the typed draft path below for initial authoring when advertised; the archive path remains available. The new editing workflow must not be replaced with repeated ZIP upload or run adoption merely to edit existing content. Runtime schemas are authoritative; if these tools are absent on an older server, report the missing capability and do not claim that the new workflow is deployed.

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
4. **Author the Idea draft:**
   - Follow `idea/decomposition`. Read `ideaBundle.initialDraft` and fetch only its checksum-pinned `ideaDraftInput` schema from `ideaBundle.schemaDocuments`; refresh the contract on HTTP 409. Write atomic Ideas, pedagogical sections and explained relations. Use stable local keys and exact quotes with their document ID and source-unit number. The quote must support the Idea; a matching substring alone does not prove meaning or full coverage.
   - Prefer `authoring.create_idea_draft` with `runToken`, `bootstrapToken`, stable `draftKey` and `draft`. The server reads the exact stored Source Pack, resolves spans, builds stable IDs, metadata, hashes and ZIP, and runs the existing validators and staging gates. It retains every source unit for coverage checks. For a repeated quote, choose a longer unique quote or supply an exact JavaScript string offset into the LF-normalized source text. Never guess the span.
   - Keep the key, run token and content unchanged when recovering a lost response. After staging, use the returned checksum with compact revision tools. `createIdeaAuthoringClient` in `lib/authoring/idea-authoring-client.ts` carries successor identity; it never retries writes or approves content. Use `readFull()` before final review.
5. **Validate, Stage and Review:**
   - The typed tool validates and stages in one call. Resolve its bounded diagnostics; do not upload the same archive again after success. A source-coverage metric counts represented units, not proof that every concept is covered. Independently check atomicity, completeness, prerequisites and evidence.
   - For the archive route, fetch the canonical schemas below, call `authoring.validate_idea_bundle` with `runToken`, `filename`, `bundleBase64`, and `bootstrapToken`, then resolve blockers before `authoring.submit_idea_bundle` (or `authoring.restage_idea_bundle` with `importId` and the caller's last-read checksum as `expectedRevision` if replacing an existing unapproved staged bundle). Before changing a draft, read `authoring.get_import` and inspect `import.reviewReset` counts. Explicitly acknowledge deletion of saved reviews by passing its `fingerprint` as `reviewResetFingerprint`. If the reset is required or stale, reload and decide again. Unchanged content does not reset reviews.
   - Read the current checksum, then call `authoring.get_idea_review_context` with the locked `runToken`, `bootstrapToken`, `importId`, and `expectedRevision`.
   - Review each Idea and its provenance. With `authoring:review`, call `authoring.review_idea_revision` using every current Idea hash and an explicit item decision. Missing or failed decisions cannot grant approval.
   - With explicit publication authorization and `authoring:publish`, call `authoring.publish_idea_bundle` using the same exact checksum and admin identity. A matching retry is idempotent. A stale checksum requires fresh context and review.
   - Read back the published Ideas before authoring products. No Admin website visit is required. An insufficient-scope response provides the OAuth resource and required grant; reauthorize with the union of existing and required scopes instead of silently granting permission.
   - For authorized withdrawal, use `authoring.withdraw_idea_bundle` with `authoring:withdraw`, the bound run and bootstrap, import ID and exact checksum. Read current status afterward. Matching retries are idempotent; entities still owned by another published import remain active.
   - If an old published import has no usable run, fetch a fresh Idea bootstrap, omit `runToken`, and explicitly pass `recovery: "exact_import"` with the import ID and observed checksum. Withdrawal recovery needs no Source Pack and grants no authoring, review or publication bypass.

## 3. Archive compatibility and canonical schemas

Fetch the current definitions from `ideaBundle.schemaDocuments`, with each exact SHA-256. Do not copy a manifest or entity shape from old prose. The strict validators reject unknown fields. The direct draft tool owns these mechanics; use them yourself only for archive input.

| Schema | Purpose |
| --- | --- |
| `ideaBundleManifest` | `idea-bundle.v3`, `sourceVersions` with embedded canonical content paths, and exact entity-file checksums and IDs |
| `sourceMaterial`, `sourceChunk` | Source bytes, versions, checksums, timestamps and exact spans |
| `learningSection` | `primaryIdeaIds`, `supportingIdeaIds`, `sourceChunkIds`, one learning objective and optional parent section |
| `idea` | Atomic statement/explanation, kind, instructional role, source policy, timestamps and identity hashes |
| `provenance` | Idea-to-chunk link, exact start/end offsets, source checksum and optional note |
| `relation` | Versioned, explained directed link between Ideas |

For archive authoring, use `$UPLOADER` and `$APPROVING_REVIEWER` attribution placeholders. The typed tool derives the authenticated creator itself. Every source material and chunk stays in the locked course/chapter and exact Source Pack version. Source spans use JavaScript UTF-16 string offsets into LF-normalized canonical text, not UTF-8 byte positions; checksums still hash UTF-8 bytes as required by the validator.

Every Idea has source-grounded provenance and exactly one primary learning section. Supporting sections are optional. The section hierarchy has at most three levels, with unique section slugs across the bundle and unique order within each sibling group. Every source unit remains accounted for; independent review still decides whether its concepts, conditions and examples are complete.

Use the current provenance roles (`primary`, `supporting`, `prerequisite`, `context` for source-grounded content) and relation types (`prerequisite`, `related`, `extends`, `example_of`, `misconception_of`) from the schemas. The prerequisite graph must have no cycles or self-loops. Prefer a small justified graph over speculative edges. Do not invent `idea.learningSectionId`, `learningSection.ideaIds`, extra provenance fields or relation types absent from the runtime schema.

Schema validation and successful staging do not approve or publish content. Keep all exact-revision review and explicit publication steps above.
