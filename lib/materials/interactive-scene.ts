import { z } from "zod";
import { compileSafeExpression } from "@/lib/zyra/canvas/expression";

const id = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,31}$/).refine(value => !["pi", "e", "__proto__", "constructor", "prototype"].includes(value));
const text = z.string().trim().min(1).max(240);
const number = z.number().finite().min(-1e6).max(1e6);
const value = z.union([number, z.string().trim().min(1).max(180)]);
const parameter = z.object({ id, label: text, min: number, max: number, step: number.min(0.000001), initial: number, unit: text.optional(), control: z.enum(["range", "toggle", "select"]), options: z.array(z.object({ value: number, label: text }).strict()).min(2).max(20).optional() }).strict();
const condition = z.object({ left: value, op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte"]), right: value }).strict();
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cycle"), parameter: id }).strict(),
  z.object({ type: z.literal("set"), parameter: id, value: number }).strict(),
  z.object({ type: z.literal("drag"), xParameter: id, yParameter: id }).strict(),
]);
const common = { color: z.enum(["foreground", "primary", "muted", "success", "warning", "destructive"]).default("foreground"), fill: z.boolean().default(false), visibleWhen: condition.optional(), action: action.optional(), actionLabel: text.optional() };
const point = z.object({ x: value, y: value }).strict();
const pathCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("M"), x: value, y: value }).strict(),
  z.object({ op: z.literal("L"), x: value, y: value }).strict(),
  z.object({ op: z.literal("Q"), x1: value, y1: value, x: value, y: value }).strict(),
  z.object({ op: z.literal("C"), x1: value, y1: value, x2: value, y2: value, x: value, y: value }).strict(),
  z.object({ op: z.literal("Z") }).strict(),
]);
const shape = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), x1: value, y1: value, x2: value, y2: value, arrow: z.boolean().default(false), ...common }).strict(),
  z.object({ type: z.literal("circle"), cx: value, cy: value, r: value, ...common }).strict(),
  z.object({ type: z.literal("rect"), x: value, y: value, width: value, height: value, ...common }).strict(),
  z.object({ type: z.literal("polygon"), points: z.array(point).min(2).max(32), closed: z.boolean().default(true), ...common }).strict(),
  z.object({ type: z.literal("path"), commands: z.array(pathCommand).min(1).max(32), ...common }).strict(),
  z.object({ type: z.literal("text"), x: value, y: value, text, value: value.optional(), ...common }).strict(),
]);

export const interactiveSceneSchema = z.object({
  id, kind: z.literal("interactive_scene"), label: text, description: text,
  interactive: z.literal(true).default(true),
  viewBox: z.object({ x: number, y: number, width: number.min(0.01), height: number.min(0.01) }).strict(),
  parameters: z.array(parameter).min(1).max(16),
  time: z.object({ parameter: id, rate: number.positive().max(100) }).strict().optional(),
  shapes: z.array(shape).min(1).max(100),
  outputs: z.array(z.object({ label: text, value, unit: text.optional() }).strict()).max(20).default([]),
  staticFallback: z.object({ type: z.literal("text"), summary: text, content: text }).strict(),
}).strict().superRefine((scene, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const ids = scene.parameters.map(p => p.id);
  if (new Set(ids).size !== ids.length || new TextEncoder().encode(JSON.stringify(scene)).length > 128 * 1024) fail("SCENE_BUDGET_OR_IDS");
  if (Math.max(scene.viewBox.width / scene.viewBox.height, scene.viewBox.height / scene.viewBox.width) > 1000) fail("SCENE_VIEWBOX_INVALID");
  const parameters = new Map(scene.parameters.map(p => [p.id, p]));
  for (const p of scene.parameters) {
    if (p.min >= p.max || p.initial < p.min || p.initial > p.max || p.step > p.max - p.min) fail("SCENE_PARAMETER_BOUNDS");
    if (p.control !== "range" && (!p.options || (p.control === "toggle" && p.options.length !== 2))) fail("SCENE_OPTIONS_REQUIRED");
    if (p.control === "range" && p.options) fail("SCENE_RANGE_OPTIONS");
    if (p.options && (new Set(p.options.map(o => o.value)).size !== p.options.length || p.options.some(o => o.value < p.min || o.value > p.max) || !p.options.some(o => o.value === p.initial))) fail("SCENE_OPTIONS_INVALID");
  }
  if (scene.time && (!parameters.has(scene.time.parameter) || parameters.get(scene.time.parameter)?.control !== "range")) fail("SCENE_TIME_PARAMETER");
  for (const item of scene.shapes) {
    if (item.type === "path" && item.commands[0].op !== "M") fail("SCENE_PATH_START");
    if (item.action && !item.actionLabel) fail("SCENE_ACTION_LABEL");
    if (item.action?.type === "drag") {
      if (item.action.xParameter === item.action.yParameter || [item.action.xParameter, item.action.yParameter].some(key => parameters.get(key)?.control !== "range")) fail("SCENE_DRAG_PARAMETER");
    } else if (item.action) {
      const action = item.action, p = parameters.get(action.parameter);
      if (!p || (action.type === "cycle" && !p.options) || (action.type === "set" && (action.value < p.min || action.value > p.max || (p.options && !p.options.some(o => o.value === action.value))))) fail("SCENE_ACTION_PARAMETER");
    }
  }
  let expressions = 0;
  const defaults = Object.fromEntries(scene.parameters.map(p => [p.id, p.initial]));
  const visit = (v: unknown, key = "") => {
    if (typeof v === "string" && ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "width", "height", "left", "right", "value"].includes(key)) {
      expressions++;
      try { const result = compileSafeExpression(v, { variables: ids, maxNodes: 48, maxDepth: 12 }).evaluate(defaults); if (Math.abs(result) > 1e7 || (["r", "width", "height"].includes(key) && result < 0)) fail("SCENE_DEFAULT_INVALID"); } catch { fail("SCENE_EXPRESSION_INVALID"); }
    } else if (typeof v === "number" && ["r", "width", "height"].includes(key) && v < 0) fail("SCENE_DEFAULT_INVALID");
    else if (Array.isArray(v)) v.forEach(item => visit(item));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, item]) => visit(item, k));
  };
  scene.shapes.forEach(item => visit(item)); scene.outputs.forEach(item => visit(item));
  if (expressions > 256) fail("SCENE_EXPRESSION_BUDGET");
});

export type InteractiveSceneSpec = z.infer<typeof interactiveSceneSchema>;
export type SceneShape = InteractiveSceneSpec["shapes"][number];
export type SceneState = Record<string, number>;
export const initialSceneState = (spec: InteractiveSceneSpec): SceneState => Object.fromEntries(spec.parameters.map(p => [p.id, p.initial]));
const expressions = new Map<string, ReturnType<typeof compileSafeExpression>>();
function sceneEvaluation(value: number | string, state: SceneState, withScale = false): { value: number; scale: number } {
  let result: number, scale: number;
  if (typeof value === "number") { result = value; scale = Math.abs(value); }
  else {
    const variables = Object.keys(state), key = `${variables.join(",")}:${value}`;
    let compiled = expressions.get(key);
    if (!compiled) { compiled = compileSafeExpression(value, { variables, maxNodes: 48, maxDepth: 12 }); if (expressions.size >= 512) expressions.clear(); expressions.set(key, compiled); }
    if (withScale) ({ value: result, scale } = compiled.evaluateWithScale(state));
    else { result = compiled.evaluate(state); scale = Math.abs(result); }
  }
  if (!Number.isFinite(result) || Math.abs(result) > 1e7) throw new Error("SCENE_VALUE_INVALID");
  return { value: result, scale };
}
export function sceneValue(value: number | string, state: SceneState): number { return sceneEvaluation(value, state).value; }
export function sceneVisible(shape: SceneShape, state: SceneState): boolean {
  const c = shape.visibleWhen;
  if (!c) return true;
  const left = sceneEvaluation(c.left, state, true), right = sceneEvaluation(c.right, state, true);
  const a = left.value, b = right.value;
  // Equality uses intermediate scale for arithmetic; powers and functions use their result scale.
  const equal = a === b || Math.abs(a - b) <= Number.EPSILON * Math.max(left.scale, right.scale);
  return c.op === "eq" ? equal : c.op === "ne" ? !equal : c.op === "lt" ? a < b : c.op === "lte" ? a <= b : c.op === "gt" ? a > b : a >= b;
}
function decimalParts(value: number): { integer: bigint; places: number } {
  const [mantissa, exponent = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return { integer: BigInt(whole + fraction), places: fraction.length - Number(exponent) };
}
export function setSceneParameter(spec: InteractiveSceneSpec, state: SceneState, id: string, value: number): SceneState {
  const p = spec.parameters.find(item => item.id === id);
  if (!p || !Number.isFinite(value)) return state;
  const bounded = Math.max(p.min, Math.min(p.max, value));
  let next: number;
  if (p.options) next = p.options.reduce((a, b) => Math.abs(b.value - bounded) < Math.abs(a.value - bounded) ? b : a).value;
  else {
    const min = decimalParts(p.min), step = decimalParts(p.step), places = Math.max(0, min.places, step.places);
    const scaled = min.integer * 10n ** BigInt(places - min.places) + BigInt(Math.round((bounded - p.min) / p.step)) * step.integer * 10n ** BigInt(places - step.places);
    next = Math.max(p.min, Math.min(p.max, Number(`${scaled}e-${places}`)));
  }
  return { ...state, [id]: next };
}
