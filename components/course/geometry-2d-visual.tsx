"use client";

import { useId } from "react";
import { MathText } from "@/components/course/math-text";
import type { PublicGeometry2dVisualSpec } from "@/lib/articles/structured-read-model";
import { scientificValueToMathText } from "@/lib/math/scientific-format";

const WIDTH = 600;
const HEIGHT = 400;
const PAD = 45;

/** One physical scale for both axes preserves circles and angles. */
export function geometryProjection(bounds: PublicGeometry2dVisualSpec["bounds"]) {
  const scale = Math.min((WIDTH - 2 * PAD) / (bounds.xMax - bounds.xMin), (HEIGHT - 2 * PAD) / (bounds.yMax - bounds.yMin));
  const xMid = (bounds.xMin + bounds.xMax) / 2;
  const yMid = (bounds.yMin + bounds.yMax) / 2;
  return { scale, x: (value: number) => WIDTH / 2 + (value - xMid) * scale, y: (value: number) => HEIGHT / 2 - (value - yMid) * scale };
}

export function Geometry2dVisual({ spec, className }: { spec: PublicGeometry2dVisualSpec; className?: string }) {
  const descriptionId = useId();
  const titleId = useId();
  const { x, y, scale } = geometryProjection(spec.bounds);
  const points = new Map(spec.geometry.points.map((point) => [point.id, point]));
  const labels: { id: string; x: number; y: number; latex: string }[] = [];
  for (const point of spec.geometry.points) if (point.labelLatex) labels.push({ id: point.id, x: x(point.x), y: y(point.y) - 8, latex: point.labelLatex });
  for (const segment of spec.geometry.segments) {
    const from = points.get(segment.from)!;
    const to = points.get(segment.to)!;
    if (segment.labelLatex) labels.push({ id: segment.id, x: x((from.x + to.x) / 2), y: y((from.y + to.y) / 2) - 8, latex: segment.labelLatex });
  }
  for (const circle of spec.geometry.circles) {
    const center = points.get(circle.center)!;
    if (circle.labelLatex) labels.push({ id: circle.id, x: x(center.x + circle.radius), y: y(center.y) - 8, latex: circle.labelLatex });
  }
  for (const polygon of spec.geometry.polygons) {
    const vertices = polygon.pointIds.map((id) => points.get(id)!);
    if (polygon.labelLatex) labels.push({ id: polygon.id, x: x(vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length), y: y(vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length), latex: polygon.labelLatex });
  }
  return <figure className={className} aria-labelledby={titleId} aria-describedby={descriptionId} data-geometry-2d>
    <figcaption id={titleId} className="mb-2 font-heading text-body-base font-bold"><MathText>{spec.label}</MathText></figcaption>
    <p id={descriptionId} className="mb-3 text-body-sm text-muted-foreground"><MathText>{spec.description}</MathText></p>
    <div className="relative aspect-[3/2] w-full rounded-lg border border-border bg-background">
      <svg role="img" aria-label={spec.label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" data-unit-scale-x={scale} data-unit-scale-y={scale}>
        {spec.geometry.polygons.map((polygon) => <polygon key={polygon.id} data-geometry-id={polygon.id} points={polygon.pointIds.map((id) => { const point = points.get(id)!; return `${x(point.x)},${y(point.y)}`; }).join(" ")} className="fill-primary/10 stroke-primary" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}
        {spec.geometry.circles.map((circle) => { const center = points.get(circle.center)!; return <circle key={circle.id} data-geometry-id={circle.id} cx={x(center.x)} cy={y(center.y)} r={circle.radius * scale} className="fill-none stroke-primary" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />; })}
        {spec.geometry.segments.map((segment) => { const from = points.get(segment.from)!; const to = points.get(segment.to)!; return <line key={segment.id} data-geometry-id={segment.id} x1={x(from.x)} y1={y(from.y)} x2={x(to.x)} y2={y(to.y)} className="stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />; })}
        {spec.geometry.points.map((point) => <circle key={point.id} data-geometry-id={point.id} cx={x(point.x)} cy={y(point.y)} r={3} className="fill-foreground" />)}
      </svg>
      {labels.map((label) => <span key={label.id} data-geometry-label={label.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-full bg-background/90 px-1 text-body-xs" style={{ left: `${label.x / WIDTH * 100}%`, top: `${label.y / HEIGHT * 100}%` }}><MathText>{`$${label.latex}$`}</MathText></span>)}
    </div>
    <div data-visual-fallback className="mt-3 space-y-2 text-body-sm">
      <MathText>{spec.staticFallback.summary}</MathText>
      {spec.staticFallback.type === "text" ? <MathText>{spec.staticFallback.content}</MathText> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{spec.staticFallback.headers.map((header, index) => <th key={index} className="border-b border-border px-2 py-1 font-semibold"><MathText>{header}</MathText></th>)}</tr></thead><tbody>{spec.staticFallback.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="border-b border-border px-2 py-1"><MathText>{scientificValueToMathText(cell)}</MathText></td>)}</tr>)}</tbody></table></div>}
    </div>
  </figure>;
}
