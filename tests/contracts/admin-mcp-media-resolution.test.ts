import { afterAll, expect, mock, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const previous = Object.fromEntries(["BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL", "ZYX_MCP_ENVIRONMENT"].map(key => [key, process.env[key]]));
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.ZYX_MCP_ENVIRONMENT = "local";
let lookups = 0;
mock.module("@/lib/storage", () => ({ storage: { exists: async (key: string) => { lookups++; return key !== "media/missing.png"; } } }));
mock.module("@/lib/authoring/mcp-auth", () => ({
  MCP_MANUAL_CLIENT_ID: "zyx-admin-connection",
  resolveMcpAdmin: async () => undefined,
  requireMcpScope(principal: { scopes: string[] }, scope: string) { if (!principal.scopes.includes(scope)) throw new Error(`AUTHORING_MCP_SCOPE_REQUIRED:${scope}`); },
}));
const { registerMediaTools } = await import("@/lib/admin-mcp/media-tools");
const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "session" as const, scopes: ["media:read"] };
function harness(scopes = principal.scopes) {
  let execute!: (input: Record<string, unknown>) => Promise<CallToolResult>;
  registerMediaTools({ registerTool(_name: string, _config: unknown, callback: typeof execute) { execute = callback; } } as never, { ...principal, scopes });
  return async (input: Record<string, unknown>) => (await execute({ expectedEnvironment: "local", expectedOrigin: "http://localhost:3000", ...input })).structuredContent as { ok: boolean; data?: Record<string, unknown>; error?: string };
}
afterAll(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; });

test("media lookup returns an encoded public application path, not a storage credential", async () => {
  const result = await harness()({ key: "media/blog/cover image.png" });
  expect(result.ok).toBe(true);
  expect(result.data).toMatchObject({ key: "media/blog/cover image.png", kind: "image", publicPath: "/api/storage/file/media/blog/cover%20image.png", publicUrl: "http://localhost:3000/api/storage/file/media/blog/cover%20image.png", byteContentVerified: false });
  expect(result.data).not.toHaveProperty("signedUrl");
});

test("private prefixes and ambiguous encoded paths fail before storage access", async () => {
  const initial = lookups;
  for (const key of ["overhaul/product-bundles/a.zip", "forms/private.pdf", "media/../private.png", "media/%2e%2e/private.png", "media/./cover.png", "media//cover.png", "media/image.png?token=private", "media/", "media/.keep"]) {
    expect((await harness()({ key })).error).toBe("INVALID_MEDIA_PATH");
  }
  expect(lookups).toBe(initial);
});

test("scope, environment and missing objects remain separate recoverable failures", async () => {
  const initial = lookups;
  expect((await harness([])({ key: "media/blog/a.png" })).error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
  expect((await harness()({ key: "media/blog/a.png", expectedEnvironment: "production" })).ok).toBe(false);
  expect(lookups).toBe(initial);
  expect((await harness()({ key: "media/missing.png" })).error).toBe("NOT_FOUND");
});
