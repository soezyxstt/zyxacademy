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
  test("samples the viewport intersection without changing the authored domain", () => {
    const originalDomain = { ...spec.domain };
    const result = evaluateFunctionPlot(spec, {}, {}, { min: -1, max: 1, sampleCount: 3 });
    expect(result[0].points.map(point => point.x)).toEqual([0, 0.5, 1]);
    expect(spec.domain).toEqual(originalDomain);
    const within = evaluateFunctionPlot(spec, {}, {}, { min: 0.5, max: 1.5, sampleCount: 3 });
    expect(within[0].points.map(point => point.x)).toEqual([0.5, 1, 1.5]);
  });

  test("returns no curve or table samples for a disjoint or touching viewport", () => {
    for (const viewport of [{ min: 3, max: 4 }, { min: -2, max: -1 }, { min: 2, max: 3 }]) {
      expect(evaluateFunctionPlot(spec, {}, {}, viewport)[0].points).toEqual([]);
    }
  });

  test("keeps excluded points outside the viewport out of curve and table samples", () => {
    const result = evaluateFunctionPlot({ ...spec, series: [{ ...spec.series[0], excludedX: [0.25, 1.75] }] }, {}, {}, { min: 0.5, max: 1.5, sampleCount: 3 });
    expect(result[0].points.map(point => point.x)).toEqual([0.5, 1, 1.5]);
  });

  test("breaks the curve at an excluded point even when sampling misses its x coordinate", () => {
    const result = evaluateFunctionPlot({ ...spec, variables: [], series: [{ id: "f", label: "f(x)", expression: "x+1" }], pointMarkers: [{ seriesId: "f", x: 0.3, y: 1.3, kind: "open", label: "Excluded" }] });
    expect(result[0].points.find(point => point.x === 0.3)?.y).toBeNull();
    expect(result[0].points.map(point => point.x)).toEqual([0, 0.3, 0.5, 1, 1.5, 2]);
  });
  test("never joins the branches across a declared vertical asymptote", () => {
    const result = evaluateFunctionPlot({ ...spec, variables: [], series: [{ id: "f", label: "f(x)", expression: "1/(x-0.3)", excludedX: [0.3] }] });
    expect(result[0].points.find(point => point.x === 0.3)?.y).toBeNull();
  });
  test("refines real-domain boundaries without joining excluded intervals", () => {
    const result = evaluateFunctionPlot({ ...spec, variables: [], domain: { min: -5, max: 5, sampleCount: 20 }, series: [{ id: "circle", label: "Circle", expression: "sqrt(9-x^2)" }] });
    const finite = result[0].points.filter(p => p.y !== null);
    expect(Math.abs(finite[0].x + 3)).toBeLessThan(0.000001);
    expect(Math.abs(finite.at(-1)!.x - 3)).toBeLessThan(0.000001);
    expect(finite[0].y!).toBeLessThan(0.003);
    expect(result[0].points.some(p => p.y === null)).toBe(true);
  });
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
