# Idea Bundle V3 Contract

Status: `ACTIVE` behind `FEATURE_STRUCTURED_ARTICLE_READER_V1` for new submission. V2 remains readable during transition.

## Purpose

Idea Bundle V3 adds a pedagogical outline to the source grounded Idea graph. The new entity file is `entities/learning-sections.json`, declared as `learning_sections` in the manifest. Source materials, source chunks, Ideas, provenance, and relations retain their V2 identity and checksum rules.

## Learning section

Each learning section contains:

- stable `id`, `chapterId`, `title`, `slug`, and zero based `orderIndex`;
- optional `parentSectionId`;
- one `learningObjective`;
- `primaryIdeaIds`, `supportingIdeaIds`, and `sourceChunkIds`.

The hierarchy is acyclic and limited to three levels. Sibling order and slug are unique. Display numbers such as `1.1` and `1.1.1` are derived from hierarchy and order, never stored as author supplied identity.

Every Idea belongs to exactly one primary learning section. Supporting membership is optional. Every referenced Idea and source chunk must exist in the bundle. Review exposes both the pedagogical order and all source mappings, so authoring may reorder material without losing traceability.

## Validation and editing

The ZIP, strict unknown field, deterministic checksum, source grounding, provenance, and relation cycle boundaries from V2 remain in force. V3 additionally validates learning section hierarchy, depth, slug, ordering, Idea coverage, and source chunk references.

Admin draft editing accepts only safe textual and ordering fields with `expectedRevision`. Stable IDs, Idea membership, provenance, and lineage cannot be edited. The server rebuilds checksums after an accepted edit. Per Idea review remains progress metadata and does not block overall Idea Bundle approval.

## MCP transition

`workflow.get_contract`, validation, submission, Context Pack, and Job Pack advertise V3. Readers accept V2 and V3. When `FEATURE_STRUCTURED_ARTICLE_READER_V1=1`, new Idea Bundle submission must use V3. Disabling the flag restores V2 submission without deleting V3 artifacts.
