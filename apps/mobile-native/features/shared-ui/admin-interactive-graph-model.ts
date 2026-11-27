import {
  compileMarkdownGraphFormula,
  formatMarkdownGraphPoint,
  markdownGraphDomain,
  markdownGraphEntries,
  parseMarkdownGraphPoint,
  type MarkdownGraphPoint,
} from "../../../../lib/materials/interactive-markdown-graph";
import type { PlotPoint } from "../../../../lib/zyra/canvas/evaluator";
import { fitNumericRange } from "../../../../lib/zyra/canvas/viewport";
import { inPlotBounds, plotFrame, projectPlotPoint } from "../student/zyra/canvas-plot-model";

export type GraphEntry = { id: number; raw: string };
type GraphRow = GraphEntry & ({ kind: "point"; point: MarkdownGraphPoint } | { kind: "formula"; points: PlotPoint[] } | { kind: "empty" | "invalid" });
type PlotBounds = Parameters<typeof projectPlotPoint>[2];
type Position = { x: number; y: number };
export const graphEntryLimit = 64;

export function initialGraphEntries(source: string) {
  return markdownGraphEntries(source).map((raw, id): GraphEntry => ({ id, raw }));
}

export function readGraphEntry(entry: GraphEntry): GraphRow {
  if (!entry.raw.trim()) return { ...entry, kind: "empty" };
  const point = parseMarkdownGraphPoint(entry.raw);
  if (point) return { ...entry, kind: "point", point };
  try {
    const compiled = compileMarkdownGraphFormula(entry.raw);
    const { min, max } = markdownGraphDomain;
    const points: PlotPoint[] = [];
    for (let index = 0; index <= 240; index++) {
      const x = min + (max - min) * index / 240;
      let y: number | null = null;
      try { y = compiled.evaluate({ x }); } catch { /* Break the drawn path at undefined values. */ }
      points.push({ x, y });
    }
    return { ...entry, kind: "formula", points };
  } catch {
    return { ...entry, kind: "invalid" };
  }
}

export function graphBounds(rows: GraphRow[]): PlotBounds {
  const ys = rows.flatMap(row => row.kind === "point" ? [row.point.y] :
    row.kind === "formula" ? row.points.flatMap(point => point.y === null ? [] : [point.y]) : []);
  const range = fitNumericRange(ys);
  const min = Math.max(-500, range?.min ?? -8);
  const max = Math.min(500, range?.max ?? 8);
  return { x: markdownGraphDomain, y: min < max ? { min, max } : { min: -8, max: 8 } };
}

export function hitGraphPoint(rows: GraphRow[], position: Position, radius: number, bounds: PlotBounds) {
  let nearest: { row: Extract<GraphRow, { kind: "point" }>; center: Position } | undefined;
  let distance = radius;
  for (const row of rows) {
    if (row.kind !== "point" || !inPlotBounds(row.point.x, row.point.y, bounds)) continue;
    const center = projectPlotPoint(row.point.x, row.point.y, bounds);
    const candidate = Math.hypot(center.x - position.x, center.y - position.y);
    if (candidate > distance) continue;
    distance = candidate;
    nearest = { row, center };
  }
  return nearest;
}

export function moveGraphPoint(point: MarkdownGraphPoint, position: Position, bounds: PlotBounds) {
  const fracX = Math.max(0, Math.min(1, (position.x - plotFrame.left) / plotFrame.width));
  const fracY = Math.max(0, Math.min(1, (position.y - plotFrame.top) / plotFrame.height));
  const x = Number((bounds.x.min + fracX * (bounds.x.max - bounds.x.min)).toFixed(2));
  const y = Number((bounds.y.max - fracY * (bounds.y.max - bounds.y.min)).toFixed(2));
  return formatMarkdownGraphPoint(point, x, y);
}
