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

Admin draft editing accepts only safe textual and ordering fields with `expectedRevision`. Stable IDs, Idea membership, provenance, and lineage cannot be edited. The server rebuilds checksums after an accepted edit. Admin and headless approval require explicit decisions for every Idea, bound to the exact revision and item hashes. The publishing admin must be the reviewer who recorded the complete approval.

## MCP transition

`workflow.get_contract`, validation, submission, Context Pack, and Job Pack advertise V3. Readers accept V2 and V3. When `FEATURE_STRUCTURED_ARTICLE_READER_V1=1`, new Idea Bundle submission must use V3. Disabling the flag restores V2 submission without deleting V3 artifacts.

## Headless revision lifecycle

`authoring.withdraw_idea_bundle` accepts the same `runToken`, `bootstrapToken`, `importId` and exact `expectedRevision` identity as publication, with `authoring:withdraw`. The active authenticated admin is server-derived. Withdrawal uses the shared transactional lifecycle, preserves canonical entities owned by other published imports, and permits idempotent retries. No Admin website visit is required.

For an old published import whose run expired, omit `runToken` and explicitly send `recovery: "exact_import"` with a fresh Idea `bootstrapToken`, the import ID and its observed checksum. This withdrawal-only recovery verifies the validated artifact, course mapping, active actor and exact snapshot; it requires no Source Pack or new authoring run. It cannot review, publish or restage content. A supplied run token is still checked normally and is never silently bypassed.

`authoring.get_idea_review_context`, `authoring.review_idea_revision` and `authoring.publish_idea_bundle` use the authenticated admin, locked course/chapter run, Idea bootstrap and exact `expectedRevision`. Publication requires explicit `authoring:publish` consent and a complete current per-Idea review. The publishing admin's own exact-revision approval and complete item evidence determine eligibility. Another reviewer's rejection remains in history and the latest-decision status, but does not veto that approval. An identical publication retry is idempotent.

Draft replacement through MCP or Admin carries the caller's last-read checksum into `stageIdeaBundle` as `expectedPreviousChecksum`. The service locks the bundle identity and import row and checks that checksum before clearing reviews or writing a revision. Submission without a replacement identity creates a new bundle only. Before replacement bytes are processed, MCP also checks the target draft's checksum, course and complete chapter scope. Ideas, learning sections and chapter-scoped sources in both the target and replacement must match the run chapter before staging. Content-addressed objects from failed or superseded staging are retained for reference-aware cleanup, preventing a concurrent retry from deleting an active object.

MCP Idea and Product submission and restaging check any supplied or run-bound bootstrap against the authenticated actor and session before processing the artifact.

Discard removes the current draft and records its audit in one row-locked transaction. It retains shared artifact bytes for reference-aware garbage collection, including concurrent discard retries.

Admin item review, whole-bundle review and publication require the checksum displayed with the reviewed artifact. Item decisions are audited against that checksum, and the row-locked whole-bundle review records the same revision and item-hash evidence used by headless publication. Missing, stale or unaudited item decisions cannot approve a bundle. Replacement clears saved item decisions as well as bundle reviews. A legacy bundle-only approval does not become revision evidence; the reviewer must explicitly reaffirm it with every item decision in detailed Admin review or the headless revision review flow. Identical publication retries remain idempotent.

Scoped Idea and Product lifecycle tools require a run whose bootstrap was already bound to the authenticated actor and session by `workflow.start`. A newly supplied bootstrap does not upgrade an unbound legacy run. On `AUTHORING_MCP_LEGACY_RUN_RESTART_REQUIRED`, obtain a fresh playbook and restart the run through the catalog with the same scope and source. Existing legacy-compatible reads and submissions retain their explicitly permitted transition behavior.

An unchanged legacy bundle-only decision can be reaffirmed with complete item decisions even after another reviewer changes the global status. The reviewer must retain their original decision and notes. Admin exposes whether the current reviewer has revision evidence; those item controls are locked only once that evidence exists, so legacy reaffirmation remains available.

Unsaved item-note changes block bundle confirmation until the reviewer saves the item decision or explicitly discards the note changes. Reloaded and locked reviews display server-saved notes for the active checksum. Legacy confirmation displays the reviewer's original approval or rejection before reaffirmation. Product validation checks every Idea link on every Product; only database lookup IDs are deduplicated.

The Admin Idea editor blocks navigation, publication and review mutation until content is saved or explicitly cancelled. Cancel restores the saved draft; save locks every editor field until its exact submitted snapshot has completed.

Admin review workspaces guard same-origin links and browser Back and Forward, including query-driven views, while review or content changes are unsaved, and warn on reload or tab close. Pending requests and their context refresh must finish before leaving. Changed Idea content requires confirmation when it invalidates existing reviewers’ decisions; unchanged content saves do not restage.

Admin detail returns `reviewReset` with `revision`, `itemReviewCount`, `bundleReviewCount`, and an opaque keyed `fingerprint`. Counts cover every review row, including pending rows and other reviewers, without exposing their notes. A changed save sends `expectedRevision` and, after explicit confirmation of review deletion, `reviewResetFingerprint`. The shared staging transaction compares both under the import lock before deleting reviews. `IDEA_BUNDLE_REVIEW_RESET_REQUIRED` and `IDEA_BUNDLE_REVIEW_RESET_STALE` return HTTP 409; reload the summary and obtain a fresh explicit decision. A concurrent review can require confirmation even when the first summary was empty. The Admin refreshes the aggregate without replacing a local draft; if the revision changed, it keeps the old checksum and asks before discarding the draft to load the new revision. An unchanged replacement is a locked no-op and does not require reset acknowledgement.

Headless callers read the same aggregate from `authoring.get_import` as `import.reviewReset` and explicitly pass `reviewResetFingerprint` to `authoring.restage_idea_bundle`. The same reset errors include retry guidance. No browser interaction is required.
