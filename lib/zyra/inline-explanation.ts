import { tool, type UIMessage } from "ai";
import { z } from "zod";
import {
  extractPlainMarkdownFromUiSpec,
  patchAssessmentUiSpec,
  type AssessmentUiBlock,
  type AssessmentUiPatch,
  type AssessmentUiSpec,
  type AssessmentUiStep,
} from "@/lib/assessment-ui-sdk";

export type {
  AssessmentUiBlock,
  AssessmentUiPatch,
  AssessmentUiSpec,
  AssessmentUiStep,
};

// ============================================================================
// 1. Flat Non-Recursive Input Schemas for Tool Calling
//    Matches lib/assessment-ui-sdk/schema.ts while staying free of $ref cycles
//    for Gemini / Cloudflare AI Gateway functionDeclarations compatibility.
// ============================================================================

const markdownBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("markdown"),
  content: z.string().min(1),
});

const calloutBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("callout"),
  tone: z.enum(["info", "tip", "warning", "formula", "mistake"]),
  title: z.string().max(160).optional(),
  content: z.string().min(1),
});

const imageBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("image"),
  src: z.string().min(1),
  alt: z.string().min(1),
  caption: z.string().max(300).optional(),
  aspect: z.enum(["auto", "video", "square"]).optional(),
});

const graphBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("graph"),
  title: z.string().max(160).optional(),
  caption: z.string().max(300).optional(),
  spec: z.record(z.string(), z.unknown()),
});

const scene3dBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("scene_3d"),
  title: z.string().max(160).optional(),
  caption: z.string().max(300).optional(),
  spec: z.record(z.string(), z.unknown()),
});

const interactiveVisualBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("interactive_visual"),
  title: z.string().max(160).optional(),
  caption: z.string().max(300).optional(),
  kind: z.enum(["canvas", "document", "chart", "flowchart"]),
  spec: z.record(z.string(), z.unknown()),
});

const formulaCardBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("formula_card"),
  title: z.string().max(160).optional(),
  latex: z.string().min(1),
  note: z.string().max(400).optional(),
});

const leafBlockInputSchema = z.discriminatedUnion("type", [
  markdownBlockInputSchema,
  calloutBlockInputSchema,
  imageBlockInputSchema,
  graphBlockInputSchema,
  scene3dBlockInputSchema,
  interactiveVisualBlockInputSchema,
  formulaCardBlockInputSchema,
]);

const stepInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  title: z.string().min(1).max(200),
  summary: z.string().max(400).optional(),
  blocks: z.array(leafBlockInputSchema).min(1),
});

const stepsBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("steps"),
  title: z.string().max(160).optional(),
  collapsible: z.boolean().optional(),
  steps: z.array(stepInputSchema).min(1),
});

const collapsibleBlockInputSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  type: z.literal("collapsible"),
  title: z.string().min(1).max(200),
  defaultOpen: z.boolean().optional(),
  variant: z.enum(["hint", "derivation", "detail", "note"]).optional(),
  blocks: z.array(leafBlockInputSchema).min(1),
});

export const inlineUiBlockInputSchema = z.discriminatedUnion("type", [
  markdownBlockInputSchema,
  stepsBlockInputSchema,
  collapsibleBlockInputSchema,
  calloutBlockInputSchema,
  imageBlockInputSchema,
  graphBlockInputSchema,
  scene3dBlockInputSchema,
  interactiveVisualBlockInputSchema,
  formulaCardBlockInputSchema,
]);

export const inlineUiSpecInputSchema = z.object({
  version: z.literal(1).optional(),
  layout: z.enum(["standard", "compact"]).optional(),
  blocks: z.array(inlineUiBlockInputSchema),
});

export const inlineUiPatchInputSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("replace_all"),
    spec: inlineUiSpecInputSchema,
  }),
  z.object({
    op: z.literal("upsert_block"),
    block: inlineUiBlockInputSchema,
    afterBlockId: z.string().min(1).max(120).optional(),
  }),
  z.object({
    op: z.literal("remove_block"),
    blockId: z.string().min(1).max(120),
  }),
  z.object({
    op: z.literal("upsert_step"),
    stepsBlockId: z.string().min(1).max(120),
    step: stepInputSchema,
    afterStepId: z.string().min(1).max(120).optional(),
  }),
  z.object({
    op: z.literal("remove_step"),
    stepsBlockId: z.string().min(1).max(120),
    stepId: z.string().min(1).max(120),
  }),
]);

export type InlineUiBlockInput = z.infer<typeof inlineUiBlockInputSchema>;
export type InlineUiSpecInput = z.infer<typeof inlineUiSpecInputSchema>;
export type InlineUiPatchInput = z.infer<typeof inlineUiPatchInputSchema>;

// ============================================================================
// 2. Deterministic ID Normalization & Patch Application
// ============================================================================

function normalizeBlock(block: InlineUiBlockInput, prefix: string, index: number): AssessmentUiBlock {
  const id = block.id?.trim() || `${prefix}-${block.type}-${index + 1}`;

  if (block.type === "steps") {
    return {
      ...block,
      id,
      steps: block.steps.map((step, stepIdx) => {
        const stepId = step.id?.trim() || `${id}-step-${stepIdx + 1}`;
        return {
          ...step,
          id: stepId,
          blocks: step.blocks.map((child, childIdx) =>
            normalizeBlock(child, stepId, childIdx)
          ),
        };
      }),
    };
  }

  if (block.type === "collapsible") {
    return {
      ...block,
      id,
      blocks: block.blocks.map((child, childIdx) =>
        normalizeBlock(child, id, childIdx)
      ),
    };
  }

  return {
    ...block,
    id,
  };
}

function normalizeStep(
  step: z.infer<typeof stepInputSchema>,
  stepsBlockId: string,
  index: number
): AssessmentUiStep {
  const stepId = step.id?.trim() || `${stepsBlockId}-step-${index + 1}`;
  return {
    ...step,
    id: stepId,
    blocks: step.blocks.map((child, childIdx) =>
      normalizeBlock(child, stepId, childIdx)
    ),
  };
}

export function normalizeInlineUiSpec(
  input: InlineUiSpecInput,
  idPrefix = "zyra-ui"
): AssessmentUiSpec {
  return {
    version: 1,
    layout: input.layout ?? "compact",
    blocks: input.blocks.map((block, index) => normalizeBlock(block, idPrefix, index)),
  };
}

export function normalizeInlineUiPatch(
  input: InlineUiPatchInput,
  idPrefix = "zyra-patch"
): AssessmentUiPatch {
  switch (input.op) {
    case "replace_all":
      return {
        op: "replace_all",
        spec: normalizeInlineUiSpec(input.spec, idPrefix),
      };
    case "upsert_block":
      return {
        op: "upsert_block",
        block: normalizeBlock(input.block, idPrefix, 0),
        afterBlockId: input.afterBlockId,
      };
    case "remove_block":
      return {
        op: "remove_block",
        blockId: input.blockId,
      };
    case "upsert_step":
      return {
        op: "upsert_step",
        stepsBlockId: input.stepsBlockId,
        step: normalizeStep(input.step, input.stepsBlockId, 0),
        afterStepId: input.afterStepId,
      };
    case "remove_step":
      return {
        op: "remove_step",
        stepsBlockId: input.stepsBlockId,
        stepId: input.stepId,
      };
  }
}

export function applyInlineUiPatch(
  current: AssessmentUiSpec | null,
  patch: AssessmentUiPatch
): AssessmentUiSpec {
  const base: AssessmentUiSpec = current ?? {
    version: 1,
    layout: "compact",
    blocks: [],
  };
  return patchAssessmentUiSpec(base, patch);
}

// ============================================================================
// 3. Vercel AI SDK v6 Tool Definition (`render_helper_ui`)
// ============================================================================

export const RENDER_HELPER_UI_TOOL_NAME = "render_helper_ui" as const;

export const renderHelperUiInputSchema = z.object({
  mode: z.enum(["replace", "append", "patch"]),
  summary: z.string().max(240).optional(),
  spec: inlineUiSpecInputSchema.optional(),
  patch: inlineUiPatchInputSchema.optional(),
});

export type RenderHelperUiInput = z.infer<typeof renderHelperUiInputSchema>;

export interface RenderHelperUiOutput {
  ok: boolean;
  mode: "replace" | "append" | "patch";
  summary?: string;
  spec?: AssessmentUiSpec;
  patch?: AssessmentUiPatch;
  error?: string;
}

export function createRenderHelperUiTool() {
  return tool({
    description:
      "Buat atau perbarui UI bantuan interaktif secara langsung di dalam kartu penjelasan inline pembahasan (langkah terstruktur, collapsible, callout, kartu rumus, grafik 2D, adegan 3D, atau visual interaktif). Gunakan mode 'replace' untuk tampilan awal atau perombakan penuh, 'append' untuk menambah blok baru di bawah UI yang sudah ada, dan 'patch' untuk memperbarui atau menghapus blok/langkah tertentu berdasarkan ID.",
    inputSchema: renderHelperUiInputSchema,
    execute: async (input): Promise<RenderHelperUiOutput> => {
      if ((input.mode === "replace" || input.mode === "append") && !input.spec) {
        return {
          ok: false,
          mode: input.mode,
          error: "Field 'spec' wajib diisi untuk mode replace atau append.",
        };
      }
      if (input.mode === "patch" && !input.patch) {
        return {
          ok: false,
          mode: input.mode,
          error: "Field 'patch' wajib diisi untuk mode patch.",
        };
      }

      if (input.mode === "patch" && input.patch) {
        const normalizedPatch = normalizeInlineUiPatch(input.patch);
        return {
          ok: true,
          mode: "patch",
          summary: input.summary,
          patch: normalizedPatch,
        };
      }

      const normalizedSpec = normalizeInlineUiSpec(input.spec!);
      return {
        ok: true,
        mode: input.mode,
        summary: input.summary,
        spec: normalizedSpec,
      };
    },
  });
}

// ============================================================================
// 4. Request Validation & System Prompt Builder
// ============================================================================

export const inlineExplanationIntentSchema = z.enum([
  "explain",
  "step_by_step",
  "visualize",
  "custom",
]);

export type InlineExplanationIntent = z.infer<typeof inlineExplanationIntentSchema>;

export const inlineExplanationContextSchema = z.object({
  courseId: z.string().trim().min(1).max(120),
  assessmentKind: z.enum(["quiz", "tryout"]),
  assessmentId: z.string().trim().min(1).max(120),
  questionId: z.string().trim().min(1).max(120),
  questionPrompt: z.string().trim().min(1).max(8000),
  studentAnswer: z.string().max(4000).optional(),
  correctAnswer: z.string().max(4000).optional(),
  explanationMarkdown: z.string().max(12000).optional().nullable(),
  explanationSpec: inlineUiSpecInputSchema.optional().nullable(),
  selectedSnippet: z.string().trim().min(1).max(1600),
  anchorBlockId: z.string().trim().min(1).max(160),
  surroundingText: z.string().max(2000).optional(),
  intent: inlineExplanationIntentSchema.optional(),
  currentInlineUi: inlineUiSpecInputSchema.optional().nullable(),
});

export type InlineExplanationContext = z.infer<typeof inlineExplanationContextSchema>;

const uiMessagePartSchema = z
  .object({
    type: z.string().min(1),
  })
  .passthrough();

export const inlineExplanationRequestSchema = z.object({
  id: z.string().max(120).optional(),
  messages: z
    .array(
      z
        .object({
          id: z.string().optional(),
          role: z.enum(["user", "assistant", "system"]),
          parts: z.array(uiMessagePartSchema).optional(),
          content: z.string().optional(),
        })
        .passthrough()
    )
    .min(1)
    .max(30),
  context: inlineExplanationContextSchema,
});

export type InlineExplanationRequest = z.infer<typeof inlineExplanationRequestSchema>;

function summarizeExistingInlineBlockIds(spec: AssessmentUiSpec | null | undefined): string {
  if (!spec?.blocks?.length) return "Belum ada blok UI bantuan.";
  const entries = spec.blocks.map((block) => {
    if (block.type === "steps") {
      const stepIds = block.steps.map((s) => `${s.id} ("${s.title}")`).join(", ");
      return `- ${block.id} [steps]: [${stepIds}]`;
    }
    const label = "title" in block && block.title ? ` ("${block.title}")` : "";
    return `- ${block.id} [${block.type}]${label}`;
  });
  return entries.join("\n");
}

export function buildInlineExplanationSystemPrompt(
  context: InlineExplanationContext,
  activeInlineUi?: AssessmentUiSpec | null
): string {
  const assessmentLabel = context.assessmentKind === "tryout" ? "tryout" : "kuis";
  const normalizedExplanationSpec = context.explanationSpec
    ? normalizeInlineUiSpec(context.explanationSpec, "exp")
    : null;
  const explanationText =
    context.explanationMarkdown?.trim() ||
    (normalizedExplanationSpec
      ? extractPlainMarkdownFromUiSpec(normalizedExplanationSpec).slice(0, 4000)
      : "") ||
    "(Tidak ada teks pembahasan tambahan.)";

  const intentHint =
    context.intent === "step_by_step"
      ? "Siswa meminta uraian langkah demi langkah. Gunakan tool render_helper_ui dengan blok 'steps' yang ringkas agar tiap langkah jelas."
      : context.intent === "visualize"
        ? "Siswa meminta visualisasi. Gunakan tool render_helper_ui dengan blok 'graph', 'scene_3d', 'interactive_visual', atau 'formula_card' yang sesuai."
        : context.intent === "explain"
          ? "Siswa meminta penjelasan fokus pada bagian yang disorot. Gunakan bahasa singkat, langsung ke inti, dan panggil render_helper_ui jika kartu rumus, callout, atau langkah singkat membantu pemahaman."
          : "Jawab pertanyaan khusus siswa terkait bagian yang disorot secara ringkas dan tepat sasaran.";

  const inlineUiForPrompt =
    activeInlineUi ??
    (context.currentInlineUi ? normalizeInlineUiSpec(context.currentInlineUi) : null);

  return `Anda adalah Zyra, tutor AI Zyx Academy yang membantu siswa langsung di dalam pembahasan ${assessmentLabel}.

ATURAN UTAMA:
1. Jawab dalam bahasa Indonesia yang singkat, pedagogis, langsung ke inti, dalam kalimat sentence-case.
2. Jangan pernah menggunakan em dash, en dash, atau tanda seru. Gunakan koma, titik dua, atau titik.
3. Fokus pada bagian pembahasan yang diblok siswa dan hubungkan dengan soal serta kunci jawaban yang benar.
4. Gunakan notasi LaTeX ($...$ atau $$...$$) untuk rumus matematika dan fisika.
5. Gunakan tool 'render_helper_ui' untuk menampilkan atau memperbarui komponen bantuan interaktif (steps, collapsible, callout, formula_card, graph, scene_3d, interactive_visual) saat visualisasi atau struktur bertahap mempermudah pemahaman.
6. Pada pertanyaan lanjutan, pertahankan konteks UI yang sudah berguna dengan memakai mode 'patch' (upsert_block, remove_block, upsert_step, remove_step) atau 'append'. Gunakan mode 'replace' hanya untuk tampilan awal atau jika siswa meminta pendekatan baru sepenuhnya.
7. Setelah memanggil 'render_helper_ui', selalu tulis penjelasan teks singkat yang merujuk ke UI bantuan tersebut agar siswa tahu apa yang perlu diperhatikan.

ARAHAN INTENT SAAT INI:
${intentHint}

KONTEKS SOAL DAN PEMBAHASAN:
- Jenis evaluasi: ${assessmentLabel}
- Soal: ${context.questionPrompt}
- Jawaban siswa: ${context.studentAnswer?.trim() || "Tidak tercatat"}
- Kunci jawaban benar: ${context.correctAnswer?.trim() || "Tidak tercatat"}
- Pembahasan saat ini:
${explanationText}

BAGIAN YANG DISOROT SISWA (anchor block: ${context.anchorBlockId}):
"${context.selectedSnippet}"${
    context.surroundingText
      ? `\n\nTeks sekitar sorotan:\n${context.surroundingText}`
      : ""
  }

DAFTAR BLOK UI BANTUAN INLINE SAAT INI:
${summarizeExistingInlineBlockIds(inlineUiForPrompt)}`;
}

// ============================================================================
// 5. Pure Multi-Turn State Reducer: deriveInlineUiFromMessages
// ============================================================================

export interface DerivedInlineUiState {
  spec: AssessmentUiSpec | null;
  lastSummary: string | null;
  updateCount: number;
  isStreamingTool: boolean;
}

interface RawToolPartLike {
  type?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  args?: unknown;
  result?: unknown;
}

function isRenderHelperUiPart(part: unknown): part is RawToolPartLike {
  if (!part || typeof part !== "object") return false;
  const p = part as RawToolPartLike;
  if (p.type === `tool-${RENDER_HELPER_UI_TOOL_NAME}`) return true;
  if (p.type === "dynamic-tool" && p.toolName === RENDER_HELPER_UI_TOOL_NAME) return true;
  if (p.type === "tool-invocation" && p.toolName === RENDER_HELPER_UI_TOOL_NAME) return true;
  return false;
}

function appendBlocks(
  current: AssessmentUiSpec | null,
  incoming: AssessmentUiSpec
): AssessmentUiSpec {
  if (!current) {
    return {
      version: 1,
      layout: incoming.layout ?? "compact",
      blocks: [...incoming.blocks],
    };
  }
  const merged = [...current.blocks];
  for (const block of incoming.blocks) {
    const existingIdx = merged.findIndex((b) => b.id === block.id);
    if (existingIdx >= 0) {
      merged[existingIdx] = block;
    } else {
      merged.push(block);
    }
  }
  return {
    version: 1,
    layout: incoming.layout ?? current.layout ?? "compact",
    blocks: merged,
  };
}

/**
 * Pure reducer that scans UIMessage[] tool parts in chronological order
 * and derives the current live AssessmentUiSpec from replace/append/patch operations.
 */
export function deriveInlineUiFromMessages(
  messages: ReadonlyArray<Pick<UIMessage, "role" | "parts"> | { role?: string; parts?: unknown[] }>
): DerivedInlineUiState {
  let spec: AssessmentUiSpec | null = null;
  let lastSummary: string | null = null;
  let updateCount = 0;
  let isStreamingTool = false;

  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const message = messages[msgIdx];
    if (!message || !Array.isArray(message.parts)) continue;

    for (let partIdx = 0; partIdx < message.parts.length; partIdx++) {
      const part = message.parts[partIdx];
      if (!isRenderHelperUiPart(part)) continue;

      if (part.state === "input-streaming") {
        isStreamingTool = true;
        continue;
      }

      if (part.state === "output-error") {
        continue;
      }

      // Prefer normalized tool output when available; otherwise fall back to validated input
      // so the UI updates as soon as input-available arrives.
      const candidate =
        part.output && typeof part.output === "object" && (part.output as RenderHelperUiOutput).ok
          ? (part.output as RenderHelperUiOutput)
          : part.input ?? part.args;

      const parsed = renderHelperUiInputSchema.safeParse(candidate);
      if (!parsed.success) {
        continue;
      }

      const payload = parsed.data;
      const prefix = `zyra-t${msgIdx}-p${partIdx}`;

      if (payload.mode === "replace" && payload.spec) {
        spec = normalizeInlineUiSpec(payload.spec, prefix);
        lastSummary = payload.summary ?? lastSummary;
        updateCount += 1;
      } else if (payload.mode === "append" && payload.spec) {
        const incoming = normalizeInlineUiSpec(payload.spec, prefix);
        spec = appendBlocks(spec, incoming);
        lastSummary = payload.summary ?? lastSummary;
        updateCount += 1;
      } else if (payload.mode === "patch" && payload.patch) {
        const normalizedPatch = normalizeInlineUiPatch(payload.patch, prefix);
        spec = applyInlineUiPatch(spec, normalizedPatch);
        lastSummary = payload.summary ?? lastSummary;
        updateCount += 1;
      }
    }
  }

  return {
    spec,
    lastSummary,
    updateCount,
    isStreamingTool,
  };
}
