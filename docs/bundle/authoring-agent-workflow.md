# Simpler Idea and Product authoring

Status: `OPEN / IN PROGRESS`. PR #480 continuation, 2026-11-25. Local implementation and repeatable synthetic measurements. Hosted acceptance, installed skill distribution and real time/token savings remain separate release checks.

## Implemented scope

| Friction | Change | Boundary |
| --- | --- | --- |
| Agent builds Idea source records, offsets, metadata and ZIP | `authoring.create_idea_draft` accepts atomic Ideas, teaching sections, explained relations and exact source quotes. The server reads the bound validated Source Pack and builds V3. | All documents and units remain in coverage checks. Ambiguous quotes require a longer unique quote or an exact offset. |
| Agent cannot inspect a raw draft cheaply | `bun run authoring:preview` renders the same Product draft JSON with shared learner and print components, without login, DB or network. `--watch` reuses compiled assets, server and browser. | Local preview, never trusted release evidence. Reports retain exact input hash and honest untested states. |
| Agent assembles Product manifests, hashes and ZIP bytes | `authoring.create_product_draft` accepts typed Article/Diktat content and source/Idea IDs. The server loads current references, assigns missing mechanical IDs and constructs the canonical archive. | Initial V4 only; existing admission and staging policy still run. |
| Every edit returns the entire artifact and review state | Opt-in `responseMode: "compact"` on context, create, patch and restore. A `target` selects one stable unit on context reads. | Full remains the default. Integrity and scope still load and validate the stored archive; compact saves response size and review/readiness queries. |
| Agent manually tracks successor IDs and run tokens | `createIdeaAuthoringClient` and `createProductAuthoringClient` wrap existing revision MCP calls through an injected transport. Exact reads cannot silently adopt a different kind/import/revision; `readFull()` obtains review context. | In-repo helper, not a published SDK. Errors preserve the last observed identity; no automatic write retries, reviews or publication. |
| One validation failure starts another blind loop | Error responses add `category`, `retryable`, `nextAction` and bounded `diagnostics`. Final draft validation preserves all independent issues. | Existing error fields and OAuth challenges remain. Transient failures require a status check before retry. |
| Browser work runs before deterministic findings are resolved | Structure/model checks run first and collect their findings. | Blocked browser/print checks remain `NOT_TESTED`. The requirement matrix and final acceptance are unchanged. |
| PDF renders twice for its file and page images | The PDF check captures every page from the same bytes. The paired image check reuses those captures. | Older executors that return only a PDF keep the separate image execution fallback. |
| Failed attempts rerun successful work | Private signed batch checkpoints bind the exact plan, staging audit, requirement and capture batch. Retries verify metadata and bytes, then copy valid artifacts to the new attempt. | No reuse across changed revisions, references, runtime or browser bindings. Failed and incomplete checks are not proof. |

## Idea authoring

Bootstrap the Idea stage and start an `idea_product` run with the exact validated stored Source Pack. Read `ideaBundle.initialDraft` and fetch `ideaDraftInput` from `ideaBundle.schemaDocuments`. Send a stable `draftKey` and `draft: { ideas, learningSections, relations }`. Each Idea supplies a local key, code, atomic statement, explanation, kind, role and exact quotes addressed by document ID and source-unit number. Sections and relations use those local keys. The server derives identity, provenance, attribution, timestamps, versions, source records, hashes and ZIP.

Source pack ID, import, checksum, status, quality report, course and chapter must match the run. Spans use JavaScript UTF-16 offsets into LF-normalized text, matching the canonical validator; embedded source bytes and their checksums remain intact. Aggregate reference, document, unit, archive-file and byte limits fail before staging. Canonical V3 and quality validation still run before the original admission/staging service.

The Idea playbook now links to runtime schemas instead of repeating unsupported relation names, wrong section/provenance fields and an incomplete manifest. This removes avoidable repair loops. Every source unit remains visible, but 100% unit coverage is not proof that all concepts within every unit were covered. Review must still assess atomicity, meaning, completeness, prerequisites and evidence.

## Product authoring

Discover the current playbook/contract, read published Ideas and admitted source excerpts, then call the advertised `initialDraft` tool. Send a stable `draftKey`, `runToken`, `bootstrapToken` and `draft: { products: [...] }`. The server returns a staged import and checksum without returning the ZIP. Repeating the same input with the same key, run token and bound reference versions produces the same archive. Changed content or updated references under that key cannot overwrite a staged draft; read current context and use the revision tools.

Supply titles, content, Idea IDs, and source/excerpt IDs. Missing entity/section/block/part IDs and order are mechanical. Supply explicit stable IDs when other content needs to reference them. Source selections inherit only from an explicitly selected parent. The server does not invent sources, scientific facts or visual models. Optional `ideaLinks: [{ id, weight, role }]` preserves authored priorities for exactly the selected `ideaIds`; the server still owns reference versions and hashes. Without that field, equal shares and `supporting` roles remain compatible. Invalid sums, duplicates, missing/extra IDs and forged metadata are rejected.

For a draft edit, read one unit, patch it and continue with the returned successor identity. Read full context at the review boundary and use the release planner for current blockers. `evaluation.review` and `evaluation.readiness` return `not_requested` in a compact response; those fields cannot stand in for approval or publication readiness.

The typed creation path currently supports standalone Articles, standalone Diktats and a Diktat derived from an Article in the same request. Flashcards, V5 collections, binary interactive documents and external Article lineage retain the archive path. Read or patch one Diktat unit with `{ entityType: "diktat", entityId, unitId }`, without section/block/item selectors. Address its parts with stable paths such as `parts[summary-part].markdown`. The server rebuilds projections and hashes and invalidates affected review and print evidence.

## Preview the same draft JSON

```sh
bun run authoring:preview --input /absolute/path/draft.json --out artifacts/authoring-preview
bun run authoring:preview --input /absolute/path/draft.json --out artifacts/authoring-preview --watch
```

Use `--check` for structural checks and an outline without a browser. `--example short` and `--example long` create deterministic examples. `--executable-path /path/to/chromium` selects a local browser explicitly; its recorded version does not change trusted release pins. The raw input is the same `productDraftInput` object sent to the creation tool, without fake source hashes or preview-only fields.

`preview-report.json` records input hash, check states, issues, timing, browser launches, PDF renders and capture paths. `outline.json` lists teaching order, objectives, Ideas and parts. Article captures cover 380 by 844 and 1536 by 864 in both themes. Diktat output includes the actual PDF and every page image from its bytes, with page-budget and overflow checks.

The server binds loopback only and serves fixed in-memory routes under a random prefix. Browser requests outside that route are blocked. Input/output aliases are rejected; report writes use exclusive temporary files and atomic rename. Missing browser setup is a runtime issue, not an instruction to rewrite the draft. Watch replaces stale success on invalid edits and keeps one browser alive between valid edits.

Preview explicitly leaves live references, human visual review and publication unverified. Server grading, coding execution and saved progress require hosted checks. Binary figures and HTML documents use the admitted-asset verifier. Inspect the initial render locally, then inspect all required control states and PDF evidence through the trusted verifier before release.

## Repeatable measurement

```sh
bun scripts/authoring/benchmark-agent-workflow.ts
```

The benchmark uses actual builders, response projections and verification coordinators with deterministic synthetic content, storage and renderer observations. It measures JSON bytes and executor calls, not model tokens, money, duration, live DB/storage or visual quality.

| Response | Short example | Long example |
| --- | ---: | ---: |
| Full context | 19,483 bytes | 138,362 bytes |
| Compact context | 443 bytes | 443 bytes |
| One selected block | 1,325 bytes | 1,325 bytes |
| Compact reduction | 97.73% | 99.68% |
| Selected-block reduction | 93.20% | 99.04% |

The PDF scenario reduces PDF calls from 2 to 1 and retains all 10 requirements. After an interruption, retry uses 5 executor calls instead of 8 and retains all 8 requirements. Failed structural preflight starts no browser work and records blocked checks as untested.

Direct JSON is not always smaller than ZIP transport: these examples use 9,537/81,078 bytes of author input versus 6,884/12,716 bytes of ZIP base64. The creation benefit is removing metadata/hash/archive work. Do not report response or call reductions as measured token or monetary savings.

## MCP and package compatibility

Both creation tools use existing `authoring:stage` consent. No new OAuth scope, feature flag or database migration is added. Bootstrap checks run before context or storage access. The context loader limits references to published same-course Ideas, active same-chapter or course-wide sources and their current excerpts, and published same-chapter learning sections. Existing staging and later release checks remain authoritative.

Runtime discovery includes limits, compact response semantics and recovery fields. The MCP tool catalog carries small input envelopes; agents fetch full checksum-pinned `ideaDraftInput` and `productDraftInput` schemas on demand. Idea descriptors use `/api/authoring/contracts/idea-v3`. The server still parses the complete strict schema before loading references or staging. The Idea, Product and pipeline playbooks, repository plugin skill sources and their host prompts use the new path only when advertised by the connected server. Existing archive tools and full responses remain available. Initial authoring remains discoverable through `workflow.get_contract`; `admin.capabilities` continues to advertise its existing revision-only authoring surface.

Repository plugin edits are candidate sources only. The hosted skill build still uses `authoring-skills.lock.json` pins in the separate `zyx-authoring-mcp` repository. Publishing that package, updating its reviewed pin and checking installed hosts remain follow-up work; this PR does not claim those clients have changed.

## Review requested

1. **New draft authority and content:** Confirm source/course/chapter/version checks, deterministic retry identity, unchanged canonical admission, valid generated IDs and Article-to-Diktat lineage. Check the optional authored Idea weights and compatible equal-share default.
2. **Revision compatibility:** Confirm full responses remain usable, compact/target reads clearly defer review, successor imports and execution tokens stay bound, and stale/CAS failures cannot become automatic retries.
3. **Evidence trust:** Confirm a checkpoint cannot cross plans, audits, requirements, batches or executor identity; corrupted metadata/bytes rerun; artifacts retain the current attempt prefix; final receipt/PDF attachment checks still reject stale evidence.
4. **Print completeness:** Confirm one PDF yields every required page, preserves the page budget and overflow checks, and cannot approve an incomplete or failed capture. Inspect actual PDF and page images during hosted acceptance.
5. **Agent usability:** Run one new Article, one standalone Diktat and one small edit with the advertised tools. Record tool calls, response bytes, render invocations, wall time and manual recovery steps.

## Continue before making the PR ready

- Complete authenticated staging acceptance with a synthetic authorized draft and real storage, including scope denial, concurrent edits, failed verification retry and final review. The current private local operator deliberately targets its configured production origin; do not relabel that as a staging run or use production data for this PR.
- Measure real short and long chapter authoring before claiming lower token cost or duration. The synthetic response/executor benchmark above does not measure model tokens, money, wall time or live storage. Compare quality with the same source and a blind rubric for correctness, coverage, teaching order and readability.
- Decide whether binary-asset input and external Article lineage belong in the next typed-draft contract. Preserve reference and asset admission checks in each extension.
- Design any reuse across revisions separately. Split content/runtime fingerprints only with dependency-specific invalidation tests. The exact-plan cache here deliberately does not claim that unrelated edits are safe to ignore.
- Reconcile and publish the separate skill package after review, then test its pinned full/compact catalogs and real host/OAuth setup.
- Review CI and bot comments before marking the PR ready. Keep the draft status while the authenticated staging acceptance above is incomplete. Deployment and content publication require their own verified run.

## Verification record

The initial PR recorded 265 passing tests across 27 focused files. The continuation adds direct Idea, descriptor, client, unit-edit, preview and measurement checks; the current PR verification record supersedes the initial counts. Pinned staging and repository-candidate skill builds remain distinct. Focused TypeScript checking includes changed TypeScript source/test files and their imports. The repository ESLint configuration excludes test files. Initial CI identified two older test fixtures that needed the new tool name and production-compatible missing-object errors; both affected contracts now pass. The PR description records reproducible commands, current test/type/visual results and the latest CI status.

Tests exercise typed packaging, database source/Idea binding, internal staging delegation, compact projections, exact selectors, immutable revision replay, diagnostic redaction, cheap-check scheduling, single-PDF capture and signed-checkpoint retry/isolation. The web retry fixture includes the renderer's full output of multiple PNGs plus JSON observations, as well as paginated output.

The continuation's latest local results total 342 passing tests across 37 focused files. Root ran the actual offline preview for short and long synthetic drafts with Chromium 158.0.8127.0 selected explicitly. Both commands returned exit 0. A follow-up PostgreSQL PDF fixture now models the private storage adapter's wrapped NoSuchKey/404 response; permission and transport errors still propagate. Root opened all eight Article screenshots at 380 by 844 and 1536 by 864 in light/dark themes, plus both Diktat page images. Final captures show complete formulas, visible function curves and the long example's offscreen scene with controls, without horizontal overflow or browser errors. This found and fixed an early theme-init error, deferred visuals missing from full-page captures, and JSXGraph's eval-dependent identity function under the strict local CSP. The preview host now uses its interpreter; the production renderer and trusted browser pin are unchanged.

No learner layout changed. Synthetic checks cover orchestration and evidence handling; they do not establish visual quality of a real chapter. Live OAuth/storage contention, deployed MCP and installed skill behavior require their own evidence. The current PR records actual typecheck, visual and CI results separately from synthetic tests.
