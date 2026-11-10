import { z } from "zod";
import { isRepresentableRange } from "./viewport";
import { FlowchartNodeKindSchema } from "@/lib/flowchart";

export const LEARNING_CANVAS_VERSION = "zyra-learning-canvas-v1";
export const LEARNING_CANVAS_CAPABILITY_VERSION = "canvas-capabilities-v1";

const IdentifierSchema = z.string().regex(
  /^[A-Za-z_][A-Za-z0-9_]{0,31}$/,
  "Identifiers must start with a letter or underscore and contain only ASCII characters.",
);
const LabelSchema = z.string().trim().min(1).max(120);
const UnitSchema = z.string().trim().min(1).max(32).regex(/^[A-Za-z%°Ωμ·/\-^0-9 ]+$/);
const FiniteNumberSchema = z.number().finite();

export const CanvasVariableSchema = z.object({
  id: IdentifierSchema,
  label: LabelSchema,
  unit: UnitSchema.nullable().optional(),
  min: FiniteNumberSchema,
  max: FiniteNumberSchema,
  defaultValue: FiniteNumberSchema,
}).strict().superRefine((value, ctx) => {
  if (value.min >= value.max) {
    ctx.addIssue({ code: "custom", path: ["min"], message: "Variable minimum must be below maximum." });
  }
  if (value.defaultValue < value.min || value.defaultValue > value.max) {
    ctx.addIssue({ code: "custom", path: ["defaultValue"], message: "Variable default must be inside its range." });
  }
});
export type CanvasVariable = z.infer<typeof CanvasVariableSchema>;

export const CanvasControlSchema = z.object({
  variableId: IdentifierSchema,
  label: LabelSchema,
  min: FiniteNumberSchema,
  max: FiniteNumberSchema,
  step: z.number().finite().positive(),
  unit: UnitSchema.nullable().optional(),
  presets: z.array(FiniteNumberSchema).max(8).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.min >= value.max) {
    ctx.addIssue({ code: "custom", path: ["min"], message: "Control minimum must be below maximum." });
  }
  if (value.presets.some((preset) => preset < value.min || preset > value.max)) {
    ctx.addIssue({ code: "custom", path: ["presets"], message: "Control presets must stay inside the control range." });
  }
});
export type CanvasControl = z.infer<typeof CanvasControlSchema>;

export const CanvasFallbackSchema = z.object({
  summary: z.string().trim().min(5).max(1000),
  columns: z.array(z.object({
    id: IdentifierSchema,
    label: LabelSchema,
    unit: UnitSchema.nullable().optional(),
  }).strict()).min(1).max(12),
  rows: z.array(z.array(z.string().trim().max(240)).max(12)).min(1).max(100),
}).strict();
export type CanvasFallback = z.infer<typeof CanvasFallbackSchema>;

const CanvasBaseSchema = z.object({
  version: z.literal(LEARNING_CANVAS_VERSION),
  title: z.string().trim().min(3).max(160),
  purpose: z.string().trim().min(5).max(500),
  variables: z.array(CanvasVariableSchema).max(12).default([]),
  controls: z.array(CanvasControlSchema).max(8).default([]),
  claimRefs: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  altText: z.string().trim().min(5).max(500),
  fallback: CanvasFallbackSchema,
}).strict();

const DomainSchema = z.object({
  min: FiniteNumberSchema,
  max: FiniteNumberSchema,
  sampleCount: z.number().int().min(2).max(400).default(160),
  unit: UnitSchema.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.min >= value.max) {
    ctx.addIssue({ code: "custom", path: ["min"], message: "Domain minimum must be below maximum." });
  }
});

export const FunctionPlotCanvasSchema = CanvasBaseSchema.extend({
  type: z.literal("function_plot"),
  domain: DomainSchema,
  yBounds: z.object({ min: FiniteNumberSchema, max: FiniteNumberSchema }).strict()
    .refine(isRepresentableRange, "Vertical bounds must define a representable increasing range.").optional(),
  equalAxisScale: z.boolean().optional(),
  pointMarkers: z.array(z.object({
    seriesId: IdentifierSchema,
    x: FiniteNumberSchema,
    y: FiniteNumberSchema,
    label: LabelSchema,
    kind: z.enum(["open", "closed"]),
  }).strict()).max(24).optional(),
  series: z.array(z.object({
    id: IdentifierSchema,
    label: LabelSchema,
    expression: z.string().trim().min(1).max(180),
    excludedX: z.array(FiniteNumberSchema).max(16).optional(),
    unit: UnitSchema.nullable().optional(),
    lineStyle: z.enum(["solid", "dashed", "dotted"]).default("solid"),
    role: z.enum(["primary", "reference"]).default("primary"),
  }).strict()).min(1).max(6),
}).strict().superRefine((plot, ctx) => {
  for (const marker of plot.pointMarkers ?? []) {
    if (!plot.series.some(series => series.id === marker.seriesId)) {
      ctx.addIssue({ code: "custom", path: ["pointMarkers"], message: "Point marker must reference a plotted series." });
    }
  }
});
export type FunctionPlotCanvas = z.infer<typeof FunctionPlotCanvasSchema>;

const DataPointSchema = z.object({
  x: FiniteNumberSchema,
  y: FiniteNumberSchema,
  label: z.string().trim().max(120).optional(),
}).strict();

export const DataPlotCanvasSchema = CanvasBaseSchema.extend({
  type: z.literal("data_plot"),
  xLabel: LabelSchema,
  yLabel: LabelSchema,
  xUnit: UnitSchema.nullable().optional(),
  yUnit: UnitSchema.nullable().optional(),
  points: z.array(DataPointSchema).min(1).max(200),
}).strict();
export type DataPlotCanvas = z.infer<typeof DataPlotCanvasSchema>;

export const DerivationCanvasSchema = CanvasBaseSchema.extend({
  type: z.literal("derivation"),
  steps: z.array(z.object({
    id: IdentifierSchema,
    label: LabelSchema,
    expression: z.string().trim().min(1).max(240),
    explanation: z.string().trim().min(1).max(500),
  }).strict()).min(1).max(12),
}).strict();
export type DerivationCanvas = z.infer<typeof DerivationCanvasSchema>;

export const TableCanvasSchema = CanvasBaseSchema.extend({
  type: z.literal("table"),
  rows: z.array(z.array(z.string().trim().max(240)).max(12)).min(1).max(100),
}).strict();
export type TableCanvas = z.infer<typeof TableCanvasSchema>;

const DiagramNodeSchema = z.object({
  id: IdentifierSchema,
  label: LabelSchema,
  kind: FlowchartNodeKindSchema.optional(),
}).strict();
const DiagramEdgeSchema = z.object({
  source: IdentifierSchema,
  target: IdentifierSchema,
  label: z.string().trim().max(120).optional(),
}).strict();

export const DiagramCanvasSchema = CanvasBaseSchema.extend({
  type: z.enum(["flowchart", "concept_map"]),
  direction: z.enum(["right", "down"]).default("right"),
  nodes: z.array(DiagramNodeSchema).min(2).max(80),
  edges: z.array(DiagramEdgeSchema).min(1).max(160),
}).strict();
export type DiagramCanvas = z.infer<typeof DiagramCanvasSchema>;

const VectorSchema = z.object({
  id: IdentifierSchema,
  label: LabelSchema,
  x: FiniteNumberSchema,
  y: FiniteNumberSchema,
  unit: UnitSchema,
}).strict();

export const VectorCanvasSchema = CanvasBaseSchema.extend({
  type: z.enum(["vector_diagram", "free_body"]),
  vectors: z.array(VectorSchema).min(1).max(16),
  originLabel: LabelSchema.optional(),
}).strict();
export type VectorCanvas = z.infer<typeof VectorCanvasSchema>;

const ChemicalQuantitySchema = z.object({
  formula: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9()]+$/),
  coefficient: z.number().int().positive().max(999),
  amount: FiniteNumberSchema.optional(),
  unit: UnitSchema.nullable().optional(),
}).strict();

export const ChemistryCanvasSchema = CanvasBaseSchema.extend({
  type: z.literal("chemistry_reaction"),
  reactants: z.array(ChemicalQuantitySchema).min(1).max(12),
  products: z.array(ChemicalQuantitySchema).min(1).max(12),
}).strict();
export type ChemistryCanvas = z.infer<typeof ChemistryCanvasSchema>;

export const CanvasSpecSchema = z.discriminatedUnion("type", [
  FunctionPlotCanvasSchema,
  DataPlotCanvasSchema,
  DerivationCanvasSchema,
  TableCanvasSchema,
  DiagramCanvasSchema,
  VectorCanvasSchema,
  ChemistryCanvasSchema,
]);
export type CanvasSpec = z.infer<typeof CanvasSpecSchema>;
export type CanvasType = CanvasSpec["type"];

export function isZyraCanvasFeatureEnabled(
  _value?: string,
): boolean {
  return true;
}

export const CanvasCapabilitySchema = z.object({
  type: z.enum([
    "function_plot",
    "data_plot",
    "derivation",
    "table",
    "flowchart",
  "concept_map",
  "vector_diagram",
  "free_body",
  "chemistry_reaction",
  ]),
  version: z.literal(LEARNING_CANVAS_CAPABILITY_VERSION),
  interactive: z.boolean(),
  fallback: z.enum(["table", "text"]),
}).strict();
export type CanvasCapability = z.infer<typeof CanvasCapabilitySchema>;

export const LEARNING_CANVAS_CAPABILITIES: readonly CanvasCapability[] = [
  { type: "function_plot", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: true, fallback: "table" },
  { type: "data_plot", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: false, fallback: "table" },
  { type: "derivation", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: true, fallback: "text" },
  { type: "table", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: false, fallback: "table" },
  { type: "flowchart", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: false, fallback: "text" },
  { type: "concept_map", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: false, fallback: "text" },
  { type: "vector_diagram", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: false, fallback: "table" },
  { type: "free_body", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: false, fallback: "table" },
  { type: "chemistry_reaction", version: LEARNING_CANVAS_CAPABILITY_VERSION, interactive: false, fallback: "table" },
];
