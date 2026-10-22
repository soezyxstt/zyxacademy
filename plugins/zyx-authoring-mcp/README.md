# Zyx Authoring MCP plugin

This package connects an MCP host to one explicitly named Zyx Authoring environment and provides thin local skill entrypoints that fetch stage playbooks at runtime via `workflow.get_playbook`.

The local 0.4.0 candidate adds default Product V4 authoring, ordered mathematical parts, Diktat lineage and renderer verification guidance. V4 is the default for new Article/Diktat authoring; explicit legacy V3 revisions remain supported. Runtime contracts and trusted verification gates decide whether a V4 artifact can advance. This directory is the local publishing mirror; editing it does not change the external commits pinned by `authoring-skills.lock.json` or any installed host package.

For a local MCP snapshot, render an environment package with `scripts/configure_environment.py build`, then run `bun scripts/build-authoring-skills.ts --local-candidate --environment staging --source <rendered-package> --output <separate-artifact>`. Candidate manifests record the workspace base commit and exact source digest. They cannot replace `dist/skills`, run in CI/deployment, or be served by a deployed environment. Normal builds still require the clean external locked source. Promote through the owning repository's review/release process and update its pin only after the actual upstream commit exists.

<!-- BEGIN:environment-config -->
## Active environment

- Environment: `staging`
- Plugin ID: `zyx-authoring-mcp-staging`
- Release version: `0.4.1`
- Bootstrap protocol: `1`
- MCP server ID: `zyx-authoring-staging`
- Endpoint: `https://staging.zyxacademy.com/api/mcp/authoring`
<!-- END:environment-config -->

Production and staging can be installed together because both the plugin ID and MCP server ID differ:

| Environment | Plugin ID | MCP server ID | Expected Codex tool prefix |
| --- | --- | --- | --- |
| Production | `zyx-authoring-mcp` | `zyx-authoring-production` | `mcp__zyx_authoring_production__` |
| Staging | `zyx-authoring-mcp-staging` | `zyx-authoring-staging` | `mcp__zyx_authoring_staging__` |

Do not publish either variant with the legacy MCP server ID `zyx-authoring` or `zyx-mcp`. A host can collapse two connections with a shared ID into one ambiguous callable namespace.

## Thin skills and server-delivered playbooks

This package includes six active authoring skills:

- `zyx-authoring-pipeline`
- `zyx-source-pack-mcp`
- `zyx-idea-bundle-mcp`
- `zyx-product-bundle-mcp`
- `zyx-question-authoring-mcp`
- `reference-question-ingest`

Each local `SKILL.md` carries only trigger metadata, environment connection identity, bootstrap protocol `1`, host subagent execution mechanics, and fail-closed safety boundaries. Detailed editorial rubrics, schema contracts, reconciliation checklists, and stage workflows are served dynamically by the MCP server through `workflow.get_playbook` and `workflow.get_contract`.

Before drafting, validating, or submitting any artifact (and upon resuming any checkpoint), the agent must call `workflow.get_playbook` with its literal skill ID, `bootstrapProtocol: 1`, `pluginVersion: "0.4.0"`, and accurate `clientCapabilities`, then pass the returned `bootstrapToken` into `workflow.start` and stage-transition tools. If `workflow.get_playbook` fails or reports `status: "incompatible"`, the agent must stop immediately and never fall back to stale cached instructions.

## Host manifests and CLI helpers

- `release.json` is the single canonical source of truth for `version` (`0.4.0`) and `bootstrapProtocol` (`1`).
- `.codex-plugin/plugin.json` is the Codex Desktop plugin manifest.
- `.claude-plugin/plugin.json` is the Claude Code plugin manifest.
- `.mcp.json` is shared by Codex and Claude Code plugin manifests and contains the environment-specific server ID (`type: "http"`).
- `mcp_config.json` is the Antigravity IDE MCP configuration (`serverUrl`).
- `claude-desktop-config.example.json` is a standalone MCP configuration template for the Claude chat tab (`type: "streamable-http"`).
- `scripts/configure_environment.py` builds deterministic environment packages into a separate output directory (`--output-dir`), provides read-only secret-redacted host diagnostics (`doctor`), and builds safe local distribution artifacts (`sync`).

## Authentication and scopes

The server does not use a static token in this package. It requires an active Zyx admin session. Hosts with MCP OAuth support should open the sign-in flow for the active endpoint automatically.

- **Default OAuth scopes**: `authoring:read`, `authoring:stage`, `authoring:review`, and `authoring:withdraw` (subject to consent selection).
- **Session connections**: An authenticated admin session connection receives all supported scopes.

A host without interactive OAuth can use a bearer token created by an authenticated admin at `/api/mcp/authoring/connection`. The token has a 30-day hard lifetime and remains bound to the originating live Better Auth session and active-admin role, invalidating earlier if the session ends or permissions change. Never commit a connection token or put it in `.mcp.json` or `mcp_config.json`.

## Implemented tool surface

Bootstrap binds the authenticated session and environment audience. On revision drift, fetch a fresh stage playbook and pass its `bootstrapToken` with the existing bound run to `workflow.get_contract`; use the returned replacement `runToken` and revalidate. Run ID, scope, source, and expiry are preserved. Legacy unbound runs must restart through the catalog. Required capabilities must be explicitly true. No legacy rejection gate is enabled in this release.

Package builds only replace files in an owned output directory. A non-empty unmanaged output or an output containing unknown files is rejected; use a new output path rather than deleting user files.

- **Bootstrap, workflow, and catalog**: `workflow.get_playbook`, `workflow.list`, `catalog.list_courses`, `catalog.list_chapters`, `source.list_files`, `source.list_reference_files`, `source.read_file`, `source.ingest`, `source.list_packs`, `source.get_pack`, `workflow.start`, `workflow.get_run`, `workflow.get_contract` (`authoring:read`). Stored course PDFs can be inspected and ingested without a local attachment; local originals remain supported. Ingested Source Packs are persisted to R2 and `impor_bundle` (`status: validated`).
- **Validation and submission**: `authoring.validate_idea_bundle`, `authoring.submit_idea_bundle`, `authoring.validate_product_bundle`, `authoring.submit_product_bundle`, `assessment.validate_quiz_draft`, `assessment.submit_quiz_draft`, `assessment.validate_reference_draft`, `assessment.submit_reference_draft` (`authoring:read` for validation, `authoring:stage` for submission).
- **Knowledge and analysis**: `assessment.list_ideas`, `assessment.get_idea`, `knowledge.search_ideas`, `knowledge.search_course_ideas`, `knowledge.get_idea`, `knowledge.list_products`, `knowledge.get_product`, `knowledge.list_sources`, `knowledge.get_source`, `knowledge.search_source_chunks`, `analysis.get_coverage`, `assessment.list_questions`, `assessment.get_question`, `assessment.list_reference_questions`, `assessment.get_reference_question`, `assessment.analyze_bank`, `assessment.find_similar` (`authoring:read`).
- **Lifecycle management**:
  - `authoring.list_imports` and `authoring.get_import`: Inspect staged Source, Idea, and Product imports and review logs without exposing storage keys or reviewer IDs (`authoring:read`).
  - `authoring.restage_idea_bundle` and `authoring.restage_product_bundle`: Replace staged bundles and reset prior review state (`authoring:stage`).
  - `authoring.discard_product_draft`: Permanently delete draft Product Bundles and staging artifacts (`authoring:withdraw`).
  - `authoring.review_idea_bundle` and `authoring.review_product_bundle`: Record immutable review decisions (`authoring:review`).
  - `authoring.withdraw_product_bundle`: Audited, idempotent, destructive withdrawal of published Product Bundles (`authoring:withdraw`). Idea Bundle withdrawal is not implemented.
  - `assessment.update_question`: Edit draft Zyx-original questions in scope and return them to `reviewStatus=generated` for admin review (`authoring:stage`). ITB example and historical reference questions are immutable; published or retired questions cannot be edited.

## Publication matrix and safety boundaries

| Workflow / Stage | Submission tool | Persistence state | Publication boundary |
| --- | --- | --- | --- |
| Source Pack | `source.ingest` | `impor_bundle` (`status="validated"`) | Validated source archive; not learner-visible. |
| Idea Bundle V3 | `authoring.submit_idea_bundle` / `authoring.restage_idea_bundle` | `impor_bundle` (`status="staged"`) | Never publishes Ideas via MCP. Admin UI publication is required before Product Bundle authoring. |
| Product Bundle V3 | `authoring.submit_product_bundle` / `authoring.restage_product_bundle` | `impor_bundle` (`status="staged"`) | Never publishes learner products via MCP. `authoring.review_product_bundle` records pedagogical review only. |
| Original Quiz Bank (`quiz_bank`) | `assessment.submit_quiz_draft` / `assessment.update_question` | `question_bank` (`status="draft"`, `reviewStatus="generated"`) | Never publishes learner quiz questions via MCP. |
| Historical Reference (`reference_question_ingest`) | `assessment.submit_reference_draft` | `reference_question_bank` (`status="published"`, `reviewStatus="published"`) | Directly persists immutable published historical reference records (`historical_reference`). |

- **Lifecycle stop conditions**: Product withdrawal (`authoring.withdraw_product_bundle`), draft discard (`authoring.discard_product_draft`), restage, and immutable review decisions change stored lifecycle state. Agents must not execute them autonomously without explicit operator authorization.

## Host installation and update guidance

- **Codex Desktop**: Add the rendered environment package as a local Codex plugin source or sync from the mirrored repository branch (`staging` or `main`), then reload plugins or start a new session.
- **Claude Code Desktop**: Load the `.claude-plugin` manifest, `skills/`, and `.mcp.json` from the environment package, and reload plugins when the package version changes.
- **Antigravity IDE**: Use the rendered `mcp_config.json` entry and the environment plugin directory (`~/.gemini/config/plugins/<plugin-id>`).
- **Claude chat tab and ChatGPT Developer Mode**: Connect to the active endpoint URL above, call `workflow.get_playbook` first in every authoring session, and pass the returned `bootstrapToken` to `workflow.start`.
