# Simpler Article and Diktat authoring

Status: `OPEN / IN PROGRESS`. Draft implementation for review, 2026-11-25. Local code and contract tests do not establish hosted acceptance or measured time/token savings.

## Implemented scope

| Friction | Change | Boundary |
| --- | --- | --- |
| Agent assembles manifests, hashes and ZIP bytes | `authoring.create_product_draft` accepts typed Article/Diktat content and source/Idea IDs. The server loads current references, assigns missing mechanical IDs and constructs the canonical archive. | Initial V4 only; existing admission and staging policy still run. |
| Every edit returns the entire artifact and review state | Opt-in `responseMode: "compact"` on context, create, patch and restore. A `target` selects one stable unit on context reads. | Full remains the default. Integrity and scope still load and validate the stored archive; compact saves response size and review/readiness queries. |
| Agent manually tracks successor IDs and run tokens | `createProductAuthoringClient` wraps existing revision MCP calls through an injected transport. | In-repo helper, not a published SDK. Errors preserve the last observed identity; no automatic write retries, reviews or publication. |
| One validation failure starts another blind loop | Error responses add `category`, `retryable`, `nextAction` and bounded `diagnostics`. Final draft validation preserves all independent issues. | Existing error fields and OAuth challenges remain. Transient failures require a status check before retry. |
| Browser work runs before deterministic findings are resolved | Structure/model checks run first and collect their findings. | Blocked browser/print checks remain `NOT_TESTED`. The requirement matrix and final acceptance are unchanged. |
| PDF renders twice for its file and page images | The PDF check captures every page from the same bytes. The paired image check reuses those captures. | Older executors that return only a PDF keep the separate image execution fallback. |
| Failed attempts rerun successful work | Private signed batch checkpoints bind the exact plan, staging audit, requirement and capture batch. Retries verify metadata and bytes, then copy valid artifacts to the new attempt. | No reuse across changed revisions, references, runtime or browser bindings. Failed and incomplete checks are not proof. |

## Agent path

Discover the current playbook/contract, read published Ideas and admitted source excerpts, then call the advertised `initialDraft` tool. Send a stable `draftKey`, `runToken`, `bootstrapToken` and `draft: { products: [...] }`. The server returns a staged import and checksum without returning the ZIP. Repeating the same input with the same key, run token and bound reference versions produces the same archive. Changed content or updated references under that key cannot overwrite a staged draft; read current context and use the revision tools.

Supply titles, content, Idea IDs, and source/excerpt IDs. Missing entity/section/block/part IDs and order are mechanical. Supply explicit stable IDs when other content needs to reference them. Source selections inherit only from an explicitly selected parent. The server does not invent sources, scientific facts or visual models. Idea weights use equal shares over the explicitly selected IDs with `supporting` roles; review that default before extending the helper to workflows that require weighted teaching priorities.

For a draft edit, read one unit, patch it and continue with the returned successor identity. Read full context at the review boundary and use the release planner for current blockers. `evaluation.review` and `evaluation.readiness` return `not_requested` in a compact response; those fields cannot stand in for approval or publication readiness.

The typed creation path currently supports standalone Articles, standalone Diktats and a Diktat derived from an Article in the same request. Flashcards, V5 collections, binary interactive documents and external Article lineage retain the archive path. Targeted reads do not yet add Diktat-unit addressing.

## MCP and package compatibility

The new tool uses existing `authoring:stage` consent. No new OAuth scope, feature flag or database migration is added. Bootstrap checks run before context or storage access. The context loader limits references to published same-course Ideas, active same-chapter or course-wide sources and their current excerpts, and published same-chapter learning sections. Existing staging and later release checks remain authoritative.

Runtime discovery includes limits, compact response semantics and recovery fields. The MCP tool catalog carries a small input envelope; agents fetch the full checksum-pinned `productDraftInput` schema on demand. The server still parses the complete strict schema before loading references or staging. The Product and pipeline playbooks, repository plugin skill sources and their host prompts use the new path only when advertised by the connected server. Existing archive tools and full responses remain available. Initial authoring remains discoverable through `workflow.get_contract`; `admin.capabilities` continues to advertise its existing revision-only authoring surface.

Repository plugin edits are candidate sources only. The hosted skill build still uses `authoring-skills.lock.json` pins in the separate `zyx-authoring-mcp` repository. Publishing that package, updating its reviewed pin and checking installed hosts remain follow-up work; this PR does not claim those clients have changed.

## Review requested

1. **New draft authority and content:** Confirm source/course/chapter/version checks, deterministic retry identity, unchanged canonical admission, valid generated IDs and Article-to-Diktat lineage. Check whether equal Idea weights meet the intended use.
2. **Revision compatibility:** Confirm full responses remain usable, compact/target reads clearly defer review, successor imports and execution tokens stay bound, and stale/CAS failures cannot become automatic retries.
3. **Evidence trust:** Confirm a checkpoint cannot cross plans, audits, requirements, batches or executor identity; corrupted metadata/bytes rerun; artifacts retain the current attempt prefix; final receipt/PDF attachment checks still reject stale evidence.
4. **Print completeness:** Confirm one PDF yields every required page, preserves the page budget and overflow checks, and cannot approve an incomplete or failed capture. Inspect actual PDF and page images during hosted acceptance.
5. **Agent usability:** Run one new Article, one standalone Diktat and one small edit with the advertised tools. Record tool calls, response bytes, render invocations, wall time and manual recovery steps.

## Continue before making the PR ready

- Complete authenticated staging acceptance with a synthetic authorized draft and real storage, including scope denial, concurrent edits, failed verification retry and final review. The current private local operator deliberately targets its configured production origin; do not relabel that as a staging run or use production data for this PR.
- Add a simple offline draft preview command using the existing renderer, with a persistent local browser session and a manifest of screenshots, outline and diagnostics. Keep exploratory preview separate from the trusted release receipt. This PR optimizes the current verifier but does not ship that standalone preview environment.
- Benchmark a representative short and long Article/Diktat before claiming lower token cost or duration. Measure admitted ZIP reads separately from response size and browser renders.
- Decide whether Diktat unit targeting, binary-asset input and external Article lineage belong in the next typed-draft contract. Preserve reference and asset admission checks in each extension.
- Design any reuse across revisions separately. Split content/runtime fingerprints only with dependency-specific invalidation tests. The exact-plan cache here deliberately does not claim that unrelated edits are safe to ignore.
- Reconcile and publish the separate skill package after review, then test its pinned full/compact catalogs and real host/OAuth setup.
- Review CI and bot comments. Keep this PR a draft until the owner chooses to proceed. No merge, hosted rollout or content publication is part of this handoff.

## Verification record

The local verification record contains 236 passing tests across 25 focused files, including the actual pinned staging skill build and repository candidate package checks. Focused TypeScript checking includes the 35 changed TypeScript source/test files and their imports. ESLint reports no source errors; the repository configuration excludes test files. `git diff --check` passes. The PR description records reproducible commands and any later changes to those results.

Tests exercise typed packaging, database source/Idea binding, internal staging delegation, compact projections, exact selectors, immutable revision replay, diagnostic redaction, cheap-check scheduling, single-PDF capture and signed-checkpoint retry/isolation. The web retry fixture includes the renderer's full output of multiple PNGs plus JSON observations, as well as paginated output.

No learner layout changed. Synthetic checks cover orchestration and evidence handling; they do not establish visual quality of a real chapter. Full application build, live OAuth/storage contention, deployed MCP and installed skill behavior require their own evidence.
