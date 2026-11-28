import { describe, expect, test } from "bun:test";
import {
  buildInlineExplanationSystemPrompt,
  createRenderHelperUiTool,
  deriveInlineUiFromMessages,
  inlineExplanationRequestSchema,
  RENDER_HELPER_UI_TOOL_NAME,
  renderHelperUiInputSchema,
} from "@/lib/zyra/inline-explanation";

describe("deriveInlineUiFromMessages", () => {
  test("returns empty state when no tool parts exist", () => {
    const result = deriveInlineUiFromMessages([
      {
        role: "user",
        parts: [{ type: "text", text: "Jelaskan bagian integral ini" }],
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "Bagian ini menggunakan substitusi u." }],
      },
    ]);

    expect(result.spec).toBeNull();
    expect(result.lastSummary).toBeNull();
    expect(result.updateCount).toBe(0);
    expect(result.isStreamingTool).toBe(false);
  });

  test("applies multi-turn replace -> append -> patch operations in order", () => {
    const result = deriveInlineUiFromMessages([
      {
        role: "user",
        parts: [{ type: "text", text: "Uraikan langkah demi langkah" }],
      },
      {
        role: "assistant",
        parts: [
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "output-available",
            input: {
              mode: "replace",
              summary: "Langkah substitusi awal",
              spec: {
                version: 1,
                blocks: [
                  {
                    id: "steps-main",
                    type: "steps",
                    title: "Langkah penyelesaian",
                    steps: [
                      {
                        id: "s1",
                        title: "Pilih substitusi",
                        blocks: [{ id: "s1-b1", type: "markdown", content: "Misalkan $u = x^2 + 1$." }],
                      },
                      {
                        id: "s2",
                        title: "Hitung turunan",
                        blocks: [{ id: "s2-b1", type: "formula_card", latex: "du = 2x\\,dx" }],
                      },
                    ],
                  },
                ],
              },
            },
          },
          { type: "text", text: "Berikut dua langkah awalnya." },
        ],
      },
      {
        role: "user",
        parts: [{ type: "text", text: "Tambahkan grafik 2D dan langkah hasil akhir" }],
      },
      {
        role: "assistant",
        parts: [
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "output-available",
            input: {
              mode: "append",
              summary: "Tambahkan grafik fungsi",
              spec: {
                blocks: [
                  {
                    id: "graph-1",
                    type: "graph",
                    title: "Kurva integrand",
                    spec: { fn: "2*x/(x^2+1)" },
                  },
                ],
              },
            },
          },
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "output-available",
            input: {
              mode: "patch",
              summary: "Tambahkan langkah 3 dan perbarui judul grafik",
              patch: {
                op: "upsert_step",
                stepsBlockId: "steps-main",
                afterStepId: "s2",
                step: {
                  id: "s3",
                  title: "Substitusi balik",
                  blocks: [
                    { id: "s3-b1", type: "formula_card", latex: "\\ln(x^2 + 1) + C" },
                  ],
                },
              },
            },
          },
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "output-available",
            input: {
              mode: "patch",
              summary: "Tambah catatan kesalahan umum",
              patch: {
                op: "upsert_block",
                afterBlockId: "steps-main",
                block: {
                  id: "callout-tip",
                  type: "callout",
                  tone: "tip",
                  title: "Catatan",
                  content: "Jangan lupa konstanta integrasi $C$.",
                },
              },
            },
          },
        ],
      },
    ]);

    expect(result.updateCount).toBe(4);
    expect(result.lastSummary).toBe("Tambah catatan kesalahan umum");
    expect(result.spec).not.toBeNull();
    expect(result.spec?.layout).toBe("compact");
    expect(result.spec?.blocks.map((b) => b.id)).toEqual([
      "steps-main",
      "callout-tip",
      "graph-1",
    ]);

    const stepsBlock = result.spec?.blocks[0];
    expect(stepsBlock?.type).toBe("steps");
    if (stepsBlock?.type === "steps") {
      expect(stepsBlock.steps.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    }
  });

  test("handles remove_step, remove_block, and replace_all patches", () => {
    const result = deriveInlineUiFromMessages([
      {
        role: "assistant",
        parts: [
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "output-available",
            input: {
              mode: "replace",
              spec: {
                blocks: [
                  {
                    id: "steps-1",
                    type: "steps",
                    steps: [
                      { id: "st-a", title: "A", blocks: [{ type: "markdown", content: "Isi A" }] },
                      { id: "st-b", title: "B", blocks: [{ type: "markdown", content: "Isi B" }] },
                    ],
                  },
                  {
                    id: "note-1",
                    type: "callout",
                    tone: "info",
                    content: "Info sementara",
                  },
                ],
              },
            },
          },
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "output-available",
            input: {
              mode: "patch",
              patch: { op: "remove_step", stepsBlockId: "steps-1", stepId: "st-a" },
            },
          },
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "output-available",
            input: {
              mode: "patch",
              patch: { op: "remove_block", blockId: "note-1" },
            },
          },
        ],
      },
    ]);

    expect(result.spec?.blocks).toHaveLength(1);
    const stepsBlock = result.spec?.blocks[0];
    expect(stepsBlock?.type).toBe("steps");
    if (stepsBlock?.type === "steps") {
      expect(stepsBlock.steps.map((s) => s.id)).toEqual(["st-b"]);
    }
  });

  test("tracks input-streaming without crashing on partial tool input and ignores output-error", () => {
    const result = deriveInlineUiFromMessages([
      {
        role: "assistant",
        parts: [
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "output-error",
            input: { mode: "replace" },
          },
          {
            type: `tool-${RENDER_HELPER_UI_TOOL_NAME}`,
            state: "input-streaming",
            input: { mode: "replace" },
          },
        ],
      },
    ]);

    expect(result.spec).toBeNull();
    expect(result.updateCount).toBe(0);
    expect(result.isStreamingTool).toBe(true);
  });

  test("auto-generates deterministic IDs when omitted in tool input", () => {
    const result = deriveInlineUiFromMessages([
      {
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: RENDER_HELPER_UI_TOOL_NAME,
            state: "input-available",
            input: {
              mode: "replace",
              spec: {
                blocks: [
                  { type: "formula_card", latex: "F = m a" },
                ],
              },
            },
          },
        ],
      },
    ]);

    expect(result.spec?.blocks).toHaveLength(1);
    expect(result.spec?.blocks[0]?.id).toBeTruthy();
  });
});

describe("inline explanation payload validation and tool execution", () => {
  test("validates inline explanation POST payload", () => {
    const valid = inlineExplanationRequestSchema.safeParse({
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "Kenapa tanda minus muncul?" }],
        },
      ],
      context: {
        courseId: "course-fisika-1",
        assessmentKind: "quiz",
        assessmentId: "quiz-1",
        questionId: "q-1",
        questionPrompt: "Hitung gaya pemulih pegas.",
        studentAnswer: "F = kx",
        correctAnswer: "F = -kx",
        explanationMarkdown: "Gaya pemulih berlawanan dengan simpangan.",
        selectedSnippet: "berlawanan dengan simpangan",
        anchorBlockId: "exp-block-1",
        intent: "explain",
      },
    });
    expect(valid.success).toBe(true);

    const invalid = inlineExplanationRequestSchema.safeParse({
      messages: [],
      context: {
        courseId: "",
        assessmentKind: "invalid",
      },
    });
    expect(invalid.success).toBe(false);
  });

  test("render_helper_ui tool validates mode requirements and normalizes spec", async () => {
    const helperTool = createRenderHelperUiTool();
    expect(helperTool.execute).toBeDefined();

    const missingSpec = await helperTool.execute!(
      { mode: "replace" },
      { toolCallId: "tc-1", messages: [] }
    );
    expect((missingSpec as { ok: boolean }).ok).toBe(false);

    const okReplace = await helperTool.execute!(
      {
        mode: "replace",
        summary: "Rumus Hukum Hooke",
        spec: {
          blocks: [{ type: "formula_card", latex: "F = -kx", title: "Hukum Hooke" }],
        },
      },
      { toolCallId: "tc-2", messages: [] }
    );
    expect((okReplace as { ok: boolean; spec?: { blocks: Array<{ id: string }> } }).ok).toBe(true);
    expect(
      (okReplace as { spec?: { blocks: Array<{ id: string }> } }).spec?.blocks[0]?.id
    ).toBe("zyra-ui-formula_card-1");
  });

  test("system prompt includes question context, selected snippet, and avoids em/en dashes", () => {
    const prompt = buildInlineExplanationSystemPrompt({
      courseId: "c-1",
      assessmentKind: "tryout",
      assessmentId: "to-1",
      questionId: "q-9",
      questionPrompt: "Tentukan limit fungsi saat x mendekati 0.",
      studentAnswer: "0",
      correctAnswer: "1",
      explanationMarkdown: "Gunakan aturan L'Hopital.",
      selectedSnippet: "aturan L'Hopital",
      anchorBlockId: "block-3",
      intent: "step_by_step",
    });

    expect(prompt).toContain("tryout");
    expect(prompt).toContain("aturan L'Hopital");
    expect(prompt).toContain("block-3");
    expect(prompt).toContain("render_helper_ui");
    expect(prompt).not.toContain("\u2014");
    expect(prompt).not.toContain("\u2013");
  });

  test("renderHelperUiInputSchema accepts patch and replace payloads", () => {
    const parsedPatch = renderHelperUiInputSchema.safeParse({
      mode: "patch",
      patch: { op: "remove_block", blockId: "b1" },
    });
    expect(parsedPatch.success).toBe(true);
  });
});
