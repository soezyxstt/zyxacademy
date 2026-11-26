# Zyx Authoring MCP plugin

This package connects an MCP host to one explicitly named Zyx environment. Focused skills route academic authoring, content revisions, blogs, forms, media and recovery to the server's current capabilities.

Release 0.5.5 adds compact paged discovery, checksum-cached playbooks/contracts, typed flashcard and V5 drafts, explicit derived-Diktat review, truthful verifier actions, and current-runtime target proof reuse. All 12 staging host skill names keep the `-stg` suffix; canonical bootstrap roles stay unchanged. Hosts must discover support on the connected server. Old clients keep full response defaults. Exact revision, source admission, scoped review, immutable history and trusted verification remain required. Bundles below V3 remain outside this workflow.

Discover tools and contracts on the selected host before using a new capability. A newer package does not prove that the connected server has deployed it. Use a supported archive path when a direct-draft tool is absent; do not guess fields or substitute an environment. Fetch schema descriptors once per checksum and load only the playbook modules needed for the current work. Renew bootstrap at stage changes, resume or reported drift, then retain the replacement run token.

The publishing source lives in `zyxacademy/plugins/zyx-authoring-mcp`; its renderer creates the separate host packages. Editing that source does not itself update installed host packages or the external commits pinned by `authoring-skills.lock.json`.

For a local MCP snapshot, render an environment package with `scripts/configure_environment.py build`, then run `bun scripts/build-authoring-skills.ts --local-candidate --environment staging --source <rendered-package> --output <separate-artifact>`. Candidate manifests record the workspace base commit and exact source digest. They cannot replace `dist/skills`, run in CI/deployment, or be served by a deployed environment. Normal builds still require the clean external locked source. Promote through the owning repository's review/release process and update its pin only after the actual upstream commit exists.

<!-- BEGIN:environment-config -->
## Active environment

- Environment: `staging`
- Plugin ID: `zyx-stg`
- Release version: `0.5.5`
- Bootstrap protocol: `1`
- MCP server ID: `zyx-stg`
- Endpoint: `https://staging.zyxacademy.com/api/mcp/authoring`
<!-- END:environment-config -->

Production and staging have distinct plugin IDs, MCP server IDs and skill IDs:

| Environment | Plugin ID | MCP server ID | Antigravity native tool prefix |
| --- | --- | --- | --- |
| Production | `zyx-prd` | `zyx-prd` | `mcp_zyx-prd_zyx-prd_` |
| Staging | `zyx-stg` | `zyx-stg` | `mcp_zyx-stg_zyx-stg_` |

The staging build appends `-stg` to every skill directory, frontmatter `name`, cross-skill link and host invocation. Production uses the base names. Staging host display names also include `(Staging)`. The renderer records the active names in `release.json.skills`, so installing both variants exposes 24 distinct skill IDs. Regeneration and switching an owned build between environments preserve this rule without duplicate suffixes or leftover skill directories.

The MCP `workflow.get_playbook` argument `skill` identifies a protocol role, not the installed host skill. Keep its canonical unsuffixed value exactly as shown in the bootstrap examples. The package renderer preserves these arguments while changing host-facing names and links.

Do not publish either variant with the legacy MCP server ID `zyx-authoring` or `zyx-mcp`. A host can collapse two connections with a shared ID into one ambiguous callable namespace.

## Portable tool names and upgrade

Use the actual call names returned by `tools/list`. This release's server advertises letters, digits, `_` and `-`, with at most 40 characters per tool. Each bundled plugin/server prefix uses 20 characters, leaving the complete Antigravity native name within 64 characters. A custom host configuration must leave the same room; a server cannot control a host's chosen prefix.

The dotted names in skills, playbooks and this guide identify canonical operations. Public names normally replace each dot with `_`, for example `forms.responses.list` becomes `forms_responses_list`. The long name `authoring.get_solution_collection_review_context` uses `authoring_solution_review_context`. Keep dotted values in `operation` arguments, confirmation identity and receipts. Existing dotted calls still work on the updated server, but only portable names appear in its tool list. Do not add both naming sets to a host's tool declarations.

Older installations need a host package/configuration update as well as the server update:

| Environment | Previous plugin ID | Previous server ID | New plugin and server ID |
| --- | --- | --- | --- |
| Staging | `zyx-authoring-mcp-staging` | `zyx-authoring-staging` | `zyx-stg` |
| Production | `zyx-authoring-mcp` | `zyx-authoring-production` | `zyx-prd` |

Install the reviewed package for the intended environment, replace its previous entry through the host's supported plugin or MCP settings, and reload or rescan tools. Do not keep both entries active for the same endpoint. Update staging and production separately; the generator does not publish either variant. If the host creates a new OAuth client, complete its consent flow. The endpoint URL stays the same. Existing narrow grants do not gain permissions from a package upgrade; reauthorize for the additional scopes needed by the task. Do not edit host cache files or replace OAuth with a manually issued bearer proxy to recover admin/provider delegation.

A production build of this source is only a candidate until its own reviewed release. Updating the staging package does not change the production package, marketplace entry or server pin.

The read-only `doctor` recognizes previous long-ID installs and unsuffixed staging skills, and reports migration needs. `sync` replaces only a validated directory owned by the generator for the selected environment. It removes the old generated skill files during that replacement, refuses unknown user files or another environment's target, and leaves sibling plugin directories intact. Host-managed plugin caches still require the host's supported update flow.

## Thin skills and server-delivered playbooks

This package exports 12 skills:

- `zyx-authoring-pipeline`
- `zyx-source-pack-mcp`
- `zyx-idea-bundle-mcp`
- `zyx-product-bundle-mcp`
- `zyx-question-authoring-mcp`
- `reference-question-ingest`
- `zyx-admin-operations`
- `zyx-blog-mcp`
- `zyx-content-revisions`
- `zyx-forms-mcp`
- `zyx-media-mcp`
- `zyx-operation-recovery`

For admin workflows, call `admin.environment` on the intended connection, compare its environment and origin, then call `admin.capabilities` for the relevant domain. Use only advertised operations and granted scopes. Discovery metadata does not grant permission. Blog, forms, media and operation recovery do not require an academic Source Pack or an authoring run.

Initial academic authoring uses thin stage entrypoints. Detailed editorial rubrics, schema contracts, reconciliation checklists and stage workflows come from `workflow.get_playbook` and `workflow.get_contract`. Before authoring a stage or resuming its checkpoint, request a fresh playbook using the canonical role from its explicit `skill` argument, `bootstrapProtocol: 1`, `pluginVersion: "0.5.5"`, and accurate `clientCapabilities`. Pass the returned bootstrap token to the applicable workflow and stage tools. If bootstrap fails or is incompatible, stop instead of using cached instructions.

For supported V4 Article/Diktat drafts, local `bun run authoring:preview --input draft.json` consumes the same draft JSON as `authoring.create_product_draft`. Use `--check` for structure, then `--watch` while editing. Inspect the Article captures and each PDF page. Preview does not verify live references, independent review, grading, saved progress or publication; obtain trusted evidence for the exact staged revision through its advertised verification path.

For existing Idea or learning Product content, use `zyx-content-revisions`: read edit context, create a revision, patch stable IDs, plan its release, review the exact revision and explicitly publish when authorized. The revision skill bootstraps with `skill: "zyx-idea-bundle-mcp"` or `skill: "zyx-product-bundle-mcp"`, never its own name. Existing-content revisions do not require a new Source Pack or an old authoring run. Restore creates a new draft rather than changing immutable history.

Blog creation always starts as a draft. Search and edit context provide revisions, validation derives a normalized draft and reading time, and explicit publication is separate. Media lookup returns the public serving path or URL for `thumbnailUrl`; raw storage keys are not thumbnail URLs. Scheduling is not implemented. Forms preview and simulation do not persist responses.

Admin writes use the exact payload, `requestKey`, `dryRun` plan and confirmation token. Existing authorization for ordinary draft work remains valid across those steps. A lost response uses `admin.operation_receipt`: `committed` attests only the database transaction, while `not_recorded` is inconclusive. Reuse the same key and payload, obtaining a fresh plan if necessary. Queued provider work is separate; inspect its job and never automatically replay an `unknown` provider outcome.

Background work uses the Google Cloud Tasks adapter. Agents use the advertised domain tools and application job status; they do not create queue tasks or configure Inngest. Some internal adapter and event names still use Inngest terms for compatibility. Queue acceptance is not completion, and an admin operation receipt does not certify a provider result.

## Host manifests and CLI helpers

- `release.json` is the canonical source for `version` (`0.5.5`), `bootstrapProtocol` (`1`), minimum compatible version (`0.2.0`) and the exact skill inventory.
- `.codex-plugin/plugin.json` is the Codex Desktop plugin manifest.
- `.claude-plugin/plugin.json` is the Claude Code plugin manifest.
- `.mcp.json` is shared by Codex and Claude Code plugin manifests and contains the environment-specific server ID (`type: "http"`).
- `mcp_config.json` is the Antigravity IDE MCP configuration (`serverUrl`).
- `claude-desktop-config.example.json` is a standalone MCP configuration template for the Claude chat tab (`type: "streamable-http"`).
- `scripts/configure_environment.py` builds deterministic environment packages into a separate output directory (`--output-dir`), provides read-only secret-redacted host diagnostics (`doctor`), and builds safe local distribution artifacts (`sync`).

## Authentication and scopes

The package contains no static token. Initial OAuth consent requires signing in as an active Zyx admin. The resulting connection uses its own consent and refresh lifecycle while the account remains authorized. Hosts with MCP OAuth support should open the sign-in flow for the active endpoint automatically.

- **Initial OAuth choices**: A fresh URL connection offers all 46 supported scopes. Only `authoring:read`, `authoring:stage`, `authoring:review`, and `authoring:withdraw` start selected for that full request. Explicit narrower scope requests remain narrow.
- **Additional scopes**: Publication and domain-specific admin operations require the user's selection and corresponding grant. Use capability discovery and OAuth reauthorization when a grant is missing. The token contains only approved scopes; upgrading the package does not widen an existing grant.
- **OAuth renewal**: New OAuth access tokens last at most one hour. The host stores the rotating refresh token and renews access; normal browser-session expiry does not by itself require consent again. On `401`, let the host refresh first. Reauthorize for a revoked grant or `invalid_grant`; follow `Retry-After` on `503`. Renewal does not add scopes or refresh authoring bootstrap and run tokens.
- **Session connections and manual tokens**: These retain the five authoring scopes, including `authoring:publish`. They do not grant the domain-specific admin scopes or replace persisted OAuth consent for provider jobs.

A host without interactive OAuth can use a bearer token created by an authenticated admin at `/api/mcp/authoring/connection`. The token has a 30-day hard lifetime and remains bound to the originating live Better Auth session and active-admin role, invalidating earlier if the session ends or permissions change. Never commit a connection token or put it in `.mcp.json` or `mcp_config.json`.

## Implemented tool surface

Bootstrap binds the authenticated session and environment audience. On revision drift, fetch a fresh stage playbook and pass its `bootstrapToken` with the existing bound run to `workflow.get_contract`; use the returned replacement `runToken` and revalidate. Run ID, scope, source, and expiry are preserved. Runs without the required session binding must follow the server's bootstrap recovery. Required host capabilities must be explicitly true. Existing-content revisions use fresh stage bootstrap and their stored scope rather than requiring an expired authoring run.

Package builds only replace files in an owned output directory. A non-empty unmanaged output or an output containing unknown files is rejected; use a new output path rather than deleting user files.

- **Bootstrap, workflow, and catalog**: `workflow.get_playbook`, `workflow.list`, `catalog.list_courses`, `catalog.list_chapters`, `source.list_files`, `source.list_reference_files`, `source.read_file`, `source.ingest`, `source.list_packs`, `source.get_pack`, `workflow.start`, `workflow.get_run`, `workflow.get_contract` (`authoring:read`). Stored course PDFs can be inspected and ingested without a local attachment; local originals remain supported. Ingested Source Packs use the configured private storage adapter and `impor_bundle` (`status: validated`).
- **PDF jobs**: When `source.read_file` returns a job, poll `source.get_read_job` with the same `fileKey` and `jobId` after `pollAfterMs`. Polling requires `authoring:stage` in addition to read permission for the source workflow. Retry failed pages only after inspecting their errors; retain completed page content.
- **Validation and submission**: `authoring.validate_idea_bundle`, `authoring.submit_idea_bundle`, `authoring.validate_product_bundle`, `authoring.submit_product_bundle`, `assessment.validate_quiz_draft`, `assessment.submit_quiz_draft`, `assessment.validate_reference_draft`, `assessment.submit_reference_draft` (`authoring:read` for validation, `authoring:stage` for submission).
- **Direct drafts when advertised**: `authoring.create_idea_draft` and `authoring.create_product_draft` (`authoring:stage`) build metadata and archives on the server, then use the same validation and staging gates. Read their current schema descriptors. Neither tool grants review or publication, and neither is a general binary-asset or cross-import lineage uploader.
- **Knowledge and analysis**: `assessment.list_ideas`, `assessment.get_idea`, `knowledge.search_ideas`, `knowledge.search_course_ideas`, `knowledge.get_idea`, `knowledge.list_products`, `knowledge.get_product`, `knowledge.list_sources`, `knowledge.get_source`, `knowledge.search_source_chunks`, `analysis.get_coverage`, `assessment.list_questions`, `assessment.get_question`, `assessment.list_reference_questions`, `assessment.get_reference_question`, `assessment.analyze_bank`, `assessment.find_similar` (`authoring:read`).
- **Lifecycle management**:
  - `authoring.get_edit_context`, `authoring.create_revision`, `authoring.patch_revision`, `authoring.prepare_revision_verification`, `authoring.plan_release`, `authoring.review_revision`, `authoring.publish_release`, `authoring.list_revisions` and `authoring.restore_revision`: V3+ revisions and atomic same-course release with stable patch targets, scoped review reuse and exact plan identity.
  - `authoring.list_imports` and `authoring.get_import`: Inspect staged Source, Idea, and Product imports and review logs without exposing storage keys or reviewer IDs (`authoring:read`).
  - `authoring.restage_idea_bundle` and `authoring.restage_product_bundle`: Replace staged bundles and reset prior review state (`authoring:stage`).
  - `authoring.discard_product_draft`: Remove draft Product Bundle inventory; retain shared content-addressed objects for safe cleanup (`authoring:withdraw`).
  - `authoring.get_idea_review_context`, `authoring.review_idea_revision`, `authoring.get_product_review_context`, and `authoring.review_product_bundle`: Read exact-revision review context and record explicit decisions (`authoring:read` / `authoring:review`).
  - `authoring.adopt_product_draft_run`: Explicitly bind an unchanged scoped draft to the current run, auditing and invalidating prior evidence and bundle review (`authoring:stage`).
  - `authoring.publish_idea_bundle`, `authoring.publish_product_bundle`, and `authoring.publish_solution_collection`: Explicit admin publication after the applicable exact-revision gates (`authoring:publish`).
  - `authoring.withdraw_product_bundle` and `authoring.withdraw_idea_bundle`: Audited, idempotent withdrawal (`authoring:withdraw`). Idea withdrawal binds the bootstrap and exact checksum, with a scoped run or explicit exact-import recovery without a Source Pack and preserves entities owned by another published import.
  - `assessment.update_question`: Edit draft Zyx-original questions in scope and return them to `reviewStatus=generated` for admin review (`authoring:stage`). ITB example and historical reference questions are immutable; published or retired questions cannot be edited.

## Publication matrix and safety boundaries

| Workflow / Stage | Submission tool | Persistence state | Publication boundary |
| --- | --- | --- | --- |
| Source Pack | `source.ingest` | `impor_bundle` (`status="validated"`) | Validated source archive; not learner-visible. |
| Idea Bundle V3 | `authoring.create_idea_draft` when advertised; archive submit/restage otherwise | `impor_bundle` (reviewable import) | An authorized admin may explicitly publish through scoped MCP after exact-revision item review or use Admin UI. Published Ideas are required for Product authoring. |
| Learning Product Bundle V3 to V5 | `authoring.create_product_draft` for advertised V4/V5 typed content; archive submit/restage for other supported content | `impor_bundle` (draft) | An authorized admin may explicitly publish through scoped MCP or Admin UI after the applicable review, dependency, PDF and verification gates. V5 uses its separate item review. |
| Original Quiz Bank (`quiz_bank`) | `assessment.submit_quiz_draft` / `assessment.update_question` | `question_bank` (`status="draft"`, `reviewStatus="generated"`) | Never publishes learner quiz questions via MCP. |
| Historical Reference (`reference_question_ingest`) | `assessment.submit_reference_draft` | `reference_question_bank` (`status="published"`, `reviewStatus="published"`) | Directly persists immutable published historical reference records (`historical_reference`). |

- **Lifecycle authorization**: Withdrawal, draft discard, replacement, immutable review and publication must match the user's authorized task. Preparing or saving a draft does not authorize publication, external messages, deletion or access changes. Reuse existing task authorization for its ordinary steps; preserve stronger confirmation for sensitive or destructive effects and manual export conflicts.

## Repository release and mirror boundary

The canonical source inventory in `release.json` and the generator's `EXPECTED_SKILLS` stay unsuffixed. Each rendered package writes its actual environment-specific inventory into `release.json`; the allowlist, directory names, frontmatter and host prompts must agree with it. Every skill exports its `SKILL.md` and matching `agents/openai.yaml`. Extra files, reference directories, secrets and archives remain rejected. Build metadata includes `skills`, `canonicalSkills` and `skillSuffix` for downstream catalog builders. The generator produces separate staging and production packages with distinct short plugin/MCP IDs and the existing transport formats.

The repository's `sync-plugin.yml` validates packages in its existing CI path. Updating the external plugin repository is a separate, explicit `workflow_dispatch` action; production mirroring remains restricted to `main`. Pushing application changes alone does not dispatch that mirror. Changed package contents need a higher release version. After the external release commit exists, update the server's separately pinned source through its normal review process. A local candidate build does not change that pin or prove marketplace distribution, deployment or installed-host refresh.

## Host installation and update guidance

- **Codex Desktop**: Add the rendered environment package as a local Codex plugin source or sync from the mirrored repository branch (`staging` or `main`), then reload plugins or start a new session.
- **Claude Code Desktop**: Load the `.claude-plugin` manifest, `skills/`, and `.mcp.json` from the environment package, and reload plugins when the package version changes.
- **Antigravity IDE**: Use the rendered `mcp_config.json` entry and the environment plugin directory (`~/.gemini/config/plugins/<plugin-id>`).
- **Claude chat tab and ChatGPT Developer Mode**: Connect to the active endpoint URL above. Initial academic authoring starts with `workflow.get_playbook` and the applicable workflow bootstrap. Existing revisions follow `zyx-content-revisions`; admin workflows start with `admin.environment` and capability discovery.
