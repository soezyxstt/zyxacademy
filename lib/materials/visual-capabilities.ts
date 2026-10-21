import type { VisualSpec } from "./visual-contract";

/** Application capabilities, not an author-supplied claim of verification. */
export const VISUAL_CAPABILITIES = {
  epsilon_delta_graph: { web: "jsxgraph", print: "application-svg", interactive: true, models: ["constant", "linear", "quadratic"] },
  learning_canvas: { web: "application-svg", print: "application-svg", interactiveModels: ["function_plot", "data_plot"], models: ["function_plot", "data_plot", "derivation", "table", "flowchart", "concept_map", "vector_diagram", "free_body", "chemistry_reaction"] },
  geometry_2d: { web: "application-svg", print: "application-svg", interactive: false, maxPoints: 100, maxSegments: 100, maxCircles: 30, maxPolygons: 30, maxPolygonVertices: 300, equalAxisUnits: true },
  source_figure: { web: "scoped-source-asset", print: "verified-source-asset", interactive: false, requiresAssetManifest: true },
} as const;

export const UNSUPPORTED_VISUAL_CAPABILITIES = ["implicit_plot", "parametric_plot", "geometry_3d", "mechanics_simulation", "model_authored_code"] as const;

export function visualCapabilityFor(spec: VisualSpec) {
  return VISUAL_CAPABILITIES[spec.kind];
}
