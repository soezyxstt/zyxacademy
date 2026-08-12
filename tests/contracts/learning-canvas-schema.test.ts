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
  test("accepts a bounded function plot", () => {
    expect(CanvasSpecSchema.parse(functionPlot).type).toBe("function_plot");
    expect(validateCanvasSpec(functionPlot, ["claim-1"]).isValid).toBe(true);
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
