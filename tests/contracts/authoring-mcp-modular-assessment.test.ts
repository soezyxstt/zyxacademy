import { describe, expect, it, mock } from "bun:test";
mock.module("server-only", () => ({}));
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { PortableMcpServer } from "@/lib/authoring/mcp-portable-server";
import {
  MCP_TOOL_NAME_MAX_LENGTH,
  MODULAR_ASSESSMENT_TOOL_NAMES,
  portableMcpToolName,
} from "@/lib/authoring/mcp-tool-names";
import { buildPlaybookResponse } from "@/lib/authoring/mcp-playbook";
import { modularAssessmentGuideResource } from "@/lib/authoring/mcp-skills";
import {
  ASSESSMENT_UI_BLOCK_TYPES,
  ASSESSMENT_UI_PATCH_OPS,
  extractPlainMarkdownFromUiSpec,
  listModularAssessmentQuestions,
  patchAssessmentUiSpec,
  registerModularAssessmentTools,
  updateModularQuestionExplanation,
  upsertModularAssessment,
  upsertModularQuestion,
  type ModularAssessmentStore,
  type StoredQuizQuestion,
  type StoredQuizTemplate,
  type StoredTryoutExam,
  type StoredTryoutQuestion,
} from "@/lib/authoring/modular-assessment-mcp";

const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
const { authoringContractSnapshot } = await import("@/lib/authoring/mcp-workflows");

const adminPrincipal = {
  userId: "test-admin",
  actorId: "test-admin",
  sessionId: "test-session",
  scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:withdraw"],
  authMethod: "session" as const,
};

function createMemoryStore(): ModularAssessmentStore & {
  quizzes: Map<string, StoredQuizTemplate>;
  quizQuestions: Map<string, StoredQuizQuestion>;
  tryouts: Map<string, StoredTryoutExam>;
  tryoutQuestions: Map<string, StoredTryoutQuestion>;
} {
  const quizzes = new Map<string, StoredQuizTemplate>();
  const quizQuestions = new Map<string, StoredQuizQuestion>();
  const tryouts = new Map<string, StoredTryoutExam>();
  const tryoutQuestions = new Map<string, StoredTryoutQuestion>();

  return {
    quizzes,
    quizQuestions,
    tryouts,
    tryoutQuestions,
    async resolveCourseId(courseIdOrKey: string) {
      return courseIdOrKey.trim();
    },
    async getQuizTemplate(id: string) {
      return quizzes.get(id) ?? null;
    },
    async saveQuizTemplate(record: StoredQuizTemplate) {
      quizzes.set(record.id, structuredClone(record));
      return record;
    },
    async getQuizQuestion(id: string) {
      return quizQuestions.get(id) ?? null;
    },
    async getQuizQuestionsByIds(ids: string[]) {
      return ids
        .map((id) => quizQuestions.get(id))
        .filter((item): item is StoredQuizQuestion => Boolean(item));
    },
    async saveQuizQuestion(record: StoredQuizQuestion) {
      quizQuestions.set(record.id, structuredClone(record));
      return record;
    },
    async updateQuizQuestionExplanation(id, payload) {
      const existing = quizQuestions.get(id);
      if (!existing) throw new Error("NOT_FOUND");
      quizQuestions.set(id, {
        ...existing,
        explanation: payload.explanation,
        explanationUi: payload.explanationUi ? structuredClone(payload.explanationUi) : null,
      });
    },
    async getTryoutExam(id: string) {
      return tryouts.get(id) ?? null;
    },
    async saveTryoutExam(record: StoredTryoutExam) {
      tryouts.set(record.id, structuredClone(record));
      return record;
    },
    async getTryoutQuestion(id: string) {
      return tryoutQuestions.get(id) ?? null;
    },
    async listTryoutQuestions(examId: string) {
      return [...tryoutQuestions.values()]
        .filter((q) => q.examId === examId)
        .sort((a, b) => a.order - b.order);
    },
    async saveTryoutQuestion(record: StoredTryoutQuestion) {
      tryoutQuestions.set(record.id, structuredClone(record));
      return record;
    },
    async updateTryoutQuestionContent(id: string, content: Record<string, unknown>) {
      const existing = tryoutQuestions.get(id);
      if (!existing) throw new Error("NOT_FOUND");
      tryoutQuestions.set(id, { ...existing, content: structuredClone(content) });
    },
  };
}

async function callJsonRpc(
  server: PortableMcpServer | ReturnType<typeof createAuthoringMcpServer>,
  method: string,
  params: Record<string, unknown> = {},
) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(
      new Request("http://localhost/api/mcp/authoring", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    return (await response.json()) as {
      result?: {
        tools?: Array<{ name: string }>;
        resources?: Array<{ uri: string; name: string }>;
        contents?: Array<{ uri: string; text?: string }>;
        isError?: boolean;
        structuredContent?: Record<string, unknown>;
      };
    };
  } finally {
    await server.close();
  }
}

describe("modular assessment MCP contract and capability discovery", () => {
  it("satisfies portable MCP tool name length and pattern limits for all 4 tools", () => {
    expect(MODULAR_ASSESSMENT_TOOL_NAMES).toEqual([
      "authoring.upsert_assessment",
      "authoring.list_assessment_questions",
      "authoring.upsert_question",
      "authoring.update_question_explanation",
    ]);
    for (const canonical of MODULAR_ASSESSMENT_TOOL_NAMES) {
      const portable = portableMcpToolName(canonical);
      expect(portable.length).toBeLessThanOrEqual(MCP_TOOL_NAME_MAX_LENGTH);
      expect(portable).toMatch(/^[a-zA-Z0-9_-]{1,40}$/);
    }
  });

  it("registers all 4 modular tools and guide resource on the authoring MCP server", async () => {
    const server = createAuthoringMcpServer(adminPrincipal);
    const listBody = await callJsonRpc(server, "tools/list");
    const toolNames = (listBody.result?.tools ?? []).map((tool) => tool.name);

    for (const canonical of MODULAR_ASSESSMENT_TOOL_NAMES) {
      expect(toolNames).toContain(portableMcpToolName(canonical));
    }

    const resourcesBody = await callJsonRpc(createAuthoringMcpServer(adminPrincipal), "resources/list");
    const uris = (resourcesBody.result?.resources ?? []).map((r) => r.uri);
    expect(uris).toContain(modularAssessmentGuideResource.uri);

    const readBody = await callJsonRpc(createAuthoringMcpServer(adminPrincipal), "resources/read", {
      uri: modularAssessmentGuideResource.uri,
    });
    expect(readBody.result?.contents?.[0]?.text).toContain("authoring.update_question_explanation");
  });

  it("advertises modular tools, UI-SDK blocks, and patch ops in contract snapshot and quiz playbook", () => {
    const outputs = authoringContractSnapshot().contracts.quiz_bank.outputs as Record<string, any>;
    expect(outputs.modularAssessment).toMatchObject({
      tools: {
        upsertAssessment: "authoring.upsert_assessment",
        listQuestions: "authoring.list_assessment_questions",
        upsertQuestion: "authoring.upsert_question",
        updateExplanation: "authoring.update_question_explanation",
      },
      scopes: {
        read: "authoring:read",
        write: "authoring:stage",
      },
      supportedKinds: ["quiz", "tryout"],
      uiSdkVersion: 1,
      uiSdkBlocks: [...ASSESSMENT_UI_BLOCK_TYPES],
      explanationPatchOps: [...ASSESSMENT_UI_PATCH_OPS],
    });

    const playbook = buildPlaybookResponse({ stage: "quiz" });
    expect(playbook.instructionsMarkdown).toContain("authoring.upsert_assessment");
    expect(playbook.instructionsMarkdown).toContain("authoring.update_question_explanation");
    expect(playbook.instructionsMarkdown).toContain("formula_card");
    expect(playbook.instructionsMarkdown).not.toMatch(/[\u2013\u2014]/);
  });

  it("enforces authoring:stage on writes and authoring:read on reads", async () => {
    const store = createMemoryStore();
    const readOnlyServer = new PortableMcpServer(
      { name: "zyx-local", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerModularAssessmentTools(
      readOnlyServer,
      { ...adminPrincipal, scopes: ["authoring:read"] },
      store,
    );

    const writeDenied = await callJsonRpc(readOnlyServer, "tools/call", {
      name: "authoring_upsert_assessment",
      arguments: { courseId: "MA1101", kind: "quiz", title: "Kuis 1" },
    });
    expect(writeDenied.result?.isError).toBe(true);
    expect(writeDenied.result?.structuredContent).toMatchObject({
      error: "AUTHORING_MCP_SCOPE_REQUIRED",
      detail: "authoring:stage",
    });

    const noReadServer = new PortableMcpServer(
      { name: "zyx-local", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerModularAssessmentTools(
      noReadServer,
      { ...adminPrincipal, scopes: ["authoring:stage"] },
      store,
    );

    const readDenied = await callJsonRpc(noReadServer, "tools/call", {
      name: "authoring_list_assessment_questions",
      arguments: { assessmentId: "qt-1" },
    });
    expect(readDenied.result?.isError).toBe(true);
    expect(readDenied.result?.structuredContent).toMatchObject({
      error: "AUTHORING_MCP_SCOPE_REQUIRED",
      detail: "authoring:read",
    });
  });
});

describe("modular quiz authoring and per-question explanation patching", () => {
  it("creates a quiz in one call, adds a UI-SDK question with auto markdown fallback, and patches only one explanation", async () => {
    const store = createMemoryStore();

    const created = await upsertModularAssessment(
      {
        courseId: "MA1101",
        kind: "quiz",
        title: "Kuis Limit Dasar",
        status: "published",
        category: "chapter",
        questions: [
          {
            id: "qb-1",
            type: "multiple_choice",
            prompt: "Hitung $\\lim_{x \\to 2} (3x + 1)$.",
            options: ["5", "6", "7", "8"],
            correctIndex: 2,
            explanation: "Substitusi langsung menghasilkan $3(2)+1=7$.",
          },
        ],
      },
      store,
    );

    expect(created).toEqual({
      ok: true,
      id: created.id,
      kind: "quiz",
      title: "Kuis Limit Dasar",
      status: "published",
      questionCount: 1,
      questionIds: ["qb-1"],
    });

    // Add a second question using ONLY promptUi and explanationUi (no plain markdown supplied)
    const added = await upsertModularQuestion(
      {
        kind: "quiz",
        quizTemplateId: created.id,
        questionId: "qb-2",
        type: "multiple_choice",
        options: ["0", "1", "2", "Tak hingga"],
        correctIndices: [1],
        promptUi: {
          blocks: [
            { id: "p-md", type: "markdown", content: "Tentukan nilai limit trigonometri berikut:" },
            { id: "p-formula", type: "formula_card", latex: "\\lim_{x \\to 0} \\frac{\\sin x}{x}" },
          ],
        },
        explanationUi: {
          blocks: [
            {
              id: "exp-steps",
              type: "steps",
              title: "Langkah Penyelesaian",
              steps: [
                {
                  id: "step-1",
                  title: "Gunakan identitas limit dasar",
                  blocks: [{ id: "s1-f", type: "formula_card", latex: "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1" }],
                },
              ],
            },
            {
              id: "exp-callout",
              type: "callout",
              tone: "tip",
              title: "Catatan",
              content: "Berlaku untuk x dalam radian.",
            },
          ],
        },
      },
      store,
    );

    expect(added).toEqual({
      ok: true,
      id: "qb-2",
      kind: "quiz",
      assessmentId: created.id,
      order: 2,
      type: "multiple_choice",
      hasPromptUi: true,
      hasExplanation: true,
      hasExplanationUi: true,
      created: true,
    });

    // Verify auto-derived plain markdown fallback
    const storedQ2 = store.quizQuestions.get("qb-2")!;
    expect(storedQ2.prompt).toContain("Tentukan nilai limit trigonometri berikut:");
    expect(storedQ2.prompt).toContain("\\lim_{x \\to 0} \\frac{\\sin x}{x}");
    expect(storedQ2.explanation).toContain("Gunakan identitas limit dasar");
    expect(storedQ2.explanation).toContain("Berlaku untuk x dalam radian.");

    // Concise list (default) omits full payloads
    const conciseList = await listModularAssessmentQuestions({ assessmentId: created.id, includeFull: false }, store);
    expect(conciseList.kind).toBe("quiz");
    expect(conciseList.questionCount).toBe(2);
    expect(conciseList.questions[0]).toMatchObject({
      id: "qb-1",
      order: 1,
      hasExplanation: true,
      hasExplanationUi: false,
      hasPromptUi: false,
    });
    expect("explanationUi" in conciseList.questions[1]).toBe(false);
    expect(conciseList.questions[1]).toMatchObject({
      id: "qb-2",
      order: 2,
      hasExplanation: true,
      hasExplanationUi: true,
      hasPromptUi: true,
    });

    // Modular explanation-only patch on qb-2 (auto-detected kind)
    const patched = await updateModularQuestionExplanation(
      {
        questionId: "qb-2",
        patches: [
          {
            op: "upsert_step",
            stepsBlockId: "exp-steps",
            afterStepId: "step-1",
            step: {
              id: "step-2",
              title: "Verifikasi dengan grafik",
              blocks: [
                {
                  id: "s2-graph",
                  type: "graph",
                  title: "Grafik sin(x)/x",
                  spec: { expression: "sin(x)/x", domain: [-5, 5] },
                },
              ],
            },
          },
          {
            op: "upsert_block",
            afterBlockId: "exp-callout",
            block: {
              id: "exp-hint",
              type: "collapsible",
              title: "Pembuktian Teorema Apit",
              variant: "derivation",
              blocks: [{ type: "markdown", content: "Untuk $x \\in (0, \\pi/2)$, $\\cos x < \\frac{\\sin x}{x} < 1$." }],
            },
          },
          {
            op: "remove_block",
            blockId: "exp-callout",
          },
        ],
      },
      store,
    );

    expect(patched).toEqual({
      ok: true,
      questionId: "qb-2",
      kind: "quiz",
      blockCount: 2,
      blockIds: ["exp-steps", "exp-hint"],
      hasExplanation: true,
      hasExplanationUi: true,
    });

    // Verify prompt, options, correctIndices, and qb-1 were NOT touched
    const afterQ2 = store.quizQuestions.get("qb-2")!;
    expect(afterQ2.prompt).toBe(storedQ2.prompt);
    expect(afterQ2.promptUi).toEqual(storedQ2.promptUi);
    expect(afterQ2.options).toEqual(["0", "1", "2", "Tak hingga"]);
    expect(afterQ2.correctIndices).toEqual([1]);
    expect(afterQ2.explanation).toContain("Verifikasi dengan grafik");
    expect(afterQ2.explanation).toContain("Pembuktian Teorema Apit");
    expect(afterQ2.explanation).not.toContain("Berlaku untuk x dalam radian.");

    const afterQ1 = store.quizQuestions.get("qb-1")!;
    expect(afterQ1.explanation).toBe("Substitusi langsung menghasilkan $3(2)+1=7$.");
  });
});

describe("modular tryout authoring and explanation patching via MCP transport", () => {
  it("supports end-to-end tryout creation, single-question upsert, and explanation patch over MCP JSON-RPC", async () => {
    const store = createMemoryStore();
    const server = new PortableMcpServer(
      { name: "zyx-local", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerModularAssessmentTools(server, adminPrincipal, store);

    const createRes = await callJsonRpc(server, "tools/call", {
      name: "authoring_upsert_assessment",
      arguments: {
        courseId: "FI1101",
        kind: "tryout",
        title: "Tryout UTS Fisika Dasar 1",
        status: "draft",
        timeLimitMinutes: 90,
        questions: [
          {
            id: "tq-1",
            type: "short_answer",
            prompt: "Sebuah benda bermassa 2 kg diberi gaya 10 N. Berapa percepatannya (m/s^2)?",
            acceptableAnswers: ["5", "5 m/s^2"],
            explanation: "Gunakan hukum kedua Newton: $a = F / m = 10 / 2 = 5\\,\\text{m/s}^2$.",
          },
        ],
      },
    });
    expect(createRes.result?.isError).toBeUndefined();
    const examId = String(createRes.result?.structuredContent?.id);
    expect(createRes.result?.structuredContent).toMatchObject({
      ok: true,
      kind: "tryout",
      title: "Tryout UTS Fisika Dasar 1",
      status: "draft",
      questionCount: 1,
      questionIds: ["tq-1"],
    });

    // Patch existing plain-markdown explanation on tq-1 by adding a 3D scene and formula card (auto-upgrades markdown)
    const patchServer = new PortableMcpServer(
      { name: "zyx-local", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerModularAssessmentTools(patchServer, adminPrincipal, store);

    const patchRes = await callJsonRpc(patchServer, "tools/call", {
      name: "authoring_update_question_explanation",
      arguments: {
        questionId: "tq-1",
        patches: [
          {
            op: "upsert_block",
            block: {
              id: "blk-formula",
              type: "formula_card",
              title: "Hukum II Newton",
              latex: "a = \\frac{F}{m} = \\frac{10}{2} = 5\\,\\text{m/s}^2",
            },
          },
          {
            op: "upsert_block",
            block: {
              id: "blk-3d",
              type: "scene_3d",
              title: "Diagram Gaya 3D",
              spec: { vectors: [{ name: "F", value: [10, 0, 0] }] },
            },
          },
        ],
      },
    });
    expect(patchRes.result?.isError).toBeUndefined();
    expect(patchRes.result?.structuredContent).toEqual({
      ok: true,
      questionId: "tq-1",
      kind: "tryout",
      blockCount: 3,
      blockIds: ["blk-0-markdown", "blk-formula", "blk-3d"],
      hasExplanation: true,
      hasExplanationUi: true,
    });

    // Verify original prompt and acceptableAnswers stayed intact
    const fullList = await listModularAssessmentQuestions({ assessmentId: examId, includeFull: true }, store);
    expect(fullList.kind).toBe("tryout");
    expect(fullList.questions[0]).toMatchObject({
      id: "tq-1",
      order: 1,
      type: "short_answer",
      prompt: "Sebuah benda bermassa 2 kg diberi gaya 10 N. Berapa percepatannya (m/s^2)?",
      acceptableAnswers: ["5", "5 m/s^2"],
      hasExplanation: true,
      hasExplanationUi: true,
    });
  });

  it("supports remove_step and all 9 Assessment UI-SDK block types in markdown extraction", () => {
    const spec = patchAssessmentUiSpec(
      null,
      {
        op: "replace_all",
        spec: {
          blocks: [
            { id: "b1", type: "markdown", content: "Ringkasan konsep." },
            { id: "b2", type: "callout", tone: "mistake", title: "Kesalahan Umum", content: "Jangan lupa tanda minus." },
            { id: "b3", type: "image", src: "https://cdn.example.test/fig1.png", alt: "Diagram benda bebas" },
            { id: "b4", type: "graph", title: "Kurva Kecepatan", spec: { kind: "line" } },
            { id: "b5", type: "scene_3d", title: "Vektor 3D", spec: { axes: true } },
            { id: "b6", type: "interactive_visual", kind: "canvas", title: "Simulasi Gerak", spec: { mode: "kinematics" } },
            { id: "b7", type: "formula_card", latex: "v = v_0 + at", note: "GLBB" },
            {
              id: "b8",
              type: "collapsible",
              title: "Detail Tambahan",
              blocks: [{ type: "markdown", content: "Integrasi percepatan konstan." }],
            },
            {
              id: "b9",
              type: "steps",
              steps: [
                { id: "s1", title: "Identifikasi variabel", blocks: [{ type: "markdown", content: "$m=2$, $F=10$" }] },
                { id: "s2", title: "Hitung hasil", blocks: [{ type: "markdown", content: "$a=5$" }] },
              ],
            },
          ],
        },
      },
    );

    expect(spec.blocks).toHaveLength(9);
    const md = extractPlainMarkdownFromUiSpec(spec);
    expect(md).toContain("Ringkasan konsep.");
    expect(md).toContain("Kesalahan Umum");
    expect(md).toContain("![Diagram benda bebas](https://cdn.example.test/fig1.png)");
    expect(md).toContain("Kurva Kecepatan");
    expect(md).toContain("Vektor 3D");
    expect(md).toContain("Simulasi Gerak");
    expect(md).toContain("$$v = v_0 + at$$");
    expect(md).toContain("Detail Tambahan");
    expect(md).toContain("Identifikasi variabel");

    const afterRemoveStep = patchAssessmentUiSpec(spec, {
      op: "remove_step",
      stepsBlockId: "b9",
      stepId: "s1",
    });
    const stepsBlock = afterRemoveStep.blocks.find((b) => b.id === "b9");
    expect(stepsBlock?.type).toBe("steps");
    if (stepsBlock?.type === "steps") {
      expect(stepsBlock.steps.map((s) => s.id)).toEqual(["s2"]);
    }
  });
});
