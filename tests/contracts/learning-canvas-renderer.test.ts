import { describe, expect, test } from "bun:test";
import {
  canvasToLegacyVisualSpec,
  evaluateFunctionPlot,
  parseCanvasSpec,
  type FunctionPlotCanvas,
} from "@/lib/zyra/canvas";

const spec: FunctionPlotCanvas = {
  version: "zyra-learning-canvas-v1",
  type: "function_plot",
  title: "Grafik lokal",
  purpose: "Menguji perubahan fungsi tanpa jaringan.",
  variables: [{ id: "a", label: "a", min: 0, max: 2, defaultValue: 1 }],
  controls: [],
  claimRefs: ["claim-1"],
  altText: "Grafik fungsi linear lokal.",
  fallback: {
    summary: "Ringkasan data grafik.",
    columns: [{ id: "x", label: "x" }, { id: "y", label: "y" }],
    rows: [["0", "0"]],
  },
  domain: { min: 0, max: 2, sampleCount: 5 },
  series: [{ id: "f", label: "f(x)", expression: "a*x" }],
};

describe("Learning Canvas renderer contracts", () => {
  test("evaluates controls locally with no side effects", () => {
    const first = evaluateFunctionPlot(spec, { a: 1 });
    const second = evaluateFunctionPlot(spec, { a: 2 });
    expect(first[0].points[2]?.y).toBe(1);
    expect(second[0].points[2]?.y).toBe(2);
  });

  test("keeps invalid editable expressions as fallback points", () => {
    const result = evaluateFunctionPlot(spec, {}, { f: "window.alert(1)" });
    expect(result[0].points.every((point) => point.y === null)).toBe(true);
  });

  test("adapts a typed plot to the legacy visual contract", () => {
    const legacy = canvasToLegacyVisualSpec(spec);
    expect(legacy?.type).toBe("graph");
    expect(legacy?.sourceClaimIds).toEqual(["claim-1"]);
  });

  test("normalizes common Gemini notation inside a structured canvas", () => {
    const normalized = parseCanvasSpec({
      ...spec,
      series: [{ id: "f", label: "f(x)", expression: "y = 2x² - 4" }],
    }, ["claim-1"]);

    expect(normalized?.type).toBe("function_plot");
    if (normalized?.type === "function_plot") {
      expect(normalized.series[0]?.expression).toBe("2*x^2 - 4");
      expect(evaluateFunctionPlot(normalized, {})[0]?.points.some((point) => point.y !== null)).toBe(true);
    }
  });

  test("rejects a structured canvas whose series cannot compile", () => {
    const rejected = parseCanvasSpec({
      ...spec,
      series: [{ id: "f", label: "f(x)", expression: "y = window.alert(1)" }],
    }, ["claim-1"]);
    expect(rejected).toBeNull();
  });
});
