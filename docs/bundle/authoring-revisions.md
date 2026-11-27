# Flexible Idea and Product revisions

Status: `ACTIVE`. Implemented and verified with focused local contracts. Remote migrations, deployment and live-service acceptance remain separate.

## Scope

The revision workflow supports Idea V3 and learning Product V3, V4 and V5. It rejects bundles below V3. Assessment authoring remains in its separate workflow. Existing historical records are not deleted or converted by this feature.

Each editable artifact retains its existing single-chapter scope. A release can combine scoped artifacts within the same canonical course. It does not move content between courses or silently reinterpret a multi-chapter archive as one chapter.

A product or Idea retains its logical identity while its content evolves through reviewed revisions. An immutable admitted ZIP is the transport and historical record; an agent edits a draft through stable-ID operations rather than rebuilding that ZIP itself. The server computes the archive, content hashes, dependencies and changed entity versions.

## Drafts and release manifests

Creating a draft from an existing published import leaves the current publication live. Each draft carries its source import, observed checksum and immutable lineage. Editing and restoration require an exact observed draft revision. A stale revision is a conflict, never permission to overwrite newer work.

A release manifest refers to exact Idea and Product draft imports. It can combine independently validated profiles, including Article/Diktat V4 and standalone Pembahasan V5. Each artifact keeps its own strict schema and required gates. A release does not turn a collection into an Article or remove V4 trusted verification.

Prospective dependency resolution currently covers incoming Ideas and dependencies between Products inside one admitted artifact. A dependency on a not-yet-published Product in another import remains a blocker; the planner must not claim that graph is ready. Existing cross-import dependencies continue to require exact published upstream content.

Publication validates the release manifest and repeats its snapshot and dependency checks under transaction locks. Replacement retires the superseded ownership and promotes the new revisions in one transaction. Failure preserves the old live state. Shared canonical ownership and published dependents require explicit reconciliation; the agent must not silently rewrite another owner's content.

## Editing and impact

For a single-product correction, call `authoring.create_revision` with `entityIds: [productId]` from the observed edit context. Direct patches must target that ID. Check the reported derived-product and print evidence changes before approving the successor bundle.

Operations address entities, sections, blocks, Diktat units and collection items by stable ID. Diktat reads and patches use `unitId` with the exact product parent, without section/block/item selectors. Stable part selectors such as `parts[part-id].markdown` support a small edit; the server refreshes projections and invalidates affected evidence. Array offsets are not stable identities. Scope, stored identity, lineage and computed hashes are server-controlled. Structural edits and explicit provenance changes must pass the complete original validators, including graph and source references. A source change cannot be justified by copying the previous provenance.

The source documents and excerpt archives themselves remain immutable in this editing workflow. Provenance changes must reference admitted active sources. Ingesting a new source follows the source-grounded authoring workflow. Existing V3 rules for unique section and block IDs within an artifact remain enforced; the review persistence also records the owning Product ID.

The release plan reports the exact revision manifest, changed and preserved units, review requirements, affected dependencies, stale evidence, blockers and next actions. Metadata and semantic no-ops must not cause every entity to receive a new version. A changed Article can invalidate its derived Diktat and PDF. The server does not invent replacement Diktat content or a verification receipt.

A Diktat's published PDF key is immutable for its canonical version. Before preserving an unchanged V4 Diktat version, the server verifies a signed proof for its full current print context and exact PDF bytes. Page captures are not required. Cold, old-format, missing or invalid proof advances the print version. A later explicit `purpose: "pdf"` request reuses authenticated unchanged targets and generates changed ones; edits do not automatically render. Publication checks the full canonical projection, current lineage and actual PDF bytes before retaining the original key. An unrelated edit grants neither a logic receipt nor review approval.

If proof disappears or runtime changes after a draft was sealed, use `patch_revision` with `refreshPrintEvidence: true` and `operations: []` on the exact draft. The server reevaluates reuse and creates a successor print version where necessary, without a fake content edit. When the proof still applies, it remains a no-op. Continue with the returned identity and complete current verification and review.

Derived Diktat impact follows each unit's `sourceElementRefs`, containing block/section, related Ideas, sources and visuals. Missing or ambiguous references remain conservative. A changed unit only clears its own requirement. A reviewer can confirm still-correct unchanged units through `derivedContentReviews: [{ entityId, sourceArticleId, expectedArticleHash, unitIds, notes }]`. The hash must match the current Article; unknown units, stale hashes and partial reviews cannot clear other units. The operation requires `authoring:review` in addition to stage scope and records actor, old/new source hashes, unit IDs and substantive notes. Up to 100 review records with 1 to 100 unique unit IDs and 20 to 2000 note characters fit within the existing 512 KiB patch limit. Final review and verification remain required.

Existing review evidence can be reused only when the reviewed unit, applicable parent and source context, reviewer and decision still match. A release decision remains explicit. Changes to structure, prerequisites or provenance can require broader review than a single text field. Reuse is auditable and never amounts to automatic mathematical approval.

Review ancestry uses one bounded recursive lookup plus the selected predecessor's review queries. Section fingerprints include their referenced visuals; an unrelated registry entry no longer invalidates every section. Product source and Idea dependency guards remain conservative.

## Release capacity

The atomic coordinator retains its 16-import resource bound. Plans expose `capacity` with selected/required entry counts, missing dependent owners and `fits`. `REVISION_RELEASE_CAPACITY_EXCEEDED` identifies a dependency closure beyond that bound and does not suggest partial publication. Larger atomic releases still require a separate persisted release-job design with frozen manifests, byte budgets and controlled promotion; this change does not claim to support them.

## MCP lifecycle

The [draft agent workflow update](authoring-agent-workflow.md) adds optional `responseMode: "compact"` for context, create, patch and restore, plus exact `target` selectors on context reads. Compact/target replies retain identity, bounded impact and current execution tokens while marking review/readiness as not evaluated. They skip those review queries but still admit the stored artifact and check its exact scope. Full stays the default. Use full context and the release planner before approval; never infer readiness from a compact edit response.

The Idea and Product injected-transport clients carry successor identity after successful calls and refuse overlapping edits. They reject mismatched exact reads, expose `readFull()` for review, and never replace stale checksums or retry writes. Additive diagnostics distinguish content, conflict, permission and runtime failures while preserving existing error codes and OAuth challenges.

The common tools are `authoring.get_edit_context`, `authoring.create_revision`, `authoring.patch_revision`, `authoring.prepare_revision_verification`, `authoring.plan_release`, `authoring.review_revision`, `authoring.publish_release`, `authoring.list_revisions` and `authoring.restore_revision`. Runtime discovery supplies their schemas, requirements and bounded inputs.

Every meaningful content patch creates an immutable successor draft with a new import ID and checksum. An unchanged patch retains the current draft. The previous unpublished draft becomes superseded; its artifact and reviews remain historical records. Continue with the returned identity. A repeated identical patch against its superseded predecessor resolves to the existing successor instead of creating duplicate work.

When a V4 Product depends on Idea revisions in the same release, call `authoring.prepare_revision_verification` with those exact entries first. The server binds the prospective dependency graph and current live baseline in an immutable audit. Default `purpose: "logic"` verifies this content without a browser or PDF; a changed candidate or baseline invalidates its plan. Authored semantic review binds the logic receipt. Request `purpose: "pdf"` separately for final Diktat artifacts and keep its plan hash separate. Preparation does not generate artifacts or approve content.

Existing-content editing uses its stored artifact and server-derived course and chapter scope. It does not require a new Source Pack, an unexpired original authoring run or draft adoption into a replacement run. A fresh compatible bootstrap, authenticated active canonical admin and the relevant read, stage, review or explicit publication grant remain required. New content still follows the source-grounded authoring workflow.

An agent reads the current context, forks a draft, patches the requested units, inspects the release plan, completes the required evidence and reviews, and explicitly publishes the exact plan. A stale plan requires a fresh read and a new decision. The Admin website is optional.

## History and restoration

History retains immutable admitted artifacts and audit lineage. Restoration creates a new draft based on the historical authored content, with versions rebased against the current live state. It does not rewrite the historical revision or immediately replace the live version. Current source, access, review and verification gates still apply before release.

## Verification boundary

Focused local contracts, application and test type checks, lint and build checks are recorded in the implementation PR. Local mocks and PGlite do not establish deployed MCP availability, OAuth, storage behavior or real multi-session PostgreSQL contention. Deployment and live content publication require their own verified target and evidence.

Local integration covers consecutive Idea releases, CAS and rollback, provenance replacement, historical reactivation, V5 item review reuse, dependency-only edits, mixed Idea/V5 release, fresh V4 Diktat evidence and mixed Idea/V4 verification before promotion. V4 integration uses the actual receipt, persistence, review and publication services with explicitly synthetic renderer observations and memory storage. It does not establish a complete trusted operator run. The reconciled generated migration `0017_quiet_the_hand.sql` remains a prerequisite before rollout.
