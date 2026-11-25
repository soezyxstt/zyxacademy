import { expect, test } from "bun:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import { issueMcpBootstrapToken } from "@/lib/authoring/mcp-workflows";
import { issueBoundMcpRunToken } from "../helpers/mcp-run";
import { ideaDraftFixture } from "../helpers/idea-draft";

const principal = { userId: "author", actorId: "author", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:read", "authoring:stage"] };

async function call(scopes: string[], args: Record<string, unknown>) {
  const server = createAuthoringMcpServer({ ...principal, scopes });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "authoring.create_idea_draft", arguments: args } }),
    }));
    expect(response.status).toBe(200);
    return await response.json() as { result?: { isError?: boolean; structuredContent?: Record<string, unknown> } };
  } finally { await server.close(); }
}

function request(actorId = "author", bindSource = true) {
  const { input, sourcePack } = ideaDraftFixture();
  const bootstrapToken = issueMcpBootstrapToken({ actorId, sessionId: "session", stage: "idea",
    clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: true } });
  const runToken = issueBoundMcpRunToken({ courseId: "course", chapterId: "chapter", ...(bindSource ? {
    sourcePackId: sourcePack.manifest.packId, sourcePackImportId: "source-import", sourcePackChecksum: sourcePack.archive.checksum,
  } : {}) }, bootstrapToken);
  return { runToken, bootstrapToken, draftKey: "first", draft: input };
}

test("registered Idea draft tool denies missing stage consent through the MCP transport", async () => {
  const body = await call(["authoring:read"], request());
  expect(body.result).toMatchObject({ isError: true, structuredContent: { error: "AUTHORING_MCP_SCOPE_REQUIRED", detail: "authoring:stage" } });
});

test("registered Idea draft tool preserves strict parsing behind the compact catalog schema", async () => {
  const input = request();
  const body = await call(principal.scopes, { ...input, draft: { ...input.draft, ideas: [{ ...input.draft.ideas[0], creatorId: "forged" }] } });
  expect(body.result).toMatchObject({ isError: true, structuredContent: { error: "IDEA_DRAFT_INPUT_INVALID", category: "content" } });
});

test("registered Idea draft tool rejects foreign principal bootstrap before private source lookup", async () => {
  const body = await call(principal.scopes, request("foreign"));
  expect(body.result).toMatchObject({ isError: true, structuredContent: { error: "AUTHORING_MCP_BOOTSTRAP_PRINCIPAL_MISMATCH" } });
});

test("registered Idea draft tool requires a bound Source Pack before private source lookup", async () => {
  const body = await call(principal.scopes, request("author", false));
  expect(body.result).toMatchObject({ isError: true, structuredContent: { error: "AUTHORING_MCP_SOURCE_PACK_REQUIRED" } });
});
