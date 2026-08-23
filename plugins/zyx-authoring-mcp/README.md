# Zyx Authoring MCP plugin

This package connects an MCP host to the Zyx Authoring MCP at:

`https://staging.zyxacademy.com/api/mcp/authoring`

It includes the four active authoring skills from this repository:

- `zyx-source-pack-mcp`
- `zyx-idea-bundle-mcp`
- `zyx-product-bundle-mcp`
- `zyx-question-authoring-mcp`

## Host manifests

- `.codex-plugin/plugin.json` is the Codex Desktop plugin manifest.
- `.claude-plugin/plugin.json` is the Claude Code Desktop plugin manifest.
- `.mcp.json` is shared by both plugin manifests.
- `claude-desktop-config.example.json` is a standalone MCP configuration template for the Claude chat tab.

## Authentication

The server does not use a static token in this package. It requires an active Zyx admin session. Hosts with MCP OAuth support should open the Zyx sign-in flow automatically. A host without interactive OAuth can use a short-lived bearer token created by an authenticated admin at `/api/mcp/authoring/connection`.

Never commit a connection token or put it in `.mcp.json`.

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
