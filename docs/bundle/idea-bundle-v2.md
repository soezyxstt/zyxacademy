# Idea Bundle V2 Contract

Idea Bundle V2 is a strict, ZIP-based import boundary for source-grounded Ideas. It is enabled by `FEATURE_IDEA_BUNDLE_V2=1`. The legacy JSON importer remains available while this flag is absent or `0`.

## ZIP security boundary

The upload is parsed without extracting to a caller-controlled filesystem path. The reader rejects path traversal, absolute paths, NUL and invalid UTF-8 names, duplicate normalized paths, symlinks, executable content, nested archives, encrypted entries, ZIP64, multi-disk archives, unsupported compression methods, CRC errors, corrupt data, and decompression bombs.

Default limits are:

- Archive: 32 MiB.
- Entries: 256.
- Compressed or uncompressed file: 8 MiB.
- Total uncompressed content: 32 MiB.
- Compression ratio: 200:1.

Security failures use stable `ZIP_*` reason codes. JSON and entity failures use stable `BUNDLE_*` reason codes so operators can distinguish malformed input, missing dependencies, checksum drift, and conflicts.

## Required bundle files

The ZIP contains `manifest.json`, one JSON array for each declared entity type, and the UTF-8 source files named by `sourceVersions[].contentPath`. The current entity file types are `source_materials`, `source_chunks`, `ideas`, `provenance`, and `relations`. Paths are relative and every file is covered by the manifest checksum inventory.

The strict manifest contains:

- `bundleId`, `bundleType: "idea"`, `schemaVersion: "idea-bundle.v2"`, and `courseId`.
- Source material IDs, versions, checksums, and content paths.
- Entity file paths, entity types, checksums, and stable IDs.
- `creatorId`, optional `curatorId`, optional AI provider, model, and prompt version.
- `createdAt`, `bundleChecksum`, and an empty `conflicts` array.

Unknown manifest fields fail closed. The bundle checksum is deterministic over the manifest without its own checksum and the sorted checksums of all other files. Entity hashes use deterministic key ordering.

## Entity invariants

- Source metadata must match `sourceVersions` and the source bytes must match their checksum.
- Source rows must be active, Ideas must be publication-ready, and entity creator attribution must match the manifest.
- Source chunks must reference an existing source version, have exact offsets into normalized source text, and have a content checksum matching the chunk text.
- Ideas must belong to the manifest course, have unique IDs and stable keys, and use valid source and publication policy values.
- Published source-grounded Ideas require provenance. Provenance must reference an existing Idea and source chunk, cite the chunk checksum, and stay within exact chunk offsets.
- Relations must reference existing Ideas, cannot self-reference, and active prerequisite relations must be acyclic.
- Unresolved manifest conflicts, missing identities, invalid statuses, unsupported schema versions, and checksum mismatches are rejected before database writes.

## Workflow and authorization

1. An admin uploads a ZIP through `/api/admin/bundles/idea` with preview intent. The API validates the ZIP and returns an editable projection without writing R2, `impor_bundle`, `item_impor_bundle`, or canonical rows.
2. The admin reviews and edits Idea content, classification, provenance notes, and relation meaning. Stable IDs, course and chapter identity, source bytes, chunks, offsets, checksums, attribution, versions, and lifecycle state cannot be changed through the draft contract.
3. Explicit staging resubmits the original ZIP and draft. The server performs an allowlist merge, recomputes Idea semantic and generation hashes plus all entity and bundle checksums, repeats full validation, then records the final ZIP and inventory. An identical `bundleId` and checksum returns the existing import without new rows. A reused `bundleId` with a different checksum is blocked as `IDEA_BUNDLE_CONFLICT`.
4. A tutor may review an import only when assigned to its course. An admin may approve or reject. Review decisions are immutable and audited.
5. Only an admin can publish an approved import. Publication resolves legacy course and chapter identities, writes all source, chunk, Idea, provenance, and relation rows in one Turso transaction, and records `publikasi_bundle` plus mutation audits.
6. Vector work is inserted into `vector_sync_queue` as deterministic, conflict-safe outbox jobs for embedding-eligible source chunks and published Ideas. Source chunks use `source_materials` and Ideas use `canonical_ideas`; each job carries the content needed to build the canonical provider-neutral payload. No partial publication is visible after a transaction failure.

The admin panel is available at `/admin/bundles/idea` while the feature flag is enabled. Disabling the flag hides the V2 panel and leaves the legacy importer available for rollback. Published evidence is never deleted as a rollback mechanism.

The panel loads the immutable staged ZIP for review and displays every Idea, source excerpt, provenance role, relation, and AI generation label before approval or publication controls are available. External agents may use `$UPLOADER` for creator fields and `$APPROVING_REVIEWER` for curator fields; the values are resolved to real accountable identities only at publication.

## Staging evidence

The staging test covers valid upload, identical retry, conflicting retry, invalid path, invalid entity checksum, missing source, duplicate Idea stable key, forced partial publication failure, successful publish, and independent reconciliation. The successful Plan 006 evidence is stored at `artifacts/staging-overhaul/20260803-plan006-bundle-v5/plan-006-result.json` and the database reconciliation at `artifacts/staging-overhaul/20260803-plan006-bundle-v5/plan-006-reconcile.json`.
