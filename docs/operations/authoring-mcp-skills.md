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

## Build and update

```powershell
bun run build:authoring-skills --environment staging
bun run build:authoring-skills --environment production
bun test tests/contracts/authoring-skills.test.ts
```

`bun run build` prepares skills before Next.js. Vercel selects production for `main`, staging for `staging`; `--environment` or `ZYX_MCP_ENVIRONMENT` selects explicitly. Generated output is ignored by Git and included in the authoring route's output trace. Rebuilding verifies ownership before replacing an existing generated tree. A failed staged build preserves the previous artifact.

For an existing source checkout, add `--source <checkout>`; HEAD must match the environment lock and the worktree must be clean. Add `--output <directory>` for a separate artifact.

To update, inspect the external commit, update its matching lock entry, and review the CI artifact. `.github/workflows/authoring-skills.yml` builds and tests both environments. Rollback restores the previous lock and server revision together. Package SemVer, skills SHA, playbook revision, and server revision are distinct.

## Acceptance and rollout

The focused suite exercises initialization, both catalogs, 21 independent fixture skills, complete frontmatter, text/blob digests, cursors, isolation, traversal, tampering, size limits, and a local HTTP import rehearsal. Linux CI runs the symlink case; Windows skips it because link creation depends on host privileges.

After deployment, supply a short-lived read-only token through `AUTHORING_MCP_SMOKE_TOKEN`, without printing or saving it:

```powershell
bun scripts/smoke-authoring-skills.ts --url https://staging.zyxacademy.com/api/mcp/authoring
bun scripts/smoke-authoring-skills.ts --url 'https://staging.zyxacademy.com/api/mcp/authoring?skills=all'
```

Repeat on the exact authorized production hostname after staging passes. The smoke calls initialize, every catalog page, skills/get, and every resources/read, verifying all bytes. It makes no authoring or database writes and does not prove ChatGPT import.

In the plugin draft, use Scan Tools against the default endpoint, confirm `zyx-authoring` and all workflow references, then review and submit the new plugin version. Adding a custom MCP URL does not guarantee installation. Native package uploads and MCP snapshots require separate host acceptance evidence.

Deployment evidence is recorded in per-rollout smoke receipts. ChatGPT Scan Tools acceptance requires an observed successful scan and confirmation of the imported draft. OpenAI Platform requires a verified developer identity before creating or uploading that draft.
