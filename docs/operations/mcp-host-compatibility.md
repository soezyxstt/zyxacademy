# MCP host compatibility

Status: `ACTIVE`

This contract covers the HTTP MCP endpoint, initial OAuth consent, tool schemas and names, and the 0.5.4 plugin package. Repository checks establish local behavior. A merged change, deployed endpoint, and installed host package are separate release targets.

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

## JSON Schema compatibility

Every advertised tool input schema must validate against both Draft-07 and Draft 2020-12 meta-schemas. Any advertised output schema receives the same check. The current catalog contains 194 input schemas and no output schemas. A catalog regression test uses the real HTTP `tools/list` response and an invalid legacy tuple as a negative control.

`source_extract_figure.crop` is a homogeneous array of exactly four finite numbers between 0 and 1, with `items` as a schema object and `minItems`/`maxItems` equal to 4. Runtime validation also requires `x1 > x0` and `y1 > y0`. This preserves crop geometry and prevents Draft-07 tuple syntax (`items: [...]`) from disabling the tool in strict 2020-12 hosts. Invalid crops fail SDK validation before source access.

## Skill identities across environments

The package renderer gives every staging skill directory, frontmatter name, cross-skill link and host invocation prompt exactly one `-stg` suffix. Production keeps the canonical skill names. For example, staging installs `zyx-product-bundle-mcp-stg`, while production installs `zyx-product-bundle-mcp`. The compact MCP router is `zyx-authoring-stg` on staging and `zyx-authoring` on production; their resource paths and ZIP roots are distinct too.

The explicit `skill` argument in `workflow_get_playbook` remains a canonical bootstrap role, such as `zyx-product-bundle-mcp`. It is not the installed host skill name. Generated examples preserve those six protocol role IDs. Tool names and dotted operation arguments follow their separate rules above.

`Sync Zyx Authoring MCP Plugin` builds both environments and verifies that their skill names do not overlap before publishing the selected target. It compares published files against the remote baseline and keeps production publication restricted to `main`. The renderer removes obsolete generated paths only in an owned output tree. The host doctor reports old unsuffixed staging installations; updating a host package and refreshing its installed skill list remains a host action.

## Job and OAuth recovery

Skills use the server's existing job and receipt tools. Cloud Tasks and Scheduler manage delivery through the shared queue adapter; retained Inngest symbols do not identify the active provider. Keep job IDs, verification attempt IDs, operation receipts and bootstrap tokens in their own fields. Respect returned retry times, inspect uncertain outcomes before repeating a mutation, and retain trusted verification and publication checks.

OAuth access refresh belongs to the configured host connection. Waiting for a job does not require reconnecting. If the server reports missing consent, revoked refresh authorization or an expired plan, apply that specific remedy and recheck the same target before resuming.

## Verification boundaries

Focused tests cover the real MCP HTTP catalog, both JSON Schema dialects, portable and legacy calls on fresh servers, SDK crop validation, alias collision and length guards, exact consent selections, narrower requests, and refusal to widen grants silently. Discovery tests preserve canonical receipt identity. Package tests render both environments and check all 12 skills, host prompts, disjoint skill names, canonical bootstrap arguments, namespace budgets, migration diagnostics, and deterministic releases. Catalog tests verify that both environment routers keep valid references and distinct resource identities.

The local consent fixture exercises all 46 options, four selected defaults, an added admin selection, no selection, keyboard focus, and an explicit narrow request at 380 by 844 and 1536 by 864 in both themes. It uses synthetic identities and does not authorize a real account. Installed Antigravity/ChatGPT acceptance and live OAuth remain separate checks. Public endpoint probes from this workspace encountered Cloudflare error 1010; no bypass was attempted.

Primary references: [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [MCP tool names](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-names), [Antigravity plugin MCP namespace](https://antigravity.google/docs/build-plugins/#mcp-servers), and [Antigravity MCP loading](https://antigravity.google/docs/mcp#eager-loading). MCP permits dots; the portable subset also satisfies the stricter host error reported for this integration.
