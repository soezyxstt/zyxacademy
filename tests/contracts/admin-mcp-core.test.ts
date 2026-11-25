import { describe, expect, it } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOperationsTools } from "@/lib/admin-mcp/operations-tools";
import { MCP_AUTHORING_DEFAULT_SCOPES } from "@/lib/authoring/mcp-workflows";
import { MCP_OAUTH_INITIAL_SCOPES, approvedScopes, defaultConsentScopes, requestedScopes } from "@/lib/authoring/mcp-oauth";

const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth" as const, scopes: [...MCP_AUTHORING_DEFAULT_SCOPES] };

describe("admin MCP scope isolation", () => {
  it("offers all initial scopes but grants admin access only when selected", () => {
    const offered = requestedScopes(null);
    expect(offered).toEqual([...MCP_OAUTH_INITIAL_SCOPES]);
    expect(defaultConsentScopes(offered)).toEqual([...MCP_AUTHORING_DEFAULT_SCOPES]);
    expect(approvedScopes(null, defaultConsentScopes(offered))).toEqual([...MCP_AUTHORING_DEFAULT_SCOPES]);
    expect(approvedScopes(null, ["courses:read"])).toEqual(["courses:read"]);
    expect(approvedScopes("forms:read courses:read", ["courses:read"])).toEqual(["courses:read"]);
    expect(() => approvedScopes("authoring:read", ["courses:read"])).toThrow("invalid_scope");
  });

  it("registers operational reads and denies an old token before accessing data", async () => {
    const handlers = new Map<string, (input: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: unknown }>>();
    const server = { registerTool: (name: string, _config: unknown, handler: (input: Record<string, unknown>) => Promise<{ isError?: boolean; structuredContent?: unknown }>) => handlers.set(name, handler) } as unknown as McpServer;
    registerOperationsTools(server, principal);
    expect([...handlers.keys()]).toContain("courses.list");
    const result = await handlers.get("courses.list")!({});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: false, error: "AUTHORING_MCP_SCOPE_REQUIRED", requiredScope: "courses:read", action: "reauthorize", retryable: false });
    expect(result).toHaveProperty("_meta.mcp/www_authenticate");
  });
});
