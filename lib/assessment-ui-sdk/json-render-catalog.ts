import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import {
  ASSESSMENT_UI_CALLOUT_TONES,
  ASSESSMENT_UI_COLLAPSIBLE_VARIANTS,
  ASSESSMENT_UI_IMAGE_ASPECTS,
  ASSESSMENT_UI_LAYOUTS,
  ASSESSMENT_UI_VISUAL_KINDS,
  type AssessmentUiBlock,
  type AssessmentUiSpec,
} from "./schema";

const recordSpecSchema = z.record(z.string(), z.unknown());

export const assessmentJsonRenderCatalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        layout: z.enum(ASSESSMENT_UI_LAYOUTS).optional(),
      }),
      slots: ["default"],
      description: "Root container stacking assessment UI blocks vertically.",
    },
    Markdown: {
      props: z.object({
        blockId: z.string().optional(),
        content: z.string(),
      }),
      slots: [],
      description: "Markdown prose with LaTeX math and inline formatting.",
    },
    FormulaCard: {
      props: z.object({
        blockId: z.string().optional(),
        title: z.string().optional(),
        latex: z.string(),
        note: z.string().optional(),
      }),
      slots: [],
      description: "Highlighted LaTeX formula card with optional title and note.",
    },
    Callout: {
      props: z.object({
        blockId: z.string().optional(),
        tone: z.enum(ASSESSMENT_UI_CALLOUT_TONES),
        title: z.string().optional(),
        content: z.string(),
      }),
      slots: [],
      description: "Semantic callout box for info, tip, warning, formula, or common mistake.",
    },
    CollapsibleSection: {
      props: z.object({
        blockId: z.string().optional(),
        title: z.string(),
        defaultOpen: z.boolean().optional(),
        variant: z.enum(ASSESSMENT_UI_COLLAPSIBLE_VARIANTS).optional(),
      }),
      slots: ["default"],
      description: "Collapsible section for optional hints, derivations, details, or notes.",
    },
    Steps: {
      props: z.object({
        blockId: z.string().optional(),
        title: z.string().optional(),
        collapsible: z.boolean().optional(),
        defaultOpenStepId: z.string().optional(),
      }),
      slots: ["default"],
      description: "Ordered multi-step solution container.",
    },
    StepItem: {
      props: z.object({
        stepId: z.string().optional(),
        index: z.number().int().min(0),
        title: z.string(),
        summary: z.string().optional(),
        collapsible: z.boolean().optional(),
      }),
      slots: ["default"],
      description: "Individual numbered step inside a Steps container.",
    },
    Image: {
      props: z.object({
        blockId: z.string().optional(),
        src: z.string(),
        alt: z.string(),
        caption: z.string().optional(),
        aspect: z.enum(ASSESSMENT_UI_IMAGE_ASPECTS).optional(),
      }),
      slots: [],
      description: "Diagram or figure image with alt text and optional caption.",
    },
    Graph: {
      props: z.object({
        blockId: z.string().optional(),
        title: z.string().optional(),
        caption: z.string().optional(),
        spec: recordSpecSchema,
      }),
      slots: [],
      description: "Interactive 2D mathematical graph widget.",
    },
    Scene3D: {
      props: z.object({
        blockId: z.string().optional(),
        title: z.string().optional(),
        caption: z.string().optional(),
        spec: recordSpecSchema,
      }),
      slots: [],
      description: "Interactive 3D scene or geometric projection viewer.",
    },
    InteractiveVisual: {
      props: z.object({
        blockId: z.string().optional(),
        title: z.string().optional(),
        caption: z.string().optional(),
        kind: z.enum(ASSESSMENT_UI_VISUAL_KINDS),
        spec: recordSpecSchema,
      }),
      slots: [],
      description: "Interactive canvas, document, chart, or flowchart visual.",
    },
  },
  actions: {},
} as unknown as Parameters<typeof defineCatalog<typeof schema>>[1]);

export function isJsonRenderSpec(input: unknown): input is Spec {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.root !== "string" || candidate.root.trim().length === 0) {
    return false;
  }
  if (
    !candidate.elements ||
    typeof candidate.elements !== "object" ||
    Array.isArray(candidate.elements)
  ) {
    return false;
  }
  const elements = candidate.elements as Record<string, unknown>;
  return candidate.root in elements;
}

export function parseJsonRenderSpec(input: unknown): Spec | null {
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
  return isJsonRenderSpec(candidate) ? candidate : null;
}

export function assessmentUiSpecToJsonRenderSpec(spec: AssessmentUiSpec): Spec {
  const elements: Spec["elements"] = {};

  const addBlock = (block: AssessmentUiBlock): string => {
    switch (block.type) {
      case "markdown":
        elements[block.id] = {
          type: "Markdown",
          props: { blockId: block.id, content: block.content },
          children: [],
        };
        return block.id;

      case "formula_card":
        elements[block.id] = {
          type: "FormulaCard",
          props: {
            blockId: block.id,
            ...(block.title !== undefined ? { title: block.title } : {}),
            latex: block.latex,
            ...(block.note !== undefined ? { note: block.note } : {}),
          },
          children: [],
        };
        return block.id;

      case "callout":
        elements[block.id] = {
          type: "Callout",
          props: {
            blockId: block.id,
            tone: block.tone,
            ...(block.title !== undefined ? { title: block.title } : {}),
            content: block.content,
          },
          children: [],
        };
        return block.id;

      case "image":
        elements[block.id] = {
          type: "Image",
          props: {
            blockId: block.id,
            src: block.src,
            alt: block.alt,
            ...(block.caption !== undefined ? { caption: block.caption } : {}),
            ...(block.aspect !== undefined ? { aspect: block.aspect } : {}),
          },
          children: [],
        };
        return block.id;

      case "graph":
        elements[block.id] = {
          type: "Graph",
          props: {
            blockId: block.id,
            ...(block.title !== undefined ? { title: block.title } : {}),
            ...(block.caption !== undefined ? { caption: block.caption } : {}),
            spec: block.spec,
          },
          children: [],
        };
        return block.id;

      case "scene_3d":
        elements[block.id] = {
          type: "Scene3D",
          props: {
            blockId: block.id,
            ...(block.title !== undefined ? { title: block.title } : {}),
            ...(block.caption !== undefined ? { caption: block.caption } : {}),
            spec: block.spec,
          },
          children: [],
        };
        return block.id;

      case "interactive_visual":
        elements[block.id] = {
          type: "InteractiveVisual",
          props: {
            blockId: block.id,
            ...(block.title !== undefined ? { title: block.title } : {}),
            ...(block.caption !== undefined ? { caption: block.caption } : {}),
            kind: block.kind,
            spec: block.spec,
          },
          children: [],
        };
        return block.id;

      case "collapsible": {
        const childKeys = block.blocks.map((child) => addBlock(child));
        elements[block.id] = {
          type: "CollapsibleSection",
          props: {
            blockId: block.id,
            title: block.title,
            ...(block.defaultOpen !== undefined ? { defaultOpen: block.defaultOpen } : {}),
            ...(block.variant !== undefined ? { variant: block.variant } : {}),
          },
          children: childKeys,
        };
        return block.id;
      }

      case "steps": {
        const stepKeys = block.steps.map((step, index) => {
          const stepChildKeys = step.blocks.map((child) => addBlock(child));
          elements[step.id] = {
            type: "StepItem",
            props: {
              stepId: step.id,
              index,
              title: step.title,
              ...(step.summary !== undefined ? { summary: step.summary } : {}),
              collapsible: Boolean(block.collapsible),
            },
            children: stepChildKeys,
          };
          return step.id;
        });

        elements[block.id] = {
          type: "Steps",
          props: {
            blockId: block.id,
            ...(block.title !== undefined ? { title: block.title } : {}),
            collapsible: Boolean(block.collapsible),
            ...(block.steps[0] ? { defaultOpenStepId: block.steps[0].id } : {}),
          },
          children: stepKeys,
        };
        return block.id;
      }
    }
  };

  const rootChildren = spec.blocks.map((block) => addBlock(block));
  elements["assessment-root"] = {
    type: "Stack",
    props: {
      ...(spec.layout !== undefined ? { layout: spec.layout } : {}),
    },
    children: rootChildren,
  };

  return {
    root: "assessment-root",
    elements,
  };
}

export function extractPlainMarkdownFromJsonRenderSpec(spec: Spec): string {
  const visited = new Set<string>();
  const parts: string[] = [];

  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    const element = spec.elements[key];
    if (!element) return;
    const props = (element.props ?? {}) as Record<string, unknown>;

    if (element.type === "Markdown" && typeof props.content === "string") {
      parts.push(props.content.trim());
    } else if (element.type === "FormulaCard" && typeof props.latex === "string") {
      const lines: string[] = [];
      if (typeof props.title === "string" && props.title.trim()) {
        lines.push(`**${props.title.trim()}**`);
      }
      lines.push(`$$\n${props.latex.trim()}\n$$`);
      if (typeof props.note === "string" && props.note.trim()) {
        lines.push(props.note.trim());
      }
      parts.push(lines.join("\n\n"));
    } else if (element.type === "Callout" && typeof props.content === "string") {
      const prefix =
        typeof props.title === "string" && props.title.trim()
          ? `**${props.title.trim()}**\n`
          : "";
      parts.push(`${prefix}${props.content.trim()}`.trim());
    } else if (
      element.type === "Image" &&
      typeof props.src === "string" &&
      typeof props.alt === "string"
    ) {
      const lines = [`![${props.alt}](${props.src})`];
      if (typeof props.caption === "string" && props.caption.trim()) {
        lines.push(props.caption.trim());
      }
      parts.push(lines.join("\n"));
    } else if (
      (element.type === "CollapsibleSection" || element.type === "Steps") &&
      typeof props.title === "string" &&
      props.title.trim()
    ) {
      parts.push(`### ${props.title.trim()}`);
    } else if (element.type === "StepItem" && typeof props.title === "string") {
      const idx = typeof props.index === "number" ? props.index + 1 : 1;
      const lines = [`**${idx}. ${props.title.trim()}**`];
      if (typeof props.summary === "string" && props.summary.trim()) {
        lines.push(props.summary.trim());
      }
      parts.push(lines.join("\n\n"));
    } else if (
      (element.type === "Graph" ||
        element.type === "Scene3D" ||
        element.type === "InteractiveVisual") &&
      (typeof props.title === "string" || typeof props.caption === "string")
    ) {
      const lines: string[] = [];
      if (typeof props.title === "string" && props.title.trim()) {
        lines.push(`**${props.title.trim()}**`);
      }
      if (typeof props.caption === "string" && props.caption.trim()) {
        lines.push(props.caption.trim());
      }
      if (lines.length > 0) parts.push(lines.join("\n"));
    }

    if (Array.isArray(element.children)) {
      for (const childKey of element.children) {
        if (typeof childKey === "string") {
          visit(childKey);
        }
      }
    }
  };

  visit(spec.root);
  return parts.filter((part) => part.length > 0).join("\n\n");
}
