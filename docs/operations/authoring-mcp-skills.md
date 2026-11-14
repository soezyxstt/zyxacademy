# Authoring MCP skills distribution

Status: `ACTIVE`

The server serves a build-time snapshot of the separate `soezyxstt/zyx-authoring-mcp` repository. `authoring-skills.lock.json` pins a full Git commit for each environment. Builds fetch that commit once, reject dirty checkouts, verify environment-specific connection instructions, and write `dist/skills/manifest.json`, resource files, and `chatgpt-skills.zip`. No request fetches GitHub. The existing plugin mirror still publishes from this repository; updating the mirror does not update the server pin automatically.

The repository candidate now includes seven existing skills and five focused agent-first skills for blog, content revisions, forms, media and operation recovery. See [agent-first content operations](agent-first-content.md). Mirroring remains manually dispatched; pinned server artifacts and installed clients are separate release targets.

## Catalogs and more than five skills

- `POST /api/mcp/authoring` defaults to the `chatgpt` catalog. It lists one `zyx-authoring` router containing every original skill and supporting file under `references/<original-name>/`. Original bytes and sibling-directory links are preserved. The router selects the original workflow and bootstrap skill ID; runtime playbooks remain authoritative.
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

## Local V4 candidate packages

The workspace mirror `plugins/zyx-authoring-mcp` contains a local `0.5.0` candidate, bootstrap protocol 1. Product V4 is the default for new Article/Diktat authoring. Existing V3 revisions retain their version unless the operator requests a reviewed conversion. The primary runtime contract exposes V4 schemas and verification; the pilot descriptor remains a compatibility alias. Product/Pipeline skills require runtime contracts, ordered mathematical representations, traced Diktat, independent review roles and trusted renderer evidence. Runtime playbooks remain authoritative.

Render each environment package before building its MCP catalog:

```powershell
python plugins/zyx-authoring-mcp/scripts/configure_environment.py build --environment staging --output-dir artifacts/authoring-plugin/v4-staging --json
bun scripts/build-authoring-skills.ts --local-candidate --environment staging --source artifacts/authoring-plugin/v4-staging --output artifacts/authoring-plugin/v4-skills-staging
```

Use matching `production` arguments for a separate production-identity candidate. This only writes local artifacts. The manifest records `kind: local-candidate`, workspace source, base commit and source digest instead of claiming an upstream commit contains uncommitted edits. Candidate builds require explicit source/output, reject CI/deployment execution and cannot replace `dist/skills`. A deployed server rejects candidate catalogs; local verification may serve them with environment `local`. Normal build behavior and external lock entries remain unchanged.

The generated native package keeps 12 skills; each MCP compact ZIP imports one router containing all 12 workflows. Archive receipts and local logs live under ignored `artifacts/authoring-plugin/`. Updating source or creating these artifacts does not install a host package or publish an external Git commit.

## Attested local renderer

The deployed trusted verification runner runs in the existing Deno Deploy worker. Playwright Core connects to the explicitly configured provider over CDP. `AUTHORING_VERIFICATION_BROWSER_PROVIDER` defaults to `cloudflare`, using `CF_ACCOUNT_ID` and `CF_API_TOKEN`. Set it to `steel` with server-only `STEEL_API_KEY` and reviewed exact `AUTHORING_VERIFICATION_STEEL_BROWSER_VERSION` to use Steel. Cloudflare retains its contract version pin. Steel requires an operator-reviewed four-part version from the probe. Provider and version are recorded in each deployed plan and checked before rendering; changing either invalidates old receipts and PDF evidence. Only the exact staging and production HTTPS origins are accepted. Each checkpoint acquires a session over HTTP, then explicitly deletes that session before disconnecting Playwright. CDP `browser.close()` alone only disconnects the client. A 60-second keep-alive bounds orphaned sessions if the platform terminates a request. No separate Node service is required.


Steel uses `POST https://api.steel.dev/v1/sessions`, connects Playwright to `wss://connect.steel.dev` for that reserved session ID, and releases only that session with `POST /v1/sessions/{id}/release`. The API key is a REST header and CDP query secret; never print the endpoint, enable credential-bearing protocol debug logs, or include it in artifacts. The session has a 120-second hard timeout and 60-second inactivity timeout. Proxy, CAPTCHA and persistent profiles are disabled. Screenshots and `page.pdf()` still use Playwright and existing R2 persistence. A failed release blocks success; failed connection or invalid metadata also trigger explicit release. Only sanitized machine failure codes reach job state. Steel authentication and exhausted-credit responses stop retries; capacity and rate limits preserve provider `Retry-After` with the existing 25-second fallback. Steel has no assumed Cloudflare daily reset.

Official [Steel pricing](https://docs.steel.dev/overview/pricinglimits), [lifecycle](https://docs.steel.dev/overview/sessions-api/session-lifecycle) and [Playwright integration](https://docs.steel.dev/integrations/playwright) were checked on 2026-10-23. Launch lists $30 one-time credits valid for 90 days, $0.10 per browser hour rounded up by minute, 10 concurrent sessions and 15 minutes per session. This verifier uses no paid proxy, CAPTCHA or Browser Tools endpoints. Do not add a payment method, buy credits, enable top-up or upgrade. Exhausted credits require operator action.

Store the key in the exact staging GitHub environment secret for deployment, or an ignored local environment file for a local probe. Configure provider/version consistently in the web and Deno environments. GitHub workflows accept these two settings from environment Variables or Secrets, preferring Variables when both exist. The API key always comes from Secrets. First run `AUTHORING_VERIFICATION_BROWSER_PROVIDER=steel bun scripts/authoring/probe-v4-browser.ts` with `NEXT_PUBLIC_APP_URL=https://staging.zyxacademy.com` and the key supplied securely through the environment. Without a version pin this diagnostic reports the observed browser version only; it cannot sign evidence. Review that version, configure its exact pin, and repeat the probe. It creates a session, connects CDP, visits the empty public verification preview without cookies or bundle data, captures a screenshot and PDF in memory, and releases the session. It logs only version, status and byte lengths. The diagnostic does not retry long provider delays inside an open request. The manual deployment diagnostic workflow uses the same provider selection and skips Cloudflare-specific account diagnostics for Steel.

Before running a real chapter, use `Operate V4 verification` with `inspect` on the matching environment branch. Recheck the actual revision rather than trusting an old checksum. Cancel only the exact old Cloudflare native run if it remains queued/running, then retry through the deployed trusted worker with consistent web/worker identity. Do not sign receipts locally. Keep code validation, successful Steel smoke, all checks PASS, ready receipt, persisted PDF evidence and independent pedagogical approval as separate acceptance results. No completed chapter run is established by this implementation or by a smoke test.

HTTP acquisition preserves `Retry-After` for transient 429 responses. Inngest schedules up to 5 retries without keeping a Deno request open; missing or invalid delay headers use 25 seconds. Explicit daily browser quota exhaustion, denied access and invalid session metadata stop without retrying. Cloudflare can return the canonical `browser-rendering` CDP route for a `browser-run` acquisition; accept either route only on the exact API origin, account and acquired session. Terminal state preserves the sanitized browser failure category. Run the existing Deno deploy workflow manually with `browser_diagnostics=true` and the exact `diagnostic_environment` to count active sessions, acquire/release an empty browser, then exercise a real Playwright CDP connection, preview hydration and screenshot without deploying or changing application data. The probe logs only sanitized status, counts, endpoint family, browser version and quota classification. Its bounded retry respects acquisition rate limits between probes. An empty active-session list alone cannot identify the exhausted quota. Cloudflare's [limits](https://developers.cloudflare.com/browser-run/limits/) and [session lifecycle](https://developers.cloudflare.com/browser-run/cdp/session-management/) document these separate limits and cleanup endpoints.

The manual `Operate V4 verification` workflow runs only from the matching `main`/production or `staging`/staging branch and uses that environment's existing secrets. `inspect` checks staging Deno variable context metadata when its deployment token is available, without logging values, then lists draft V4 titles and revision checksums read-only; an exact revision also reports artifacts, trace errors and retry scheduling. `retry` requires one exact inspected checksum, requests the established trusted job and waits for its complete receipt plus matching PDF-persistence marker, or reports the provider's persisted future retry time. `cancel` cancels only the unique run attached to that exact draft revision and records its before/after status. It cannot review or publish content. `evidence` downloads only verified artifacts plus learning content into a private GitHub artifact with a 3-day retention for visual review; it omits credentials, account identities and private storage keys. A local or CI command must never execute browser checks and sign a production receipt in place of the deployed trusted worker.

For local testing only, build the Node ESM adapter from the current workspace:

```powershell
bun scripts/authoring/build-local-verification-renderer.ts
node artifacts/authoring-verification/renderer.mjs --base-url http://127.0.0.1:3100 --port 3101
```

Set `AUTHORING_VERIFICATION_RENDERER_URL` to this local adapter and provide `AUTHORING_VERIFICATION_RENDERER_SECRET` through the process environment. Keep the existing `DIKTAT_RENDERER_URL` and secret for its separate `/render` API. The local adapter binds loopback and needs Playwright Chromium. Actual PDF pages are counted and rasterized by the existing PDF parser; Poppler is not a deployment prerequisite.

The build resolves workspace aliases and leaves installed packages external. It embeds the actual build fingerprint and expected Chromium metadata, then records the bundle SHA and fingerprint in `renderer-build.json`. The fingerprint binds explicit source bytes, installed package versions, KaTeX CSS/font bytes, Playwright browser metadata, contract, playbook and print profile. At startup, embedded and live fingerprints must match; an old bundle refuses changed source or dependencies instead of claiming their newer identity. The runner retains that snapshot and checks plan fields plus the actual launched Chromium version before execution. Rebuild and restart after a relevant source or dependency change. Keep all `PRODUCT_V4_RUNTIME_FILES`, package manifests and KaTeX assets available in the runtime trace.

The application build runs `prepare-web-verification.ts`, embeds its public fingerprint in the verification preview, and generates `lib/compute/product-v4-build-runtime.json` for Deno. The Deno release pipeline regenerates that identity from the exact source and locked packages before upload. Deno consumes the build identity instead of reading frontend files excluded from its deployment. A stale web build cannot satisfy trusted checks.

The controlled `/authoring-verification` preview excludes site telemetry. Its executor rejects unexpected external requests rather than suppressing their errors. A local production build, Node HTTP renderer and synthetic canonical V4 ZIP have exercised all 22 derived checks, including web states and PDF page capture. This is local evidence; it does not certify deployed endpoints, installed plugin imports or a complete chapter's pedagogic acceptance.

Reader checks reject display-math scrolling at normal text size and require named, keyboard-accessible scroll regions at doubled text size. Pixel-based typography is explicitly doubled and measured; scientific diagram coordinates retain their existing zoom controls. Chapter captures preserve the configured CSS viewport and allow at most 300 slices per check.

Verification checkpoints preparation, each requirement, final receipt readback and PDF persistence as separate Inngest steps. Step discovery performs no database or storage requests outside those steps. Long web captures use at most 2 viewport slices per step on the existing Hono transport, with a 15-second timeout per screenshot and a 60-second deadline for remote browser work. Cleanup has a separate 15-second bound and starts before database/storage evidence writes, reducing idle browser billing. Abort guards prevent delayed asset loading from starting a new browser after the deadline. Capture outputs contain artifact metadata rather than image bytes. Progress reports completed/total checks and an update timestamp. Provider backoff persists `retryAt`; the 20-minute stale lease starts after that scheduled time instead of expiring while Inngest legitimately waits for quota. Attempts without updates or a future retry time still expire after 20 minutes. Artifacts and dependency/attempt checks remain mandatory before a passing receipt.

Machine render receipts and independent pedagogic/visual review are separate gates. A passing browser job establishes the recorded machine checks, not mathematical equivalence or human readability by itself.

## Acceptance and rollout

The focused suite exercises initialization, both catalogs, 21 independent fixture skills, complete frontmatter, text/blob digests, cursors, isolation, traversal, tampering, size limits, and a local HTTP import rehearsal. Linux CI runs the symlink case; Windows skips it because link creation depends on host privileges.

Local verification on 2026-10-21 additionally exercised the real six-skill V4 candidate through MCP HTTP transport, checked every resource digest, confirmed plugin `0.4.0` bootstrap compatibility and rejected candidate serving in deployed environments. The distribution suite passed 11 tests with one Windows symlink skip; Python packaging passed 11 tests for both environment identities. Runtime-binding tests reject live dependency drift, course/excerpt swaps, changed asset bytes, unknown figure permission and newer plans presented to an older embedded renderer. Primary-agent browser/PDF verification is recorded separately.

Run `bun test ./tests/contracts/product-v4-publication-integration.test.ts` in its own process. It migrates an in-memory SQLite database and exercises the real publication and quality gates: a current signed fixture receipt, explicit section/rubric approval and PDF evidence permit publication; stale or forged receipt, incomplete review, stale PDF, changed source and missing section approval reject atomically. Its fixture executor tests gate wiring; it does not substitute for actual browser/PDF execution.

A read-only host doctor observed an existing Antigravity staging package at `0.2.0` with legacy connection identity and checksum drift; its production package was absent. No package was installed or reloaded by these checks. Codex/ChatGPT active imports, OAuth sessions, external pinned-source updates and deployed MCP endpoints require their own observed acceptance and are not certified by local package tests.

After deployment, supply a short-lived read-only token through `AUTHORING_MCP_SMOKE_TOKEN`, without printing or saving it:

```powershell
bun scripts/smoke-authoring-skills.ts --url https://staging.zyxacademy.com/api/mcp/authoring
bun scripts/smoke-authoring-skills.ts --url 'https://staging.zyxacademy.com/api/mcp/authoring?skills=all'
```

Repeat on the exact authorized production hostname after staging passes. The smoke calls initialize, every catalog page, skills/get, and every resources/read, verifying all bytes. It makes no authoring or database writes and does not prove ChatGPT import.

In the plugin draft, use Scan Tools against the default endpoint, confirm `zyx-authoring` and all workflow references, then review and submit the new plugin version. Adding a custom MCP URL does not guarantee installation. Native package uploads and MCP snapshots require separate host acceptance evidence.

Deployment evidence is recorded in per-rollout smoke receipts. ChatGPT Scan Tools acceptance requires an observed successful scan and confirmation of the imported draft. OpenAI Platform requires a verified developer identity before creating or uploading that draft.


## Exact production draft fixture in staging

The manual `Operate V4 verification` workflow with action `prepare-fixture` runs only from `staging`, with an explicitly inspected revision checksum. Use it only after the operator authorizes copying that draft and its required learning dependencies to staging. Its production job issues SELECTs and downloads the exact ZIP; it exports no account rows, sessions, learner data, reviews or receipts. The private transfer artifact expires after 1 day.

The staging job uses the existing staging guard, checks all identity references and current dependency pins before writes, inserts only missing parent/Idea/source/chunk rows, and refuses conflicts. Account identities must already exist in staging. Source-figure assets and external product dependencies are deliberately unsupported by this focused transfer. Existing drafts are left for native inspection and retry rather than creating another attempt. A new draft is staged through `stageProductBundle`, keeps the original bundle checksum, and requests the normal deployed trusted worker. Polling waits for all checks, a ready receipt and matching persisted PDF evidence; it does not execute checks or sign receipts locally. Pedagogic approval and publication remain separate.

### Admin MCP permissions

The existing endpoint also accepts explicit admin scopes for supported tools. OAuth consent grants only selected requested scopes; legacy session and compatibility tokens retain the authoring scopes. Reauthorize to add permissions. Verify the tool catalog and scope grants in the target environment before use. Local implementation does not verify deployment or external client behavior.

The local native package now includes `zyx-admin-operations` as its seventh workflow. Admin operations use explicit scopes, signed plans and outbox receipts rather than authoring bootstrap stages. The locked deployed skill source remains separate; local package contents do not prove that an MCP host can discover this workflow. See [Admin MCP operations](admin-mcp.md).
