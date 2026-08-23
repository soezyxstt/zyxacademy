import { validateVisualSpec, type VisualSpec } from "@/lib/tutor/visual-contracts";
import { compileSafeExpression, normalizeLegacyGraphExpression } from "./expression";
import {
  CanvasSpecSchema,
  type CanvasSpec,
  type CanvasVariable,
  type FunctionPlotCanvas,
} from "./contracts";

export interface CanvasValidationResult {
  isValid: boolean;
  reasonCodes: string[];
  spec?: CanvasSpec;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizeCanvasInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const record = { ...(input as Record<string, unknown>) };

  if (!record.version || typeof record.version !== "string") {
    record.version = "zyra-learning-canvas-v1";
  }
  if (!record.title || typeof record.title !== "string" || record.title.trim().length < 3) {
    record.title = "Grafik Fungsi";
  }
  if (!record.purpose || typeof record.purpose !== "string" || record.purpose.trim().length < 5) {
    record.purpose = "Visualisasi grafik matematika interaktif.";
  }
  if (!record.altText || typeof record.altText !== "string" || record.altText.trim().length < 5) {
    record.altText = `Grafik ${record.title} pada bidang koordinat kartesius.`;
  }
  if (!Array.isArray(record.variables)) {
    record.variables = [];
  }
  if (!Array.isArray(record.controls)) {
    record.controls = [];
  }
  if (!Array.isArray(record.claimRefs)) {
    record.claimRefs = [];
  }

  if (record.type === "function_plot") {
    const rawDomain = (record.domain && typeof record.domain === "object" ? record.domain : {}) as Record<string, unknown>;
    const min = typeof rawDomain.min === "number" && Number.isFinite(rawDomain.min) ? rawDomain.min : -10;
    const max = typeof rawDomain.max === "number" && Number.isFinite(rawDomain.max) && rawDomain.max > min ? rawDomain.max : 10;
    const sampleCount = typeof rawDomain.sampleCount === "number" && Number.isInteger(rawDomain.sampleCount) && rawDomain.sampleCount >= 2 && rawDomain.sampleCount <= 400 ? rawDomain.sampleCount : 240;
    record.domain = { min, max, sampleCount };

    let seriesList = Array.isArray(record.series) ? record.series : [];
    if (typeof record.series === "string") {
      seriesList = [{ id: "f1", label: "y", expression: record.series }];
    }
    record.series = seriesList.map((series, idx) => {
      if (typeof series === "string") {
        return {
          id: `f${idx + 1}`,
          label: `f${idx + 1}(x)`,
          expression: normalizeLegacyGraphExpression(series),
        };
      }
      if (!series || typeof series !== "object" || Array.isArray(series)) return series;
      const item = series as Record<string, unknown>;
      return {
        id: typeof item.id === "string" && item.id ? item.id : `f${idx + 1}`,
        label: typeof item.label === "string" && item.label ? item.label : `f${idx + 1}(x)`,
        expression: typeof item.expression === "string" ? normalizeLegacyGraphExpression(item.expression) : "",
      };
    });

    if (!record.fallback || typeof record.fallback !== "object" || !Array.isArray((record.fallback as Record<string, unknown>).columns)) {
      const seriesNames = (record.series as Array<{ label: string; expression: string }>).map((s) => s.label || "y");
      record.fallback = {
        summary: `Tabel nilai untuk ${record.title}`,
        columns: [{ id: "x", label: "x" }, ...seriesNames.map((name, i) => ({ id: `y_${i}`, label: name }))],
        rows: [
          [String(min), ...seriesNames.map(() => "0")],
          ["0", ...seriesNames.map(() => "0")],
          [String(max), ...seriesNames.map(() => "0")],
        ],
      };
    }
  }

  return record;
}

function validateVariables(spec: CanvasSpec): string[] {
  const reasons: string[] = [];
  const variables = new Map<string, CanvasVariable>();
  for (const variable of spec.variables) {
    if (variables.has(variable.id)) reasons.push("DUPLICATE_VARIABLE_ID");
    variables.set(variable.id, variable);
  }
  for (const control of spec.controls) {
    const variable = variables.get(control.variableId);
    if (!variable) {
      reasons.push("CONTROL_VARIABLE_UNKNOWN");
      continue;
    }
    if (control.min < variable.min || control.max > variable.max) reasons.push("CONTROL_RANGE_OUTSIDE_VARIABLE");
    if (control.min >= control.max) reasons.push("INVALID_CONTROL_RANGE");
  }
  return reasons;
}

function validateFunctionPlot(spec: FunctionPlotCanvas): string[] {
  const variables = spec.variables.map((variable) => variable.id);
  const reasons: string[] = [];
  for (const series of spec.series) {
    try {
      compileSafeExpression(series.expression, { variables: ["x", ...variables] });
    } catch {
      reasons.push("INVALID_SAFE_EXPRESSION");
    }
  }
  return reasons;
}

function validateDiagram(spec: Extract<CanvasSpec, { type: "flowchart" | "concept_map" }>): string[] {
  const reasons: string[] = [];
  const nodeIds = new Set(spec.nodes.map((node) => node.id));
  if (nodeIds.size !== spec.nodes.length) reasons.push("DUPLICATE_DIAGRAM_NODE_ID");
  for (const edge of spec.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) reasons.push("DIAGRAM_EDGE_NODE_UNKNOWN");
    if (edge.source === edge.target) reasons.push("DIAGRAM_SELF_EDGE");
  }
  return reasons;
}

function validateFiniteData(spec: CanvasSpec): string[] {
  if (spec.type !== "data_plot") return [];
  return spec.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
    ? ["NON_FINITE_DATA_POINT"]
    : [];
}

export function validateCanvasSpec(
  input: unknown,
  allowedClaimRefs?: readonly string[],
): CanvasValidationResult {
  const parsed = CanvasSpecSchema.safeParse(normalizeCanvasInput(input));
  if (!parsed.success) {
    return { isValid: false, reasonCodes: ["INVALID_CANVAS_SCHEMA"] };
  }
  const spec = parsed.data;
  const reasons: string[] = [
    ...validateVariables(spec),
    ...validateFiniteData(spec),
  ];

  if (allowedClaimRefs) {
    const allowed = new Set(allowedClaimRefs);
    if (spec.claimRefs.some((claimRef) => !allowed.has(claimRef))) reasons.push("UNREFERENCED_CANONICAL_CLAIM");
  }
  if (spec.type === "function_plot") reasons.push(...validateFunctionPlot(spec));
  if (spec.type === "derivation") {
    for (const step of spec.steps) {
      try {
        compileSafeExpression(step.expression, { variables: spec.variables.map((variable) => variable.id) });
      } catch {
        reasons.push("INVALID_DERIVATION_EXPRESSION");
      }
    }
  }
  if (spec.type === "flowchart" || spec.type === "concept_map") reasons.push(...validateDiagram(spec));
  if (spec.type === "chemistry_reaction") {
    for (const quantity of [...spec.reactants, ...spec.products]) {
      if (quantity.amount !== undefined && !quantity.unit) reasons.push("CHEMISTRY_AMOUNT_UNIT_REQUIRED");
    }
  }

  const deduped = unique(reasons);
  return deduped.length === 0
    ? { isValid: true, reasonCodes: [], spec }
    : { isValid: false, reasonCodes: deduped, spec };
}

export function parseCanvasSpec(
  input: unknown,
  allowedClaimRefs?: readonly string[],
): CanvasSpec | null {
  const result = validateCanvasSpec(input, allowedClaimRefs);
  return result.isValid ? result.spec ?? null : null;
}

export function canvasToLegacyVisualSpec(spec: CanvasSpec): VisualSpec | null {
  const validation = validateCanvasSpec(spec);
  if (!validation.isValid) return null;

  if (spec.type === "flowchart" || spec.type === "concept_map") {
    return {
      type: "flowchart",
      title: spec.title,
      semanticLabels: spec.nodes.map((node) => node.label),
      values: {},
      relationships: spec.edges.map((edge) => ({
        sourceNode: edge.source,
        targetNode: edge.target,
        label: edge.label,
      })),
      sourceClaimIds: spec.claimRefs,
      altDescription: spec.altText,
    };
  }

  const labels = spec.type === "function_plot"
    ? spec.series.map((series) => series.label)
    : spec.type === "data_plot"
      ? [spec.xLabel, spec.yLabel]
      : [spec.title];
  const values: Record<string, number | string> = {};
  if (spec.type === "function_plot") {
    values.domainMin = spec.domain.min;
    values.domainMax = spec.domain.max;
    for (const series of spec.series) values[series.id] = series.expression;
  } else if (spec.type === "data_plot") {
    spec.points.forEach((point, index) => {
      values[`point_${index + 1}_x`] = point.x;
      values[`point_${index + 1}_y`] = point.y;
    });
  } else if (spec.type === "vector_diagram" || spec.type === "free_body") {
    spec.vectors.forEach((vector) => {
      values[`${vector.id}_x`] = vector.x;
      values[`${vector.id}_y`] = vector.y;
    });
  }
  return {
    type: spec.type === "table" ? "chart" : "graph",
    title: spec.title,
    semanticLabels: labels,
    values,
    relationships: [],
    sourceClaimIds: spec.claimRefs,
    altDescription: spec.altText,
  };
}

export function validateLegacyVisualCompatibility(spec: CanvasSpec): boolean {
  const legacy = canvasToLegacyVisualSpec(spec);
  return legacy ? validateVisualSpec(legacy, spec.claimRefs).isValid : false;
}
