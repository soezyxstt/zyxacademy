import { afterEach, describe, expect, it, mock } from "bun:test";
import { OPS_AI_SKILL_CATALOG } from "@/lib/admin-ops-ai/skills-catalog";
import {
  OPS_INTERACTIVE_EXECUTION_GUIDE,
  buildOpsAiSkillsCatalogPrompt,
  loadActiveOpsAiSkillsContext,
  loadOpsAiSkillMarkdown,
} from "@/lib/admin-ops-ai/skills";
import {
  cleanOpsAiSessionTitle,
  generateOpsAiSessionTitle,
  isInitialOpsAiTitle,
} from "@/lib/admin-ops-ai/title-ai";
import {
  buildOpsAiSystemPrompt,
  createOpsAiRuntimeResponse,
} from "@/lib/admin-ops-ai/runtime";
import { setOpsAiModelStreamMock } from "@/lib/admin-ops-ai/model-factory";

mock.module("server-only", () => ({}));
const { createBrowserOperationTools } = await import("@/lib/admin-ops-ai/operation-tools");

const ORIGINAL_MOCK_GEMINI = process.env.MOCK_GEMINI;

afterEach(() => {
  setOpsAiModelStreamMock(null);
  if (ORIGINAL_MOCK_GEMINI === undefined) {
    delete process.env.MOCK_GEMINI;
  } else {
    process.env.MOCK_GEMINI = ORIGINAL_MOCK_GEMINI;
  }
});

describe("Ops AI 12 skills loader", () => {
  it("loads all 12 skills with YAML frontmatter stripped", async () => {
    expect(OPS_AI_SKILL_CATALOG).toHaveLength(12);

    for (const skill of OPS_AI_SKILL_CATALOG) {
      const markdown = await loadOpsAiSkillMarkdown(skill.id);
      expect(markdown).not.toBeNull();
      expect(markdown!.length).toBeGreaterThan(80);
      expect(markdown!.startsWith("---")).toBe(false);
      expect(markdown).not.toMatch(/^name:\s+/m);
    }

    expect(await loadOpsAiSkillMarkdown("unknown-skill-id")).toBeNull();
  });

  it("caps active skill context at 3 unique valid skills", async () => {
    const active = await loadActiveOpsAiSkillsContext([
      "zyx-forms-mcp",
      "zyx-forms-mcp",
      "invalid-skill",
      "zyx-blog-mcp",
      "zyx-media-mcp",
      "zyx-admin-operations",
    ]);

    expect(active.map((item) => item.id)).toEqual([
      "zyx-forms-mcp",
      "zyx-blog-mcp",
      "zyx-media-mcp",
    ]);
    expect(active[0].label).toBe("Form Studio");
    expect(active[0].content.startsWith("---")).toBe(false);
  });

  it("formats a compact 12-skill catalog prompt with route-relevant markers", () => {
    const formsCatalog = buildOpsAiSkillsCatalogPrompt("/admin/forms");
    expect(formsCatalog).toContain("DAFTAR 12 SKILL PLUGIN (PILIH OTOMATIS VIA load_admin_skill):");
    for (const skill of OPS_AI_SKILL_CATALOG) {
      expect(formsCatalog).toContain(`- ${skill.id}: ${skill.shortDescription}`);
    }
    expect(formsCatalog).toContain(
      `- zyx-forms-mcp: ${OPS_AI_SKILL_CATALOG.find((s) => s.id === "zyx-forms-mcp")!.shortDescription} (relevan untuk halaman ini)`,
    );
    expect(formsCatalog).toContain(
      `- zyx-admin-operations: ${OPS_AI_SKILL_CATALOG.find((s) => s.id === "zyx-admin-operations")!.shortDescription} (relevan untuk halaman ini)`,
    );
    expect(formsCatalog).not.toContain(
      `- zyx-blog-mcp: ${OPS_AI_SKILL_CATALOG.find((s) => s.id === "zyx-blog-mcp")!.shortDescription} (relevan untuk halaman ini)`,
    );
    expect(formsCatalog).not.toContain("—");
    expect(formsCatalog).not.toContain("–");

    const quizCatalog = buildOpsAiSkillsCatalogPrompt("/admin/courses/calc-1/quizzes");
    expect(quizCatalog).toContain("zyx-question-authoring-mcp");
    expect(quizCatalog).toContain(
      `- zyx-question-authoring-mcp: ${OPS_AI_SKILL_CATALOG.find((s) => s.id === "zyx-question-authoring-mcp")!.shortDescription} (relevan untuk halaman ini)`,
    );
    expect(quizCatalog).toContain(
      `- reference-question-ingest: ${OPS_AI_SKILL_CATALOG.find((s) => s.id === "reference-question-ingest")!.shortDescription} (relevan untuk halaman ini)`,
    );
  });
});

describe("Ops AI operation tools validation and load_admin_skill", () => {
  const testChat = {
    actorId: "admin-test",
    sessionId: "session-test",
    chatId: "chat-test",
    grantIds: [] as string[],
  };
  const toolOptions = { toolCallId: "tc-test", messages: [] };

  it("strips browser-managed MCP control keys and returns rich fieldErrors plus inputSchema on invalid arguments", async () => {
    const tools = createBrowserOperationTools(testChat, "run-test", true);
    const result = (await tools.use_admin_operation.execute!(
      {
        operation: "forms.presets.update",
        argumentsJson: JSON.stringify({
          dryRun: true,
          expectedEnvironment: "staging",
          expectedOrigin: "https://staging.zyxacademy.com",
          requestKey: "req-123",
          confirmationToken: "tok-123",
          id: "preset-1",
          expectedRevision: "rev-1",
          name: "Preset Uji",
          questions: [{ title: "Nama", type: "INVALID_TYPE" }],
          unexpectedExtraField: "should-report",
        }),
      },
      toolOptions,
    )) as {
      summary: string;
      issues: string[];
      fieldErrors: Array<{
        path: string;
        code: string;
        message: string;
        unrecognizedKeys?: string[];
      }>;
      inputSchema?: Record<string, unknown>;
    };

    expect(result.summary).toContain("Argumen tidak valid:");
    expect(result.summary).toContain("panggil ulang use_admin_operation");
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.fieldErrors)).toBe(true);
    expect(result.fieldErrors.length).toBeGreaterThan(0);

    const unrecognizedError = result.fieldErrors.find(
      (err) => err.code === "unrecognized_keys",
    );
    expect(unrecognizedError?.unrecognizedKeys).toEqual(["unexpectedExtraField"]);
    expect(unrecognizedError?.unrecognizedKeys).not.toContain("dryRun");
    expect(unrecognizedError?.unrecognizedKeys).not.toContain("expectedEnvironment");
    expect(unrecognizedError?.unrecognizedKeys).not.toContain("expectedOrigin");
    expect(unrecognizedError?.unrecognizedKeys).not.toContain("requestKey");
    expect(unrecognizedError?.unrecognizedKeys).not.toContain("confirmationToken");

    const enumError = result.fieldErrors.find(
      (err) => err.path === "questions.0.type",
    );
    expect(enumError).toBeDefined();
    expect(result.inputSchema).toBeDefined();
    expect(typeof result.inputSchema).toBe("object");
  });

  it("lists all 12 skills or loads a specific skill guide via load_admin_skill", async () => {
    const tools = createBrowserOperationTools(testChat, "run-test", false);

    const listed = (await tools.load_admin_skill.execute!({}, toolOptions)) as {
      summary: string;
      skills: Array<{ skillId: string; label: string }>;
    };
    expect(listed.skills).toHaveLength(12);

    const loaded = (await tools.load_admin_skill.execute!(
      { skillId: "zyx-forms-mcp" },
      toolOptions,
    )) as {
      skillId: string;
      label: string;
      guide: string;
    };
    expect(loaded.skillId).toBe("zyx-forms-mcp");
    expect(loaded.label).toBe("Form Studio");
    expect(loaded.guide.startsWith("---")).toBe(false);
    expect(loaded.guide).toContain("forms.create");
  });
});

describe("Ops AI conversation title AI", () => {
  it("cleans generated titles to max 8 words and max 64 chars without quotes, prefixes, or dashes", () => {
    expect(cleanOpsAiSessionTitle('Judul: "Audit kelengkapan mata kuliah kalkulus."')).toBe(
      "Audit kelengkapan mata kuliah kalkulus",
    );
    expect(
      cleanOpsAiSessionTitle(
        "Pembuatan formulir pendaftaran peserta pelatihan olimpiade matematika tingkat nasional tahun ini",
      ).split(" ").length,
    ).toBeLessThanOrEqual(8);
    expect(
      cleanOpsAiSessionTitle(
        "Judul panjang sekali untuk menguji pemotongan enam puluh empat karakter secara rapi",
      ).length,
    ).toBeLessThanOrEqual(64);
    expect(cleanOpsAiSessionTitle("Ringkasan \u2014 form & blog!")).toBe("Ringkasan form & blog");
  });

  it("detects initial placeholder and truncated first-message titles", () => {
    expect(isInitialOpsAiTitle("")).toBe(true);
    expect(isInitialOpsAiTitle("Percakapan Baru")).toBe(true);
    expect(isInitialOpsAiTitle("Sesi Percakapan")).toBe(true);
    expect(isInitialOpsAiTitle("Zyx Ops AI")).toBe(true);
    const firstMessage =
      "Tolong buatkan formulir pendaftaran webinar kalkulus dasar untuk mahasiswa semester satu";
    expect(isInitialOpsAiTitle(firstMessage.slice(0, 48).trim(), firstMessage)).toBe(true);
    expect(isInitialOpsAiTitle("Formulir pendaftaran webinar kalkulus", firstMessage)).toBe(
      false,
    );
  });

  it("generates a deterministic title in MOCK_GEMINI mode", async () => {
    process.env.MOCK_GEMINI = "true";
    const title = await generateOpsAiSessionTitle({
      userMessage: "Buatkan formulir pendaftaran kelas intensif fisika. Sertakan kolom nama dan email.",
      assistantMessage: "Saya siapkan proposal pembuatan formulir.",
    });

    expect(title).toBe("Buatkan formulir pendaftaran kelas intensif fisika");
  });
});

describe("Ops AI system prompt and stream session title event", () => {
  it("injects OPS_INTERACTIVE_EXECUTION_GUIDE and compact 12-skill catalog for autonomous load_admin_skill selection", () => {
    const prompt = buildOpsAiSystemPrompt(
      { currentPath: "/admin/forms", mode: "edit" },
      { browserToolsEnabled: true },
    );

    expect(prompt).toContain("load_admin_skill");
    expect(prompt).toContain(OPS_INTERACTIVE_EXECUTION_GUIDE);
    expect(prompt).toContain("DAFTAR 12 SKILL PLUGIN (PILIH OTOMATIS VIA load_admin_skill):");
    expect(prompt).toContain("pilih otomatis skill yang paling relevan");
    expect(prompt).toContain("load_admin_skill({ skillId })");
    expect(prompt).toContain("zyx-forms-mcp");
    expect(prompt).toContain("(relevan untuk halaman ini)");
    expect(prompt).not.toContain("PANDUAN SKILL AKTIF");

    const promptWithoutBridge = buildOpsAiSystemPrompt(
      { currentPath: "/admin/forms", mode: "ask" },
      { browserToolsEnabled: false },
    );
    expect(promptWithoutBridge).not.toContain(
      "DAFTAR 12 SKILL PLUGIN (PILIH OTOMATIS VIA load_admin_skill):",
    );
    expect(promptWithoutBridge).not.toContain("(relevan untuk halaman ini)");
  });

  it("emits data-session-title at end of stream when needsTitle is true", async () => {
    process.env.MOCK_GEMINI = "true";
    setOpsAiModelStreamMock(async function* () {
      yield { type: "text-delta", textDelta: "Ringkasan status formulir sudah siap." };
      yield { type: "finish", finishReason: "stop" };
    });

    const response = createOpsAiRuntimeResponse({
      messages: [{ role: "user", content: "Ringkas status formulir pendaftaran aktif." }],
      context: { currentPath: "/admin/forms", mode: "ask" },
      chatId: "chat-title-123",
      needsTitle: true,
    });

    const body = await response.text();
    expect(body).toContain('"type":"data-session-title"');
    expect(body).toContain('"sessionId":"chat-title-123"');
    expect(body).toContain('"title":"Ringkas status formulir pendaftaran aktif"');
  });
});
