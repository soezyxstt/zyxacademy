# Zyx Authoring MCP plugin

This package connects an MCP host to the Zyx Authoring MCP at:

`https://staging.zyxacademy.com/api/mcp/authoring`

It includes five active authoring skills from this repository:

- `zyx-authoring-pipeline`
- `zyx-source-pack-mcp`
- `zyx-idea-bundle-mcp`
- `zyx-product-bundle-mcp`
- `zyx-question-authoring-mcp`

`zyx-authoring-pipeline` orchestrates the full `idea_product` state machine and delegates each authoring stage to the matching specialist skill. The four specialist skills remain independently invocable.

## Host manifests

- `.codex-plugin/plugin.json` is the Codex Desktop plugin manifest.
- `.claude-plugin/plugin.json` is the Claude Code Desktop plugin manifest.
- `.mcp.json` is shared by both plugin manifests.
- `claude-desktop-config.example.json` is a standalone MCP configuration template for the Claude chat tab.

## Authentication and scopes

The server does not use a static token in this package. It requires an active Zyx admin session. Hosts with MCP OAuth support should open the Zyx sign-in flow automatically.

- **Default OAuth scopes**: `authoring:read` and `authoring:stage`.
- **Supported explicit scopes**: `authoring:review` and `authoring:withdraw`.
- **Session connections**: An authenticated admin session connection receives all supported scopes.

A host without interactive OAuth can use a short-lived bearer token created by an authenticated admin at `/api/mcp/authoring/connection`. Never commit a connection token or put it in `.mcp.json`.

## Implemented tool surface

The Zyx Authoring MCP implements the following tools across workflow, validation, knowledge inspection, and lifecycle operations:

- **Workflow and catalog**: `workflow.list`, `catalog.list_courses`, `catalog.list_chapters`, `source.list_files`, `source.read_file`, `source.ingest`, `workflow.start`, `workflow.get_run`, `workflow.get_contract` (`authoring:read`). Stored course PDFs can be inspected and ingested without a local attachment; local originals remain supported.
- **Validation and staging**: `authoring.validate_idea_bundle`, `authoring.submit_idea_bundle`, `authoring.validate_product_bundle`, `authoring.submit_product_bundle`, `assessment.validate_quiz_draft`, `assessment.submit_quiz_draft` (`authoring:read` for validation, `authoring:stage` for submission).
- **Knowledge and analysis**: `assessment.list_ideas`, `assessment.get_idea`, `knowledge.search_ideas`, `knowledge.get_idea`, `knowledge.list_products`, `knowledge.get_product`, `knowledge.list_sources`, `knowledge.get_source`, `knowledge.search_source_chunks`, `analysis.get_coverage`, `assessment.list_questions`, `assessment.get_question`, `assessment.analyze_bank`, `assessment.find_similar` (`authoring:read`).
- **Lifecycle management**:
  - `authoring.list_imports` and `authoring.get_import`: Inspect staged imports and review logs without exposing storage keys or reviewer IDs (`authoring:read`).
  - `authoring.restage_idea_bundle` and `authoring.restage_product_bundle`: Replace staged bundles and reset prior review state via lifecycle services (`authoring:stage`).
  - `authoring.discard_product_draft`: Permanently delete draft Product Bundles and staging artifacts (`authoring:withdraw`).
  - `authoring.review_idea_bundle` and `authoring.review_product_bundle`: Record immutable review decisions (`authoring:review`).
  - `authoring.withdraw_product_bundle`: Audited, idempotent, destructive withdrawal of published Product Bundles (`authoring:withdraw`). Idea Bundle withdrawal is not implemented.
  - `assessment.update_question`: Edit draft Zyx-original questions in scope and return them to `reviewStatus=generated` for admin review (`authoring:stage`). ITB example questions are immutable; published or retired questions cannot be edited.

## Safety boundaries and stop conditions

- **No publication in MCP**: There is no `authoring:publish` scope and no publication tool. External agents must stop at staging or review; publication remains exclusively in the Zyx admin UI and backend services.
- **Idea withdrawal boundary**: Idea Bundle withdrawal is not implemented via MCP.
- **Lifecycle stop conditions**: Product withdrawal (`authoring.withdraw_product_bundle`), draft discard (`authoring.discard_product_draft`), restage, and immutable review decisions change stored lifecycle state. Agents must not execute them autonomously without explicit instruction.

## Codex Desktop

Use the package as a local Codex plugin source. Validate it first with the `plugin-creator` validator, then add the package to the local Codex plugin marketplace used by your desktop installation.

The plugin is intentionally not installed into a user profile by this repository change.

## Claude Code Desktop

The Claude Desktop Code tab can load the `.claude-plugin` manifest, the root `skills/` directory, and the root `.mcp.json`. Install the package through a Claude Code plugin marketplace or open it as a local development plugin. Reload plugins after changing the package.

## Claude chat tab

The chat tab has a separate MCP configuration from the Code tab. Use `claude-desktop-config.example.json` as the server entry if the installed Claude Desktop version supports file-based remote MCP configuration. Otherwise add a custom remote connector in Claude Desktop and use the endpoint URL above. The Claude Code skills are not automatically loaded into the chat tab by the MCP connection alone.

## ChatGPT

Enable Developer mode, add an MCP connector pointing at the endpoint URL above, and authenticate with the Zyx admin OAuth flow. Hosts without interactive OAuth can use the short-lived connection token from `/api/mcp/authoring/connection`. Paste `skills/zyx-question-authoring-mcp/SKILL.md` (or another skill body) into custom GPT or project instructions so the agent follows the same tool sequence.

The MCP server remains authoritative for admin access, workflow scope, checksums, provenance, quality reports, and staging. The client skills only provide workflow instructions.
