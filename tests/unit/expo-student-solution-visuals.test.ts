import { expect, test } from "bun:test";
import { solutionCollectionFixture } from "../../app/visual-fixtures/solution-collection/fixture";
import { readSolutionVisual, solutionFallback } from "../../apps/mobile-native/features/solutions/visual-preview-model";
import { applySceneAction, epsilonProbe, sceneBoardPoint, sceneReadout, visibleSceneShapes } from "../../apps/mobile-native/features/solutions/structured-visual-model";
import { initialSceneState, setSceneParameter } from "../../lib/materials/interactive-scene";
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
  expect(epsilonProbe(visual, 0.25, 0)).toMatchObject({ y: 0, inside: false });
  expect(epsilonProbe(visual, 0.25, 1)).toMatchObject({ y: 0, inside: true });
  expect(epsilonProbe(visual, 0, 1)).toMatchObject({ delta: null, inside: false });
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


test("renders only validated scene states and keeps authored controls and projection coherent", () => {
  const scene = readSolutionVisual({
    kind: "interactive_scene", id: "learn", label: "Track", description: "Explore positions and switches.",
    viewBox: { x: -10, y: 0, width: 20, height: 10 },
    parameters: [
      { id: "x", label: "Horizontal", min: -10, max: 10, step: 1, initial: 0, control: "range" },
      { id: "mode", label: "Marker", min: 0, max: 1, step: 1, initial: 0, control: "toggle", options: [{ value: 0, label: "Hide" }, { value: 1, label: "Show" }] },
    ],
    shapes: [
      { type: "line", x1: -10, y1: 6, x2: 10, y2: 6, actionLabel: "Toggle marker", action: { type: "cycle", parameter: "mode" } },
      { type: "circle", cx: "x", cy: 6, r: 2, visibleWhen: { left: "mode", op: "eq", right: 1 } },
    ],
    outputs: [{ label: "Distance", value: "abs(x)" }],
    staticFallback: { type: "text", summary: "Horizontal track", content: "The marker follows the horizontal coordinate." },
  });
  if (scene?.kind !== "interactive_scene") throw new Error("Expected a valid scene");
  const initial = initialSceneState(scene);
  expect(visibleSceneShapes(scene, initial)?.map(item => item.index)).toEqual([0]);
  let state = applySceneAction(scene, initial, scene.shapes[0].action);
  expect(visibleSceneShapes(scene, state)?.map(item => item.index)).toEqual([0, 1]);
  state = setSceneParameter(scene, state, "x", -3.1);
  expect(sceneReadout(scene.outputs[0].value, state)).toBe(3);
  expect(applySceneAction(scene, state, scene.shapes[0].action).mode).toBe(0);
  expect(sceneBoardPoint(scene.viewBox, 200, 200, 100, 100)).toEqual({ x: 0, y: 5 });
  expect(sceneBoardPoint(scene.viewBox, 0, 200, 100, 100)).toBeNull();
});
