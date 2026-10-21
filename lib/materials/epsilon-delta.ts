import { evaluateVisualFunction, type EpsilonDeltaGraphSpec } from "./visual-contract";

type EpsilonDeltaModel = Pick<EpsilonDeltaGraphSpec, "functionModel" | "limitPoint" | "limitValue" | "bounds">;

export type EpsilonDeltaResult =
  | { status: "guaranteed"; delta: number }
  | { status: "resolution_limited"; delta: null };

export function sampleEpsilonDeltaCurve(spec: Pick<EpsilonDeltaModel, "functionModel" | "bounds">) {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  const { xMin, xMax, yMin, yMax } = spec.bounds;
  let segment: Array<{ x: number; y: number }> | null = null;
  for (let i = 0; i <= 80; i++) {
    const x = xMin + (i / 80) * (xMax - xMin);
    const y = evaluateVisualFunction(spec.functionModel, x);
    if (!Number.isFinite(x) || !Number.isFinite(y) || y < yMin || y > yMax) {
      segment = null;
      continue;
    }
    if (!segment) {
      segment = [];
      segments.push(segment);
    }
    segment.push({ x, y });
  }
  return segments;
}

export function deriveEpsilonDelta(spec: EpsilonDeltaModel, epsilon: number): EpsilonDeltaResult {
  const unavailable: EpsilonDeltaResult = { status: "resolution_limited", delta: null };
  const { functionModel: model, limitPoint: c, limitValue: limit } = spec;
  const radius = Math.min(c - spec.bounds.xMin, spec.bounds.xMax - c);
  const a = model.kind === "quadratic" ? model.a : 0;
  const b = model.kind === "quadratic" ? model.b : model.kind === "linear" ? model.m : 0;
  const constant = model.kind === "linear" ? model.b : model.c;
  const center = evaluateVisualFunction(model, c);
  const magnitude = Math.abs(a * c * c) + Math.abs(b * c) + Math.abs(constant) + Math.abs(limit);
  const slopeMagnitude = Math.abs(2 * a * c) + Math.abs(b);
  // Reserve roundoff for center evaluation, cancellation, and the derived bound.
  const error = 16 * Number.EPSILON * magnitude + Number.MIN_VALUE;
  const margin = epsilon - Math.abs(center - limit) - error;
  const slope = Math.abs(2 * a * c + b) + 16 * Number.EPSILON * slopeMagnitude;
  const bound = (slope + Math.abs(a) * radius) * (1 + 16 * Number.EPSILON);
  if (![epsilon, c, limit, radius, center, magnitude, margin, bound].every(Number.isFinite)
    || epsilon <= 0 || radius <= 0 || margin <= 0 || bound < 0) return unavailable;

  // |f(c+h)-L| <= |f(c)-L| + |h| (|2ac+b| + |a| radius).
  const delta = Math.min(radius, bound === 0 ? radius : margin / bound) * (1 - 16 * Number.EPSILON);
  if (!Number.isFinite(delta) || delta <= 0 || c - delta === c || c + delta === c) return unavailable;
  return { status: "guaranteed", delta };
}
