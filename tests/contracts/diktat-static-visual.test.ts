import { describe, expect, test } from "bun:test";
import { renderDiktatStaticVisual, buildDiktatVisualSnapshot } from "@/lib/materials/diktat-static-visual";
import { prepareAuthoredDiktatVisuals, authoredDiktatUnitsSchema } from "@/lib/materials/diktat-v4";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import { LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";
const base = { version: "zyra-learning-canvas-v1", title: "Scientific plot", purpose: "Scientific quantities.", variables: [], controls: [], claimRefs: [], altText: "Scientific plot.", fallback: { summary: "Scientific values.", columns: [{ id: "x", label: "$x$" }], rows: [["1"]] } };
function render(canvas: object) { return renderDiktatStaticVisual(visualSpecSchema.parse({ id: "v", kind: "learning_canvas", label: "Scientific", description: "Mathematical quantities.", interactive: false, canvas: { ...base, ...canvas } })); }
describe("Diktat deterministic static visuals", () => {
  test("renders analytic epsilon/delta bands and pinned state without authored assets", () => {
    const html = renderDiktatStaticVisual(LIMIT_EPSILON_DELTA_GRAPH);
    expect(html).toContain("<svg"); expect(html).toContain("foreignObject"); expect(html).toContain("\\delta"); expect(html).toContain("data-state-hash");
    expect(html).not.toContain("katex-error"); expect(html).not.toContain("<script");
    expect(buildDiktatVisualSnapshot(LIMIT_EPSILON_DELTA_GRAPH)).toEqual(buildDiktatVisualSnapshot(structuredClone(LIMIT_EPSILON_DELTA_GRAPH)));
  });
  test("prepares missing draft snapshot and rejects stale authored snapshot", () => {
    const units = authoredDiktatUnitsSchema.parse([{ id: "u", sourceElementRefs: ["s"], ideaIds: ["i"], parts: [{ id: "p", kind: "visual_ref", visualId: LIMIT_EPSILON_DELTA_GRAPH.id, staticMarkdown: "Caption." }] }]);
    const prepared = prepareAuthoredDiktatVisuals(units, [LIMIT_EPSILON_DELTA_GRAPH]);
    expect(prepared[0].parts[0]).toHaveProperty("staticSnapshot");
    expect(() => prepareAuthoredDiktatVisuals(prepared, [{ ...LIMIT_EPSILON_DELTA_GRAPH, defaultEpsilon: 0.5 }])).toThrow("DIKTAT_VISUAL_SNAPSHOT_STALE");
  });
  test("typesets scientific table, chemistry, vectors and generated diagram arrows", () => {
    expect(render({ type: "table", rows: [["1.7e-5"]] })).toContain("10^{-5}");
    expect(render({ type: "table", rows: [["1.700e-999"]] })).toContain("1.700\\times 10^{-999}");
    expect(render({ type: "table", rows: [["1.7e999"]] })).toContain("1.7\\times 10^{999}");
    expect(render({ type: "chemistry_reaction", reactants: [{ formula: "H2", coefficient: 2 }, { formula: "O2", coefficient: 1 }], products: [{ formula: "H2O", coefficient: 2 }] })).toContain("katex");
    expect(render({ type: "vector_diagram", vectors: [{ id: "f", label: "$F$", x: 1, y: 2, unit: "N" }] })).toContain("marker-end");
    expect(render({ type: "flowchart", nodes: [{ id: "a", label: "$x$" }, { id: "b", label: "$x^2$" }], edges: [{ source: "a", target: "b" }] })).toContain("marker-end");
    const down = render({ type: "flowchart", direction: "down", nodes: [{ id: "a", label: "$x$" }, { id: "b", label: "$x^2$" }], edges: [{ source: "a", target: "b" }] });
    expect(down).toContain('<rect x="180" y="180"');
  });
  test("renders actual data and safe function expressions, rejecting invalid math", () => {
    expect(render({ type: "data_plot", xLabel: "$t$", yLabel: "$F$", points: [{ x: 1, y: 2 }] })).toContain("<circle");
    expect(render({ type: "function_plot", domain: { min: -1, max: 1 }, series: [{ id: "f", label: "$f$", expression: "x^2" }] })).toContain("<path");
    expect(() => render({ type: "table", rows: [["$\\unsupported{x}$"]] })).toThrow();
  });
  test("separates upright units, typesets graph equations at display size and labels arrow tips", () => {
    const graph = render({ type: "function_plot", domain: { min: 0, max: 0.002, unit: "s" }, series: [{ id: "f", label: "$f$", expression: "x/2", unit: "m" }] });
    expect(graph).toContain("\\left[\\pu{s}\\right]");
    expect(graph).toContain("\\displaystyle f_{1}(x)=\\frac{x}{2}");
    const data = render({ type: "data_plot", xLabel: "$t$", yLabel: "$F$", xUnit: "s", yUnit: "N", points: [{ x: 1, y: 2 }] });
    expect(data).toContain("\\left[\\pu{N}\\right]");
    const vector = render({ type: "vector_diagram", vectors: [{ id: "f", label: "$\\vec F$", x: 2, y: 3, unit: "N" }] });
    expect(vector).toContain("foreignObject");
    expect(vector.match(/\\vec F/g)?.length).toBe(2);
    const chemistry = render({ type: "chemistry_reaction", reactants: [{ formula: "H2", coefficient: 1, amount: 0.002, unit: "mol" }], products: [{ formula: "H2", coefficient: 1 }] });
    expect(chemistry).toContain("0.002\\,\\pu{mol}");
  });
  test("renders equal-scale geometry and refuses unverified source figure assets", () => {
    const geometry = visualSpecSchema.parse({ id: "g", kind: "geometry_2d", label: "$A$", description: "A circle around $A$.", bounds: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, staticFallback: { type: "text", summary: "Circle.", content: "Radius one." }, geometry: { points: [{ id: "a", x: 0, y: 0, labelLatex: "A" }], circles: [{ id: "c", center: "a", radius: 1, labelLatex: "r=1" }] } });
    expect(renderDiktatStaticVisual(geometry)).toContain('<circle cx="260" cy="160" r="65"');
    const figure = visualSpecSchema.parse({ id: "figure", kind: "source_figure", label: "Figure", description: "Source figure.", assetId: "a".repeat(64), materialId: "material", sourceChecksum: "b".repeat(64), staticFallback: { type: "text", summary: "Figure.", content: "Original figure." } });
    if (figure.kind !== "source_figure") throw new Error("Expected source figure fixture");
    expect(() => renderDiktatStaticVisual(figure)).toThrow("DIKTAT_SOURCE_FIGURE_ASSET_REQUIRED");
    expect(() => renderDiktatStaticVisual(figure, { [figure.assetId]: { bytes: new TextEncoder().encode("<svg/>"), mimeType: "image/png", sourceChecksum: figure.sourceChecksum } })).toThrow("DIKTAT_SOURCE_FIGURE_FORMAT_INVALID");
    const printed = renderDiktatStaticVisual(figure, { [figure.assetId]: { bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"), mimeType: "image/png", sourceChecksum: figure.sourceChecksum, attribution: "Author <script>" } });
    expect(printed).toContain("Author &lt;script&gt;");
    expect(printed).not.toContain("Author <script>");
  });
});
