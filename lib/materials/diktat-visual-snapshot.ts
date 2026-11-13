import { createHash } from "node:crypto";
import { visualSpecSchema, type VisualSpec } from "./visual-contract";
import { initialSceneState } from "./interactive-scene";

export const DIKTAT_STATIC_VISUAL_RENDERER = "zyx-static-visual-v1";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function buildDiktatVisualSnapshot(input: VisualSpec) {
  const visual = visualSpecSchema.parse(input);
  const state = visual.kind === "epsilon_delta_graph" ? { epsilon: visual.defaultEpsilon, probe: visual.limitPoint }
    : visual.kind === "learning_canvas" ? Object.fromEntries(visual.canvas.variables.map(variable => [variable.id, variable.defaultValue])) : visual.kind === "interactive_scene" ? initialSceneState(visual) : visual.kind === "interactive_document" ? { printSha256: visual.printSha256, defaultState: visual.staticFallback.content, printCaption: visual.printCaption } : {};
  return { rendererVersion: DIKTAT_STATIC_VISUAL_RENDERER, visualHash: digest(visual), stateHash: digest(state) };
}
