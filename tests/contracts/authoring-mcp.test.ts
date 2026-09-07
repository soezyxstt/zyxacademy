import { describe, expect, it } from "bun:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import { previousIdeaBundleSourceKey } from "@/lib/bundle/staging";
import {
  MCP_AUTHORING_DEFAULT_SCOPES,
  MCP_CONNECTION_TOKEN_TTL_SECONDS,
  ingestMcpSourcePack,
  issueMcpConnectionToken,
  listAuthoringWorkflows,
  readMcpConnectionToken,
} from "@/lib/authoring/mcp-workflows";
import { normalizeQuestionBankDraft, parseQuestionBankDraftJson } from "@/lib/authoring/question-bank-draft";
import {
  computeIdeaFacets,
  filterIdeaRecords,
  normalizeIdeaDifficultyLevel,
  paginateIdeaRecords,
  type CatalogIdeaRecord,
} from "@/lib/authoring/question-catalog";
import { reviewQuestionBankDraft } from "@/lib/authoring/question-draft-review";
import { MCP_OAUTH_SCOPES, requestedScopes } from "@/lib/authoring/mcp-oauth";
import { GET as mcpGet, DELETE as mcpDelete } from "@/app/api/mcp/authoring/route";

const testPrincipal = {
  userId: "test-admin",
  actorId: "test-admin",
  sessionId: "test-session",
  scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:withdraw"],
  authMethod: "session" as const,
};

function catalogRecord(overrides: Partial<CatalogIdeaRecord> = {}): CatalogIdeaRecord {
  return {
    id: "idea-1",
    code: "MA1101-01",
    statement: "Definisi limit barisan",
    explanation: "Limit barisan didefinisikan dengan epsilon.",
    latex: null,
    knowledgeKind: "definition",
    instructionalRole: "core",
    difficultyLevel: "introductory",
    version: 2,
    semanticHash: "a".repeat(64),
    ...overrides,
  };
}

function draftJson(questions: unknown[]): string {
  return JSON.stringify({ schemaVersion: "question-bank-draft.v2", draftId: "draft-1", questions });
}

function multipleChoice(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    questionType: "multiple_choice",
    difficulty: "medium",
    cognitiveLevel: "apply",
    reasoningPattern: "direct_application",
    tags: [],
    prompt: `Pertanyaan untuk ${id}?`,
    options: ["A", "B", "C", "D"],
    correctIndices: [0],
    acceptableAnswers: [],
    explanation: "Karena A benar.",
    ideaLinks: [],
    ...overrides,
  };
}

describe("provider-neutral authoring MCP workflow registry", () => {
  it("exposes exactly the two supported workflow choices", () => {
    const workflows = listAuthoringWorkflows();
    expect(workflows.map((workflow) => workflow.key)).toEqual(["idea_product", "quiz_bank"]);
    expect(workflows.some((workflow) => workflow.key.includes("both"))).toBe(false);
    expect(workflows).toHaveLength(2);
  });

  it("keeps the Source Pack mandatory for idea_product and optional for quiz_bank", () => {
    const workflows = listAuthoringWorkflows();
    const ideaProduct = workflows.find((workflow) => workflow.key === "idea_product");
    const quizBank = workflows.find((workflow) => workflow.key === "quiz_bank");
    expect(ideaProduct?.sourcePackRequired).toBe(true);
    expect(quizBank?.sourcePackRequired).toBe(false);
  });

  it("keeps OAuth defaults backward compatible while exposing explicit lifecycle scopes", () => {
    expect(MCP_AUTHORING_DEFAULT_SCOPES).toEqual(["authoring:read", "authoring:stage"]);
    expect(requestedScopes(null)).toEqual(["authoring:read", "authoring:stage"]);
    expect(MCP_OAUTH_SCOPES).toEqual([
      "authoring:read",
      "authoring:stage",
      "authoring:review",
      "authoring:withdraw",
    ]);
    expect(requestedScopes("authoring:read authoring:review authoring:withdraw")).toEqual([
      "authoring:read",
      "authoring:review",
      "authoring:withdraw",
    ]);
    expect(() => requestedScopes("authoring:publish")).toThrow("invalid_scope");
  });

  it("issues MCP connection tokens with a 30-day hard lifetime", () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const token = issueMcpConnectionToken({
      userId: "test-admin",
      sessionId: "test-session",
      clientId: "test-client",
      resource: "https://example.test/api/mcp/authoring",
      scopes: ["authoring:read"],
    });
    const payload = readMcpConnectionToken(token);

    expect(MCP_CONNECTION_TOKEN_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(payload.expiresAt - payload.issuedAt).toBe(MCP_CONNECTION_TOKEN_TTL_SECONDS * 1000);
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

  it("rejects GET and DELETE with 405 Method Not Allowed to prevent persistent SSE compute drain", async () => {
    const getResponse = await mcpGet();
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("Allow")).toBe("POST");
    const getJson = await getResponse.json() as { error?: string };
    expect(getJson.error).toBe("METHOD_NOT_ALLOWED");

    const deleteResponse = await mcpDelete();
    expect(deleteResponse.status).toBe(405);
    expect(deleteResponse.headers.get("Allow")).toBe("POST");
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
    const body = await response.json() as { result?: { tools?: Array<{ name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }> } };
    const tools = body.result?.tools ?? [];
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("authoring.submit_idea_bundle");
    expect(names).toContain("authoring.submit_product_bundle");
    expect(names).toContain("assessment.list_ideas");
    expect(names).toContain("assessment.get_idea");
    expect(names).toContain("assessment.validate_quiz_draft");
    expect(names).toContain("assessment.submit_quiz_draft");
    expect(names).toContain("authoring.list_imports");
    expect(names).toContain("authoring.get_import");
    expect(names).toContain("authoring.restage_idea_bundle");
    expect(names).toContain("authoring.restage_product_bundle");
    expect(names).toContain("authoring.discard_product_draft");
    expect(names).toContain("authoring.review_idea_bundle");
    expect(names).toContain("authoring.review_product_bundle");
    expect(names).toContain("authoring.withdraw_product_bundle");
    expect(names).toContain("assessment.update_question");
    expect(names).toContain("source.list_files");
    expect(names).toContain("source.read_file");
    expect(names).toContain("source.list_packs");
    expect(names).toContain("source.get_pack");
    expect(names.some((name) => name.includes("publish"))).toBe(false);
    expect(names.some((name) => name.includes("both"))).toBe(false);
    expect(tools.find((tool) => tool.name === "authoring.list_imports")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "source.list_files")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "source.read_file")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "source.list_packs")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "source.get_pack")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "authoring.review_idea_bundle")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tools.find((tool) => tool.name === "authoring.withdraw_product_bundle")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("does not grant lifecycle mutations to legacy read and stage principals", async () => {
    const server = createAuthoringMcpServer({ ...testPrincipal, scopes: ["authoring:read", "authoring:stage"] });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "authoring.withdraw_product_bundle", arguments: { importId: "product-import-1" } },
      }),
    }));
    const body = await response.json() as { result?: { isError?: boolean; structuredContent?: { error?: string; detail?: string } } };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.structuredContent).toMatchObject({
      error: "AUTHORING_MCP_SCOPE_REQUIRED",
      detail: "authoring:withdraw",
    });
  });

  it("does not dereference a missing conflict when staging a new Idea Bundle", () => {
    expect(previousIdeaBundleSourceKey(undefined, undefined)).toBeNull();
    expect(previousIdeaBundleSourceKey({ id: "existing", sourceUriOrKey: "overhaul/existing.zip" }, undefined)).toBeNull();
    expect(previousIdeaBundleSourceKey(undefined, "existing")).toBeNull();
    expect(previousIdeaBundleSourceKey({ id: "existing", sourceUriOrKey: "overhaul/existing.zip" }, "other")).toBeNull();
    expect(previousIdeaBundleSourceKey({ id: "existing", sourceUriOrKey: "overhaul/existing.zip" }, "existing")).toBe("overhaul/existing.zip");
  });
});

describe("question authoring idea catalog", () => {
  const records = [
    catalogRecord(),
    catalogRecord({ id: "idea-2", code: "MA1101-02", statement: "Rumus turunan fungsi komposisi", explanation: "Gunakan aturan rantai.", knowledgeKind: "formula", difficultyLevel: "advanced" }),
    catalogRecord({ id: "idea-3", code: "MA1101-03", statement: "Prosedur sketsa grafik", explanation: "Tentukan titik kritis lalu uji tanda.", instructionalRole: "prerequisite", knowledgeKind: "procedure", difficultyLevel: "intermediate" }),
  ];

  it("normalizes unknown difficulty metadata to unspecified", () => {
    expect(normalizeIdeaDifficultyLevel(undefined)).toBe("unspecified");
    expect(normalizeIdeaDifficultyLevel({ level: "introductory" })).toBe("unspecified");
    expect(normalizeIdeaDifficultyLevel("intermediate")).toBe("intermediate");
  });

  it("filters by query, knowledge kind, role, and difficulty level", () => {
    expect(filterIdeaRecords(records, { query: "epsilon" }).map((record) => record.id)).toEqual(["idea-1"]);
    expect(filterIdeaRecords(records, { knowledgeKinds: ["formula"] }).map((record) => record.id)).toEqual(["idea-2"]);
    expect(filterIdeaRecords(records, { instructionalRoles: ["prerequisite"] }).map((record) => record.id)).toEqual(["idea-3"]);
    expect(filterIdeaRecords(records, { difficultyLevels: ["introductory", "advanced"] })).toHaveLength(2);
    expect(filterIdeaRecords(records, {})).toHaveLength(3);
  });

  it("computes facets over the filtered set", () => {
    const facets = computeIdeaFacets(filterIdeaRecords(records, { knowledgeKinds: ["definition", "formula"] }));
    expect(facets.knowledgeKind).toEqual({ definition: 1, formula: 1 });
    expect(facets.instructionalRole).toEqual({ core: 2 });
  });

  it("paginates with a next offset", () => {
    const page = paginateIdeaRecords(records, 2, 0);
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(2);
    expect(page.nextOffset).toBe(2);
    const lastPage = paginateIdeaRecords(records, 2, 2);
    expect(lastPage.items).toHaveLength(1);
    expect(lastPage.nextOffset).toBeNull();
  });
});

describe("aggregated question bank draft review", () => {
  const scopeIdeas = [
    { id: "idea-1", code: "MA1101-01", courseId: "course-1", chapterId: "chapter-1", status: "published" },
    { id: "idea-2", code: "MA1101-02", courseId: "course-1", chapterId: "chapter-1", status: "published" },
    { id: "idea-3", code: "MA1101-03", courseId: "course-1", chapterId: "chapter-2", status: "published" },
    { id: "idea-4", code: "MA1101-04", courseId: "course-1", chapterId: "chapter-1", status: "draft" },
  ];

  function reviewDraft(questions: unknown[]) {
    const parsed = parseQuestionBankDraftJson(draftJson(questions));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("draft should parse");
    return reviewQuestionBankDraft({
      draft: normalizeQuestionBankDraft(parsed.data),
      scopeCourseId: "course-1",
      scopeChapterId: "chapter-1",
      ideas: scopeIdeas,
    });
  }

  it("accepts a linked draft that satisfies scope and weight rules", () => {
    const review = reviewDraft([
      multipleChoice("q1", { ideaLinks: [
        { ideaId: "idea-1", weight: 0.7, role: "primary" },
        { ideaId: "idea-2", weight: 0.3, role: "supporting" },
      ] }),
    ]);
    expect(review.valid).toBe(true);
    expect(review.blockingIssueCount).toBe(0);
    expect(review.stats.linkedQuestionCount).toBe(1);
    expect(review.stats.coverage.coveredIdeaIds).toEqual(["idea-1", "idea-2"]);
    expect(review.stats.coverage.uncoveredIdeaIds).toEqual([]);
    expect(review.issues.some((issue) => issue.code === "QUESTION_COVERAGE_GAP")).toBe(false);
  });

  it("reports every blocking issue in one pass without failing fast", () => {
    const review = reviewDraft([
      multipleChoice("q1"),
      multipleChoice("q1", { correctIndices: [0, 0] }),
      multipleChoice("q2", { ideaLinks: [{ ideaId: "idea-missing", weight: 0.5, role: "primary" }] }),
      multipleChoice("q3", { ideaLinks: [
        { ideaId: "idea-3", weight: 0.5, role: "primary" },
        { ideaId: "idea-4", weight: 0.5, role: "required" },
      ] }),
    ]);
    const codes = review.issues.filter((issue) => issue.severity === "blocking").map((issue) => issue.code);
    expect(codes).toContain("QUESTION_BANK_DRAFT_DUPLICATE_ID");
    expect(codes).toContain("QUESTION_AUTHORING_INVALID_QUESTION");
    expect(codes).toContain("QUESTION_AUTHORING_DUPLICATE_ANSWER");
    expect(codes).toContain("QUESTION_AUTHORING_IDEA_NOT_FOUND");
    expect(codes).toContain("QUESTION_AUTHORING_IDEA_WEIGHT_INVALID");
    expect(codes).toContain("QUESTION_AUTHORING_IDEA_CHAPTER_MISMATCH");
    expect(codes).toContain("QUESTION_AUTHORING_IDEA_NOT_PUBLISHED");
    expect(review.valid).toBe(false);
  });

  it("warns about uncovered catalog ideas and empty explanations without blocking", () => {
    const review = reviewDraft([multipleChoice("q1", { explanation: "" })]);
    expect(review.valid).toBe(true);
    expect(review.blockingIssueCount).toBe(0);
    const warningCodes = review.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.code);
    expect(warningCodes).toContain("QUESTION_EXPLANATION_EMPTY");
    expect(warningCodes.filter((code) => code === "QUESTION_COVERAGE_GAP")).toHaveLength(2);
  });
});
