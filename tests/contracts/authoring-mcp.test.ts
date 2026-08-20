import { describe, expect, it } from "bun:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import { ingestMcpSourcePack, listAuthoringWorkflows } from "@/lib/authoring/mcp-workflows";
import { normalizeQuestionBankDraft, parseQuestionBankDraftJson } from "@/lib/authoring/question-bank-draft";

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

  it("accepts question bank draft v2 with optional per-question Idea links", () => {
    const parsed = parseQuestionBankDraftJson(JSON.stringify({
      schemaVersion: "question-bank-draft.v2",
      draftId: "draft-1",
      questions: [{
        id: "question-1",
        difficulty: "medium",
        questionType: "multiple_choice",
        cognitiveLevel: "apply",
        reasoningPattern: "direct_application",
        tags: [],
        prompt: "Berapa hasil 2 + 2?",
        options: ["3", "4"],
        correctIndices: [1],
        acceptableAnswers: [],
        explanation: "Hasilnya 4.",
      }],
    }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const normalized = normalizeQuestionBankDraft(parsed.data);
      expect(normalized.items[0]?.ideaLinks).toEqual([]);
      expect(normalized.items[0]?.question.questionType).toBe("multiple_choice");
    }
  });

  it("normalizes the legacy KO-based quiz draft into canonical authoring input", () => {
    const parsed = parseQuestionBankDraftJson(JSON.stringify({
      schemaVersion: "quiz-bank-draft.v1",
      draftId: "legacy-draft",
      questions: [{
        id: "legacy-question",
        knowledgeObjectId: "ko-1",
        itemFormat: "multiple_choice",
        prompt: "Pilih jawaban.",
        options: ["A", "B"],
        correctIndices: [0],
        explanation: "A benar.",
        difficulty: "easy",
        cognitiveLevel: "remember",
        reasoningPattern: "recall",
      }],
    }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const normalized = normalizeQuestionBankDraft(parsed.data);
      expect(normalized.items[0]?.question.knowledgeObjectId).toBe("ko-1");
      expect(normalized.items[0]?.ideaLinks).toEqual([]);
    }
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
    expect(names).toContain("assessment.list_ideas");
    expect(names).toContain("assessment.validate_quiz_draft");
    expect(names).toContain("assessment.submit_quiz_draft");
    expect(names.some((name) => name.includes("both"))).toBe(false);
  });
});
