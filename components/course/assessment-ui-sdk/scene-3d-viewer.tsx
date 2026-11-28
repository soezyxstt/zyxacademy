"use client";

import React, { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { interactiveSceneSchema } from "@/lib/materials/interactive-scene";

const LazyInteractiveSceneRenderer = dynamic(
  () =>
    import("@/components/course/interactive-scene-renderer").then(
      (module) => module.InteractiveSceneRenderer,
    ),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat visual interaktif...
      </p>
    ),
  },
);

type Vec3 = [number, number, number];

interface Scene3dPoint {
  position: Vec3;
  label?: string;
  color?: string;
}

interface Scene3dSegment {
  from: Vec3;
  to: Vec3;
  arrow?: boolean;
  label?: string;
  color?: string;
}

interface Scene3dBox {
  center: Vec3;
  size: Vec3;
  label?: string;
  color?: string;
}

interface Parsed3dPrimitives {
  points: Scene3dPoint[];
  segments: Scene3dSegment[];
  boxes: Scene3dBox[];
  showAxes: boolean;
  summary?: string;
}

const SVG_WIDTH = 520;
const SVG_HEIGHT = 320;
const DEFAULT_YAW = 0.65;
const DEFAULT_PITCH = 0.42;
const DEFAULT_ZOOM = 1;

function parseVec3(raw: unknown): Vec3 | null {
  if (Array.isArray(raw) && raw.length >= 3) {
    const [x, y, z] = raw.map(Number);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return [x, y, z];
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const x = Number(obj.x);
    const y = Number(obj.y);
    const z = Number(obj.z);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return [x, y, z];
    }
  }
  return null;
}

function resolveColorToken(color?: string): string {
  switch (color) {
    case "primary":
      return "var(--color-brand-primary)";
    case "secondary":
      return "var(--color-brand-secondary)";
    case "success":
      return "var(--color-status-success)";
    case "warning":
      return "var(--color-status-warning)";
    case "error":
    case "destructive":
      return "var(--color-status-error)";
    case "muted":
      return "var(--color-muted-foreground)";
    default:
      return "var(--color-brand-primary)";
  }
}

function extract3dPrimitives(spec: Record<string, unknown>): Parsed3dPrimitives {
  const points: Scene3dPoint[] = [];
  const segments: Scene3dSegment[] = [];
  const boxes: Scene3dBox[] = [];

  const rawPoints = Array.isArray(spec.points) ? spec.points : [];
  for (const item of rawPoints) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const position = parseVec3(rec.position ?? rec.coords ?? rec);
    if (position) {
      points.push({
        position,
        label: typeof rec.label === "string" ? rec.label : undefined,
        color: typeof rec.color === "string" ? rec.color : undefined,
      });
    }
  }

  const rawVectors = Array.isArray(spec.vectors) ? spec.vectors : [];
  for (const item of rawVectors) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const from = parseVec3(rec.from ?? rec.origin) ?? [0, 0, 0];
    const to = parseVec3(rec.to ?? rec.end ?? rec.direction ?? rec);
    if (to) {
      segments.push({
        from,
        to,
        arrow: true,
        label: typeof rec.label === "string" ? rec.label : undefined,
        color: typeof rec.color === "string" ? rec.color : undefined,
      });
    }
  }

  const rawSegments = Array.isArray(spec.segments) ? spec.segments : [];
  for (const item of rawSegments) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const from = parseVec3(rec.from ?? rec.start);
    const to = parseVec3(rec.to ?? rec.end);
    if (from && to) {
      segments.push({
        from,
        to,
        arrow: rec.arrow === true,
        label: typeof rec.label === "string" ? rec.label : undefined,
        color: typeof rec.color === "string" ? rec.color : undefined,
      });
    }
  }

  const rawObjects = Array.isArray(spec.objects)
    ? spec.objects
    : Array.isArray(spec.primitives)
      ? spec.primitives
      : [];
  for (const item of rawObjects) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const kind = typeof rec.type === "string" ? rec.type : typeof rec.kind === "string" ? rec.kind : "";
    if (kind === "box" || kind === "cube" || kind === "prism") {
      const center = parseVec3(rec.center ?? rec.position) ?? [0, 0, 0];
      const size =
        parseVec3(rec.size ?? rec.dimensions) ??
        (typeof rec.edge === "number" && Number.isFinite(rec.edge)
          ? [rec.edge, rec.edge, rec.edge]
          : [2, 2, 2]);
      boxes.push({
        center,
        size,
        label: typeof rec.label === "string" ? rec.label : undefined,
        color: typeof rec.color === "string" ? rec.color : undefined,
      });
    } else if (kind === "vector" || kind === "line" || kind === "segment") {
      const from = parseVec3(rec.from ?? rec.start) ?? [0, 0, 0];
      const to = parseVec3(rec.to ?? rec.end ?? rec.direction);
      if (to) {
        segments.push({
          from,
          to,
          arrow: kind === "vector" || rec.arrow === true,
          label: typeof rec.label === "string" ? rec.label : undefined,
          color: typeof rec.color === "string" ? rec.color : undefined,
        });
      }
    } else if (kind === "point" || kind === "sphere") {
      const position = parseVec3(rec.position ?? rec.center);
      if (position) {
        points.push({
          position,
          label: typeof rec.label === "string" ? rec.label : undefined,
          color: typeof rec.color === "string" ? rec.color : undefined,
        });
      }
    }
  }

  const summary =
    typeof spec.summary === "string" && spec.summary.trim()
      ? spec.summary.trim()
      : typeof spec.description === "string" && spec.description.trim()
        ? spec.description.trim()
        : undefined;

  return {
    points,
    segments,
    boxes,
    showAxes: spec.axes !== false,
    summary,
  };
}

function boxEdges(box: Scene3dBox): Array<[Vec3, Vec3]> {
  const [cx, cy, cz] = box.center;
  const [hx, hy, hz] = [box.size[0] / 2, box.size[1] / 2, box.size[2] / 2];
  const corners: Vec3[] = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  const pairs: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return pairs.map(([a, b]) => [corners[a], corners[b]]);
}

export function Scene3dViewer({
  spec,
  title,
}: {
  spec: Record<string, unknown>;
  title?: string;
}) {
  const interactiveScene = useMemo(() => interactiveSceneSchema.safeParse(spec), [spec]);
  const primitives = useMemo(() => extract3dPrimitives(spec), [spec]);

  const [yaw, setYaw] = useState(DEFAULT_YAW);
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  if (interactiveScene.success) {
    return <LazyInteractiveSceneRenderer spec={interactiveScene.data} />;
  }

  const hasGeometry =
    primitives.points.length > 0 ||
    primitives.segments.length > 0 ||
    primitives.boxes.length > 0;

  if (!hasGeometry) {
    return (
      <div
        role="status"
        data-assessment-visual-fallback="scene_3d"
        className="rounded-lg border border-border bg-muted/30 p-3 text-body-xs text-muted-foreground"
      >
        {primitives.summary ? (
          <MathText as="p">{primitives.summary}</MathText>
        ) : (
          <p>Visual 3D belum lengkap untuk ditampilkan.</p>
        )}
      </div>
    );
  }

  const allCoords: Vec3[] = [
    ...primitives.points.map((p) => p.position),
    ...primitives.segments.flatMap((s) => [s.from, s.to]),
    ...primitives.boxes.flatMap((b) => boxEdges(b).flat()),
  ];
  const maxExtent = Math.max(
    1,
    ...allCoords.flatMap(([x, y, z]) => [Math.abs(x), Math.abs(y), Math.abs(z)]),
  );
  const scale = (Math.min(SVG_WIDTH, SVG_HEIGHT) * 0.34 * zoom) / maxExtent;

  const project = ([x, y, z]: Vec3): { x: number; y: number; depth: number } => {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;

    const perspective = 1 / (1 + z2 / (maxExtent * 6));
    return {
      x: SVG_WIDTH / 2 + x1 * scale * perspective,
      y: SVG_HEIGHT / 2 - y2 * scale * perspective,
      depth: z2,
    };
  };

  const axisExtent = maxExtent * 1.15;
  const origin = project([0, 0, 0]);
  const axisX = project([axisExtent, 0, 0]);
  const axisY = project([0, axisExtent, 0]);
  const axisZ = project([0, 0, axisExtent]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, yaw, pitch };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setYaw(dragRef.current.yaw + dx * 0.01);
    setPitch(Math.max(-1.4, Math.min(1.4, dragRef.current.pitch + dy * 0.01)));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setYaw((prev) => prev - 0.15);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setYaw((prev) => prev + 0.15);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setPitch((prev) => Math.max(-1.4, prev - 0.12));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setPitch((prev) => Math.min(1.4, prev + 0.12));
    }
  };

  return (
    <div className="space-y-2" data-assessment-scene-3d="">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          tabIndex={0}
          aria-label={title ? `Visual 3D: ${title}` : "Visual 3D interaktif"}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="block h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <defs>
            <marker
              id="assessment-3d-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="context-stroke" />
            </marker>
          </defs>

          {primitives.showAxes ? (
            <g className="stroke-muted-foreground/60" strokeWidth={1.2}>
              <line x1={origin.x} y1={origin.y} x2={axisX.x} y2={axisX.y} />
              <text x={axisX.x + 6} y={axisX.y + 4} className="fill-muted-foreground text-[11px] font-sans">
                x
              </text>
              <line x1={origin.x} y1={origin.y} x2={axisY.x} y2={axisY.y} />
              <text x={axisY.x + 6} y={axisY.y + 4} className="fill-muted-foreground text-[11px] font-sans">
                y
              </text>
              <line x1={origin.x} y1={origin.y} x2={axisZ.x} y2={axisZ.y} />
              <text x={axisZ.x + 6} y={axisZ.y + 4} className="fill-muted-foreground text-[11px] font-sans">
                z
              </text>
            </g>
          ) : null}

          {primitives.boxes.map((box, boxIndex) => {
            const stroke = resolveColorToken(box.color);
            const edges = boxEdges(box);
            const labelPos = project(box.center);
            return (
              <g key={`box-${boxIndex}`}>
                {edges.map(([start, end], edgeIndex) => {
                  const p1 = project(start);
                  const p2 = project(end);
                  return (
                    <line
                      key={`box-${boxIndex}-edge-${edgeIndex}`}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={stroke}
                      strokeWidth={1.6}
                      strokeOpacity={0.85}
                    />
                  );
                })}
                {box.label ? (
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-sans font-semibold"
                  >
                    {box.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {primitives.segments.map((segment, index) => {
            const p1 = project(segment.from);
            const p2 = project(segment.to);
            const stroke = resolveColorToken(segment.color);
            return (
              <g key={`seg-${index}`}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={stroke}
                  strokeWidth={2.2}
                  markerEnd={segment.arrow ? "url(#assessment-3d-arrow)" : undefined}
                />
                {segment.label ? (
                  <text
                    x={(p1.x + p2.x) / 2 + 6}
                    y={(p1.y + p2.y) / 2 - 6}
                    className="fill-foreground text-[11px] font-sans font-semibold"
                  >
                    {segment.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {primitives.points.map((point, index) => {
            const p = project(point.position);
            const fill = resolveColorToken(point.color);
            return (
              <g key={`pt-${index}`}>
                <circle cx={p.x} cy={p.y} r={4.5} fill={fill} />
                {point.label ? (
                  <text
                    x={p.x + 8}
                    y={p.y - 6}
                    className="fill-foreground text-[11px] font-sans font-semibold"
                  >
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body-xs text-muted-foreground">
          Seret atau gunakan tombol panah untuk memutar sudut pandang.
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Perbesar visual 3D"
            onClick={() => setZoom((prev) => Math.min(2, Number((prev + 0.2).toFixed(2))))}
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Perkecil visual 3D"
            onClick={() => setZoom((prev) => Math.max(0.5, Number((prev - 0.2).toFixed(2))))}
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Reset sudut pandang 3D"
            onClick={() => {
              setYaw(DEFAULT_YAW);
              setPitch(DEFAULT_PITCH);
              setZoom(DEFAULT_ZOOM);
            }}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      {primitives.summary ? (
        <MathText as="p" className="text-body-xs text-muted-foreground">
          {primitives.summary}
        </MathText>
      ) : null}
    </div>
  );
}
