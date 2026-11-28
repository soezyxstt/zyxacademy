import { z } from "zod";

export const ASSESSMENT_UI_LAYOUTS = ["standard", "compact"] as const;
export type AssessmentUiLayout = (typeof ASSESSMENT_UI_LAYOUTS)[number];

export const ASSESSMENT_UI_CALLOUT_TONES = [
  "info",
  "tip",
  "warning",
  "formula",
  "mistake",
] as const;
export type AssessmentUiCalloutTone = (typeof ASSESSMENT_UI_CALLOUT_TONES)[number];

export const ASSESSMENT_UI_COLLAPSIBLE_VARIANTS = [
  "hint",
  "derivation",
  "detail",
  "note",
] as const;
export type AssessmentUiCollapsibleVariant =
  (typeof ASSESSMENT_UI_COLLAPSIBLE_VARIANTS)[number];

export const ASSESSMENT_UI_IMAGE_ASPECTS = ["auto", "video", "square"] as const;
export type AssessmentUiImageAspect = (typeof ASSESSMENT_UI_IMAGE_ASPECTS)[number];

export const ASSESSMENT_UI_VISUAL_KINDS = [
  "canvas",
  "document",
  "chart",
  "flowchart",
] as const;
export type AssessmentUiVisualKind = (typeof ASSESSMENT_UI_VISUAL_KINDS)[number];

export interface AssessmentUiStep {
  id: string;
  title: string;
  summary?: string;
  blocks: AssessmentUiBlock[];
}

export interface AssessmentUiStepInput {
  id?: string;
  title: string;
  summary?: string;
  blocks: AssessmentUiBlockInput[];
}

export type AssessmentUiBlock =
  | { id: string; type: "markdown"; content: string }
  | {
      id: string;
      type: "steps";
      title?: string;
      collapsible?: boolean;
      steps: AssessmentUiStep[];
    }
  | {
      id: string;
      type: "collapsible";
      title: string;
      defaultOpen?: boolean;
      variant?: AssessmentUiCollapsibleVariant;
      blocks: AssessmentUiBlock[];
    }
  | {
      id: string;
      type: "callout";
      tone: AssessmentUiCalloutTone;
      title?: string;
      content: string;
    }
  | {
      id: string;
      type: "image";
      src: string;
      alt: string;
      caption?: string;
      aspect?: AssessmentUiImageAspect;
    }
  | {
      id: string;
      type: "graph";
      title?: string;
      caption?: string;
      spec: Record<string, unknown>;
    }
  | {
      id: string;
      type: "scene_3d";
      title?: string;
      caption?: string;
      spec: Record<string, unknown>;
    }
  | {
      id: string;
      type: "interactive_visual";
      title?: string;
      caption?: string;
      kind: AssessmentUiVisualKind;
      spec: Record<string, unknown>;
    }
  | {
      id: string;
      type: "formula_card";
      title?: string;
      latex: string;
      note?: string;
    };

export type AssessmentUiBlockInput =
  | { id?: string; type: "markdown"; content: string }
  | {
      id?: string;
      type: "steps";
      title?: string;
      collapsible?: boolean;
      steps: AssessmentUiStepInput[];
    }
  | {
      id?: string;
      type: "collapsible";
      title: string;
      defaultOpen?: boolean;
      variant?: AssessmentUiCollapsibleVariant;
      blocks: AssessmentUiBlockInput[];
    }
  | {
      id?: string;
      type: "callout";
      tone: AssessmentUiCalloutTone;
      title?: string;
      content: string;
    }
  | {
      id?: string;
      type: "image";
      src: string;
      alt: string;
      caption?: string;
      aspect?: AssessmentUiImageAspect;
    }
  | {
      id?: string;
      type: "graph";
      title?: string;
      caption?: string;
      spec: Record<string, unknown>;
    }
  | {
      id?: string;
      type: "scene_3d";
      title?: string;
      caption?: string;
      spec: Record<string, unknown>;
    }
  | {
      id?: string;
      type: "interactive_visual";
      title?: string;
      caption?: string;
      kind: AssessmentUiVisualKind;
      spec: Record<string, unknown>;
    }
  | {
      id?: string;
      type: "formula_card";
      title?: string;
      latex: string;
      note?: string;
    };

export interface AssessmentUiSpec {
  version: 1;
  layout?: AssessmentUiLayout;
  blocks: AssessmentUiBlock[];
}

export interface AssessmentUiSpecInput {
  version?: 1;
  layout?: AssessmentUiLayout;
  blocks: AssessmentUiBlockInput[];
}

export type AssessmentUiPatch =
  | { op: "replace_all"; spec: AssessmentUiSpec }
  | { op: "upsert_block"; block: AssessmentUiBlock; afterBlockId?: string }
  | { op: "remove_block"; blockId: string }
  | {
      op: "upsert_step";
      stepsBlockId: string;
      step: AssessmentUiStep;
      afterStepId?: string;
    }
  | { op: "remove_step"; stepsBlockId: string; stepId: string };

export type AssessmentUiPatchInput =
  | { op: "replace_all"; spec: AssessmentUiSpecInput }
  | { op: "upsert_block"; block: AssessmentUiBlockInput; afterBlockId?: string }
  | { op: "remove_block"; blockId: string }
  | {
      op: "upsert_step";
      stepsBlockId: string;
      step: AssessmentUiStepInput;
      afterStepId?: string;
    }
  | { op: "remove_step"; stepsBlockId: string; stepId: string };

const optionalIdSchema = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const recordSpecSchema = z.record(z.string(), z.unknown());

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, val]) => key !== "id" && val !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`).join(",")}}`;
}

function claimUniqueId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }
  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  const unique = `${baseId}-${suffix}`;
  usedIds.add(unique);
  return unique;
}

function normalizeStepWithIds(
  step: AssessmentUiStepInput,
  usedIds: Set<string>,
): AssessmentUiStep {
  const explicitId = step.id?.trim();
  const baseId =
    explicitId && explicitId.length > 0
      ? explicitId
      : `step-${fnv1aHash(stableSerialize({ title: step.title, summary: step.summary, blocks: step.blocks }))}`;
  const id = claimUniqueId(baseId, usedIds);
  const blocks = step.blocks.map((block) => normalizeBlockWithIds(block, usedIds));
  return {
    id,
    title: step.title,
    ...(step.summary !== undefined ? { summary: step.summary } : {}),
    blocks,
  };
}

function normalizeBlockWithIds(
  block: AssessmentUiBlockInput,
  usedIds: Set<string>,
): AssessmentUiBlock {
  const explicitId = block.id?.trim();
  const baseId =
    explicitId && explicitId.length > 0
      ? explicitId
      : `blk-${block.type.replace(/_/g, "-")}-${fnv1aHash(stableSerialize(block))}`;
  const id = claimUniqueId(baseId, usedIds);

  switch (block.type) {
    case "markdown":
      return { id, type: "markdown", content: block.content };
    case "steps":
      return {
        id,
        type: "steps",
        ...(block.title !== undefined ? { title: block.title } : {}),
        ...(block.collapsible !== undefined ? { collapsible: block.collapsible } : {}),
        steps: block.steps.map((step) => normalizeStepWithIds(step, usedIds)),
      };
    case "collapsible":
      return {
        id,
        type: "collapsible",
        title: block.title,
        ...(block.defaultOpen !== undefined ? { defaultOpen: block.defaultOpen } : {}),
        ...(block.variant !== undefined ? { variant: block.variant } : {}),
        blocks: block.blocks.map((child) => normalizeBlockWithIds(child, usedIds)),
      };
    case "callout":
      return {
        id,
        type: "callout",
        tone: block.tone,
        ...(block.title !== undefined ? { title: block.title } : {}),
        content: block.content,
      };
    case "image":
      return {
        id,
        type: "image",
        src: block.src,
        alt: block.alt,
        ...(block.caption !== undefined ? { caption: block.caption } : {}),
        ...(block.aspect !== undefined ? { aspect: block.aspect } : {}),
      };
    case "graph":
      return {
        id,
        type: "graph",
        ...(block.title !== undefined ? { title: block.title } : {}),
        ...(block.caption !== undefined ? { caption: block.caption } : {}),
        spec: block.spec,
      };
    case "scene_3d":
      return {
        id,
        type: "scene_3d",
        ...(block.title !== undefined ? { title: block.title } : {}),
        ...(block.caption !== undefined ? { caption: block.caption } : {}),
        spec: block.spec,
      };
    case "interactive_visual":
      return {
        id,
        type: "interactive_visual",
        ...(block.title !== undefined ? { title: block.title } : {}),
        ...(block.caption !== undefined ? { caption: block.caption } : {}),
        kind: block.kind,
        spec: block.spec,
      };
    case "formula_card":
      return {
        id,
        type: "formula_card",
        ...(block.title !== undefined ? { title: block.title } : {}),
        latex: block.latex,
        ...(block.note !== undefined ? { note: block.note } : {}),
      };
  }
}

function normalizeSpecWithIds(spec: AssessmentUiSpecInput): AssessmentUiSpec {
  const usedIds = new Set<string>();
  return {
    version: 1,
    ...(spec.layout !== undefined ? { layout: spec.layout } : {}),
    blocks: spec.blocks.map((block) => normalizeBlockWithIds(block, usedIds)),
  };
}

const rawAssessmentUiStepSchema: z.ZodType<AssessmentUiStepInput> = z.lazy(() =>
  z.object({
    id: optionalIdSchema,
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1).optional(),
    blocks: z.array(rawAssessmentUiBlockSchema),
  }),
);

const rawAssessmentUiBlockSchema: z.ZodType<AssessmentUiBlockInput> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      id: optionalIdSchema,
      type: z.literal("markdown"),
      content: z.string(),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("steps"),
      title: z.string().trim().min(1).optional(),
      collapsible: z.boolean().optional(),
      steps: z.array(rawAssessmentUiStepSchema),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("collapsible"),
      title: z.string().trim().min(1),
      defaultOpen: z.boolean().optional(),
      variant: z.enum(ASSESSMENT_UI_COLLAPSIBLE_VARIANTS).optional(),
      blocks: z.array(rawAssessmentUiBlockSchema),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("callout"),
      tone: z.enum(ASSESSMENT_UI_CALLOUT_TONES),
      title: z.string().trim().min(1).optional(),
      content: z.string(),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("image"),
      src: z.string().trim().min(1),
      alt: z.string().trim().min(1),
      caption: z.string().trim().min(1).optional(),
      aspect: z.enum(ASSESSMENT_UI_IMAGE_ASPECTS).optional(),
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("graph"),
      title: z.string().trim().min(1).optional(),
      caption: z.string().trim().min(1).optional(),
      spec: recordSpecSchema,
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("scene_3d"),
      title: z.string().trim().min(1).optional(),
      caption: z.string().trim().min(1).optional(),
      spec: recordSpecSchema,
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("interactive_visual"),
      title: z.string().trim().min(1).optional(),
      caption: z.string().trim().min(1).optional(),
      kind: z.enum(ASSESSMENT_UI_VISUAL_KINDS),
      spec: recordSpecSchema,
    }),
    z.object({
      id: optionalIdSchema,
      type: z.literal("formula_card"),
      title: z.string().trim().min(1).optional(),
      latex: z.string().trim().min(1),
      note: z.string().trim().min(1).optional(),
    }),
  ]),
);

export const assessmentUiStepSchema = rawAssessmentUiStepSchema.transform((step) =>
  normalizeStepWithIds(step, new Set<string>()),
);

export const assessmentUiBlockSchema = rawAssessmentUiBlockSchema.transform((block) =>
  normalizeBlockWithIds(block, new Set<string>()),
);

export const assessmentUiSpecSchema = z
  .object({
    version: z.literal(1).default(1),
    layout: z.enum(ASSESSMENT_UI_LAYOUTS).optional(),
    blocks: z.array(rawAssessmentUiBlockSchema),
  })
  .transform((spec) => normalizeSpecWithIds(spec));

export const assessmentUiPatchSchema = z.discriminatedUnion("op", [
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
    step: assessmentUiStepSchema,
    afterStepId: z.string().trim().min(1).optional(),
  }),
  z.object({
    op: z.literal("remove_step"),
    stepsBlockId: z.string().trim().min(1),
    stepId: z.string().trim().min(1),
  }),
]);

export function parseAssessmentUiSpec(input: unknown): AssessmentUiSpec | null {
  if (input === null || input === undefined) {
    return null;
  }

  let candidate: unknown = input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  const parsed = assessmentUiSpecSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function normalizeToAssessmentUiSpec(
  spec: unknown,
  fallbackMarkdown?: string | null,
): AssessmentUiSpec {
  const parsed = parseAssessmentUiSpec(spec);
  if (parsed && parsed.blocks.length > 0) {
    return parsed;
  }

  const markdown = typeof fallbackMarkdown === "string" ? fallbackMarkdown.trim() : "";
  if (markdown.length > 0) {
    return normalizeSpecWithIds({
      version: 1,
      ...(parsed?.layout ? { layout: parsed.layout } : {}),
      blocks: [{ type: "markdown", content: markdown }],
    });
  }

  return parsed ?? { version: 1, blocks: [] };
}

function readSpecSummary(spec: Record<string, unknown>): string | null {
  for (const key of ["summary", "description", "altText", "formula", "initialFormula"]) {
    const value = spec[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  const fallback = spec.staticFallback ?? spec.fallback;
  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    const summary = (fallback as Record<string, unknown>).summary;
    if (typeof summary === "string" && summary.trim().length > 0) {
      return summary.trim();
    }
  }
  return null;
}

function extractBlockMarkdown(block: AssessmentUiBlock): string {
  switch (block.type) {
    case "markdown":
      return block.content.trim();
    case "callout": {
      const prefix = block.title ? `**${block.title}**\n` : "";
      return `${prefix}${block.content.trim()}`.trim();
    }
    case "formula_card": {
      const parts: string[] = [];
      if (block.title) parts.push(`**${block.title}**`);
      parts.push(`$$\n${block.latex.trim()}\n$$`);
      if (block.note) parts.push(block.note.trim());
      return parts.join("\n\n");
    }
    case "image": {
      const lines = [`![${block.alt}](${block.src})`];
      if (block.caption) lines.push(block.caption.trim());
      return lines.join("\n");
    }
    case "collapsible": {
      const inner = block.blocks
        .map((child) => extractBlockMarkdown(child))
        .filter((part) => part.length > 0)
        .join("\n\n");
      return inner ? `### ${block.title}\n\n${inner}` : `### ${block.title}`;
    }
    case "steps": {
      const parts: string[] = [];
      if (block.title) parts.push(`### ${block.title}`);
      block.steps.forEach((step, index) => {
        const stepLines: string[] = [`**${index + 1}. ${step.title}**`];
        if (step.summary) stepLines.push(step.summary.trim());
        const inner = step.blocks
          .map((child) => extractBlockMarkdown(child))
          .filter((part) => part.length > 0)
          .join("\n\n");
        if (inner) stepLines.push(inner);
        parts.push(stepLines.join("\n\n"));
      });
      return parts.join("\n\n");
    }
    case "graph":
    case "scene_3d":
    case "interactive_visual": {
      const parts: string[] = [];
      if (block.title) parts.push(`**${block.title}**`);
      const summary = readSpecSummary(block.spec);
      if (summary) parts.push(summary);
      if (block.caption) parts.push(block.caption.trim());
      return parts.join("\n");
    }
  }
}

export function extractPlainMarkdownFromUiSpec(
  spec: AssessmentUiSpec | null | undefined,
): string {
  if (!spec || !Array.isArray(spec.blocks) || spec.blocks.length === 0) {
    return "";
  }
  return spec.blocks
    .map((block) => extractBlockMarkdown(block))
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function replaceNestedBlock(
  blocks: AssessmentUiBlock[],
  target: AssessmentUiBlock,
): { blocks: AssessmentUiBlock[]; replaced: boolean } {
  let replaced = false;
  const next = blocks.map((block) => {
    if (block.id === target.id) {
      replaced = true;
      return target;
    }
    if (block.type === "collapsible") {
      const childResult = replaceNestedBlock(block.blocks, target);
      if (childResult.replaced) {
        replaced = true;
        return { ...block, blocks: childResult.blocks };
      }
    } else if (block.type === "steps") {
      let stepReplaced = false;
      const nextSteps = block.steps.map((step) => {
        const childResult = replaceNestedBlock(step.blocks, target);
        if (childResult.replaced) {
          stepReplaced = true;
          return { ...step, blocks: childResult.blocks };
        }
        return step;
      });
      if (stepReplaced) {
        replaced = true;
        return { ...block, steps: nextSteps };
      }
    }
    return block;
  });
  return { blocks: next, replaced };
}

function removeBlockRecursive(
  blocks: AssessmentUiBlock[],
  blockId: string,
): AssessmentUiBlock[] {
  return blocks
    .filter((block) => block.id !== blockId)
    .map((block) => {
      if (block.type === "collapsible") {
        return { ...block, blocks: removeBlockRecursive(block.blocks, blockId) };
      }
      if (block.type === "steps") {
        return {
          ...block,
          steps: block.steps.map((step) => ({
            ...step,
            blocks: removeBlockRecursive(step.blocks, blockId),
          })),
        };
      }
      return block;
    });
}

function updateStepsBlockRecursive(
  blocks: AssessmentUiBlock[],
  stepsBlockId: string,
  updater: (steps: AssessmentUiStep[]) => AssessmentUiStep[],
): { blocks: AssessmentUiBlock[]; found: boolean } {
  let found = false;
  const next = blocks.map((block) => {
    if (block.type === "steps" && block.id === stepsBlockId) {
      found = true;
      return { ...block, steps: updater(block.steps) };
    }
    if (block.type === "collapsible") {
      const childResult = updateStepsBlockRecursive(block.blocks, stepsBlockId, updater);
      if (childResult.found) {
        found = true;
        return { ...block, blocks: childResult.blocks };
      }
    } else if (block.type === "steps") {
      let nestedFound = false;
      const nextSteps = block.steps.map((step) => {
        const childResult = updateStepsBlockRecursive(step.blocks, stepsBlockId, updater);
        if (childResult.found) {
          nestedFound = true;
          return { ...step, blocks: childResult.blocks };
        }
        return step;
      });
      if (nestedFound) {
        found = true;
        return { ...block, steps: nextSteps };
      }
    }
    return block;
  });
  return { blocks: next, found };
}

export function patchAssessmentUiSpec(
  spec: AssessmentUiSpec | null | undefined,
  patch: AssessmentUiPatchInput | AssessmentUiPatch,
): AssessmentUiSpec {
  const parsedPatch = assessmentUiPatchSchema.parse(patch);
  const base: AssessmentUiSpec = spec
    ? assessmentUiSpecSchema.parse(spec)
    : { version: 1, blocks: [] };

  switch (parsedPatch.op) {
    case "replace_all":
      return parsedPatch.spec;

    case "upsert_block": {
      const { block, afterBlockId } = parsedPatch;
      const existingTopIndex = base.blocks.findIndex((item) => item.id === block.id);
      if (existingTopIndex !== -1) {
        const nextBlocks = [...base.blocks];
        nextBlocks[existingTopIndex] = block;
        return { ...base, blocks: nextBlocks };
      }

      if (!afterBlockId) {
        const nested = replaceNestedBlock(base.blocks, block);
        if (nested.replaced) {
          return { ...base, blocks: nested.blocks };
        }
      }

      const nextBlocks = [...base.blocks];
      if (afterBlockId) {
        const anchorIndex = nextBlocks.findIndex((item) => item.id === afterBlockId);
        if (anchorIndex !== -1) {
          nextBlocks.splice(anchorIndex + 1, 0, block);
          return { ...base, blocks: nextBlocks };
        }
      }
      nextBlocks.push(block);
      return { ...base, blocks: nextBlocks };
    }

    case "remove_block":
      return {
        ...base,
        blocks: removeBlockRecursive(base.blocks, parsedPatch.blockId),
      };

    case "upsert_step": {
      const { stepsBlockId, step, afterStepId } = parsedPatch;
      const updated = updateStepsBlockRecursive(base.blocks, stepsBlockId, (steps) => {
        const existingIndex = steps.findIndex((item) => item.id === step.id);
        if (existingIndex !== -1) {
          const nextSteps = [...steps];
          nextSteps[existingIndex] = step;
          return nextSteps;
        }
        const nextSteps = [...steps];
        if (afterStepId) {
          const anchorIndex = nextSteps.findIndex((item) => item.id === afterStepId);
          if (anchorIndex !== -1) {
            nextSteps.splice(anchorIndex + 1, 0, step);
            return nextSteps;
          }
        }
        nextSteps.push(step);
        return nextSteps;
      });

      if (!updated.found) {
        throw new Error(`Steps block "${stepsBlockId}" not found.`);
      }
      return { ...base, blocks: updated.blocks };
    }

    case "remove_step": {
      const { stepsBlockId, stepId } = parsedPatch;
      const updated = updateStepsBlockRecursive(base.blocks, stepsBlockId, (steps) =>
        steps.filter((item) => item.id !== stepId),
      );

      if (!updated.found) {
        throw new Error(`Steps block "${stepsBlockId}" not found.`);
      }
      return { ...base, blocks: updated.blocks };
    }
  }
}
