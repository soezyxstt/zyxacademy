# Agent-first content operations

Status: `OPEN / IN PROGRESS`

This contract covers repository implementation and focused local verification. Deployment, authenticated OAuth hosts, live providers and installed marketplace acceptance are separate boundaries. The Admin website is optional for the advertised MCP workflows. An active authorized identity, explicit operation scopes and existing publication gates remain required.

## Discover before acting

Read `admin.environment`, then pass the intended `expectedEnvironment` and `expectedOrigin` to data tools. `admin.capabilities` returns a paginated catalog derived from operations registered on that server, their required and missing scopes, mutation controls, retry strategies and bounded workflow guides. Metadata does not grant permission. Initial source-grounded authoring still uses its stage playbook; existing V3+ content uses the [revision workflow](../bundle/authoring-revisions.md).

Structured failures preserve required scopes and the OAuth insufficient-scope challenge. Validation reports field paths without echoing supplied values. A stale revision requires a fresh read and reconciliation. A lost response does not justify a new request key.

## Blog workflow

Use `blog.search` for filtered metadata and continuation, `blog.get_edit_context` for the full observed revision, and `blog.validate` for normalization and publication impact without writes, rendering, network fetches or AI quota. `blog.list` retains its array result. Create validation accepts `article`; edit validation accepts `id`, `expectedRevision` and optional `changes`.

`blog.create` creates a draft. `blog.update` and `blog.set_publication` require the observed revision, signed dry-run plan and stable request key. Editing a published article changes live content immediately when committed; the plan reports visibility and old and new public paths. Title edits preserve the slug unless a replacement is explicit. Reading time is server-derived. Omitted summaries use deterministic text on MCP. The existing Admin summary-generation adapter retains its provider boundary.

MCP, Admin saves and Admin Ops use the same row-locked revision service. A stale save retains the editor's local content and reports a reload requirement. Thumbnails accept safe public media paths or external HTTPS hosts supported by the image renderer. Exact application-origin media URLs are normalized to local paths. No scheduled-publication timer is implemented; scheduling requests fail explicitly rather than promising future execution.

## Media and forms

`media.get` resolves an existing `media/` leaf to an encoded application `publicPath` and `publicUrl`. It checks object existence, does not download or verify bytes, and never exposes credentials or arbitrary private object paths. `byteContentVerified` remains false. Existing queued uploads remain limited to 512 KiB; larger uploads use the existing upload surface.

Forms retain preview, validation, simulation, response permissions and spreadsheet conflict protection. Simulation does not submit a response. A spreadsheet overwrite still needs the user's exact conflict acknowledgment. No generic SQL, HTTP, shell or private-storage tool is added.

## Recover a committed mutation

`admin.operation_receipt` accepts the original operation and request key on the same actor and origin. It checks the operation's current scopes and live authority. Default output is metadata. `includeResult: true` applies the same result redaction as the original tool; job-operation receipts remain metadata-only.

`committed` attests a database commit, not provider delivery or the current target state. `not_recorded` means unknown and may be in flight. Retry the same operation, payload and request key, obtaining a fresh signed plan if needed. Queued operations require `adminjobs.get`; uncertain external outcomes require inspection and reconciliation rather than a fresh effect under a new key.

Writes and receipt replay recheck active canonical membership, the bound live session and persisted OAuth consent inside the transaction. Authority locks precede mutation serialization and mutable targets. Discovery annotations describe behavior; they never replace authorization.

## Repository plugin distribution

The source is `plugins/zyx-authoring-mcp`, release 0.5.0. Five focused skills cover blog, content revisions, forms, media and operation recovery alongside the seven existing skills. Environment packaging exports all 12 and preserves distinct staging and production connections.

Ordinary CI validates the package. Mirroring to the external plugin repository uses the existing manually dispatched sync workflow. The server skill artifact uses a separately pinned external snapshot. A local source edit, push or successful package check does not establish either remote synchronization or installed-host acceptance.

## Focused local verification

Primary verification on 2026-11-14 passed 83 selected Bun cases with 1,336 assertions and 14 Python distribution cases. Tests ran sequentially under a one-CPU, 1,280 MiB process-group RSS and 55-second per-command guard. PostgreSQL behavior used isolated PGlite fixtures; external effects used mocks. Cases cover blog draft/publication and stale saves, explicit-slug and updated-revision replay, thumbnail normalization, capability schemas, authority revocation, scope challenges, receipt privacy, existing Admin domains and the nine revision tools.

Both environment packages exported all 12 skills, and both local candidate catalogs and compact archives were generated and integrity-checked. The existing test requiring the separately built locked `dist/skills` artifact was excluded because that artifact was absent; candidate checks do not substitute for acceptance of that external snapshot. No full application build, lint, typecheck, browser, installed-plugin, remote sync, OAuth host, provider or live PostgreSQL contention check was run. Frontend edits only carry the observed revision and select stale-save copy; no layout or navigation redesign is claimed.
