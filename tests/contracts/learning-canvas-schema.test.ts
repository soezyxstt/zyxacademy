import { describe, expect, test } from "bun:test";
import { CanvasSpecSchema, validateCanvasSpec } from "@/lib/zyra/canvas";

const fallback = {
  summary: "Tabel ringkas untuk membaca hubungan x dan y.",
  columns: [
    { id: "x", label: "x" },
    { id: "y", label: "y" },
  ],
  rows: [["0", "0"], ["1", "1"]],
};

const functionPlot = {
  version: "zyra-learning-canvas-v1",
  type: "function_plot",
  title: "Hubungan kuadrat",
  purpose: "Melihat perubahan nilai fungsi saat x berubah.",
  variables: [{ id: "a", label: "Koefisien", min: 0, max: 4, defaultValue: 1 }],
  controls: [{ variableId: "a", label: "Koefisien a", min: 0, max: 4, step: 1, presets: [1, 2] }],
  claimRefs: ["claim-1"],
  altText: "Grafik fungsi kuadrat dengan satu kontrol koefisien.",
  fallback,
  domain: { min: -2, max: 2, sampleCount: 20 },
  series: [{ id: "f", label: "f(x)", expression: "a*x^2" }],
};

describe("Learning Canvas schema", () => {
  test("computes missing plot fallback values and preserves undefined limit points", () => {
    const result = validateCanvasSpec({ ...functionPlot, fallback: undefined, domain: { min: 0, max: 2 }, series: [{ id: "f", label: "f(x)", expression: "(x^2-1)/(x-1)", excludedX: [1] }] }, ["claim-1"]);
    expect(result.isValid).toBe(true);
    expect(result.spec?.fallback.rows).toEqual([["0", "1"], ["1", "N/A"], ["2", "3"]]);
  });

  test("computes missing fallback using default coefficients within the domain", () => {
    const result = validateCanvasSpec({ ...functionPlot, fallback: undefined, domain: { min: 2, max: 4 }, variables: [{ id: "a", label: "Koefisien", min: 0, max: 4, defaultValue: 2 }] }, ["claim-1"]);
    expect(result.spec?.fallback.rows).toEqual([["2", "8"], ["3", "18"], ["4", "32"]]);
  });
  test("distinguishes an excluded limit point from the defined function value", () => {
    const pointMarkers = [
      { seriesId: "f", x: 0, y: 1, label: "Limit = 1", kind: "open" },
      { seriesId: "f", x: 0, y: 2, label: "f(0) = 2", kind: "closed" },
    ];
    expect(CanvasSpecSchema.safeParse({ ...functionPlot, pointMarkers }).success).toBe(true);
    expect(CanvasSpecSchema.safeParse({ ...functionPlot, pointMarkers: [{ ...pointMarkers[0], seriesId: "missing" }] }).success).toBe(false);
    expect(CanvasSpecSchema.safeParse({ ...functionPlot, pointMarkers: [{ ...pointMarkers[0], x: Infinity }] }).success).toBe(false);
  });
  test("accepts a bounded function plot", () => {
    expect(CanvasSpecSchema.parse(functionPlot).type).toBe("function_plot");
    expect(validateCanvasSpec(functionPlot, ["claim-1"]).isValid).toBe(true);
  });

  test("accepts equal axis scaling without changing existing plots", () => {
    const plot = CanvasSpecSchema.parse({ ...functionPlot, equalAxisScale: true });
    expect(plot.type === "function_plot" && plot.equalAxisScale).toBe(true);
    expect(CanvasSpecSchema.safeParse({ ...functionPlot, equalAxisScale: "true" }).success).toBe(false);
  });

  test("rejects unknown visual types", () => {
    const result = CanvasSpecSchema.safeParse({ ...functionPlot, type: "arbitrary_markup" });
    expect(result.success).toBe(false);
  });

  test("rejects an unreferenced canonical claim", () => {
    const result = validateCanvasSpec(functionPlot, ["claim-other"]);
    expect(result.reasonCodes).toContain("UNREFERENCED_CANONICAL_CLAIM");
  });

  test("rejects an oversized sample domain", () => {
    const result = CanvasSpecSchema.safeParse({
      ...functionPlot,
      domain: { min: 1, max: 1, sampleCount: 20 },
    });
    expect(result.success).toBe(false);
  });

  test("requires units on vector quantities", () => {
    const result = CanvasSpecSchema.safeParse({
      ...functionPlot,
      type: "vector_diagram",
      title: "Gaya",
      purpose: "Membaca arah dan besar gaya.",
      vectors: [{ id: "force", label: "Gaya", x: 2, y: 1 }],
    });
    expect(result.success).toBe(false);
  });
});
