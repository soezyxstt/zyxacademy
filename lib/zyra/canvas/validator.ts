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
  const record = input as Record<string, unknown>;
  if (record.type !== "function_plot" || !Array.isArray(record.series)) return input;
  return {
    ...record,
    series: record.series.map((series) => {
      if (!series || typeof series !== "object" || Array.isArray(series)) return series;
      const item = series as Record<string, unknown>;
      return typeof item.expression === "string"
        ? { ...item, expression: normalizeLegacyGraphExpression(item.expression) }
        : series;
    }),
  };
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

function canvasIdentifier(value: string, index: number): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^[^A-Za-z_]+/, "")
    .slice(0, 28);
  return normalized || `item_${index + 1}`;
}

/** Converts the older typed visual intent into a renderable Learning Canvas. */
export function visualSpecToCanvasSpec(spec: VisualSpec | null | undefined): CanvasSpec | null {
  if (!spec || spec.sourceClaimIds.length === 0) return null;
  const base = {
    version: "zyra-learning-canvas-v1" as const,
    title: spec.title,
    purpose: spec.altDescription,
    variables: [],
    controls: [],
    claimRefs: spec.sourceClaimIds,
    altText: spec.altDescription,
  };

  if (spec.type === "graph") {
    const expressions = Object.values(spec.values)
      .filter((value): value is string => typeof value === "string")
      .map(normalizeLegacyGraphExpression)
      .filter((expression) => {
        try {
          compileSafeExpression(expression, { variables: ["x"] });
          return true;
        } catch {
          return false;
        }
      })
      .slice(0, 6);
    if (expressions.length === 0) return null;
    const domainMin = typeof spec.values.domainMin === "number" ? spec.values.domainMin : -10;
    const domainMax = typeof spec.values.domainMax === "number" ? spec.values.domainMax : 10;
    if (domainMin >= domainMax) return null;
    return parseCanvasSpec({
      ...base,
      type: "function_plot",
      domain: { min: domainMin, max: domainMax, sampleCount: 240 },
      series: expressions.map((expression, index) => ({
        id: `f_${index + 1}`,
        label: spec.semanticLabels[index] ?? `f${index + 1}(x)`,
        expression,
      })),
      fallback: {
        summary: spec.altDescription,
        columns: [{ id: "function", label: "Fungsi" }, { id: "expression", label: "Rumus" }],
        rows: expressions.map((expression, index) => [spec.semanticLabels[index] ?? `f${index + 1}(x)`, expression]),
      },
    });
  }

  if (spec.type === "chart") {
    const values = Object.entries(spec.values).filter((entry): entry is [string, number] => typeof entry[1] === "number");
    if (values.length === 0) return null;
    return parseCanvasSpec({
      ...base,
      type: "data_plot",
      xLabel: spec.semanticLabels[0] ?? "Data",
      yLabel: spec.semanticLabels[1] ?? "Nilai",
      points: values.map(([label, value], index) => ({ x: index + 1, y: value, label })),
      fallback: {
        summary: spec.altDescription,
        columns: [{ id: "label", label: "Data" }, { id: "value", label: "Nilai" }],
        rows: values.map(([label, value]) => [label, String(value)]),
      },
    });
  }

  if (spec.type === "flowchart") {
    const labels = [...new Set([
      ...spec.semanticLabels,
      ...spec.relationships.flatMap((edge) => [edge.sourceNode, edge.targetNode]),
    ])].slice(0, 80);
    if (labels.length < 2 || spec.relationships.length === 0) return null;
    const idByLabel = new Map(labels.map((label, index) => [label, canvasIdentifier(label, index)]));
    return parseCanvasSpec({
      ...base,
      type: "flowchart",
      direction: "right",
      nodes: labels.map((label) => ({ id: idByLabel.get(label), label })),
      edges: spec.relationships.map((edge) => ({
        source: idByLabel.get(edge.sourceNode),
        target: idByLabel.get(edge.targetNode),
        label: edge.label,
      })),
      fallback: {
        summary: spec.altDescription,
        columns: [{ id: "source", label: "Dari" }, { id: "target", label: "Ke" }, { id: "relation", label: "Hubungan" }],
        rows: spec.relationships.map((edge) => [edge.sourceNode, edge.targetNode, edge.label ?? ""]),
      },
    });
  }

  return null;
}
