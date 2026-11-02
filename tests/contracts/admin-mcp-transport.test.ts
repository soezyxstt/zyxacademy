import { expect, test } from "bun:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import { FORMS_PREVIEW_URI, FORMS_SUMMARY_URI } from "@/lib/admin-mcp/forms-ui";
const principal = { userId: "fixture", actorId: "fixture", sessionId: "fixture", authMethod: "oauth" as const, scopes: ["authoring:read"] };
async function rpc(method: string, params?: unknown) {
  const server = createAuthoringMcpServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
    return await response.json();
  } finally { await server.close(); }
}
test("tool catalog publishes mutation schemas and UI binding; original tools coexist", async () => {
  const response = await rpc("tools/list", {});
  expect(response.error).toBeUndefined();
  const tools = response.result.tools;
  expect(new Set(tools.map((tool: any) => tool.name)).size).toBe(tools.length);
  expect(tools.some((tool: any) => tool.name.startsWith("pka."))).toBe(false);
  const adminTools = tools.filter((tool: any) => /^(forms|shortlinks|courses|chapters|materials|videos|groups|tokens|users|links|blog|schedules|tutorial|enrollments|notifications|media|analytics|settings|adminjobs|jobs|meet|generation)\./.test(tool.name));
  expect(adminTools.length).toBeGreaterThan(100);
  for (const tool of adminTools) {
    expect(tool.inputSchema.required).toContain("expectedEnvironment");
    expect(tool.inputSchema.required).toContain("expectedOrigin");
  }
  const create = tools.find((tool: any) => tool.name === "forms.create");
  expect(create.annotations.readOnlyHint).toBe(false);
  expect(create.inputSchema.required).toContain("requestKey");
  expect(create.inputSchema.required).toContain("expectedEnvironment");
  expect(create.inputSchema.required).toContain("expectedOrigin");
  expect(tools.some((tool: any) => tool.name === "admin.environment")).toBe(true);
  expect(tools.find((tool: any) => tool.name === "forms.preview")._meta.ui.resourceUri).toBe(FORMS_PREVIEW_URI);
  expect(tools.some((tool: any) => tool.name === "workflow.get_playbook")).toBe(true);
});
test("UI resources remain readable after skills registration, even with no skill artifact", async () => {
  for (const uri of [FORMS_PREVIEW_URI, FORMS_SUMMARY_URI]) {
    const response = await rpc("resources/read", { uri });
    expect(response.error).toBeUndefined();
    expect(response.result.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(response.result.contents[0].text).toContain("form-action 'none'");
  }
  const listed = await rpc("resources/list", {});
  expect(listed.result.resources.map((resource: any) => resource.uri)).toContain(FORMS_PREVIEW_URI);
});
test("original authoring grant cannot execute a new admin mutation", async () => {
  const response = await rpc("tools/call", { name: "forms.create", arguments: { expectedEnvironment: "local", expectedOrigin: "http://localhost:3000", requestKey: "fixture-create", definition: { title: "Fixture", slug: "fixture", questions: [{ title: "Name", type: "TEXT" }] } } });
  expect(response.result.isError).toBe(true);
  expect(response.result.structuredContent.error).toBe("AUTHORING_MCP_SCOPE_REQUIRED");
});
