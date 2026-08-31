# Product Bundle V3 Contract

Status: `ACTIVE` behind `FEATURE_STRUCTURED_ARTICLE_READER_V1` for new submission and structured review. V2 remains readable during transition.

## Article structure

An Article V3 stores `sections` and has no flat root blocks. A section contains stable identity, kind, title, slug, order, optional parent, learning objective, Idea links, source references, and semantic blocks. `topic` requires exactly one `learningSectionId`. `overview` and `summary` may synthesize multiple Ideas without one learning section.

Each block stores `contentMarkdown`, `blockType`, optional title, Idea IDs, and source references as fields. Metadata is never embedded in Markdown. The compiler preserves block types in the semantic AST and derives `artikel.contentMarkdown` deterministically for compatibility, search, and vector indexing.

## Quality gates

- Every Idea is covered and traceable to a source.
- Every topic has a learning objective, core explanation, understanding check, and provenance.
- Examples, analogies, visuals, formulas, misconceptions, and warnings are required only when pedagogically relevant.
- A topic targets 3 to 8 reading minutes and has a hard prose equivalent limit of 1,500 words. A short topic produces a warning, not filler.
- A chapter has overview, synthesis or summary, and a final understanding check.

## Review, edit, and publication

`review_item_bundle` identifies `targetType` and `targetId`. V3 Article review targets `article_section`; the V2 block endpoint remains an adapter for `article_block`.

Admin edits require `expectedRevision`, accept only safe content fields, recompute generation hashes and bundle checksum, preserve approval for unchanged sections, reset changed section approval, and mark an Article to Diktat dependency `STALE`. Stable IDs, provenance, and lineage identity cannot be edited.

Publication requires the approving admin to have approved every Article section and no section may have `changes_requested`. A different reviewer cannot reuse another reviewer's approval. Any stale dependency blocks publication. Publishing is transactional and idempotent.

## Read models

Admin and student previews use the same semantic section renderer. The admin model adds provenance, Idea IDs, dependencies, and review state. The student model omits all internal Idea and provenance identifiers.

When `FEATURE_STRUCTURED_ARTICLE_READER_V1=1`, new Product Bundle submission must use V3 and canonical Article rows are preferred by the student material reader. Disabling the flag restores V2 submission and the legacy reader without deleting V3 data.
