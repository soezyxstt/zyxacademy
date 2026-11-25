# MCP host compatibility

Status: `ACTIVE`

This contract covers the HTTP MCP endpoint, initial OAuth consent, tool names, and the 0.5.3 plugin package. Repository checks establish local behavior. A merged change, deployed endpoint, and installed host package are separate release targets.

## Initial OAuth permissions

The initial HTTP 401 challenge requests the complete supported OAuth set. An authorization request with no scope, or a blank scope, uses that same set. It currently contains 46 permissions: five authoring permissions and 41 admin permissions. The consent view groups them into Authoring, Academic, Content, Access, Coordination, and System.

For that complete initial set, only `authoring:read`, `authoring:stage`, `authoring:review`, and `authoring:withdraw` start selected. Publication and all admin permissions require a selection. An explicit narrower request keeps its exact scope set and selection behavior. The server never adds unavailable options to a narrow request or grants an unselected permission.

The authorization action validates that selected scopes are a nonempty subset of requested scopes. Authorization codes, access tokens, and persisted consent contain only that selection. Silent authorization cannot enlarge an existing grant. Existing session/manual connections retain their five authoring scopes; the full initial OAuth set does not expand those paths. Existing live-session, active-admin, resource-audience, and per-tool checks still apply.

If a host keeps requesting the old four-scope set, the server correctly shows those four. Start a fresh OAuth connection to discover the new initial challenge. Refreshing tools or adding `?skills=all` does not add permissions. Incremental reauthorization must request the intended complete grant, including any existing permissions that should remain, because explicit consent replaces the prior selection.

## Portable call names

`tools/list` exposes one portable name per registered tool. Names use ASCII letters, digits, `_`, and `-`, with a maximum of 40 characters. Most names replace dots with underscores. One existing long name has a fixed alias:

| Canonical operation ID | Public call name |
| --- | --- |
| `admin.environment` | `admin_environment` |
| `workflow.get_playbook` | `workflow_get_playbook` |
| `forms.responses.list` | `forms_responses_list` |
| `authoring.get_solution_collection_review_context` | `authoring_solution_review_context` |

A public SDK transport adapter maps call names back to canonical IDs before SDK validation. It translates only the names in `tools/list` and `tools/call`, preserving schemas, annotations, metadata, request identity, transport options, and response data. Each fresh stateless server builds its map during registration, so an alias call does not depend on an earlier list request. Duplicate aliases, cross-name collisions, or overlong names fail registration rather than acquiring unstable numeric suffixes.

Legacy dotted calls remain accepted but do not appear as duplicate catalog entries. Canonical IDs still identify scopes, signed plans, receipts, retry keys, and browser Ops AI operations. In particular, `admin_operation_receipt` still accepts an argument such as `operation: "blog.create"`.

`admin_capabilities` returns `callName` beside each canonical operation name and `callNames` beside workflow operation IDs. Authoring playbooks and contracts expose `toolNaming`, including the fixed alias. Their existing `nextActions` and tool references remain canonical operation IDs. The server instructions and all 12 skills tell agents to use the listed public call names while preserving dotted operation arguments. Embedded forms previews do not issue tool calls.

## Host namespace and migration

Antigravity plugin tool declarations can include both plugin and server IDs before the remote name. The package therefore uses short, distinct environment IDs:

| Environment | Plugin ID | MCP server key | Resource endpoint |
| --- | --- | --- | --- |
| Staging | `zyx-stg` | `zyx-stg` | `https://staging.zyxacademy.com/api/mcp/authoring` |
| Production candidate | `zyx-prd` | `zyx-prd` | `https://www.zyxacademy.com/api/mcp/authoring` |

The composed pattern `mcp_<plugin>_<server>_<tool>` has a 20-character prefix for either package. The 40-character tool budget keeps it within 64. The current catalog has 194 tools, unique aliases, and a longest composed name of 59 characters. Package and server checks cover this complete catalog, not only one sample. An arbitrary longer host-selected server label can still exceed a provider's limit; use the documented short key for URL-only connections too.

Upgrading the server does not rename an installed plugin. Update the package through the host's supported installation flow, replace the old staging connection with `zyx-stg`, and refresh its tool catalog. The package doctor reports the old long IDs; it does not edit host caches or silently delete connections. Installing the staging package does not migrate a production connection. The production render remains a local candidate until its separate release.

OAuth remains direct HTTP. A renamed host installation may register a new OAuth client and need consent again. The resource URL stays fixed. A manual-bearer stdio proxy is not equivalent: manual connections cannot delegate the admin/provider jobs that require persisted OAuth consent.

## Verification boundaries

Focused tests cover the real MCP HTTP catalog, portable and legacy calls on fresh servers, SDK validation, alias collision and length guards, exact consent selections, narrower requests, and refusal to widen grants silently. Discovery tests preserve canonical receipt identity. Package tests render both environments and check all 12 skills, host prompts, namespace budgets, migration diagnostics, and deterministic releases.

The local consent fixture exercises all 46 options, four selected defaults, an added admin selection, no selection, keyboard focus, and an explicit narrow request at 380 by 844 and 1536 by 864 in both themes. It uses synthetic identities and does not authorize a real account. Installed Antigravity/ChatGPT acceptance and live OAuth remain separate checks. Public endpoint probes from this workspace encountered Cloudflare error 1010; no bypass was attempted.

Primary references: [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [MCP tool names](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-names), [Antigravity plugin MCP namespace](https://antigravity.google/docs/build-plugins/#mcp-servers), and [Antigravity MCP loading](https://antigravity.google/docs/mcp#eager-loading). MCP permits dots; the portable subset also satisfies the stricter host error reported for this integration.
