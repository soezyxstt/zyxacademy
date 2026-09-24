# Product Bundle V3 Contract

Status: `ACTIVE` behind `FEATURE_STRUCTURED_ARTICLE_READER_V1` for new submission and structured review. V2 remains readable during transition.

## Article structure

An Article V3 stores `sections` and has no flat root blocks. A section contains stable identity, kind, title, slug, order, optional parent, learning objective, Idea links, source references, and semantic blocks. `topic` requires exactly one `learningSectionId`. `overview` and `summary` may synthesize multiple Ideas without one learning section.

Each block stores `contentMarkdown`, `blockType`, optional title, Idea IDs, and source references as fields. Metadata is never embedded in Markdown. The compiler preserves block types in the semantic AST and derives `artikel.contentMarkdown` deterministically for compatibility, search, and vector indexing.

## Quality gates

- Every Idea is covered and traceable to a source.
- Every topic has a learning objective, core explanation, understanding check, and provenance.
- Examples, analogies, visuals, formulas, misconceptions, and warnings are required only when pedagogically relevant.
- Each topic declares a structured learning-time estimate for reading, examples, and practice. Completeness is judged against its objectives, not a fixed word count or reading-duration target.
- A chapter has overview, synthesis or summary, and a final understanding check.
- Pedagogy metadata binds objectives to explanation and formative-check blocks, declares prerequisites and symbols, and records whether a visual is required or not relevant.
- Formative checks are learning interactions only. `checkKind` supports `multiple_choice`, `short_answer`, `numeric_answer`, and `conceptual_explanation`. An optional typed `evaluation` uses `choice`, `text_exact`, `numeric`, or `ai_rubric` respectively. Without `evaluation`, the published check remains readable and reveal-only.
- `feedbackPolicy` is optional and may contain up to three progressive hints plus `allowRetry`. Evaluation and reveal routes authorize the published Article version and course enrollment, and never write attempts, grades, mastery, or assessment rows.
- Required visuals use typed, non-executable payloads. A mathematically sampled graph is explanatory evidence only and never replaces an analytic proof.
- MCP quality reports warn when a graph-relevant section has no linked visual, when one display formula joins multiple relations with commas, or when explanatory passages, worked-example steps, and verification repeat within a section. These warnings require editorial review; they do not prove a visual is always necessary or automatically rewrite content.
- Display formulas may use a short Markdown list with one relation per item. The quality count preserves mathematical inequalities such as `x<1` and does not mistake commas inside set notation for a crowded formula.

## Review, edit, and publication

`review_item_bundle` identifies `targetType` and `targetId`. V3 Article review targets `article_section`; the V2 block endpoint remains an adapter for `article_block`.

Admin edits require `expectedRevision`, accept only safe content fields, recompute generation hashes and bundle checksum, preserve approval for unchanged sections, reset changed section approval, and mark an Article to Diktat dependency `STALE`. Stable IDs, provenance, and lineage identity cannot be edited.

Publication requires the approving admin to have approved every Article section and all eight pedagogic criteria against the current content fingerprint and policy version. A different reviewer cannot reuse another reviewer's approval. Missing or stale approvals, stale dependencies, failed visual contracts, and missing, failed, or stale Diktat PDF evidence block publication. Publishing is transactional and idempotent.

The Diktat PDF worker compiles only the linked Article and Diktat revision, renders formulas fail-closed, records renderer and print-profile identity, verifies a 2 to 4 page PDF, then stores revision-bound evidence outside the ZIP. Admins may render, retry, and preview this artifact. Students may download the published PDF only when authorized for the course. The generic storage proxy cannot expose protected Product Diktat keys.

## Read models

Admin and student previews use the same semantic section renderer. The admin model adds provenance, Idea IDs, dependencies, and review state. The student model omits all internal Idea and provenance identifiers.

When `FEATURE_STRUCTURED_ARTICLE_READER_V1=1`, new Product Bundle submission must use V3. The student material reader always prefers published canonical Article rows. Disabling the flag restores V2 submission without deleting V3 data or hiding published products.
