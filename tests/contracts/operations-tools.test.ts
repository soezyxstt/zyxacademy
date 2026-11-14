import { beforeAll, describe, expect, mock, test } from "bun:test";

let live = true;
let selected: Record<string, unknown> = {};
const chain: Record<string, unknown> = {};
for (const name of ["from", "where", "orderBy", "limit", "offset"]) chain[name] = () => name === "offset" ? Promise.resolve([Object.fromEntries(Object.keys(selected).map((key) => [key, key]))]) : chain;
mock.module("@/lib/db", () => ({ db: { select: (fields: Record<string, unknown>) => { selected = fields; return chain; } } }));
mock.module("@/lib/authoring/mcp-auth", () => ({
  MCP_MANUAL_CLIENT_ID: "zyx-admin-connection",
  requireMcpScope: (principal: { scopes: string[] }, scope: string) => { if (!principal.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); },
  resolveMcpAdmin: async () => { if (!live) throw new Error("AUTHORING_MCP_ADMIN_REQUIRED"); },
}));
const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
beforeAll(async () => {
  const { registerOperationsTools } = await import("@/lib/admin-mcp/operations-tools");
  registerOperationsTools({ registerTool: (name: string, _config: unknown, fn: (input: Record<string, unknown>) => Promise<any>) => handlers.set(name, fn) } as never, { userId: "u", actorId: "u", sessionId: "s", scopes: ["access:read"], authMethod: "oauth" });
});
describe("operation handlers", () => {
  test("denies absent scope", async () => {
    expect((await handlers.get("courses.list")!({ expectedEnvironment: "local", expectedOrigin: "http://localhost:3000", limit: 1, offset: 0 })).structuredContent.error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
  });
  test("revalidates live admin and sanitizes failures", async () => {
    live = false;
    const result = await handlers.get("tokens.list")!({ expectedEnvironment: "local", expectedOrigin: "http://localhost:3000", limit: 1, offset: 0 });
    expect(result.structuredContent).toMatchObject({ error: "AUTHORING_MCP_ADMIN_REQUIRED", action: "reauthorize", retryable: false });
    live = true;
  });
  test("executes bounded metadata read without token values", async () => {
    const result = await handlers.get("tokens.list")!({ expectedEnvironment: "local", expectedOrigin: "http://localhost:3000", limit: 1, offset: 0 });
    expect(result.structuredContent.data[0].id).toBe("id");
    expect(result.structuredContent.data[0].token).toBeUndefined();
    expect((await handlers.get("tokens.list")!({ limit: 101, offset: 0 })).structuredContent.error).toBe("INVALID_INPUT");
  });
});
