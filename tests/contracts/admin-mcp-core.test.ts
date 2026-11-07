import { describe, expect, it } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOperationsTools } from "@/lib/admin-mcp/operations-tools";
import { MCP_AUTHORING_DEFAULT_SCOPES } from "@/lib/authoring/mcp-workflows";
import { approvedScopes, requestedScopes } from "@/lib/authoring/mcp-oauth";

const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth" as const, scopes: [...MCP_AUTHORING_DEFAULT_SCOPES] };

describe("admin MCP scope isolation", () => {
  it("requires explicit OAuth request and consent", () => {
    expect(requestedScopes(null)).toEqual([...MCP_AUTHORING_DEFAULT_SCOPES]);
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
    expect(result.structuredContent).toEqual({ ok: false, error: "AUTHORING_MCP_SCOPE_REQUIRED" });
  });
});
