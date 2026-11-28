import { createHash, randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { aiQuestionBank, courses, exams, mataKuliah, questions, quizTemplates } from "@/db/schema";
import { requireMcpScope, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { insufficientScopeChallenge } from "@/lib/authoring/mcp-oauth";
import { readMcpCourseChoice } from "@/lib/authoring/mcp-workflows";

// ---------------------------------------------------------------------------
// Assessment UI-SDK Schema, Normalization, Markdown Fallback, and Patch Engine
// ---------------------------------------------------------------------------

export const ASSESSMENT_UI_BLOCK_TYPES = [
  "markdown",
  "steps",
  "collapsible",
  "callout",
  "image",
  "graph",
  "scene_3d",
  "interactive_visual",
  "formula_card",
] as const;

export const ASSESSMENT_UI_PATCH_OPS = [
  "replace_all",
  "upsert_block",
  "remove_block",
  "upsert_step",
  "remove_step",
] as const;

export interface AssessmentUiMarkdownBlock {
  id: string;
  type: "markdown";
  content: string;
}

export interface AssessmentUiStep {
  id: string;
  title: string;
  summary?: string;
  blocks: AssessmentUiBlock[];
}

export interface AssessmentUiStepsBlock {
  id: string;
  type: "steps";
  title?: string;
  collapsible?: boolean;
  steps: AssessmentUiStep[];
}

export interface AssessmentUiCollapsibleBlock {
  id: string;
  type: "collapsible";
  title: string;
  defaultOpen?: boolean;
  variant?: "hint" | "derivation" | "detail" | "note";
  blocks: AssessmentUiBlock[];
}

export interface AssessmentUiCalloutBlock {
  id: string;
  type: "callout";
  tone: "info" | "tip" | "warning" | "formula" | "mistake";
  title?: string;
  content: string;
}

export interface AssessmentUiImageBlock {
  id: string;
  type: "image";
  src: string;
  alt: string;
  caption?: string;
  aspect?: "auto" | "video" | "square";
}

export interface AssessmentUiGraphBlock {
  id: string;
  type: "graph";
  title?: string;
  caption?: string;
  spec: Record<string, unknown>;
}

export interface AssessmentUiScene3dBlock {
  id: string;
  type: "scene_3d";
  title?: string;
  caption?: string;
  spec: Record<string, unknown>;
}

export interface AssessmentUiInteractiveVisualBlock {
  id: string;
  type: "interactive_visual";
  title?: string;
  caption?: string;
  kind: "canvas" | "document" | "chart" | "flowchart" | "vibration" | "kinematics" | "statics" | "thermo";
  spec: Record<string, unknown>;
}

export interface AssessmentUiFormulaCardBlock {
  id: string;
  type: "formula_card";
  title?: string;
  latex: string;
  note?: string;
}

export type AssessmentUiBlock =
  | AssessmentUiMarkdownBlock
  | AssessmentUiStepsBlock
  | AssessmentUiCollapsibleBlock
  | AssessmentUiCalloutBlock
  | AssessmentUiImageBlock
  | AssessmentUiGraphBlock
  | AssessmentUiScene3dBlock
  | AssessmentUiInteractiveVisualBlock
  | AssessmentUiFormulaCardBlock;

export interface AssessmentUiSpec {
  version: 1;
  layout?: "standard" | "compact";
  blocks: AssessmentUiBlock[];
}

export type AssessmentUiBlockInput =
  | (Omit<AssessmentUiMarkdownBlock, "id"> & { id?: string })
  | (Omit<AssessmentUiStepsBlock, "id" | "steps"> & {
      id?: string;
      steps: Array<Omit<AssessmentUiStep, "id" | "blocks"> & { id?: string; blocks: AssessmentUiBlockInput[] }>;
    })
  | (Omit<AssessmentUiCollapsibleBlock, "id" | "blocks"> & {
      id?: string;
      blocks: AssessmentUiBlockInput[];
    })
  | (Omit<AssessmentUiCalloutBlock, "id"> & { id?: string })
  | (Omit<AssessmentUiImageBlock, "id"> & { id?: string })
  | (Omit<AssessmentUiGraphBlock, "id"> & { id?: string })
  | (Omit<AssessmentUiScene3dBlock, "id"> & { id?: string })
  | (Omit<AssessmentUiInteractiveVisualBlock, "id"> & { id?: string })
  | (Omit<AssessmentUiFormulaCardBlock, "id"> & { id?: string });

export interface AssessmentUiSpecInput {
  version?: 1;
  layout?: "standard" | "compact";
  blocks: AssessmentUiBlockInput[];
}

export type AssessmentUiStepInput = {
  id?: string;
  title: string;
  summary?: string;
  blocks: AssessmentUiBlockInput[];
};

export type AssessmentUiPatch =
  | { op: "replace_all"; spec: AssessmentUiSpecInput }
  | { op: "upsert_block"; block: AssessmentUiBlockInput; afterBlockId?: string }
  | { op: "remove_block"; blockId: string }
  | { op: "upsert_step"; stepsBlockId: string; step: AssessmentUiStepInput; afterStepId?: string }
  | { op: "remove_step"; stepsBlockId: string; stepId: string };

const optionalIdSchema = z.string().trim().min(1).max(120).optional();

export const assessmentUiBlockSchema: z.ZodType<AssessmentUiBlockInput> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      id: optionalIdSchema,
      type: z.literal("markdown"),
      content: z.string(),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("steps"),
      title: z.string().optional(),
      collapsible: z.boolean().optional(),
      steps: z.array(
        z.object({
          id: optionalIdSchema,
          title: z.string().min(1),
          summary: z.string().optional(),
          blocks: z.array(assessmentUiBlockSchema),
        }),
      ),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("collapsible"),
      title: z.string().min(1),
      defaultOpen: z.boolean().optional(),
      variant: z.enum(["hint", "derivation", "detail", "note"]).optional(),
      blocks: z.array(assessmentUiBlockSchema),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("callout"),
      tone: z.enum(["info", "tip", "warning", "formula", "mistake"]),
      title: z.string().optional(),
      content: z.string(),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("image"),
      src: z.string().min(1),
      alt: z.string(),
      caption: z.string().optional(),
      aspect: z.enum(["auto", "video", "square"]).optional(),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("graph"),
      title: z.string().optional(),
      caption: z.string().optional(),
      spec: z.record(z.string(), z.unknown()),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("scene_3d"),
      title: z.string().optional(),
      caption: z.string().optional(),
      spec: z.record(z.string(), z.unknown()),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("interactive_visual"),
      title: z.string().optional(),
      caption: z.string().optional(),
      kind: z.enum(["canvas", "document", "chart", "flowchart", "vibration", "kinematics", "statics", "thermo"]),
      spec: z.record(z.string(), z.unknown()),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("formula_card"),
      title: z.string().optional(),
      latex: z.string().min(1),
      note: z.string().optional(),
    }),
  ]),
);

export const assessmentUiSpecSchema: z.ZodType<AssessmentUiSpecInput> = z.object({
  version: z.literal(1).optional(),
  layout: z.enum(["standard", "compact"]).optional(),
  blocks: z.array(assessmentUiBlockSchema),
});

export const assessmentUiStepInputSchema: z.ZodType<AssessmentUiStepInput> = z.object({
  id: optionalIdSchema,
  title: z.string().min(1),
  summary: z.string().optional(),
  blocks: z.array(assessmentUiBlockSchema),
});

export const assessmentUiPatchSchema: z.ZodType<AssessmentUiPatch> = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("replace_all"),
    spec: assessmentUiSpecSchema,
  }),
  z.object({
    op: z.literal("upsert_block"),
    block: assessmentUiBlockSchema,
    afterBlockId: z.string().trim().min(1).optional(),
  }),
  z.object({
    op: z.literal("remove_block"),
    blockId: z.string().trim().min(1),
  }),
  z.object({
    op: z.literal("upsert_step"),
    stepsBlockId: z.string().trim().min(1),
    step: assessmentUiStepInputSchema,
    afterStepId: z.string().trim().min(1).optional(),
  }),
  z.object({
    op: z.literal("remove_step"),
    stepsBlockId: z.string().trim().min(1),
    stepId: z.string().trim().min(1),
  }),
]);

function deterministicId(prefix: string, seed: unknown): string {
  const hash = createHash("sha256").update(JSON.stringify(seed)).digest("hex").slice(0, 8);
  return `${prefix}-${hash}`;
}

export function normalizeAssessmentUiBlock(block: AssessmentUiBlockInput, index: number, scopePrefix = "blk"): AssessmentUiBlock {
  const id = block.id?.trim() || deterministicId(`${scopePrefix}-${index}-${block.type}`, block);
  if (block.type === "steps") {
    return {
      ...block,
      id,
      steps: block.steps.map((step, stepIndex) => normalizeAssessmentUiStep(step, stepIndex, `${id}-step`)),
    };
  }
  if (block.type === "collapsible") {
    return {
      ...block,
      id,
      blocks: block.blocks.map((child, childIndex) => normalizeAssessmentUiBlock(child, childIndex, `${id}-child`)),
    };
  }
  return { ...block, id } as AssessmentUiBlock;
}

export function normalizeAssessmentUiStep(step: AssessmentUiStepInput, index: number, scopePrefix = "step"): AssessmentUiStep {
  const id = step.id?.trim() || deterministicId(`${scopePrefix}-${index}`, { title: step.title, summary: step.summary });
  return {
    ...step,
    id,
    blocks: step.blocks.map((child, childIndex) => normalizeAssessmentUiBlock(child, childIndex, `${id}-blk`)),
  };
}

export function normalizeAssessmentUiSpec(
  spec: AssessmentUiSpecInput | null | undefined,
  fallbackMarkdown?: string | null,
): AssessmentUiSpec | null {
  if (spec) {
    return {
      version: 1,
      ...(spec.layout ? { layout: spec.layout } : {}),
      blocks: spec.blocks.map((block, index) => normalizeAssessmentUiBlock(block, index)),
    };
  }
  const trimmed = fallbackMarkdown?.trim();
  if (!trimmed) return null;
  return {
    version: 1,
    blocks: [
      {
        id: "blk-0-markdown",
        type: "markdown",
        content: trimmed,
      },
    ],
  };
}

function extractBlockMarkdown(block: AssessmentUiBlock): string {
  switch (block.type) {
    case "markdown":
      return block.content.trim();
    case "formula_card": {
      const parts: string[] = [];
      if (block.title?.trim()) parts.push(`**${block.title.trim()}**`);
      parts.push(`$$${block.latex.trim()}$$`);
      if (block.note?.trim()) parts.push(block.note.trim());
      return parts.join("\n\n");
    }
    case "callout": {
      const prefix = block.title?.trim() ? `**${block.title.trim()}:** ` : "";
      return `${prefix}${block.content.trim()}`;
    }
    case "image": {
      const base = `![${block.alt.trim()}](${block.src.trim()})`;
      return block.caption?.trim() ? `${base}\n\n*${block.caption.trim()}*` : base;
    }
    case "graph":
    case "scene_3d":
    case "interactive_visual": {
      const label = block.title?.trim() || block.caption?.trim() || `Visual (${block.type})`;
      return block.caption?.trim() && block.title?.trim()
        ? `**${block.title.trim()}**\n\n${block.caption.trim()}`
        : `**${label}**`;
    }
    case "collapsible": {
      const inner = block.blocks.map(extractBlockMarkdown).filter(Boolean).join("\n\n");
      return inner ? `### ${block.title.trim()}\n\n${inner}` : `### ${block.title.trim()}`;
    }
    case "steps": {
      const parts: string[] = [];
      if (block.title?.trim()) parts.push(`### ${block.title.trim()}`);
      block.steps.forEach((step, idx) => {
        const stepLines: string[] = [`${idx + 1}. **${step.title.trim()}**`];
        if (step.summary?.trim()) stepLines.push(step.summary.trim());
        const nested = step.blocks.map(extractBlockMarkdown).filter(Boolean).join("\n\n");
        if (nested) stepLines.push(nested);
        parts.push(stepLines.join("\n\n"));
      });
      return parts.join("\n\n");
    }
  }
}

export function extractPlainMarkdownFromUiSpec(spec: AssessmentUiSpec | AssessmentUiSpecInput | null | undefined): string {
  if (!spec) return "";
  const normalized = normalizeAssessmentUiSpec(spec);
  if (!normalized) return "";
  return normalized.blocks.map(extractBlockMarkdown).filter(Boolean).join("\n\n").trim();
}

export function patchAssessmentUiSpec(
  existing: AssessmentUiSpec | null | undefined,
  patch: AssessmentUiPatch,
  fallbackMarkdown?: string | null,
): AssessmentUiSpec {
  if (patch.op === "replace_all") {
    return normalizeAssessmentUiSpec(patch.spec)!;
  }

  const base: AssessmentUiSpec = existing
    ? normalizeAssessmentUiSpec(existing)!
    : (normalizeAssessmentUiSpec(null, fallbackMarkdown) ?? { version: 1, blocks: [] });

  const blocks = [...base.blocks];

  switch (patch.op) {
    case "upsert_block": {
      const normalizedBlock = normalizeAssessmentUiBlock(patch.block, blocks.length);
      const existingIndex = blocks.findIndex((b) => b.id === normalizedBlock.id);
      if (existingIndex >= 0) {
        blocks[existingIndex] = normalizedBlock;
      } else if (patch.afterBlockId) {
        const afterIndex = blocks.findIndex((b) => b.id === patch.afterBlockId);
        if (afterIndex >= 0) {
          blocks.splice(afterIndex + 1, 0, normalizedBlock);
        } else {
          blocks.push(normalizedBlock);
        }
      } else {
        blocks.push(normalizedBlock);
      }
      return { ...base, blocks };
    }
    case "remove_block": {
      const idx = blocks.findIndex((b) => b.id === patch.blockId);
      if (idx < 0) {
        throw new Error(`ASSESSMENT_UI_BLOCK_NOT_FOUND: Block '${patch.blockId}' not found.`);
      }
      blocks.splice(idx, 1);
      return { ...base, blocks };
    }
    case "upsert_step": {
      const stepsIdx = blocks.findIndex((b) => b.id === patch.stepsBlockId && b.type === "steps");
      if (stepsIdx < 0) {
        throw new Error(`ASSESSMENT_UI_STEPS_BLOCK_NOT_FOUND: Steps block '${patch.stepsBlockId}' not found.`);
      }
      const stepsBlock = blocks[stepsIdx] as AssessmentUiStepsBlock;
      const steps = [...stepsBlock.steps];
      const normalizedStep = normalizeAssessmentUiStep(patch.step, steps.length, `${stepsBlock.id}-step`);
      const stepIdx = steps.findIndex((s) => s.id === normalizedStep.id);
      if (stepIdx >= 0) {
        steps[stepIdx] = normalizedStep;
      } else if (patch.afterStepId) {
        const afterIdx = steps.findIndex((s) => s.id === patch.afterStepId);
        if (afterIdx >= 0) {
          steps.splice(afterIdx + 1, 0, normalizedStep);
        } else {
          steps.push(normalizedStep);
        }
      } else {
        steps.push(normalizedStep);
      }
      blocks[stepsIdx] = { ...stepsBlock, steps };
      return { ...base, blocks };
    }
    case "remove_step": {
      const stepsIdx = blocks.findIndex((b) => b.id === patch.stepsBlockId && b.type === "steps");
      if (stepsIdx < 0) {
        throw new Error(`ASSESSMENT_UI_STEPS_BLOCK_NOT_FOUND: Steps block '${patch.stepsBlockId}' not found.`);
      }
      const stepsBlock = blocks[stepsIdx] as AssessmentUiStepsBlock;
      const stepIdx = stepsBlock.steps.findIndex((s) => s.id === patch.stepId);
      if (stepIdx < 0) {
        throw new Error(`ASSESSMENT_UI_STEP_NOT_FOUND: Step '${patch.stepId}' not found in block '${patch.stepsBlockId}'.`);
      }
      const steps = stepsBlock.steps.filter((s) => s.id !== patch.stepId);
      blocks[stepsIdx] = { ...stepsBlock, steps };
      return { ...base, blocks };
    }
  }
}

// ---------------------------------------------------------------------------
// Input Schemas for the 4 Modular Assessment MCP Tools
// ---------------------------------------------------------------------------

export const assessmentKindSchema = z.enum(["quiz", "tryout"]);
export type AssessmentKind = z.infer<typeof assessmentKindSchema>;

export const modularQuestionTypeSchema = z.enum([
  "multiple_choice",
  "multiple_choices",
  "short_answer",
  "essay",
]);
export type ModularQuestionType = z.infer<typeof modularQuestionTypeSchema>;

export const modularInlineQuestionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  order: z.number().int().min(0).optional(),
  type: modularQuestionTypeSchema.optional(),
  questionType: modularQuestionTypeSchema.optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  tags: z.array(z.string()).optional(),
  prompt: z.string().optional(),
  promptUi: assessmentUiSpecSchema.nullable().optional(),
  options: z.array(z.string()).optional(),
  correctIndex: z.number().int().min(0).optional(),
  correctIndices: z.array(z.number().int().min(0)).optional(),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  explanationUi: assessmentUiSpecSchema.nullable().optional(),
  reviewStatus: z.enum(["generated", "reviewed", "published", "flagged", "retired"]).optional(),
});

export type ModularInlineQuestionInput = z.infer<typeof modularInlineQuestionSchema>;

export const upsertAssessmentInputSchema = z.object({
  courseId: z.string().trim().min(1),
  kind: assessmentKindSchema,
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(255).optional(),
  status: z.enum(["draft", "published", "ended"]).optional(),
  category: z.enum(["chapter", "weekly", "daily", "simulation", "premium"]).optional(),
  visibility: z.enum(["free", "paid"]).optional(),
  manualStatus: z.enum(["open", "closed", "scheduled"]).optional(),
  timeLimitSeconds: z.number().int().min(60).nullable().optional(),
  timeLimitMinutes: z.number().int().min(1).nullable().optional(),
  maxAttempts: z.number().int().min(1).nullable().optional(),
  showDiscussion: z.boolean().optional(),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  questions: z.array(modularInlineQuestionSchema).optional(),
});

export type UpsertAssessmentInput = z.infer<typeof upsertAssessmentInputSchema>;

export const listAssessmentQuestionsInputSchema = z.object({
  assessmentId: z.string().trim().min(1),
  kind: assessmentKindSchema.optional(),
  includeFull: z.boolean().default(false),
});

export type ListAssessmentQuestionsInput = z.infer<typeof listAssessmentQuestionsInputSchema>;

export const upsertQuestionInputSchema = z.object({
  kind: assessmentKindSchema,
  questionId: z.string().trim().min(1).optional(),
  courseId: z.string().trim().min(1).optional(),
  quizTemplateId: z.string().trim().min(1).optional(),
  examId: z.string().trim().min(1).optional(),
  order: z.number().int().min(0).optional(),
  type: modularQuestionTypeSchema.optional(),
  questionType: modularQuestionTypeSchema.optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  tags: z.array(z.string()).optional(),
  prompt: z.string().optional(),
  promptUi: assessmentUiSpecSchema.nullable().optional(),
  options: z.array(z.string()).optional(),
  correctIndex: z.number().int().min(0).optional(),
  correctIndices: z.array(z.number().int().min(0)).optional(),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  explanationUi: assessmentUiSpecSchema.nullable().optional(),
  reviewStatus: z.enum(["generated", "reviewed", "published", "flagged", "retired"]).optional(),
});

export type UpsertQuestionInput = z.infer<typeof upsertQuestionInputSchema>;

export const updateQuestionExplanationInputSchema = z.object({
  questionId: z.string().trim().min(1),
  kind: assessmentKindSchema.optional(),
  explanation: z.string().optional(),
  explanationUi: assessmentUiSpecSchema.nullable().optional(),
  patch: assessmentUiPatchSchema.optional(),
  patches: z.array(assessmentUiPatchSchema).min(1).optional(),
});

export type UpdateQuestionExplanationInput = z.infer<typeof updateQuestionExplanationInputSchema>;

// ---------------------------------------------------------------------------
// Store Interface & Normalized Records (Decoupled for DB & Unit Tests)
// ---------------------------------------------------------------------------

export interface StoredQuizTemplate {
  id: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status: "draft" | "published";
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  selectionRules: Record<string, unknown>;
  openAt: Date | null;
  closeAt: Date | null;
  manualStatus: "open" | "closed" | "scheduled";
  showDiscussion: boolean;
}

export interface StoredQuizQuestion {
  id: string;
  courseId: string;
  difficulty: "easy" | "medium" | "hard";
  questionType: ModularQuestionType;
  tags: string[];
  prompt: string;
  promptUi: AssessmentUiSpec | null;
  options: string[];
  correctIndices: number[];
  acceptableAnswers: string[];
  explanation: string;
  explanationUi: AssessmentUiSpec | null;
  reviewStatus: "generated" | "reviewed" | "published" | "flagged" | "retired";
}

export interface StoredTryoutExam {
  id: string;
  courseId: string;
  title: string;
  type: "tryout";
  status: "draft" | "published" | "ended";
  settings: Record<string, unknown>;
  openAt: Date | null;
  closeAt: Date | null;
}

export interface StoredTryoutQuestion {
  id: string;
  examId: string;
  type: ModularQuestionType;
  order: number;
  content: Record<string, unknown>;
}

export interface ModularAssessmentStore {
  resolveCourseId(courseIdOrKey: string): Promise<string>;
  getQuizTemplate(id: string): Promise<StoredQuizTemplate | null>;
  saveQuizTemplate(record: StoredQuizTemplate, creating: boolean): Promise<StoredQuizTemplate>;
  getQuizQuestion(id: string): Promise<StoredQuizQuestion | null>;
  getQuizQuestionsByIds(ids: string[]): Promise<StoredQuizQuestion[]>;
  saveQuizQuestion(record: StoredQuizQuestion, creating: boolean): Promise<StoredQuizQuestion>;
  updateQuizQuestionExplanation(
    id: string,
    payload: { explanation: string; explanationUi: AssessmentUiSpec | null },
  ): Promise<void>;
  getTryoutExam(id: string): Promise<StoredTryoutExam | null>;
  saveTryoutExam(record: StoredTryoutExam, creating: boolean): Promise<StoredTryoutExam>;
  getTryoutQuestion(id: string): Promise<StoredTryoutQuestion | null>;
  listTryoutQuestions(examId: string): Promise<StoredTryoutQuestion[]>;
  saveTryoutQuestion(record: StoredTryoutQuestion, creating: boolean): Promise<StoredTryoutQuestion>;
  updateTryoutQuestionContent(id: string, content: Record<string, unknown>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Drizzle PostgreSQL Default Store Implementation
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((n) => Number.isInteger(n) && n >= 0)
    : [];
}

function asUiSpec(value: unknown): AssessmentUiSpec | null {
  if (!value || typeof value !== "object") return null;
  const parsed = assessmentUiSpecSchema.safeParse(value);
  return parsed.success ? normalizeAssessmentUiSpec(parsed.data) : null;
}

const bankTableColumns = aiQuestionBank as unknown as Record<string, unknown>;
const hasBankUiColumns = Boolean(bankTableColumns.promptUi && bankTableColumns.explanationUi);

export function createDrizzleModularAssessmentStore(): ModularAssessmentStore {
  return {
    async resolveCourseId(courseIdOrKey: string): Promise<string> {
      const trimmed = courseIdOrKey.trim();
      const candidate = trimmed.includes(".") ? readMcpCourseChoice(trimmed).courseId : trimmed;

      const [canonical] = await db
        .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
        .from(mataKuliah)
        .where(
          or(
            eq(mataKuliah.id, candidate),
            eq(mataKuliah.legacyCourseId, candidate),
            eq(mataKuliah.code, candidate),
          ),
        )
        .limit(1);

      if (canonical) {
        return canonical.legacyCourseId ?? canonical.id;
      }

      const [legacy] = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, candidate))
        .limit(1);

      if (!legacy) {
        throw new Error(`MODULAR_ASSESSMENT_COURSE_NOT_FOUND: Course '${candidate}' not found.`);
      }
      return legacy.id;
    },

    async getQuizTemplate(id: string): Promise<StoredQuizTemplate | null> {
      const [row] = await db.select().from(quizTemplates).where(eq(quizTemplates.id, id)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        courseId: row.courseId,
        title: row.title,
        category: row.category,
        visibility: row.visibility,
        status: row.status,
        timeLimitSeconds: row.timeLimitSeconds ?? null,
        maxAttempts: row.maxAttempts ?? null,
        selectionRules: asRecord(row.selectionRules),
        openAt: row.openAt ?? null,
        closeAt: row.closeAt ?? null,
        manualStatus: row.manualStatus,
        showDiscussion: row.showDiscussion,
      };
    },

    async saveQuizTemplate(record: StoredQuizTemplate, creating: boolean): Promise<StoredQuizTemplate> {
      if (creating) {
        await db.insert(quizTemplates).values({
          id: record.id,
          courseId: record.courseId,
          title: record.title,
          category: record.category,
          visibility: record.visibility,
          status: record.status,
          timeLimitSeconds: record.timeLimitSeconds,
          maxAttempts: record.maxAttempts,
          selectionRules: record.selectionRules,
          openAt: record.openAt,
          closeAt: record.closeAt,
          manualStatus: record.manualStatus,
          showDiscussion: record.showDiscussion,
        });
      } else {
        await db
          .update(quizTemplates)
          .set({
            title: record.title,
            category: record.category,
            visibility: record.visibility,
            status: record.status,
            timeLimitSeconds: record.timeLimitSeconds,
            maxAttempts: record.maxAttempts,
            selectionRules: record.selectionRules,
            openAt: record.openAt,
            closeAt: record.closeAt,
            manualStatus: record.manualStatus,
            showDiscussion: record.showDiscussion,
            updatedAt: new Date(),
          })
          .where(eq(quizTemplates.id, record.id));
      }
      return record;
    },

    async getQuizQuestion(id: string): Promise<StoredQuizQuestion | null> {
      const [row] = await db.select().from(aiQuestionBank).where(eq(aiQuestionBank.id, id)).limit(1);
      if (!row) return null;
      const raw = row as Record<string, unknown>;
      return {
        id: row.id,
        courseId: row.courseId,
        difficulty: row.difficulty,
        questionType: row.questionType,
        tags: asStringArray(row.tags),
        prompt: row.prompt,
        promptUi: asUiSpec(raw.promptUi),
        options: asStringArray(row.options),
        correctIndices: asNumberArray(row.correctIndices),
        acceptableAnswers: asStringArray(row.acceptableAnswers),
        explanation: row.explanation,
        explanationUi: asUiSpec(raw.explanationUi),
        reviewStatus: row.reviewStatus,
      };
    },

    async getQuizQuestionsByIds(ids: string[]): Promise<StoredQuizQuestion[]> {
      if (ids.length === 0) return [];
      const rows = await db.select().from(aiQuestionBank).where(inArray(aiQuestionBank.id, ids));
      return rows.map((row) => {
        const raw = row as Record<string, unknown>;
        return {
          id: row.id,
          courseId: row.courseId,
          difficulty: row.difficulty,
          questionType: row.questionType,
          tags: asStringArray(row.tags),
          prompt: row.prompt,
          promptUi: asUiSpec(raw.promptUi),
          options: asStringArray(row.options),
          correctIndices: asNumberArray(row.correctIndices),
          acceptableAnswers: asStringArray(row.acceptableAnswers),
          explanation: row.explanation,
          explanationUi: asUiSpec(raw.explanationUi),
          reviewStatus: row.reviewStatus,
        };
      });
    },

    async saveQuizQuestion(record: StoredQuizQuestion, creating: boolean): Promise<StoredQuizQuestion> {
      const uiFields = hasBankUiColumns
        ? { promptUi: record.promptUi, explanationUi: record.explanationUi }
        : {};
      if (creating) {
        await db.insert(aiQuestionBank).values({
          id: record.id,
          courseId: record.courseId,
          origin: "zyx_original",
          quizEligible: true,
          status: "active",
          difficulty: record.difficulty,
          questionType: record.questionType,
          tags: record.tags,
          prompt: record.prompt,
          options: record.options,
          correctIndices: record.correctIndices,
          acceptableAnswers: record.acceptableAnswers,
          explanation: record.explanation,
          reviewStatus: record.reviewStatus,
          ...uiFields,
        } as typeof aiQuestionBank.$inferInsert);
      } else {
        await db
          .update(aiQuestionBank)
          .set({
            difficulty: record.difficulty,
            questionType: record.questionType,
            tags: record.tags,
            prompt: record.prompt,
            options: record.options,
            correctIndices: record.correctIndices,
            acceptableAnswers: record.acceptableAnswers,
            explanation: record.explanation,
            reviewStatus: record.reviewStatus,
            ...uiFields,
          } as Partial<typeof aiQuestionBank.$inferInsert>)
          .where(eq(aiQuestionBank.id, record.id));
      }
      return record;
    },

    async updateQuizQuestionExplanation(
      id: string,
      payload: { explanation: string; explanationUi: AssessmentUiSpec | null },
    ): Promise<void> {
      const uiFields = hasBankUiColumns ? { explanationUi: payload.explanationUi } : {};
      await db
        .update(aiQuestionBank)
        .set({
          explanation: payload.explanation,
          ...uiFields,
        } as Partial<typeof aiQuestionBank.$inferInsert>)
        .where(eq(aiQuestionBank.id, id));
    },

    async getTryoutExam(id: string): Promise<StoredTryoutExam | null> {
      const [row] = await db
        .select()
        .from(exams)
        .where(and(eq(exams.id, id), eq(exams.type, "tryout")))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        courseId: row.courseId,
        title: row.title,
        type: "tryout",
        status: row.status,
        settings: asRecord(row.settings),
        openAt: row.openAt ?? null,
        closeAt: row.closeAt ?? null,
      };
    },

    async saveTryoutExam(record: StoredTryoutExam, creating: boolean): Promise<StoredTryoutExam> {
      if (creating) {
        await db.insert(exams).values({
          id: record.id,
          courseId: record.courseId,
          title: record.title,
          type: "tryout",
          status: record.status,
          settings: record.settings,
          openAt: record.openAt,
          closeAt: record.closeAt,
        });
      } else {
        await db
          .update(exams)
          .set({
            title: record.title,
            status: record.status,
            settings: record.settings,
            openAt: record.openAt,
            closeAt: record.closeAt,
          })
          .where(and(eq(exams.id, record.id), eq(exams.type, "tryout")));
      }
      return record;
    },

    async getTryoutQuestion(id: string): Promise<StoredTryoutQuestion | null> {
      const [row] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
      if (!row) return null;
      return {
        id: row.id,
        examId: row.examId,
        type: (modularQuestionTypeSchema.safeParse(row.type).success
          ? row.type
          : "multiple_choice") as ModularQuestionType,
        order: row.order,
        content: asRecord(row.content),
      };
    },

    async listTryoutQuestions(examId: string): Promise<StoredTryoutQuestion[]> {
      const rows = await db
        .select()
        .from(questions)
        .where(eq(questions.examId, examId))
        .orderBy(asc(questions.order));
      return rows.map((row) => ({
        id: row.id,
        examId: row.examId,
        type: (modularQuestionTypeSchema.safeParse(row.type).success
          ? row.type
          : "multiple_choice") as ModularQuestionType,
        order: row.order,
        content: asRecord(row.content),
      }));
    },

    async saveTryoutQuestion(record: StoredTryoutQuestion, creating: boolean): Promise<StoredTryoutQuestion> {
      if (creating) {
        await db.insert(questions).values({
          id: record.id,
          examId: record.examId,
          type: record.type,
          order: record.order,
          content: record.content,
        });
      } else {
        await db
          .update(questions)
          .set({
            type: record.type,
            order: record.order,
            content: record.content,
          })
          .where(eq(questions.id, record.id));
      }
      return record;
    },

    async updateTryoutQuestionContent(id: string, content: Record<string, unknown>): Promise<void> {
      await db.update(questions).set({ content }).where(eq(questions.id, id));
    },
  };
}

// ---------------------------------------------------------------------------
// Core Modular Assessment Operations
// ---------------------------------------------------------------------------

function resolveCorrectIndices(input: {
  correctIndices?: number[];
  correctIndex?: number;
  fallback?: number[];
}): number[] {
  if (input.correctIndices !== undefined) return input.correctIndices;
  if (input.correctIndex !== undefined) return [input.correctIndex];
  return input.fallback ?? [];
}

function validateAnswerShape(params: {
  questionType: ModularQuestionType;
  options: string[];
  correctIndices: number[];
}) {
  if (params.questionType === "multiple_choice" || params.questionType === "multiple_choices") {
    for (const idx of params.correctIndices) {
      if (idx < 0 || idx >= params.options.length) {
        throw new Error(
          `MODULAR_QUESTION_INVALID_ANSWER_INDEX: Index ${idx} is out of bounds for ${params.options.length} options.`,
        );
      }
    }
  }
}

function promptPreview(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  return singleLine.length > 120 ? `${singleLine.slice(0, 117)}...` : singleLine;
}

function extractFixedQuestionIds(selectionRules: Record<string, unknown>): string[] {
  return Array.isArray(selectionRules.fixedQuestionIds)
    ? selectionRules.fixedQuestionIds.map((id) => String(id)).filter(Boolean)
    : [];
}

export async function upsertModularAssessment(
  rawInput: UpsertAssessmentInput,
  store: ModularAssessmentStore = createDrizzleModularAssessmentStore(),
) {
  const input = upsertAssessmentInputSchema.parse(rawInput);
  const courseId = await store.resolveCourseId(input.courseId);

  if (input.kind === "quiz") {
    const existing = input.id ? await store.getQuizTemplate(input.id) : null;
    const creating = !existing;
    const id = input.id ?? `qt-${randomUUID().slice(0, 12)}`;
    const title = input.title?.trim() ?? existing?.title;
    if (!title) {
      throw new Error("MODULAR_ASSESSMENT_TITLE_REQUIRED: title is required when creating a quiz.");
    }
    const status = (input.status === "published" ? "published" : input.status === "draft" ? "draft" : existing?.status ?? "draft") as
      | "draft"
      | "published";
    const timeLimitSeconds =
      input.timeLimitSeconds !== undefined
        ? input.timeLimitSeconds
        : input.timeLimitMinutes !== undefined
          ? input.timeLimitMinutes === null
            ? null
            : input.timeLimitMinutes * 60
          : (existing?.timeLimitSeconds ?? 1800);

    const baseRules: Record<string, unknown> = {
      ...(existing?.selectionRules ?? {}),
      ...(input.settings ?? {}),
    };
    let questionIds = extractFixedQuestionIds(baseRules);

    if (input.questions && input.questions.length > 0) {
      const nextIds: string[] = [];
      for (const [idx, item] of input.questions.entries()) {
        const saved = await upsertModularQuestion(
          {
            kind: "quiz",
            courseId,
            questionId: item.id,
            order: item.order ?? idx,
            type: item.type ?? item.questionType,
            difficulty: item.difficulty,
            tags: item.tags,
            prompt: item.prompt,
            promptUi: item.promptUi,
            options: item.options,
            correctIndex: item.correctIndex,
            correctIndices: item.correctIndices,
            acceptableAnswers: item.acceptableAnswers,
            explanation: item.explanation,
            explanationUi: item.explanationUi,
            reviewStatus: item.reviewStatus,
          },
          store,
        );
        nextIds.push(saved.id);
      }
      questionIds = nextIds;
    }

    const selectionRules: Record<string, unknown> = {
      canGoBack: true,
      requireAllAnswered: false,
      shuffleQuestions: false,
      shuffleOptions: false,
      showScoreImmediate: true,
      passingScore: 70,
      ...baseRules,
      fixedQuestionIds: questionIds,
      count: questionIds.length,
    };

    const record: StoredQuizTemplate = {
      id,
      courseId: existing?.courseId ?? courseId,
      title,
      category: input.category ?? existing?.category ?? "chapter",
      visibility: input.visibility ?? existing?.visibility ?? "free",
      status,
      timeLimitSeconds,
      maxAttempts: input.maxAttempts !== undefined ? input.maxAttempts : (existing?.maxAttempts ?? null),
      selectionRules,
      openAt: input.openAt !== undefined ? (input.openAt ? new Date(input.openAt) : null) : (existing?.openAt ?? null),
      closeAt: input.closeAt !== undefined ? (input.closeAt ? new Date(input.closeAt) : null) : (existing?.closeAt ?? null),
      manualStatus: input.manualStatus ?? existing?.manualStatus ?? "open",
      showDiscussion: input.showDiscussion ?? existing?.showDiscussion ?? true,
    };

    await store.saveQuizTemplate(record, creating);
    return {
      ok: true as const,
      id: record.id,
      kind: "quiz" as const,
      title: record.title,
      status: record.status,
      questionCount: questionIds.length,
      questionIds,
    };
  }

  // kind === "tryout"
  const existing = input.id ? await store.getTryoutExam(input.id) : null;
  const creating = !existing;
  const id = input.id ?? `exm-${randomUUID().slice(0, 12)}`;
  const title = input.title?.trim() ?? existing?.title;
  if (!title) {
    throw new Error("MODULAR_ASSESSMENT_TITLE_REQUIRED: title is required when creating a tryout.");
  }
  const timeLimitMinutes =
    input.timeLimitMinutes !== undefined
      ? input.timeLimitMinutes
      : input.timeLimitSeconds !== undefined
        ? input.timeLimitSeconds === null
          ? null
          : Math.max(1, Math.round(input.timeLimitSeconds / 60))
        : (existing?.settings.timeLimitMinutes as number | null | undefined) ?? 60;

  const settings: Record<string, unknown> = {
    ...(existing?.settings ?? {}),
    ...(input.settings ?? {}),
    timeLimitMinutes,
    ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
    ...(input.showDiscussion !== undefined ? { showDiscussion: input.showDiscussion } : {}),
  };

  const record: StoredTryoutExam = {
    id,
    courseId: existing?.courseId ?? courseId,
    title,
    type: "tryout",
    status: input.status ?? existing?.status ?? "draft",
    settings,
    openAt: input.openAt !== undefined ? (input.openAt ? new Date(input.openAt) : null) : (existing?.openAt ?? null),
    closeAt: input.closeAt !== undefined ? (input.closeAt ? new Date(input.closeAt) : null) : (existing?.closeAt ?? null),
  };

  await store.saveTryoutExam(record, creating);

  if (input.questions && input.questions.length > 0) {
    for (const [idx, item] of input.questions.entries()) {
      await upsertModularQuestion(
        {
          kind: "tryout",
          examId: record.id,
          questionId: item.id,
          order: item.order ?? idx + 1,
          type: item.type ?? item.questionType,
          difficulty: item.difficulty,
          tags: item.tags,
          prompt: item.prompt,
          promptUi: item.promptUi,
          options: item.options,
          correctIndex: item.correctIndex,
          correctIndices: item.correctIndices,
          acceptableAnswers: item.acceptableAnswers,
          explanation: item.explanation,
          explanationUi: item.explanationUi,
        },
        store,
      );
    }
  }

  const savedQuestions = await store.listTryoutQuestions(record.id);
  const questionIds = savedQuestions.map((q) => q.id);

  return {
    ok: true as const,
    id: record.id,
    kind: "tryout" as const,
    title: record.title,
    status: record.status,
    questionCount: questionIds.length,
    questionIds,
  };
}

export async function listModularAssessmentQuestions(
  rawInput: ListAssessmentQuestionsInput,
  store: ModularAssessmentStore = createDrizzleModularAssessmentStore(),
) {
  const input = listAssessmentQuestionsInputSchema.parse(rawInput);

  let kind: AssessmentKind | undefined = input.kind;
  let quizTemplate: StoredQuizTemplate | null = null;
  let tryoutExam: StoredTryoutExam | null = null;

  if (!kind || kind === "quiz") {
    quizTemplate = await store.getQuizTemplate(input.assessmentId);
    if (quizTemplate) kind = "quiz";
  }
  if (!quizTemplate && (!kind || kind === "tryout")) {
    tryoutExam = await store.getTryoutExam(input.assessmentId);
    if (tryoutExam) kind = "tryout";
  }

  if (kind === "quiz" && quizTemplate) {
    const fixedIds = extractFixedQuestionIds(quizTemplate.selectionRules);
    const rows = await store.getQuizQuestionsByIds(fixedIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = fixedIds
      .map((id) => byId.get(id))
      .filter((item): item is StoredQuizQuestion => Boolean(item));

    return {
      ok: true as const,
      assessmentId: quizTemplate.id,
      kind: "quiz" as const,
      title: quizTemplate.title,
      questionCount: ordered.length,
      questions: ordered.map((q, index) => ({
        id: q.id,
        order: index + 1,
        type: q.questionType,
        promptPreview: promptPreview(q.prompt),
        hasExplanation: q.explanation.trim().length > 0,
        hasExplanationUi: Boolean(q.explanationUi && q.explanationUi.blocks.length > 0),
        hasPromptUi: Boolean(q.promptUi && q.promptUi.blocks.length > 0),
        ...(input.includeFull
          ? {
              prompt: q.prompt,
              promptUi: q.promptUi,
              options: q.options,
              correctIndices: q.correctIndices,
              acceptableAnswers: q.acceptableAnswers,
              explanation: q.explanation,
              explanationUi: q.explanationUi,
              difficulty: q.difficulty,
              tags: q.tags,
            }
          : {}),
      })),
    };
  }

  if (kind === "tryout" && tryoutExam) {
    const rows = await store.listTryoutQuestions(tryoutExam.id);
    return {
      ok: true as const,
      assessmentId: tryoutExam.id,
      kind: "tryout" as const,
      title: tryoutExam.title,
      questionCount: rows.length,
      questions: rows.map((q) => {
        const content = q.content;
        const prompt = typeof content.prompt === "string" ? content.prompt : "";
        const explanation = typeof content.explanation === "string" ? content.explanation : "";
        const promptUi = asUiSpec(content.promptUi);
        const explanationUi = asUiSpec(content.explanationUi);
        const correctIndices = resolveCorrectIndices({
          correctIndices: Array.isArray(content.correctIndices) ? asNumberArray(content.correctIndices) : undefined,
          correctIndex: typeof content.correctIndex === "number" ? content.correctIndex : undefined,
        });

        return {
          id: q.id,
          order: q.order,
          type: q.type,
          promptPreview: promptPreview(prompt),
          hasExplanation: explanation.trim().length > 0,
          hasExplanationUi: Boolean(explanationUi && explanationUi.blocks.length > 0),
          hasPromptUi: Boolean(promptUi && promptUi.blocks.length > 0),
          ...(input.includeFull
            ? {
                prompt,
                promptUi,
                options: asStringArray(content.options),
                correctIndices,
                acceptableAnswers: asStringArray(content.acceptableAnswers),
                explanation,
                explanationUi,
                difficulty: typeof content.difficulty === "string" ? content.difficulty : "medium",
                tags: asStringArray(content.tags),
              }
            : {}),
        };
      }),
    };
  }

  throw new Error(`MODULAR_ASSESSMENT_NOT_FOUND: Assessment '${input.assessmentId}' not found.`);
}

export async function upsertModularQuestion(
  rawInput: UpsertQuestionInput,
  store: ModularAssessmentStore = createDrizzleModularAssessmentStore(),
) {
  const input = upsertQuestionInputSchema.parse(rawInput);

  if (input.kind === "quiz") {
    const existing = input.questionId ? await store.getQuizQuestion(input.questionId) : null;
    const creating = !existing;
    const template = input.quizTemplateId ? await store.getQuizTemplate(input.quizTemplateId) : null;
    if (input.quizTemplateId && !template) {
      throw new Error(`MODULAR_ASSESSMENT_NOT_FOUND: Quiz '${input.quizTemplateId}' not found.`);
    }

    const resolvedCourseId = existing?.courseId
      ?? template?.courseId
      ?? (input.courseId ? await store.resolveCourseId(input.courseId) : null);

    if (!resolvedCourseId) {
      throw new Error("MODULAR_QUESTION_COURSE_REQUIRED: Provide courseId or quizTemplateId when creating a quiz question.");
    }

    const nextPromptUi =
      input.promptUi !== undefined
        ? (input.promptUi ? normalizeAssessmentUiSpec(input.promptUi) : null)
        : (existing?.promptUi ?? null);

    const nextPrompt =
      input.prompt !== undefined
        ? input.prompt.trim()
        : nextPromptUi && input.promptUi !== undefined
          ? extractPlainMarkdownFromUiSpec(nextPromptUi)
          : (existing?.prompt ?? "");

    if (!nextPrompt) {
      throw new Error("MODULAR_QUESTION_PROMPT_REQUIRED: Provide prompt or promptUi.");
    }

    const nextExplanationUi =
      input.explanationUi !== undefined
        ? (input.explanationUi ? normalizeAssessmentUiSpec(input.explanationUi) : null)
        : (existing?.explanationUi ?? null);

    const nextExplanation =
      input.explanation !== undefined
        ? input.explanation.trim()
        : nextExplanationUi && input.explanationUi !== undefined
          ? extractPlainMarkdownFromUiSpec(nextExplanationUi)
          : (existing?.explanation ?? "");

    const questionType = input.questionType ?? input.type ?? existing?.questionType ?? "multiple_choice";
    const options = input.options ?? existing?.options ?? [];
    const correctIndices = resolveCorrectIndices({
      correctIndices: input.correctIndices,
      correctIndex: input.correctIndex,
      fallback: existing?.correctIndices ?? [],
    });

    validateAnswerShape({ questionType, options, correctIndices });

    const id = input.questionId ?? `qb-${randomUUID().slice(0, 12)}`;
    const record: StoredQuizQuestion = {
      id,
      courseId: resolvedCourseId,
      difficulty: input.difficulty ?? existing?.difficulty ?? "medium",
      questionType,
      tags: input.tags ?? existing?.tags ?? [],
      prompt: nextPrompt,
      promptUi: nextPromptUi,
      options,
      correctIndices,
      acceptableAnswers: input.acceptableAnswers ?? existing?.acceptableAnswers ?? [],
      explanation: nextExplanation,
      explanationUi: nextExplanationUi,
      reviewStatus: input.reviewStatus ?? existing?.reviewStatus ?? "reviewed",
    };

    await store.saveQuizQuestion(record, creating);

    let attachedOrder: number | null = null;
    if (template) {
      const fixedIds = extractFixedQuestionIds(template.selectionRules);
      const existingIdx = fixedIds.indexOf(record.id);
      if (existingIdx < 0) {
        if (input.order !== undefined && input.order >= 0 && input.order < fixedIds.length) {
          fixedIds.splice(input.order, 0, record.id);
          attachedOrder = input.order + 1;
        } else {
          fixedIds.push(record.id);
          attachedOrder = fixedIds.length;
        }
        await store.saveQuizTemplate(
          {
            ...template,
            selectionRules: {
              ...template.selectionRules,
              fixedQuestionIds: fixedIds,
              count: fixedIds.length,
            },
          },
          false,
        );
      } else {
        attachedOrder = existingIdx + 1;
      }
    }

    return {
      ok: true as const,
      id: record.id,
      kind: "quiz" as const,
      assessmentId: template?.id ?? null,
      order: attachedOrder,
      type: record.questionType,
      hasPromptUi: Boolean(record.promptUi && record.promptUi.blocks.length > 0),
      hasExplanation: record.explanation.trim().length > 0,
      hasExplanationUi: Boolean(record.explanationUi && record.explanationUi.blocks.length > 0),
      created: creating,
    };
  }

  // kind === "tryout"
  const existing = input.questionId ? await store.getTryoutQuestion(input.questionId) : null;
  const creating = !existing;
  const examId = input.examId ?? existing?.examId;
  if (!examId) {
    throw new Error("MODULAR_QUESTION_EXAM_REQUIRED: Provide examId when creating a tryout question.");
  }
  const exam = await store.getTryoutExam(examId);
  if (!exam) {
    throw new Error(`MODULAR_ASSESSMENT_NOT_FOUND: Tryout '${examId}' not found.`);
  }

  const existingContent = existing?.content ?? {};
  const existingPrompt = typeof existingContent.prompt === "string" ? existingContent.prompt : "";
  const existingPromptUi = asUiSpec(existingContent.promptUi);
  const existingExplanation = typeof existingContent.explanation === "string" ? existingContent.explanation : "";
  const existingExplanationUi = asUiSpec(existingContent.explanationUi);

  const nextPromptUi =
    input.promptUi !== undefined
      ? (input.promptUi ? normalizeAssessmentUiSpec(input.promptUi) : null)
      : existingPromptUi;

  const nextPrompt =
    input.prompt !== undefined
      ? input.prompt.trim()
      : nextPromptUi && input.promptUi !== undefined
        ? extractPlainMarkdownFromUiSpec(nextPromptUi)
        : existingPrompt;

  if (!nextPrompt) {
    throw new Error("MODULAR_QUESTION_PROMPT_REQUIRED: Provide prompt or promptUi.");
  }

  const nextExplanationUi =
    input.explanationUi !== undefined
      ? (input.explanationUi ? normalizeAssessmentUiSpec(input.explanationUi) : null)
      : existingExplanationUi;

  const nextExplanation =
    input.explanation !== undefined
      ? input.explanation.trim()
      : nextExplanationUi && input.explanationUi !== undefined
        ? extractPlainMarkdownFromUiSpec(nextExplanationUi)
        : existingExplanation;

  const questionType = input.questionType ?? input.type ?? existing?.type ?? "multiple_choice";
  const options = input.options ?? asStringArray(existingContent.options);
  const existingCorrectIndices = resolveCorrectIndices({
    correctIndices: Array.isArray(existingContent.correctIndices) ? asNumberArray(existingContent.correctIndices) : undefined,
    correctIndex: typeof existingContent.correctIndex === "number" ? existingContent.correctIndex : undefined,
  });
  const correctIndices = resolveCorrectIndices({
    correctIndices: input.correctIndices,
    correctIndex: input.correctIndex,
    fallback: existingCorrectIndices,
  });

  validateAnswerShape({ questionType, options, correctIndices });

  let order = input.order ?? existing?.order;
  if (order === undefined) {
    const currentQuestions = await store.listTryoutQuestions(examId);
    order = currentQuestions.length > 0 ? Math.max(...currentQuestions.map((q) => q.order)) + 1 : 1;
  }

  const id = input.questionId ?? `tq-${randomUUID().slice(0, 12)}`;
  const nextContent: Record<string, unknown> = {
    ...existingContent,
    prompt: nextPrompt,
    promptUi: nextPromptUi,
    options,
    correctIndex: correctIndices[0],
    correctIndices,
    acceptableAnswers: input.acceptableAnswers ?? asStringArray(existingContent.acceptableAnswers),
    explanation: nextExplanation,
    explanationUi: nextExplanationUi,
    ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
  };

  const record: StoredTryoutQuestion = {
    id,
    examId,
    type: questionType,
    order,
    content: nextContent,
  };

  await store.saveTryoutQuestion(record, creating);

  return {
    ok: true as const,
    id: record.id,
    kind: "tryout" as const,
    assessmentId: examId,
    order: record.order,
    type: record.type,
    hasPromptUi: Boolean(nextPromptUi && nextPromptUi.blocks.length > 0),
    hasExplanation: nextExplanation.trim().length > 0,
    hasExplanationUi: Boolean(nextExplanationUi && nextExplanationUi.blocks.length > 0),
    created: creating,
  };
}

export async function updateModularQuestionExplanation(
  rawInput: UpdateQuestionExplanationInput,
  store: ModularAssessmentStore = createDrizzleModularAssessmentStore(),
) {
  const input = updateQuestionExplanationInputSchema.parse(rawInput);

  if (
    input.explanation === undefined &&
    input.explanationUi === undefined &&
    input.patch === undefined &&
    input.patches === undefined
  ) {
    throw new Error(
      "EXPLANATION_UPDATE_EMPTY: Provide explanation, explanationUi, patch, or patches.",
    );
  }

  let kind: AssessmentKind | undefined = input.kind;
  let quizQuestion: StoredQuizQuestion | null = null;
  let tryoutQuestion: StoredTryoutQuestion | null = null;

  if (!kind || kind === "quiz") {
    quizQuestion = await store.getQuizQuestion(input.questionId);
    if (quizQuestion) kind = "quiz";
  }
  if (!quizQuestion && (!kind || kind === "tryout")) {
    tryoutQuestion = await store.getTryoutQuestion(input.questionId);
    if (tryoutQuestion) kind = "tryout";
  }

  if (!kind || (!quizQuestion && !tryoutQuestion)) {
    throw new Error(`MODULAR_QUESTION_NOT_FOUND: Question '${input.questionId}' not found.`);
  }

  const existingExplanation =
    kind === "quiz"
      ? quizQuestion!.explanation
      : typeof tryoutQuestion!.content.explanation === "string"
        ? tryoutQuestion!.content.explanation
        : "";

  const existingExplanationUi =
    kind === "quiz"
      ? quizQuestion!.explanationUi
      : asUiSpec(tryoutQuestion!.content.explanationUi);

  let nextExplanationUi: AssessmentUiSpec | null =
    input.explanationUi !== undefined
      ? input.explanationUi
        ? normalizeAssessmentUiSpec(input.explanationUi)
        : null
      : existingExplanationUi;

  const patchQueue: AssessmentUiPatch[] = [
    ...(input.patch ? [input.patch] : []),
    ...(input.patches ?? []),
  ];

  for (const patch of patchQueue) {
    nextExplanationUi = patchAssessmentUiSpec(nextExplanationUi, patch, existingExplanation);
  }

  const uiChanged = input.explanationUi !== undefined || patchQueue.length > 0;
  const nextExplanation =
    input.explanation !== undefined
      ? input.explanation.trim()
      : uiChanged && nextExplanationUi
        ? extractPlainMarkdownFromUiSpec(nextExplanationUi)
        : existingExplanation;

  if (kind === "quiz") {
    await store.updateQuizQuestionExplanation(quizQuestion!.id, {
      explanation: nextExplanation,
      explanationUi: nextExplanationUi,
    });
  } else {
    // Preserve every non-explanation field (prompt, promptUi, options, correctIndices, etc.) untouched.
    const nextContent: Record<string, unknown> = {
      ...tryoutQuestion!.content,
      explanation: nextExplanation,
      explanationUi: nextExplanationUi,
    };
    await store.updateTryoutQuestionContent(tryoutQuestion!.id, nextContent);
  }

  const blockIds = nextExplanationUi ? nextExplanationUi.blocks.map((b) => b.id) : [];

  return {
    ok: true as const,
    questionId: input.questionId,
    kind,
    blockCount: blockIds.length,
    blockIds,
    hasExplanation: nextExplanation.trim().length > 0,
    hasExplanationUi: blockIds.length > 0,
  };
}

// ---------------------------------------------------------------------------
// MCP Tool Registration
// ---------------------------------------------------------------------------

function formatToolResult(payload: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

function formatToolError(error: unknown) {
  const message = error instanceof Error ? error.message : "MODULAR_ASSESSMENT_ERROR";
  const firstLine = message.split("\n")[0] ?? "MODULAR_ASSESSMENT_ERROR";
  const [rawCode, ...rest] = firstLine.split(":");
  const code = rawCode.trim().slice(0, 120);
  const detail = rest.join(":").trim().slice(0, 600) || undefined;
  if (code === "AUTHORING_MCP_SCOPE_REQUIRED" && detail) {
    const challenge = insufficientScopeChallenge(detail);
    return {
      ...formatToolResult(
        {
          ok: false,
          error: code,
          detail,
          requiredScope: detail,
          remediation:
            "Reauthorize this OAuth client with the required scope, then retry.",
        },
        true,
      ),
      _meta: { "mcp/www_authenticate": [challenge] },
    };
  }
  return formatToolResult({ ok: false, error: code, ...(detail ? { detail } : {}) }, true);
}

async function runModularTool(handler: () => Promise<Record<string, unknown>>) {
  try {
    return formatToolResult(await handler());
  } catch (error) {
    return formatToolError(error);
  }
}

export function registerModularAssessmentTools(
  server: McpServer,
  principal: McpPrincipal,
  store?: ModularAssessmentStore,
): void {
  const resolvedStore = store ?? createDrizzleModularAssessmentStore();

  (server as any).registerTool(
    "authoring.upsert_assessment",
    {
      title: "Upsert Quiz or Tryout Assessment",
      description:
        "Create or update a quiz template or tryout exam in one concise call, with optional inline questions (plain markdown and/or Assessment UI-SDK promptUi and explanationUi).",
      inputSchema: upsertAssessmentInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input: UpsertAssessmentInput) =>
      runModularTool(async () => {
        requireMcpScope(principal, "authoring:stage");
        if (
          input?.status === "published" ||
          (Array.isArray(input?.questions) &&
            input.questions.some((q) => q && typeof q === "object" && q.reviewStatus === "published"))
        ) {
          requireMcpScope(principal, "authoring:publish");
        }
        return upsertModularAssessment(input, resolvedStore);
      }),
  );

  (server as any).registerTool(
    "authoring.list_assessment_questions",
    {
      title: "List Assessment Questions",
      description:
        "List questions in a quiz or tryout with compact previews and UI-SDK flags. Pass includeFull: true to inspect full prompts, options, and explanationUi blocks.",
      inputSchema: listAssessmentQuestionsInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input: ListAssessmentQuestionsInput) =>
      runModularTool(async () => {
        requireMcpScope(principal, "authoring:read");
        return listModularAssessmentQuestions(input, resolvedStore);
      }),
  );

  (server as any).registerTool(
    "authoring.upsert_question",
    {
      title: "Upsert Single Assessment Question",
      description:
        "Create or update one quiz or tryout question without resending the whole assessment. Accepts plain markdown and/or Assessment UI-SDK promptUi and explanationUi.",
      inputSchema: upsertQuestionInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input: UpsertQuestionInput) =>
      runModularTool(async () => {
        requireMcpScope(principal, "authoring:stage");
        if (input?.reviewStatus === "published") {
          requireMcpScope(principal, "authoring:publish");
        }
        return upsertModularQuestion(input, resolvedStore);
      }),
  );

  (server as any).registerTool(
    "authoring.update_question_explanation",
    {
      title: "Update Single Question Explanation",
      description:
        "Update or modularly patch ONLY a single question's explanation or explanationUi blocks/steps by questionId without modifying its prompt, options, answers, or other questions.",
      inputSchema: updateQuestionExplanationInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input: UpdateQuestionExplanationInput) =>
      runModularTool(async () => {
        requireMcpScope(principal, "authoring:stage");
        return updateModularQuestionExplanation(input, resolvedStore);
      }),
  );
}
