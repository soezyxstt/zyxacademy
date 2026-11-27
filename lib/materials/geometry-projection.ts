import type { Geometry2dVisualSpec } from "./visual-contract";

type GeometryBounds = { xMin: number; xMax: number; yMin: number; yMax: number };

export const geometryWidth = 600;
const HEIGHT = 400;
const PAD = 45;

/** Wide, shallow bounds need less vertical space while retaining label padding. */
export function geometryHeight(bounds: GeometryBounds) {
  const width = bounds.xMax - bounds.xMin;
  const height = bounds.yMax - bounds.yMin;
  return Math.max(140, Math.min(HEIGHT, 2 * PAD + (geometryWidth - 2 * PAD) * height / width));
}

/** One physical scale for both axes preserves circles and angles. */
export function geometryProjection(bounds: GeometryBounds, height = HEIGHT) {
  const scale = Math.min((geometryWidth - 2 * PAD) / (bounds.xMax - bounds.xMin), (height - 2 * PAD) / (bounds.yMax - bounds.yMin));
  const xMid = (bounds.xMin + bounds.xMax) / 2;
  const yMid = (bounds.yMin + bounds.yMax) / 2;
  return { scale, x: (value: number) => geometryWidth / 2 + (value - xMid) * scale, y: (value: number) => height / 2 - (value - yMid) * scale };
}

export function geometryLabels(geometry: Geometry2dVisualSpec["geometry"], { x, y }: ReturnType<typeof geometryProjection>) {
  const points = new Map(geometry.points.map(point => [point.id, point]));
  const labels: { id: string; x: number; y: number; latex: string }[] = [];
  for (const point of geometry.points) if (point.labelLatex) labels.push({ id: point.id, x: x(point.x), y: y(point.y) - 20, latex: point.labelLatex });
  for (const segment of geometry.segments) {
    const from = points.get(segment.from)!;
    const to = points.get(segment.to)!;
    if (segment.labelLatex) labels.push({ id: segment.id, x: x((from.x + to.x) / 2), y: y((from.y + to.y) / 2) - 20, latex: segment.labelLatex });
  }
  for (const circle of geometry.circles) {
    const center = points.get(circle.center)!;
    if (circle.labelLatex) labels.push({ id: circle.id, x: x(center.x + circle.radius), y: y(center.y) - 20, latex: circle.labelLatex });
  }
  for (const polygon of geometry.polygons) {
    const vertices = polygon.pointIds.map((id) => points.get(id)!);
    if (polygon.labelLatex) labels.push({ id: polygon.id, x: x(vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length), y: y(vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length), latex: polygon.labelLatex });
  }
  return labels;
}
