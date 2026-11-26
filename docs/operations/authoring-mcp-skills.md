# Authoring MCP skills distribution

Status: `ACTIVE`

The server serves a build-time snapshot of the separate `soezyxstt/zyx-authoring-mcp` repository. `authoring-skills.lock.json` pins a full Git commit for each environment. Builds fetch that commit once, reject dirty checkouts, verify environment-specific connection instructions, and write `dist/skills/manifest.json`, resource files, and `chatgpt-skills.zip`. No request fetches GitHub. The existing plugin mirror still publishes from this repository; updating the mirror does not update the server pin automatically.

The package keeps all 12 workflows and gives every rendered staging skill a `-stg` suffix; production skill names stay unsuffixed. The canonical source keeps unsuffixed role names and supports both renders. `authoring-skills.lock.json` records each reviewed external source commit. The staging and production pins remain separate. See [agent-first content operations](agent-first-content.md). `Sync Zyx Authoring MCP Plugin` validates both renders and their disjoint identities before a manually dispatched mirror; changing package content does not update a server pin or installed host automatically.

The staging entry in `authoring-skills.lock.json` is the authority for the external source commit used by the build. Read the matching release manifest for its version and payload digest. The production entry remains unchanged by this staging release. A normal pinned build, the deployed endpoint and the host's installed package each require their own verification.

## Catalogs and more than five skills

- `POST /api/mcp/authoring` defaults to the `chatgpt` catalog. It lists one environment-specific router, `zyx-authoring-stg` for staging or `zyx-authoring` for production, containing every rendered skill and supporting file under `references/<published-skill-name>/`. Original bytes and sibling-directory links are preserved. The router selects the matching published workflow. Its explicit bootstrap `skill` argument remains canonical and does not gain `-stg`; runtime playbooks remain authoritative.
- `POST /api/mcp/authoring?skills=all` lists every original skill separately, five per page. There is no five-skill server cap. Clients retain the query parameter for every request. Tools and authentication are identical in both profiles.
- The native plugin package retains all 12 independent skills. Uploading bundled skills is a separate path from MCP Scan Tools.

OpenAI's MCP importer accepts at most five uniquely named skills across ten pages, not five per page. A plugin with many bundled skills does not establish that MCP scans can exceed that limit. The default router preserves all workflows within one imported skill; it does not create 12 independent imported entries. GPT loads the matching workflow reference on demand.

Build limits: 100 files per skill, 256 KiB for root `SKILL.md`, 1 MiB per supporting file, 5 MiB total per skill, and 8 MiB for the generated scan ZIP including packaging overhead. Both independent entries and the combined router are validated. Growth beyond the router limits fails the build; use the full native package instead of silently omitting workflows.

Official references: [MCP skills import](https://developers.openai.com/plugins/build/mcp-server#import-skills-from-the-mcp-server), [plugin packaging](https://developers.openai.com/plugins/build/plugins).

## Protocol and security

Initialization declares `capabilities.resources` and `capabilities.extensions["io.modelcontextprotocol/skills"]`. `skills/list` accepts `{}` or a returned cursor. `skills/get` accepts `{ "uri": "<listed SKILL.md URI>" }`. These are protocol handlers, not tools. `resources/read` returns exactly one matching URI, as UTF-8 text or a base64 blob. Every parsed frontmatter entry appears in the catalog.

Each resource digest covers original bytes. Loading a catalog verifies every size and hash before caching the snapshot. Text hashes use UTF-8; blob hashes use decoded bytes. Reads use exact manifest membership, never caller-provided filesystem paths. Build and runtime reject symlinks, traversal, unsafe URI characters, and normalized or case-insensitive path collisions. Production and staging reject snapshots from the other environment.

The existing authenticated admin boundary applies. No write scope or feature flag is added. Publication and bootstrap gates remain in existing services. A missing or corrupt artifact fails skill requests without disabling tool handlers.

Custom skill request schemas extend the installed SDK's pagination and resource schemas. The skills capability extension is validated explicitly, preserving `capabilities.extensions` on the wire without casting the SDK server interface. Custom artifact roots receive the same environment checks as the default root.

## Build and update

```powershell
bun run build:authoring-skills --environment staging
bun run build:authoring-skills --environment production
bun test tests/contracts/authoring-skills.test.ts
```

`bun run build` prepares skills before Next.js. Vercel selects production for `main`, staging for `staging`; `--environment` or `ZYX_MCP_ENVIRONMENT` selects explicitly. Generated output is ignored by Git and included in the authoring route's output trace. Rebuilding verifies ownership before replacing an existing generated tree. A failed staged build preserves the previous artifact.

For an existing source checkout, add `--source <checkout>`; HEAD must match the environment lock and the worktree must be clean. Add `--output <directory>` for a separate artifact.

To update, inspect the external commit, update its matching lock entry, and review the CI artifact. `.github/workflows/authoring-skills.yml` builds and tests both environments. Rollback restores the previous lock and server revision together. Package SemVer, skills SHA, playbook revision, and server revision are distinct.

## Version 0.5.6 workflow packages

The workspace source `plugins/zyx-authoring-mcp` contains version `0.5.6`, bootstrap protocol 1. All 12 skills carry the release version; Product, pipeline, revisions and recovery instructions now separate browser-free logic checks from final Diktat PDF generation. Initial authoring prefers advertised direct drafts and checksum-bound schemas. Revisions use compact target reads while final semantic review uses full current context. Local preview is optional and cannot supply verification or review approval. Admin workflows retain their domain discovery, signed plans, request identity and receipt/job recovery.

Product V4 is the default for new learning products. Existing V3 revisions retain their version unless the operator requests a reviewed conversion. The typed draft path supports Article, Diktat, flashcard set and flashcard products, or one standalone V5 solution collection; binary assets and unsupported external lineage retain their archive path. A package update is not evidence that a connected server exposes a newer tool. Discover its live contract and use the supported fallback in the same environment. Runtime playbooks remain authoritative.

Render each environment package before building its MCP catalog:

```powershell
python plugins/zyx-authoring-mcp/scripts/configure_environment.py build --environment staging --output-dir artifacts/authoring-plugin/v4-staging --json
bun scripts/build-authoring-skills.ts --local-candidate --environment staging --source artifacts/authoring-plugin/v4-staging --output artifacts/authoring-plugin/v4-skills-staging
```

Use matching `production` arguments for a separate production-identity candidate. This only writes local artifacts. The manifest records `kind: local-candidate`, workspace source, base commit and source digest instead of claiming an upstream commit contains uncommitted edits. Candidate builds require explicit source/output, reject CI/deployment execution and cannot replace `dist/skills`. A deployed server rejects candidate catalogs; local verification may serve them with environment `local`. Candidate builds never update the external lock entries; normal builds still require the clean locked source.

The generated native package keeps 12 skills; each MCP compact ZIP imports one router containing all 12 workflows. Archive receipts and local logs live under ignored `artifacts/authoring-plugin/`. Updating source or creating these artifacts does not install a host package or publish an external Git commit.

## V4 logic checks and final PDF artifacts

`authoring.verify_product_bundle` and `authoring.get_verification` accept `purpose: "logic" | "pdf"`; omission selects `logic`. The default verifies structure, references, notation, schemas and supported models without a browser, screenshots, page images or PDF generation. These checks cover their stated rules; they do not prove arbitrary mathematics. An independent authored review still checks source claims, reasoning, calculations, units, assumptions, domain bounds and answers, and binds the current logic receipt.

Use `purpose: "pdf"` only when a bundle contains Diktats and the final files are needed. It uses a separate server-computed print plan, reuses valid unchanged targets and generates the remaining PDFs. It does not require screenshots, page captures or visual inspection. Publication requires exact current canonical PDF bytes and lineage for each included Diktat, in addition to logic readiness and semantic review. Article-only V4 bundles need no PDF. Optional local or manual previews do not block V4 review or publication. V2/V3 retain their separate existing evidence policy.

Request, poll, retry, cancel and inspect the same purpose and exact current plan. A logic receipt cannot satisfy a PDF gate, and a PDF receipt cannot approve semantic review. Missing PDF evidence calls for final PDF generation, not a prose change or a default logic retry.

## Background jobs and connection recovery

The shared queue adapter dispatches Cloud Tasks when `QUEUE_PROVIDER=cloud-tasks`; Scheduler and the authenticated worker handle bounded scheduling, retries and checkpoints. Retained `inngest` identifiers support compatibility and do not require an agent to use Inngest. Do not infer the live provider from a directory or API symbol.

Each skill uses its own MCP result contract: PDF page jobs use `source.get_read_job`; figure jobs use `source.get_figure_job`; delegated admin effects use `adminjobs.get` and exact operation receipts; verification uses `authoring.get_verification` with the same purpose and observed plan. Follow the returned identity, status, polling delay and retry time. A queued job, an uploaded draft, an optional preview, a logic receipt and canonical PDF evidence establish distinct states. Provider delivery does not replace semantic review or explicit publication authority.

For a stalled V4 attempt, correlate worker logs with its task hash, plan hash and current check. `product_v4.queue_failure` distinguishes the authenticated queue catch (`boundary: queue`, with the existing empty 503 response) from a rejected Neon `app.fetch` (`boundary: request`, with the original exception rethrown). It records only allowlisted error categories, validated task/retry metadata and up to three numeric `index.mjs` locations per error or cause. It omits raw messages, stack text, URLs, request bodies and credentials. `product_v4.browser_start` records the plan/check hashes after assets load and immediately before hosted browser execution. This marker identifies the reached phase, not a passing check. A missing catch event can still reflect a process interruption; use provider evidence to establish its cause. Diagnostics do not change authorization, retry limits, MCP status contracts, readiness or publication gates.

The Neon host also observes `product_v4.process_fatal` through Node's `uncaughtExceptionMonitor` and `product_v4.process_exit` through its exit event, only while a V4 request has passed the existing Cloud Tasks identity and delivery checks. Each record contains at most three active task hashes, their total count and an explicit truncation marker when needed. Fatal records add an allowlisted error type, a fixed origin and at most three numeric locations from `index.mjs`, Playwright `coreBundle.js` or `utilsBundle.js`; they never include raw messages, stack paths, URLs, headers or bodies. Active tasks identify concurrent work, not which task caused the fatal event. Scope cleanup runs on fulfilled and rejected requests and prevents later callbacks from reactivating an ended request. The monitor installs no fatal-error, rejection or signal handler, so Node retains its normal termination and exit code. These host logs do not change the renderer fingerprint, MCP tools or receipts. Absence of a record cannot exclude a host termination that skips Node's events.

Let the host renew access through the existing OAuth connection. Recover missing scopes, revoked authorization, stale plans and lost operation replies using their specific contracts. Do not reconnect merely because a job is pending, copy tokens between environments, or fall back to manual bearer auth for delegated provider jobs.

## Final PDF runtime and optional browser diagnostics

Logic checks run in the server job and need no browser provider, version pin or local renderer. The explicit final PDF job uses the shared Hono compute worker; its `workers/deno-background` directory does not identify the active deployment host. The attested private local operator is PDF-only and follows its exact environment restrictions. For PDF generation, Playwright Core connects to the configured provider over CDP. `AUTHORING_VERIFICATION_BROWSER_PROVIDER` defaults to `cloudflare`, using `CF_ACCOUNT_ID` and `CF_API_TOKEN`; `steel` uses server-only `STEEL_API_KEY` and the reviewed exact `AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION`. Cloudflare retains its contract version pin. Steel requires an operator-reviewed four-part version from the probe. Provider and version bind the PDF plan and artifact reuse; changes do not require browser setup for logic. Hosted requests accept only the exact staging and production HTTPS origins. Each browser checkpoint acquires a session over HTTP and explicitly deletes it before disconnecting Playwright; CDP `browser.close()` alone only disconnects the client. A 60-second keep-alive bounds orphaned sessions if the platform ends a request. No separate Node service is required.


Steel uses `POST https://api.steel.dev/v1/sessions`, connects Playwright to `wss://connect.steel.dev` for that reserved session ID, and releases only that session with `POST /v1/sessions/{id}/release`. The API key is a REST header and CDP query secret; never print the endpoint, enable credential-bearing protocol debug logs, or include it in artifacts. The session has a 120-second hard timeout and 60-second inactivity timeout. Proxy, CAPTCHA and persistent profiles are disabled. Final PDFs use Playwright `page.pdf()` and the existing private object storage. Screenshot capture belongs to optional diagnostics, not the V4 review or publication gate. A failed release blocks success; failed connection or invalid metadata also trigger explicit release. Only sanitized machine failure codes reach job state. Steel authentication and exhausted-credit responses stop retries; capacity and rate limits preserve provider `Retry-After` with the existing 25-second fallback. Steel has no assumed Cloudflare daily reset.

Official [Steel pricing](https://docs.steel.dev/overview/pricinglimits), [lifecycle](https://docs.steel.dev/overview/sessions-api/session-lifecycle) and [Playwright integration](https://docs.steel.dev/integrations/playwright) were checked on 2026-10-23. Launch lists $30 one-time credits valid for 90 days, $0.10 per browser hour rounded up by minute, 10 concurrent sessions and 15 minutes per session. This verifier uses no paid proxy, CAPTCHA or Browser Tools endpoints. Do not add a payment method, buy credits, enable top-up or upgrade. Exhausted credits require operator action.

Store the key in the exact staging GitHub environment secret for deployment, or an ignored local environment file for a local probe. Configure provider/version consistently in the web and Deno environments. GitHub workflows accept these two settings from environment Variables or Secrets, preferring Variables when both exist. The API key always comes from Secrets. First run `AUTHORING_VERIFICATION_BROWSER_PROVIDER=steel bun scripts/authoring/probe-v4-browser.ts` with `NEXT_PUBLIC_APP_URL=https://staging.zyxacademy.com` and the key supplied securely through the environment. Without a version pin this diagnostic reports the observed browser version only; it cannot sign evidence. Review that version, configure its exact pin, and repeat the probe. It creates a session, connects CDP, visits the empty public verification preview without cookies or bundle data, captures a screenshot and PDF in memory, and releases the session. It logs only version, status and byte lengths. The diagnostic does not retry long provider delays inside an open request. The manual deployment diagnostic workflow uses the same provider selection and skips Cloudflare-specific account diagnostics for Steel.

Before recovering a chapter attempt, use `Operate V4 verification` with `inspect`, the matching environment branch and the intended purpose. Recheck the current revision and plan. Cancel only an observed obsolete attempt of that purpose, then retry through the deployed worker with consistent identity. Logic needs no successful Steel smoke. PDF provider diagnostics establish runtime availability, not content approval. Keep logic checks, semantic review and any required final PDF artifact proof as separate acceptance results. No completed chapter run is established by a smoke test.

HTTP acquisition preserves `Retry-After` for transient 429 responses. The active queue adapter schedules bounded retries using both job and queue limits without keeping a worker request open; missing or invalid delay headers use 25 seconds. Explicit daily browser quota exhaustion, denied access and invalid session metadata stop without retrying. Cloudflare can return the canonical `browser-rendering` CDP route for a `browser-run` acquisition; accept either route only on the exact API origin, account and acquired session. Terminal state preserves the sanitized browser failure category. Run the existing Deno deploy workflow manually with `browser_diagnostics=true` and the exact `diagnostic_environment` to count active sessions, acquire/release an empty browser, then exercise a real Playwright CDP connection, preview hydration and screenshot without deploying or changing application data. The probe logs only sanitized status, counts, endpoint family, browser version and quota classification. Its bounded retry respects acquisition rate limits between probes. An empty active-session list alone cannot identify the exhausted quota. Cloudflare's [limits](https://developers.cloudflare.com/browser-run/limits/) and [session lifecycle](https://developers.cloudflare.com/browser-run/cdp/session-management/) document these separate limits and cleanup endpoints.

The manual `Operate V4 verification` workflow runs only from the matching `main`/production or `staging`/staging branch and uses that environment's existing secrets. `V4_PURPOSE` selects `logic` or `pdf`, defaulting to `logic`. `inspect` checks staging deployment context metadata when its token is available without logging values, then lists draft V4 titles and revision checksums read-only; an exact revision also reports the selected purpose's artifacts, errors and retry schedule. `retry` requires one exact inspected checksum and waits for the selected purpose's receipt; only PDF purpose requires matching PDF persistence. `cancel` revokes only the exact selected attempt and records its before/after status. These operations cannot review or publish content. `evidence` exports verified artifacts and learning content into a GitHub artifact with 3-day retention, omitting credentials, account identities and private storage keys. Visual inspection of that export is optional. Local or CI commands cannot sign a substitute production receipt for the deployed worker.

For local testing only, build the Node ESM adapter from the current workspace:

```powershell
bun scripts/authoring/build-local-verification-renderer.ts
node artifacts/authoring-verification/renderer.mjs --base-url http://127.0.0.1:3100 --port 3101
```

Set `AUTHORING_VERIFICATION_RENDERER_URL` to this local adapter only for local PDF testing, with `AUTHORING_VERIFICATION_RENDERER_SECRET` in the process environment. Keep the existing `DIKTAT_RENDERER_URL` and secret for its separate `/render` API. The adapter binds loopback and needs Playwright Chromium. The PDF parser counts actual pages and verifies byte bounds; final PDF verification does not rasterize pages. `verify-local-v4.ts --purpose logic` needs no renderer. The private `run-product-v4-local.mjs` operator fixes purpose to PDF and rejects a purpose override in its input file.

The local renderer build resolves workspace aliases and leaves installed packages external. It embeds the PDF build fingerprint and expected Chromium metadata, then records the bundle SHA and fingerprint in `renderer-build.json`. The PDF fingerprint binds source bytes, installed packages, KaTeX CSS/fonts, browser metadata, contract, playbook and print profile. Embedded and live fingerprints must match. The runner checks the PDF plan and actual Chromium version before execution. Rebuild after a relevant source or dependency change and retain the declared runtime files. Logic plans use their own binding and do not depend on this browser renderer.

The application build runs `prepare-web-verification.ts`, embeds the public print fingerprint in the verification preview and generates `lib/compute/product-v4-build-runtime.json` for the worker. The release pipeline regenerates that identity from the exact source and locked packages. The worker consumes the build identity rather than reading omitted frontend files. A stale web build cannot supply current final PDF evidence; it is not a browser prerequisite for logic checks.

The controlled `/authoring-verification` preview excludes site telemetry and rejects unexpected external requests. Historical local acceptance exercised 22 visual-policy checks, including web states and page capture. That result predates the logic/PDF split and is not the current required plan. It does not certify deployed endpoints, installed plugins or a chapter's semantic acceptance.

Retained optional reader diagnostics check display-math scrolling, keyboard access and doubled text size. Their capture limits and viewport rules apply only when those diagnostics run. They do not add screenshots or visual approval to the current V4 logic, PDF or publication requirements.

Verification checkpoints preparation, each requirement and final receipt readback as durable steps; PDF purpose adds artifact persistence. Step discovery performs no database or storage requests outside those steps. Browser deadlines and explicit cleanup apply only when generating PDFs or running optional diagnostics. Default logic performs no browser work. Progress reports completed/total checks and an update timestamp for the selected purpose. Provider backoff persists `retryAt`; the 20-minute stale lease starts after that scheduled time. Attempts without updates or a future retry time still expire after 20 minutes. Exact dependencies, current attempt identity and required artifacts remain prerequisites for the matching receipt.

Logic receipts and independent semantic review establish separate results. Logic verifies supported rules and models, not arbitrary mathematical equivalence. A PDF receipt establishes final artifact evidence, not semantic or visual approval. Optional previews and visual inspection cannot block V4 publication.

## Acceptance and rollout

The focused suite exercises initialization, both catalogs, 21 independent fixture skills, complete frontmatter, text/blob digests, cursors, isolation, traversal, tampering, size limits, and a local HTTP import rehearsal. Linux CI runs the symlink case; Windows skips it because link creation depends on host privileges.

Local verification on 2026-10-21 additionally exercised the real six-skill V4 candidate through MCP HTTP transport, checked every resource digest, confirmed plugin `0.4.0` bootstrap compatibility and rejected candidate serving in deployed environments. The distribution suite passed 11 tests with one Windows symlink skip; Python packaging passed 11 tests for both environment identities. Runtime-binding tests reject live dependency drift, course/excerpt swaps, changed asset bytes, unknown figure permission and newer plans presented to an older embedded renderer. Primary-agent browser/PDF verification is recorded separately.

Run `bun scripts/test-contracts.ts tests/contracts/product-v4-publication-integration.test.ts` in its own process. Its isolated PostgreSQL-compatible fixture exercises real publication gates: a current signed logic receipt and explicit section/rubric approval are required; Diktats additionally need canonical PDF proof from the separate PDF plan. Stale or forged receipts, wrong purpose, incomplete review, stale PDF, changed source and missing section approval reject atomically. The fixture tests gate wiring, not actual provider health or arbitrary mathematical correctness.

A read-only host doctor observed an existing Antigravity staging package at `0.2.0` with legacy connection identity and checksum drift; its production package was absent. No package was installed or reloaded by these checks. Codex/ChatGPT active imports, OAuth sessions, external pinned-source updates and deployed MCP endpoints require their own observed acceptance and are not certified by local package tests.

After deployment, supply a short-lived read-only token through `AUTHORING_MCP_SMOKE_TOKEN`, without printing or saving it:

```powershell
bun scripts/smoke-authoring-skills.ts --url https://staging.zyxacademy.com/api/mcp/authoring
bun scripts/smoke-authoring-skills.ts --url 'https://staging.zyxacademy.com/api/mcp/authoring?skills=all'
```

Repeat on the exact authorized production hostname after staging passes. The smoke calls initialize, every catalog page, skills/get, and every resources/read, verifying all bytes. It makes no authoring or database writes and does not prove ChatGPT import.

In the plugin draft, use Scan Tools against the default endpoint, confirm the matching `zyx-authoring-stg` or `zyx-authoring` router and all workflow references, then review and submit the new plugin version. Adding a custom MCP URL does not guarantee installation. Native package uploads and MCP snapshots require separate host acceptance evidence.

Deployment evidence is recorded in per-rollout smoke receipts. ChatGPT Scan Tools acceptance requires an observed successful scan and confirmation of the imported draft. OpenAI Platform requires a verified developer identity before creating or uploading that draft.


## Exact production draft fixture in staging

The manual `Operate V4 verification` workflow with action `prepare-fixture` runs only from `staging`, with an explicitly inspected revision checksum. Use it only after the operator authorizes copying that draft and its required learning dependencies to staging. Its production job issues SELECTs and downloads the exact ZIP; it exports no account rows, sessions, learner data, reviews or receipts. The private transfer artifact expires after 1 day.

The staging job uses the existing staging guard, checks identity references and current dependency pins, inserts only missing parent/Idea/source/chunk rows and refuses conflicts. Account identities must already exist in staging. Source-figure assets and external product dependencies remain outside this focused transfer. Existing drafts remain available for native inspection and retry. A new draft stages through `stageProductBundle` with the original checksum and uses the normal deployed logic job. Final Diktat PDFs require a separate explicit PDF request; no local command signs substitute evidence. Semantic approval and publication remain separate.

### Admin MCP permissions

Fresh URL connections offer all 46 OAuth scopes with the four existing authoring defaults selected. Explicit narrower requests remain exact. OAuth consent grants only selected requested scopes; legacy session and compatibility tokens retain the five authoring scopes. Reauthorize to add permissions. The package uses short environment IDs, portable call names and distinct staging skill names; see [MCP host compatibility](mcp-host-compatibility.md) for naming, migration, and scope recovery. Verify the tool catalog and scope grants in the target environment before use. Local implementation does not verify deployment or external client behavior.

The native package includes `zyx-admin-operations` and five focused workflows for blog, content revisions, forms, media and recovery alongside the six academic authoring skills. Admin operations use explicit scopes, signed plans and outbox receipts rather than authoring bootstrap stages. The locked server snapshot remains separate; package contents alone do not prove that an installed MCP host can discover these workflows. See [Admin MCP operations](admin-mcp.md).
