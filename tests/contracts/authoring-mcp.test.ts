import { describe, expect, it } from "bun:test";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createAuthoringMcpServer } from "@/lib/authoring/mcp-server";
import { previousIdeaBundleSourceKey } from "@/lib/bundle/staging";
import {
  authoringContractSnapshot,
  MCP_AUTHORING_DEFAULT_SCOPES,
  MCP_CONNECTION_TOKEN_TTL_SECONDS,
  ingestMcpSourcePack,
  issueMcpConnectionToken,
  issueMcpRunToken,
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
import { MCP_OAUTH_SCOPES, approvedScopes, requestedScopes } from "@/lib/authoring/mcp-oauth";
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
    ideaLinks: [{ ideaId: "idea-1", weight: 1, role: "primary" }],
    ...overrides,
  };
}

describe("provider-neutral authoring MCP workflow registry", () => {
  it("exposes the supported workflow choices without a combined option", () => {
    const workflows = listAuthoringWorkflows();
    expect(workflows.map((workflow) => workflow.key)).toEqual(["idea_product", "quiz_bank", "reference_question_ingest"]);
    expect(workflows.some((workflow) => workflow.key.includes("both"))).toBe(false);
    expect(workflows).toHaveLength(3);
  });

  it("keeps the Source Pack mandatory for idea_product and optional for quiz_bank", () => {
    const workflows = listAuthoringWorkflows();
    const ideaProduct = workflows.find((workflow) => workflow.key === "idea_product");
    const historical = workflows.find((workflow) => workflow.key === "reference_question_ingest");
    const quizBank = workflows.find((workflow) => workflow.key === "quiz_bank");
    expect(ideaProduct?.sourcePackRequired).toBe(true);
    expect(historical?.sourcePackRequired).toBe(false);
    expect(quizBank?.sourcePackRequired).toBe(false);
  });

  it("defaults OAuth to all four scopes while respecting explicit scope requests", () => {
    expect(MCP_AUTHORING_DEFAULT_SCOPES).toEqual([
      "authoring:read",
      "authoring:stage",
      "authoring:review",
      "authoring:withdraw",
    ]);
    expect(requestedScopes(null)).toEqual([
      "authoring:read",
      "authoring:stage",
      "authoring:review",
      "authoring:withdraw",
    ]);
    expect(requestedScopes("")).toEqual([...MCP_AUTHORING_DEFAULT_SCOPES]);
    expect(requestedScopes("   ")).toEqual([...MCP_AUTHORING_DEFAULT_SCOPES]);
    expect(requestedScopes("authoring:read")).toEqual(["authoring:read"]);
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

  it("grants selected supported scopes including explicit additions and rejects invalid consent", () => {
    expect(approvedScopes(null, ["authoring:read", "authoring:withdraw"])).toEqual(["authoring:read", "authoring:withdraw"]);
    expect(approvedScopes(null, ["authoring:read", "authoring:read"])).toEqual(["authoring:read"]);
    expect(() => approvedScopes(null, [])).toThrow("invalid_scope");
    expect(approvedScopes("authoring:read authoring:stage authoring:review", ["authoring:read", "authoring:stage", "authoring:review", "authoring:withdraw"])).toEqual([...MCP_OAUTH_SCOPES]);
    expect(approvedScopes("authoring:read", ["authoring:withdraw"])).toEqual(["authoring:withdraw"]);
    expect(() => approvedScopes("authoring:publish", ["authoring:read"])).toThrow("invalid_scope");
    expect(() => approvedScopes(null, ["authoring:publish"])).toThrow("invalid_scope");
    expect(() => approvedScopes(null, [new File(["authoring:read"], "scope.txt")])).toThrow("invalid_scope");
  });

  it("preserves a reduced consent scope in the issued token", () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const scopes = approvedScopes(null, ["authoring:read"]);
    const token = issueMcpConnectionToken({
      userId: testPrincipal.userId,
      sessionId: testPrincipal.sessionId,
      scopes,
    });
    expect(readMcpConnectionToken(token).scopes).toEqual(["authoring:read"]);
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

  it("accepts question bank draft v2 with explicit per-question Idea links", () => {
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
        ideaLinks: [{ ideaId: "idea-1", weight: 1, role: "primary" }],
      }],
    }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const normalized = normalizeQuestionBankDraft(parsed.data);
      expect(normalized.items[0]?.ideaLinks).toEqual([{ ideaId: "idea-1", weight: 1, role: "primary" }]);
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
    const body = await response.json() as { result?: { tools?: Array<{ name: string; inputSchema?: any; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }> } };
    const tools = body.result?.tools ?? [];
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("authoring.submit_idea_bundle");
    expect(names).toContain("authoring.submit_product_bundle");
    expect(names).toContain("assessment.list_ideas");
    expect(names).toContain("assessment.get_idea");
    expect(names).toContain("assessment.validate_quiz_draft");
    expect(names).toContain("assessment.submit_quiz_draft");
    expect(names).toContain("assessment.validate_reference_draft");
    expect(names).toContain("assessment.submit_reference_draft");
    expect(names).toContain("assessment.list_reference_questions");
    expect(names).toContain("assessment.get_reference_question");
    expect(names).toContain("knowledge.search_course_ideas");
    expect(names).toContain("source.list_reference_files");
    expect(names).toContain("authoring.list_imports");
    expect(names).toContain("authoring.get_import");
    expect(names).toContain("authoring.restage_idea_bundle");
    expect(names).toContain("authoring.restage_product_bundle");
    expect(names).toContain("authoring.discard_product_draft");
    expect(names).toContain("authoring.review_idea_bundle");
    expect(names).toContain("authoring.review_product_bundle");
    expect(names).toContain("authoring.withdraw_product_bundle");
    expect(names).toContain("assessment.update_question");
    const updateLinks = tools.find((tool) => tool.name === "assessment.update_question")?.inputSchema;
    expect(updateLinks.required).toContain("ideaLinks");
    expect(updateLinks.properties.ideaLinks.minItems).toBe(1);
    expect(names).toContain("source.list_files");
    expect(names).toContain("source.read_file");
    expect(names).toContain("source.get_read_job");
    expect(tools.find((tool) => tool.name === "source.read_file")?.inputSchema.properties.representation.default).toBe("text");
    expect(names).toContain("workflow.list");
    expect(names).toContain("workflow.start");
    expect(names).toContain("source.list_packs");
    expect(names).toContain("source.get_pack");
    expect(names.some((name) => name.includes("publish"))).toBe(false);
    expect(names.some((name) => name.includes("both"))).toBe(false);
    expect(tools.find((tool) => tool.name === "authoring.list_imports")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "source.list_files")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "source.read_file")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "source.list_packs")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "source.get_pack")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "authoring.review_idea_bundle")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tools.find((tool) => tool.name === "authoring.withdraw_product_bundle")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });

    const workflowStart = tools.find((tool) => tool.name === "workflow.start")?.inputSchema;
    expect(workflowStart?.properties?.workflow?.enum).toEqual(["idea_product", "quiz_bank", "reference_question_ingest"]);
    expect(workflowStart?.required).toContain("courseKey");
    expect(workflowStart?.required).not.toContain("chapterKey");
    expect(workflowStart?.required).not.toContain("sourcePackToken");

    const referenceList = tools.find((tool) => tool.name === "assessment.list_reference_questions")?.inputSchema;
    expect(referenceList?.properties?.limit).toMatchObject({ minimum: 1, maximum: 10, default: 10 });
  });

  it("calls the public workflow list and historical contract through MCP", async () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const server = createAuthoringMcpServer(testPrincipal);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);

    const listResponse = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "workflow.list", arguments: {} } }),
    }));
    const listBody = await listResponse.json() as { result?: { structuredContent?: { workflows?: Array<{ key: string; reviewRequired?: boolean; publicationTarget?: string }> } } };
    const workflows = listBody.result?.structuredContent?.workflows ?? [];
    expect(workflows.map((workflow) => workflow.key)).toEqual([
      "idea_product",
      "quiz_bank",
      "reference_question_ingest",
    ]);
    const historicalWorkflow = workflows.find((w) => w.key === "reference_question_ingest");
    expect(historicalWorkflow).toMatchObject({
      key: "reference_question_ingest",
      reviewRequired: false,
      publicationTarget: "reference_question_bank",
    });

    const runToken = issueMcpRunToken({ workflow: "reference_question_ingest", courseId: "course-contract", courseLabel: "Course contract" });
    const contractServer = createAuthoringMcpServer(testPrincipal);
    const contractTransport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await contractServer.connect(contractTransport);
    const contractResponse = await contractTransport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "workflow.get_contract", arguments: { runToken } } }),
    }));
    const contractBody = await contractResponse.json() as { result?: { structuredContent?: any } };
    expect(contractBody.result?.structuredContent?.workflow).toMatchObject({
      key: "reference_question_ingest",
      reviewRequired: false,
      publicationTarget: "reference_question_bank",
    });
    expect(contractBody.result?.structuredContent?.scope).toEqual({ course: "Course contract" });
    expect(contractBody.result?.structuredContent?.rules).toContain("Jangan membuat Idea baru, mengarang jawaban, mengoreksi sumber, menerjemahkan, atau menginfer jawaban yang tidak terbukti.");
    expect(contractBody.result?.structuredContent?.outputs?.referenceQuestionDraft).toMatchObject({
      reviewRequired: false,
      publicationTarget: "reference_question_bank",
      initialStatus: "published",
      allowedSourceTools: ["source.list_reference_files", "source.read_file", "source.get_read_job"],
    });
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

  it("requires stage scope before persisting PDF page images", async () => {
    for (const name of ["source.read_file", "source.get_read_job"]) {
      const server = createAuthoringMcpServer({ ...testPrincipal, scopes: ["authoring:read"] });
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call",
          params: { name, arguments: { fileKey: "not-resolved-before-scope-check", pages: [1], jobId: "a".repeat(64) } } }),
      }));
      const body = await response.json() as { result?: { isError?: boolean; structuredContent?: unknown } };
      expect(body.result?.isError).toBe(true);
      expect(body.result?.structuredContent).toMatchObject({ error: "AUTHORING_MCP_SCOPE_REQUIRED", detail: "authoring:stage" });
      await server.close();
    }
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

  it("advertises mandatory published links and exactly one primary in the contract", () => {
    const output = authoringContractSnapshot().contracts.quiz_bank.outputs as any;
    expect(output.quizDraft).toMatchObject({ ideaLinksRequired: true, primaryIdeaCount: 1 });
    expect(output.quizDraft.scopeGuidance.linkingPolicy).toMatchObject({ required: true, primaryCount: 1 });
    expect(output.quizDraft.draftExample.questions[0].ideaLinks).toEqual([
      { ideaId: "published-idea-id-in-locked-chapter", weight: 1, role: "primary" },
    ]);
  });

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

  it("rejects missing and empty Idea links at the V2 schema boundary", () => {
    expect(parseQuestionBankDraftJson(draftJson([multipleChoice("q1", { ideaLinks: [] })])).success).toBe(false);
    const { ideaLinks: _links, ...question } = multipleChoice("q1");
    expect(parseQuestionBankDraftJson(draftJson([question])).success).toBe(false);
  });

  it("blocks unlinked normalized legacy items instead of silently accepting them", () => {
    const parsed = parseQuestionBankDraftJson(draftJson([multipleChoice("q1")]));
    if (!parsed.success) throw new Error("fixture should parse");
    const draft = normalizeQuestionBankDraft(parsed.data);
    draft.items[0].ideaLinks = [];
    const review = reviewQuestionBankDraft({ draft, scopeCourseId: "course-1", scopeChapterId: "chapter-1", ideas: scopeIdeas });
    expect(review.valid).toBe(false);
    expect(review.issues.some((issue) => issue.code === "QUESTION_AUTHORING_IDEA_REQUIRED")).toBe(true);
  });

  it.each([
    [{ ideaId: "idea-1", weight: 1, role: "supporting" }],
    [{ ideaId: "idea-1", weight: 0.5, role: "primary" }, { ideaId: "idea-2", weight: 0.5, role: "primary" }],
  ])("blocks any primary count other than one: %j", (...links) => {
    const review = reviewDraft([multipleChoice("q1", { ideaLinks: links })]);
    expect(review.valid).toBe(false);
    expect(review.issues.some((issue) => issue.code === "QUESTION_AUTHORING_PRIMARY_IDEA_REQUIRED")).toBe(true);
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
    expect(warningCodes.filter((code) => code === "QUESTION_COVERAGE_GAP")).toHaveLength(1);
  });
});
