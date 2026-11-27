import type { PlotPoint } from "./evaluator";
import type { NumericRange } from "./viewport";

type Series = { id: string; points: readonly PlotPoint[] };
type Bounds = { x: NumericRange; y: NumericRange };
type Coordinates = { x: number; y: number };

function interpolate(a: PlotPoint, b: PlotPoint, x: number) {
  if (a.y === null || b.y === null || b.x <= a.x) return null;
  return a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x));
}

function segmentCrossing(a: PlotPoint, b: PlotPoint, c: PlotPoint, d: PlotPoint): Coordinates | null {
  const start = Math.max(a.x, c.x), end = Math.min(b.x, d.x);
  if (start >= end) return null;
  const first = interpolate(a, b, start), last = interpolate(a, b, end);
  const lower = interpolate(c, d, start), upper = interpolate(c, d, end);
  if (first === null || last === null || lower === null || upper === null) return null;
  const before = first - lower, after = last - upper;
  if (Math.sign(before) === Math.sign(after)) return null;
  const fraction = Math.abs(before) / (Math.abs(before) + Math.abs(after));
  return { x: start + (end - start) * fraction, y: first + (last - first) * fraction };
}

/** Describe crossings in the displayed polylines. An excluded sample breaks both adjacent segments. */
export function plotAnnotations(curves: readonly Series[], bounds: Bounds, includeIntersections: boolean) {
  const roots: Array<{ id: string; seriesId: string; x: number }> = [];
  const intersections: Array<Coordinates & { id: string }> = [];
  for (const curve of curves) {
    if (bounds.y.min > 0 || bounds.y.max < 0) break;
    for (let i = 1; i < curve.points.length; i++) {
      const a = curve.points[i - 1], b = curve.points[i];
      if (a.y === null || b.y === null || Math.sign(a.y) === Math.sign(b.y)) continue;
      if (Math.abs(a.y - b.y) > (bounds.y.max - bounds.y.min) * 0.8) continue;
      const x = a.x + (b.x - a.x) * (Math.abs(a.y) / (Math.abs(a.y) + Math.abs(b.y)));
      if (x >= bounds.x.min && x <= bounds.x.max) roots.push({ id: curve.id + "-root-" + i, seriesId: curve.id, x });
    }
  }
  if (!includeIntersections) return { roots, intersections };
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      const first = curves[i], second = curves[j];
      let a = 1, b = 1;
      while (a < first.points.length && b < second.points.length) {
        const endFirst = first.points[a], endSecond = second.points[b];
        const point = segmentCrossing(first.points[a - 1], endFirst, second.points[b - 1], endSecond);
        if (point && point.x >= bounds.x.min && point.x <= bounds.x.max && point.y >= bounds.y.min && point.y <= bounds.y.max) {
          const x = Math.round(point.x * 100) / 100, y = Math.round(point.y * 100) / 100;
          if (!intersections.some(other => Math.abs(other.x - x) < 0.04 && Math.abs(other.y - y) < 0.04)) {
            intersections.push({ id: `intersect-${first.id}-${second.id}-${a}-${b}`, x, y });
          }
        }
        if (endFirst.x <= endSecond.x) a++;
        if (endSecond.x <= endFirst.x) b++;
      }
    }
  }
  return { roots, intersections };
}
