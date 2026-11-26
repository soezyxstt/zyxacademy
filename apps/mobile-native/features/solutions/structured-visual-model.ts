import { deriveEpsilonDelta } from "../../../../lib/materials/epsilon-delta";
import { sceneValue, sceneVisible, setSceneParameter, type InteractiveSceneSpec, type SceneShape, type SceneState } from "../../../../lib/materials/interactive-scene";
import { evaluateVisualFunction, type EpsilonDeltaGraphSpec } from "../../../../lib/materials/visual-contract";

export function epsilonProbe(visual: EpsilonDeltaGraphSpec, epsilon: number, x: number) {
  const delta = deriveEpsilonDelta(visual, epsilon).delta;
  const y = evaluateVisualFunction(visual.functionModel, x);
  const distanceX = Math.abs(x - visual.limitPoint);
  const distanceY = Math.abs(y - visual.limitValue);
  return { delta, y, distanceX, distanceY, inside: delta !== null && distanceX > 0 && distanceX < delta };
}

export function applySceneAction(scene: InteractiveSceneSpec, state: SceneState, action: SceneShape["action"]) {
  if (!action || action.type === "drag") return state;
  if (action.type === "set") return setSceneParameter(scene, state, action.parameter, action.value);
  const options = scene.parameters.find(parameter => parameter.id === action.parameter)?.options;
  if (!options?.length) return state;
  const index = options.findIndex(option => option.value === state[action.parameter]);
  return setSceneParameter(scene, state, action.parameter, options[(index + 1) % options.length].value);
}

export function sceneBoardPoint(box: InteractiveSceneSpec["viewBox"], width: number, height: number, x: number, y: number) {
  const size = Math.min(width / box.width, height / box.height);
  if (!Number.isFinite(size) || size <= 0) return null;
  const left = (width - box.width * size) / 2;
  const top = (height - box.height * size) / 2;
  return { x: box.x + (x - left) / size, y: box.y + (y - top) / size };
}

export function visibleSceneShapes(scene: InteractiveSceneSpec, state: SceneState) {
  try {
    return scene.shapes.flatMap((shape, index) => sceneVisible(shape, state) ? [{ shape, index }] : []);
  } catch {
    return null;
  }
}

export function sceneReadout(input: number | string, state: SceneState) {
  try { return Number(sceneValue(input, state).toPrecision(6)); }
  catch { return null; }
}
