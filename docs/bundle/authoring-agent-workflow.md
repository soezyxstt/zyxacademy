# Simpler Idea and Product authoring

Status: `ACTIVE`. Updated 2026-11-26 with compact discovery, typed V4/V5 creation and exact-target proof reuse. Local synthetic measurements do not establish hosted latency, token billing, visual quality or installed-host refresh.

## Implemented scope

| Friction | Change | Boundary |
| --- | --- | --- |
| Agent builds Idea source records, offsets, metadata and ZIP | `authoring.create_idea_draft` accepts atomic Ideas, teaching sections, explained relations and exact source quotes. The server reads the bound validated Source Pack and builds V3. | All documents and units remain in coverage checks. Ambiguous quotes require a longer unique quote or an exact offset. |
| Agent cannot inspect a raw draft cheaply | `bun run authoring:preview` renders the same Product draft JSON with shared learner and print components, without login, DB or network. `--watch` reuses compiled assets, server and browser. | Local preview, never trusted release evidence. Reports retain exact input hash and honest untested states. |
| Agent assembles Product manifests, hashes and ZIP bytes | `authoring.create_product_draft` accepts Article, Diktat, flashcard/set and standalone V5 collection content with source/Idea IDs. The server binds references and creates the archive. | Initial V4 or one V5 collection; canonical admission and staging still run. |
| Every edit returns the entire artifact and review state | Opt-in `responseMode: "compact"` on context, create, patch and restore. A `target` selects one stable unit on context reads. | Full remains the default. Integrity and scope still load and validate the stored archive; compact saves response size and review/readiness queries. |
| Agent manually tracks successor IDs and run tokens | `createIdeaAuthoringClient` and `createProductAuthoringClient` wrap existing revision MCP calls through an injected transport. Exact reads cannot silently adopt a different kind/import/revision; `readFull()` obtains review context. | In-repo helper, not a published SDK. Errors preserve the last observed identity; no automatic write retries, reviews or publication. |
| One validation failure starts another blind loop | Error responses add `category`, `retryable`, `nextAction` and bounded `diagnostics`. Final draft validation preserves all independent issues. | Existing error fields and OAuth challenges remain. Transient failures require a status check before retry. |
| Browser work runs before deterministic findings are resolved | Structure/model checks run first and collect their findings. | Blocked browser/print checks remain `NOT_TESTED`. The requirement matrix and final acceptance are unchanged. |
| PDF renders twice for its file and page images | The PDF check captures every page from the same bytes. The paired image check reuses those captures. | Older executors that return only a PDF keep the separate image execution fallback. |
| Failed attempts or unrelated edits repeat rendering | Signed checkpoints and target proofs verify metadata and bytes before copying artifacts to a new exact-plan attempt. | Reuse needs the same target, relevant upstream graph, assets, environment, course, revision root and runtime. Structure always reruns. Cold, incomplete or damaged proof rerenders. |

## Idea authoring

Bootstrap the Idea stage and start an `idea_product` run with the exact validated stored Source Pack. Read `ideaBundle.initialDraft` and fetch `ideaDraftInput` from `ideaBundle.schemaDocuments`. Send a stable `draftKey` and `draft: { ideas, learningSections, relations }`. Each Idea supplies a local key, code, atomic statement, explanation, kind, role and exact quotes addressed by document ID and source-unit number. Sections and relations use those local keys. The server derives identity, provenance, attribution, timestamps, versions, source records, hashes and ZIP.

Source pack ID, import, checksum, status, quality report, course and chapter must match the run. Spans use JavaScript UTF-16 offsets into LF-normalized text, matching the canonical validator; embedded source bytes and their checksums remain intact. Aggregate reference, document, unit, archive-file and byte limits fail before staging. Canonical V3 and quality validation still run before the original admission/staging service.

The Idea playbook now links to runtime schemas instead of repeating unsupported relation names, wrong section/provenance fields and an incomplete manifest. This removes avoidable repair loops. Every source unit remains visible, but 100% unit coverage is not proof that all concepts within every unit were covered. Review must still assess atomicity, meaning, completeness, prerequisites and evidence.

## Product authoring

Discover the current playbook/contract, read published Ideas and admitted source excerpts, then call the advertised `initialDraft` tool. Send a stable `draftKey`, `runToken`, `bootstrapToken` and `draft: { products: [...] }`. The server returns a staged import and checksum without returning the ZIP. Repeating the same input with the same key, run token and bound reference versions produces the same archive. Changed content or updated references under that key cannot overwrite a staged draft; read current context and use the revision tools.

Supply titles, content, Idea IDs, and source/excerpt IDs. Missing entity/section/block/part IDs and order are mechanical. Supply explicit stable IDs when other content needs to reference them. Source selections inherit only from an explicitly selected parent. The server does not invent sources, scientific facts or visual models. Optional `ideaLinks: [{ id, weight, role }]` preserves authored priorities for exactly the selected `ideaIds`; the server still owns reference versions and hashes. Without that field, equal shares and `supporting` roles remain compatible. Invalid sums, duplicates, missing/extra IDs and forged metadata are rejected.

For a draft edit, read one unit, patch it and continue with the returned successor identity. Read full context at the review boundary and use the release planner for current blockers. `evaluation.review` and `evaluation.readiness` return `not_requested` in a compact response; those fields cannot stand in for approval or publication readiness.

The typed path supports Articles, Diktats, same-request Article lineage, flashcards/sets and a standalone V5 collection. A flashcard supplies one Idea, front/back and optional explanation/setId. A set may omit cards to derive membership from same-request setId links. A V5 collection supplies title/items; the server binds current active course/chapter titles and missing mechanical IDs, while options keep explicit IDs. Canonical V5 provenance, static content and standalone-profile rules still apply. The request permits 256 products, at most 16 Articles/Diktats and 512 KiB. Binary interactive documents and external Article lineage retain the archive path.

Read or patch one Diktat unit with `{ entityType: "diktat", entityId, unitId }`, without section/block/item selectors. Address parts with stable paths such as `parts[summary-part].markdown`. The server rebuilds projections/hashes and invalidates affected evidence. An initial draft without revision lineage advertises `create_revision` before patching.

## Compact discovery and contract reuse

Opt-in compact `list_imports` supports course/chapter/query/statuses/headsOnly and a filter-bound keyset cursor. It selects summaries in one database query, without ZIP reads or readiness evaluation. Heads retain the live import and latest editable candidate per lineage. Compact `get_import` returns metadata; inventory and readiness are explicit projections. Full legacy response shapes remain available. Full Product reads share the admitted row/bundle and computed readiness within the request.

Compact playbooks return changed module bodies once; `knownModuleChecksums` refers to already retained content. Compatibility and bootstrap remain fresh. Compact contracts select the active stage and Product profile, omit the duplicate pilot body and support `knownViewChecksum` for that exact view. Descriptor checksums still pin schemas. Content caching never authorizes writes or replaces tokens.

### Measured response sizes, 2026-11-26

The current contract fixtures measure UTF-8 JSON bytes. Playbook measurements use the same API, actor and bootstrap envelope. Cached requests retain previously verified document bytes; bootstrap and run checks remain current.

| Fixture | Full or baseline | Compact | Cached compact |
| --- | ---: | ---: | ---: |
| Product playbook, six modules | 125,085 B | 64,882 B (48.1% less) | 4,835 B (96.1% less) |
| Product workflow contract, V4 projection | 76,103 B | 46,755 B (38.6% less) | 3,102 B (95.9% less) |
| Twenty stored import rows versus metadata projection | 212,386 B | 12,579 B (94.1% less) | Not applicable |

The import baseline is the synthetic stored-row fixture, not the old full MCP response. Unfiltered discovery makes one query and zero ZIP reads. Course filtering also resolves course identity. An admitted compact patch reads the predecessor ZIP once; exact retry reads its existing successor. The warm card-edit integration needs only the structural executor check and no new PDF render; it still produces a new receipt for all current requirements. Missing proof advances the print version. These measurements do not establish hosted latency, token charges, money saved or teaching quality.

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

The hosted skill build uses `authoring-skills.lock.json` pins in the separate `zyx-authoring-mcp` repository. [Package PR #3](https://github.com/soezyxstt/zyx-authoring-mcp/pull/3) released staging 0.5.2 after bot review completed without findings, advancing the older six-skill staging package to all 12 workflows. The staging lock now selects its merge commit `dcb6098002e4e730f7da610d6c13417388cd45fc`; the production lock is unchanged. Package source, external release, server build and installed-host refresh are distinct states; this PR does not claim installed clients or deployed servers have changed.

## Twelve-skill refresh

Release 0.5.2 updates every skill and its host prompt against the current runtime:

| Skill | Main change |
| --- | --- |
| `zyx-authoring-pipeline` | Start at the needed stage, reuse valid context and choose the advertised draft path. |
| `zyx-source-pack-mcp` | Use actual manifest fields, source-unit markers, original-byte hashes and complete coverage evidence; resume extraction without blind rework. |
| `zyx-idea-bundle-mcp` | Author atomic Ideas and exact quotes while the server builds mechanical fields and archives. |
| `zyx-product-bundle-mcp` | Preview the same Article/Diktat input, retain archive paths for unsupported content and review the final canonical artifact. |
| `zyx-content-revisions` | Find stored imports without an old run, read one stable target, then review full current context and follow the profile's evidence requirements. |
| `zyx-question-authoring-mcp` | Use the runtime draft example, published Idea links and actual bank gaps; original questions remain drafts. |
| `reference-question-ingest` | Use legitimate private file-key arguments, strict payload fields and honest provenance; historical essays stay outside quiz assembly. |
| `zyx-blog-mcp` | Search metadata first, validate actual create/edit shapes and distinguish draft creation from live published edits. |
| `zyx-forms-mcp` | Preserve full definitions, simulate without submitting responses and inspect Sheets conflicts even when a job succeeds. |
| `zyx-media-mcp` | Resolve public serving paths, respect the bounded upload job and verify assets after manual reconciliation. |
| `zyx-admin-operations` | Discover only relevant domains and use the exact environment, scopes, signed plan and request identity. |
| `zyx-operation-recovery` | Separate database receipts, provider outcomes and authoring revisions; preserve original operation identity before retry. |

Runtime playbooks were corrected with the skills. The complete Source Pack example and historical-reference example now pass their actual validators. Product V4 examples use typed fields; obsolete provenance and assessment fields no longer cause preventable repair loops. Packaging tests cover all 12 host prompts and verify version substitution in both JSON-style and prose bootstrap instructions when the next release version changes.

Compared with the previous PR head, Idea and Product skill files plus host prompts shrink from 21,151 to 17,467 UTF-8 bytes (17.4%). All 12 pairs total 70,458 bytes versus 70,978 previously, including added recovery and evidence rules. These are instruction-file measurements, not measured tokens, costs or teaching quality. Independent source review and six read-only workflow walkthroughs checked stage selection, standalone Diktat, existing-unit revisions, historical ingest and admin recovery. They do not replace a hosted run.

## Review requested

1. **New draft authority and content:** Confirm source/course/chapter/version checks, deterministic retry identity, unchanged canonical admission, valid generated IDs and Article-to-Diktat lineage. Check the optional authored Idea weights and compatible equal-share default.
2. **Revision compatibility:** Confirm full responses remain usable, compact/target reads clearly defer review, successor imports and execution tokens stay bound, and stale/CAS failures cannot become automatic retries.
3. **Evidence trust:** Confirm a checkpoint cannot cross plans, audits, requirements, batches or executor identity; corrupted metadata/bytes rerun; artifacts retain the current attempt prefix; final receipt/PDF attachment checks still reject stale evidence.
4. **Print completeness:** Confirm one PDF yields every required page, preserves the page budget and overflow checks, and cannot approve an incomplete or failed capture. Inspect actual PDF and page images during hosted acceptance.
5. **Agent usability:** Run one new Article, one standalone Diktat and one small edit with the advertised tools. Record tool calls, response bytes, render invocations, wall time and manual recovery steps.

## Remaining hosted acceptance

- Complete authenticated staging acceptance with a synthetic authorized draft and real storage, including scope denial, concurrent edits, failed verification retry and final review. The current private local operator deliberately targets its configured production origin; do not relabel that as a staging run or use production data for this PR.
- Measure real short and long chapter authoring before claiming lower token cost or duration. The synthetic response/executor benchmark above does not measure model tokens, money, wall time or live storage. Compare quality with the same source and a blind rubric for correctness, coverage, teaching order and readability.
- Decide whether binary-asset input and external Article lineage belong in the next typed-draft contract. Preserve reference and asset admission checks in each extension.
- Exercise the scoped revision proof cache with real storage and renderer output. Local tests cover target/upstream changes, assets, course, revision root, runtime changes, tampered bytes and proof disappearance after a draft is sealed. They do not establish hosted hit rates or visual quality.
- Check the refreshed package in installed hosts and their OAuth sessions. The reviewed external staging release and exact source pin are complete; a server build alone does not establish host acceptance.
- Review CI and bot comments on the latest commit before merging to staging. The owner marked PR #480 ready for review on 2026-11-25 while the skill update was in progress. A code merge does not run the authenticated checks above or deploy the application; deployment and content publication retain their own verification.

## Prior verification record

The initial PR recorded 265 passing tests across 27 focused files. The continuation adds direct Idea, descriptor, client, unit-edit, preview and measurement checks; the current PR verification record supersedes the initial counts. Pinned staging and repository-candidate skill builds remain distinct. Focused TypeScript checking includes changed TypeScript source/test files and their imports. The repository ESLint configuration excludes test files. Initial CI identified two older test fixtures that needed the new tool name and production-compatible missing-object errors; both affected contracts now pass. The PR description records reproducible commands, current test/type/visual results and the latest CI status.

The subsequent 12-skill refresh passed 15 Python distribution tests and 69 tests across 10 focused Bun contract files, using the latest result for each file. Both environment packages built with 35 allowlisted files. The staging release check accepted the 0.4.1 to 0.5.2 advance. The new executable playbook examples cover original bytes, hashes, coverage and strict assessment eligibility. Final review corrected conditional V4 PDF evidence, the 100-import search limit, media lookup after reconciliation and Sheets confirmation after a successful job. Focused TypeScript checking, source lint and diff checks passed. After the external package merged, a normal locked staging build succeeded; a local MCP HTTP smoke read and hash-checked the full catalog (12 skills, 24 files) and compact catalog (one router, 25 files). This exercised the released commit with staging identity, not a workspace-candidate manifest or an installed host.

Tests exercise typed packaging, database source/Idea binding, internal staging delegation, compact projections, exact selectors, immutable revision replay, diagnostic redaction, cheap-check scheduling, single-PDF capture and signed-checkpoint retry/isolation. The web retry fixture includes the renderer's full output of multiple PNGs plus JSON observations, as well as paginated output.

The continuation's latest local results total 342 passing tests across 37 focused files. A PostgreSQL PDF fixture models the private storage adapter's wrapped NoSuchKey/404 response; permission and transport errors still propagate. The local preview handles theme initialization and deferred visual rendering. JSXGraph uses its interpreter under the preview's strict local CSP; the production renderer and trusted browser pin are unchanged.

No learner layout changed. Synthetic checks cover orchestration and evidence handling; they do not establish visual quality of a real chapter. Live OAuth/storage contention, deployed MCP and installed skill behavior require their own evidence. The current PR records actual typecheck, visual and CI results separately from synthetic tests.
