import { expect, mock, test } from "bun:test";
let queries = 0;
mock.module("@/lib/db", () => ({ db: { select: () => { queries++; throw new Error("must not query"); } } }));
const { issueMcpConnectionToken } = await import("@/lib/authoring/mcp-workflows");
const { principalFromConnectionToken } = await import("@/lib/authoring/mcp-auth");
test("a valid signed token for another resource is rejected before database access", async () => {
  const token = issueMcpConnectionToken({ userId: "fixture", sessionId: "fixture", clientId: "fixture", resource: "https://other.example.test/api/mcp/authoring", scopes: ["forms:write"] });
  await expect(principalFromConnectionToken(token, "https://target.example.test/api/mcp/authoring")).rejects.toThrow("AUTHORING_MCP_INVALID_RESOURCE");
  expect(queries).toBe(0);
});
