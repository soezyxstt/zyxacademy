"use client";

import { useId } from "react";
import { MathText } from "@/components/course/math-text";
import type { PublicGeometry2dVisualSpec } from "@/lib/articles/structured-read-model";
import { scientificValueToMathText } from "@/lib/math/scientific-format";

import { geometryHeight, geometryLabels, geometryProjection, geometryWidth as WIDTH } from "@/lib/materials/geometry-projection";
export { geometryHeight, geometryProjection } from "@/lib/materials/geometry-projection";

export function Geometry2dVisual({ spec, className }: { spec: PublicGeometry2dVisualSpec; className?: string }) {
  const descriptionId = useId();
  const titleId = useId();
  const height = geometryHeight(spec.bounds);
  const { x, y, scale } = geometryProjection(spec.bounds, height);
  const points = new Map(spec.geometry.points.map((point) => [point.id, point]));
  const labels = geometryLabels(spec.geometry, { x, y, scale });
  return <figure className={className} aria-labelledby={titleId} aria-describedby={descriptionId} data-geometry-2d>
    <figcaption id={titleId} className="mb-2 font-heading text-body-base font-bold"><MathText>{spec.label}</MathText></figcaption>
    <p id={descriptionId} className="mb-3 text-body-sm text-muted-foreground"><MathText>{spec.description}</MathText></p>
    <div className="relative w-full rounded-lg border border-border bg-background" style={{ aspectRatio: `${WIDTH} / ${height}` }} data-geometry-frame>
      <svg role="img" aria-label={spec.label} viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" data-unit-scale-x={scale} data-unit-scale-y={scale}>
        {spec.geometry.polygons.map((polygon) => <polygon key={polygon.id} data-geometry-id={polygon.id} points={polygon.pointIds.map((id) => { const point = points.get(id)!; return `${x(point.x)},${y(point.y)}`; }).join(" ")} className="fill-primary/10 stroke-primary" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)}
        {spec.geometry.circles.map((circle) => { const center = points.get(circle.center)!; return <circle key={circle.id} data-geometry-id={circle.id} cx={x(center.x)} cy={y(center.y)} r={circle.radius * scale} className="fill-none stroke-primary" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />; })}
        {spec.geometry.segments.map((segment) => { const from = points.get(segment.from)!; const to = points.get(segment.to)!; return <line key={segment.id} data-geometry-id={segment.id} x1={x(from.x)} y1={y(from.y)} x2={x(to.x)} y2={y(to.y)} className="stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />; })}
        {spec.geometry.points.map((point) => <circle key={point.id} data-geometry-id={point.id} cx={x(point.x)} cy={y(point.y)} r={3} className="fill-foreground" />)}
      </svg>
      {labels.map((label) => {
        const left = Math.max(0, Math.min(100, label.x / WIDTH * 100));
        const top = Math.max(0, Math.min(100, label.y / height * 100));
        // Interpolating the translation keeps even labels near an edge inside the frame.
        return <span key={label.id} data-geometry-label={label.id} className="absolute max-h-full max-w-full overflow-auto bg-background/90 px-1 text-body-xs" style={{ left: `${left}%`, top: `${top}%`, transform: `translate(-${left}%, -${top}%)` }}><MathText>{`$${label.latex}$`}</MathText></span>;
      })}
    </div>
    <div data-visual-fallback className="mt-3 space-y-2 text-body-sm">
      <p><MathText>{spec.staticFallback.summary}</MathText></p>
      {spec.staticFallback.type === "text" ? <p><MathText>{spec.staticFallback.content}</MathText></p> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{spec.staticFallback.headers.map((header, index) => <th key={index} className="border-b border-border px-2 py-1 font-semibold"><MathText>{header}</MathText></th>)}</tr></thead><tbody>{spec.staticFallback.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="border-b border-border px-2 py-1"><MathText>{scientificValueToMathText(cell)}</MathText></td>)}</tr>)}</tbody></table></div>}
    </div>
  </figure>;
}
