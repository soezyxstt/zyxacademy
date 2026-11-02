import { describe, expect, mock, test } from "bun:test";

let selections = 0;
mock.module("@/lib/db", () => ({ db: { select: () => { selections++; throw new Error("private database detail"); } } }));
const { registerFormsTools } = await import("@/lib/admin-mcp/forms-tools");

function tools(scopes: string[]) {
  const callbacks = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
  const server = { registerResource: () => undefined, registerTool: (name: string, _config: unknown, callback: (input: Record<string, unknown>) => Promise<any>) => callbacks.set(name, callback) };
  registerFormsTools(server as never, { userId: "u", actorId: "u", sessionId: "s", authMethod: "oauth", scopes });
  return callbacks;
}

describe("forms MCP scope boundary", () => {
  test("denied response access does not query the database", async () => {
    selections = 0;
    const result = await tools(["forms:read"]).get("forms.responses.list")!({ formId: "f" });
    expect(result.structuredContent.error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
    expect(selections).toBe(0);
  });
  test("invalid pagination does not query the database", async () => {
    selections = 0;
    const result = await tools(["forms:read"]).get("forms.list")!({ limit: 101 });
    expect(result.structuredContent.error).toBe("INVALID_INPUT");
    expect(selections).toBe(0);
  });
  test("database errors are sanitized", async () => {
    const result = await tools(["forms:read"]).get("forms.list")!({ expectedEnvironment: "local", expectedOrigin: "http://localhost:3000" });
    expect(result.structuredContent.error).toBe("ADMIN_MCP_REQUEST_FAILED");
    expect(JSON.stringify(result)).not.toContain("private database detail");
  });
});
