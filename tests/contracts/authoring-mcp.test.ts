import { describe, expect, it } from "bun:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import { ingestMcpSourcePack, listAuthoringWorkflows } from "@/lib/authoring/mcp-workflows";

const testPrincipal = {
  userId: "test-admin",
  actorId: "test-admin",
  sessionId: "test-session",
  scopes: ["authoring:read", "authoring:stage"],
  authMethod: "session" as const,
};

describe("provider-neutral authoring MCP workflow registry", () => {
  it("exposes exactly the two supported workflow choices", () => {
    const workflows = listAuthoringWorkflows();
    expect(workflows.map((workflow) => workflow.key)).toEqual(["idea_product", "quiz_bank"]);
    expect(workflows.some((workflow) => workflow.key.includes("both"))).toBe(false);
    expect(workflows).toHaveLength(2);
  });

  it("returns a structured compatibility failure for an invalid Source Pack", () => {
    const result = ingestMcpSourcePack("invalid.zip", Buffer.from("not a zip").toString("base64"));
    expect(result).toMatchObject({ ok: false, error: "ZIP_NOT_ARCHIVE" });
  });

  it("rejects malformed artifact encoding before validation", () => {
    expect(() => ingestMcpSourcePack("invalid.zip", "%%%invalid%%%"))
      .toThrow("AUTHORING_MCP_BASE64_INVALID");
  });

  it("serves the MCP initialize handshake over Streamable HTTP", async () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const server = createAuthoringMcpServer(testPrincipal);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "contract-test", version: "1.0.0" },
        },
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { serverInfo: { name: "zyx-authoring" } } });
  });

  it("advertises submission tools without a combined workflow tool", async () => {
    const server = createAuthoringMcpServer(testPrincipal);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    }));
    const body = await response.json() as { result?: { tools?: Array<{ name: string }> } };
    const names = body.result?.tools?.map((tool) => tool.name) ?? [];
    expect(names).toContain("authoring.submit_idea_bundle");
    expect(names).toContain("authoring.submit_product_bundle");
    expect(names).toContain("assessment.validate_quiz_draft");
    expect(names).toContain("assessment.submit_quiz_draft");
    expect(names.some((name) => name.includes("both"))).toBe(false);
  });
});
