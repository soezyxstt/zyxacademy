# Authoring MCP skills distribution

Status: `ACTIVE`

The server serves a build-time snapshot of the separate `soezyxstt/zyx-authoring-mcp` repository. `authoring-skills.lock.json` pins a full Git commit for each environment. Builds fetch that commit once, reject dirty checkouts, verify environment-specific connection instructions, and write `dist/skills/manifest.json`, resource files, and `chatgpt-skills.zip`. No request fetches GitHub. The existing plugin mirror still publishes from this repository; updating the mirror does not update the server pin automatically.

## Catalogs and more than five skills

- `POST /api/mcp/authoring` defaults to the `chatgpt` catalog. It lists one `zyx-authoring` router containing every original skill and supporting file under `references/<original-name>/`. Original bytes and sibling-directory links are preserved. The router selects the original workflow and bootstrap skill ID; runtime playbooks remain authoritative.
- `POST /api/mcp/authoring?skills=all` lists every original skill separately, five per page. There is no five-skill server cap. Clients retain the query parameter for every request. Tools and authentication are identical in both profiles.
- The native plugin package retains all six independent skills. Uploading bundled skills is a separate path from MCP Scan Tools.

OpenAI's MCP importer accepts at most five uniquely named skills across ten pages, not five per page. A plugin with many bundled skills does not establish that MCP scans can exceed that limit. The default router preserves all workflows within one imported skill; it does not create six independent imported entries. GPT loads the matching workflow reference on demand.

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

The workspace mirror `plugins/zyx-authoring-mcp` contains a local `0.4.1` candidate, bootstrap protocol 1. Product V4 is the default for new Article/Diktat authoring. Existing V3 revisions retain their version unless the operator requests a reviewed conversion. The primary runtime contract exposes V4 schemas and verification; the pilot descriptor remains a compatibility alias. Product/Pipeline skills require runtime contracts, ordered mathematical representations, traced Diktat, independent review roles and trusted renderer evidence. Runtime playbooks remain authoritative.

Render each environment package before building its MCP catalog:

```powershell
python plugins/zyx-authoring-mcp/scripts/configure_environment.py build --environment staging --output-dir artifacts/authoring-plugin/v4-staging --json
bun scripts/build-authoring-skills.ts --local-candidate --environment staging --source artifacts/authoring-plugin/v4-staging --output artifacts/authoring-plugin/v4-skills-staging
```

Use matching `production` arguments for a separate production-identity candidate. This only writes local artifacts. The manifest records `kind: local-candidate`, workspace source, base commit and source digest instead of claiming an upstream commit contains uncommitted edits. Candidate builds require explicit source/output, reject CI/deployment execution and cannot replace `dist/skills`. A deployed server rejects candidate catalogs; local verification may serve them with environment `local`. Normal build behavior and external lock entries remain unchanged.

The generated native package keeps six skills; each MCP compact ZIP imports one router containing all six workflows. Archive receipts and local logs live under ignored `artifacts/authoring-plugin/`. Updating source or creating these artifacts does not install a host package or publish an external Git commit.

## Attested local renderer

The deployed trusted verification runner runs in the existing Deno Deploy worker. Playwright Core connects to Cloudflare Browser Run over CDP using `CF_ACCOUNT_ID` and `CF_API_TOKEN`. Its browser version is pinned in the verification contract and recorded in each deployed plan. Only the exact staging and production HTTPS origins are accepted. The worker closes the browser after the job, and disconnected sessions cannot poison later jobs. No separate Node service is required.

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
