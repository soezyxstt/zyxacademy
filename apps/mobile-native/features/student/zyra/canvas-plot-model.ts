import type { CanvasControl, CanvasFallback, DataPlotCanvas, FunctionPlotCanvas } from "../../../../../lib/zyra/canvas/contracts";
import { evaluateFunctionPlot, type PlotPoint } from "../../../../../lib/zyra/canvas/evaluator";
import { computeValueTableSampling, fitNumericRange, isRepresentableRange, zoomNumericRange, type NumericRange } from "../../../../../lib/zyra/canvas/viewport";

export const plotWidth = 320;
export const plotHeight = 205;
export const plotFrame = { left: 45, top: 12, width: 258, height: 162 };
export type PlotBounds = { x: NumericRange; y: NumericRange };
type PlotSeries = { id: string; points: PlotPoint[] };

function shareAxisScale(bounds: PlotBounds): PlotBounds | null {
  const scale = Math.max((bounds.x.max - bounds.x.min) / plotFrame.width, (bounds.y.max - bounds.y.min) / plotFrame.height);
  const expand = (range: NumericRange, length: number) => {
    const center = range.min + (range.max - range.min) / 2;
    return { min: center - scale * length / 2, max: center + scale * length / 2 };
  };
  const x = expand(bounds.x, plotFrame.width);
  const y = expand(bounds.y, plotFrame.height);
  return isRepresentableRange(x) && isRepresentableRange(y) ? { x, y } : null;
}

export function plotBounds(spec: FunctionPlotCanvas | DataPlotCanvas, series: readonly PlotSeries[], zoom: number): PlotBounds | null {
  const points = series.flatMap(item => item.points);
  const x = fitNumericRange(spec.type === "function_plot" ? [spec.domain.min, spec.domain.max] : points.map(point => point.x), 0.06);
  const y = fitNumericRange(points.flatMap(point => point.y === null ? [] : [point.y]));
  if (!x || !y) return null;
  const bounds = spec.type === "function_plot" && spec.equalAxisScale ? shareAxisScale({ x, y }) : { x, y };
  if (!bounds) return null;
  const zoomX = zoomNumericRange(bounds.x, zoom, 0.5);
  const zoomY = zoomNumericRange(bounds.y, zoom, 0.5);
  return zoomX && zoomY ? { x: zoomX, y: zoomY } : bounds;
}

export function samplePlot(spec: FunctionPlotCanvas | DataPlotCanvas, values: Record<string, number>, formulas: Record<string, string>, visibleRange?: NumericRange): PlotSeries[] {
  if (spec.type === "data_plot") return [{ id: "data", points: spec.points }];
  if (!isRepresentableRange(spec.domain)) return [];
  return evaluateFunctionPlot(spec, values, resolvedFormulas(spec, formulas), visibleRange && { ...visibleRange, sampleCount: 241 });
}

function resolvedFormulas(spec: FunctionPlotCanvas, formulas: Record<string, string>) {
  return Object.fromEntries(spec.series.map(({ id, expression }) => [id, Object.hasOwn(formulas, id) ? formulas[id] : expression]));
}

export function functionValues(
  spec: FunctionPlotCanvas,
  values: Record<string, number>,
  formulas: Record<string, string>,
  summary: string,
  visibleRange?: NumericRange,
): CanvasFallback {
  const range = visibleRange ? computeValueTableSampling(spec.domain.min, spec.domain.max, visibleRange.min, visibleRange.max)
    : { ...spec.domain, sampleCount: 5 };
  const series = range ? evaluateFunctionPlot(spec, values, resolvedFormulas(spec, formulas), range) : [];
  const columns = [{ id: "x", label: "x", unit: spec.domain.unit }, ...spec.series.map(({ id, label, unit }) => ({ id, label, unit }))];
  const valuesByX = series.map(item => new Map(item.points.map(point => [point.x, point.y])));
  const rows = (series[0]?.points ?? []).map(({ x }) => [
    String(x),
    ...valuesByX.map(item => {
      const y = item.get(x);
      return y === null || y === undefined ? "N/A" : String(Number(y.toPrecision(8)));
    }),
  ]);
  return { summary, columns, rows };
}

export function projectPlotPoint(x: number, y: number, bounds: PlotBounds) {
  const fractionX = (x - bounds.x.min) / (bounds.x.max - bounds.x.min);
  const fractionY = (bounds.y.max - y) / (bounds.y.max - bounds.y.min);
  // Limit SVG coordinates before clipping, including extreme finite outliers.
  const bound = (fraction: number) => Math.max(-2, Math.min(3, fraction));
  return { x: plotFrame.left + bound(fractionX) * plotFrame.width, y: plotFrame.top + bound(fractionY) * plotFrame.height };
}

export function inPlotBounds(x: number, y: number, bounds: PlotBounds) {
  return x >= bounds.x.min && x <= bounds.x.max && y >= bounds.y.min && y <= bounds.y.max;
}

export function plotPath(points: readonly PlotPoint[], bounds: PlotBounds) {
  let started = false;
  let path = "";
  for (const point of points) {
    if (point.y === null || !Number.isFinite(point.x)) {
      started = false;
      continue;
    }
    const { x, y } = projectPlotPoint(point.x, point.y, bounds);
    path += `${started ? " L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    started = true;
  }
  return path;
}

export function stepParameter(value: number, control: CanvasControl, direction: -1 | 1) {
  const next = value + direction * control.step;
  // Remove floating point noise for decimal steps without losing a small valid step.
  const rounded = Number(next.toPrecision(15));
  return Math.min(control.max, Math.max(control.min, (rounded - value) * direction <= 0 ? next : rounded));
}

export function inspectPlotPoint(series: readonly PlotSeries[], hidden: ReadonlySet<string>, bounds: PlotBounds, tap: { x: number; y: number }) {
  let selected: { id: string; x: number; y: number } | null = null;
  let distance = 24 ** 2;
  for (const curve of series) {
    if (hidden.has(curve.id)) continue;
    for (const point of curve.points) {
      if (point.y === null || !inPlotBounds(point.x, point.y, bounds)) continue;
      const projected = projectPlotPoint(point.x, point.y, bounds);
      const squared = (tap.x - projected.x) ** 2 + (tap.y - projected.y) ** 2;
      if (squared > distance) continue;
      distance = squared;
      selected = { id: curve.id, x: point.x, y: point.y };
    }
  }
  return selected;
}
