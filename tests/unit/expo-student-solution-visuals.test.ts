import { expect, test } from "bun:test";
import { solutionCollectionFixture } from "../../app/visual-fixtures/solution-collection/fixture";
import { readSolutionVisual, solutionFallback } from "../../apps/mobile-native/features/solutions/visual-preview-model";
import { courseZyraPlotFixture } from "../../apps/mobile-native/features/student/zyra/fixture";

test("released solutions keep renderable geometry and the full authored fallback", () => {
  const original = solutionCollectionFixture.items[0].visuals[0];
  const geometry = readSolutionVisual(original);
  if (!geometry || geometry.kind !== "geometry_2d") throw new Error("Authored geometry was discarded");
  expect(geometry.geometry.segments.map(segment => segment.labelLatex)).toEqual(["6", "4"]);
  expect(solutionFallback(geometry)).toEqual({ summary: "AB = 6 cm dan AC = 4 cm.", content: "Panjang BC tidak diperlukan untuk menghitung luas." });
  expect(readSolutionVisual({ ...geometry, geometry: { ...geometry.geometry, points: [] } })).toBeNull();
  expect(readSolutionVisual({ ...geometry, kind: "source_figure" })).toBeNull();
});

test("a Solution Collection canvas carries its declared interaction mode to the native renderer", () => {
  const visual = {
    id: "canvas-a", kind: "learning_canvas", label: "Parabola", description: "Coefficient of a quadratic function.",
    interactive: false, canvas: courseZyraPlotFixture,
  };
  expect(readSolutionVisual(visual)).toMatchObject({ kind: "learning_canvas", interactive: false, canvas: { controls: courseZyraPlotFixture.controls } });
  expect(readSolutionVisual({ ...visual, interactive: true })).toMatchObject({ interactive: true });
  expect(readSolutionVisual({ ...visual, canvas: { ...visual.canvas, series: [] } })).toBeNull();
});

test("fallback tables preserve signs, zero, headers and mathematical source text", () => {
  const visual = readSolutionVisual({
    id: "limit-a", kind: "epsilon_delta_graph", label: "A limit", description: "Constant function near x=0.",
    bounds: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    limitPoint: 0, limitValue: 0, defaultEpsilon: 0.25, defaultDelta: 1, functionModel: { kind: "constant", c: 0 },
    staticFallback: { type: "table", summary: "$f(x)=0$", headers: ["$x$", "$f(x)$"], rows: [[-1, 0], [0, 0], [1, "0.0"]] },
  });
  if (!visual || visual.kind !== "epsilon_delta_graph") throw new Error("Authored graph was discarded");
  expect(solutionFallback(visual)).toEqual({ table: {
    summary: "$f(x)=0$",
    columns: [{ id: "column_0", label: "$x$" }, { id: "column_1", label: "$f(x)$" }],
    rows: [["-1", "0"], ["0", "0"], ["1", "0.0"]],
  } });
});

test("reviewed interactive document metadata provides fallback prose without loading the executable artifact", () => {
  const visual = readSolutionVisual({
    id: "doc-a", kind: "interactive_document", version: 1, label: "Concept demonstration", description: "A changing shape.",
    documentSha256: "a".repeat(64), documentBytes: 64, printSha256: "b".repeat(64), printBytes: 20, height: 320,
    staticFallback: { type: "text", summary: "The shape starts square.", content: "Changing its width does not change its height." },
    printCaption: "The original square.",
  });
  if (!visual || visual.kind !== "interactive_document") throw new Error("Authored fallback was discarded");
  expect(solutionFallback(visual)).toEqual({ summary: "The shape starts square.", content: "Changing its width does not change its height." });
});
