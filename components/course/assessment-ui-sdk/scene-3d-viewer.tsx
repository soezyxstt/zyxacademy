"use client";

import React, { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { compile as compileMathExpr } from "mathjs";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider";
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
type Axis3 = "x" | "y" | "z";
type RevolutionMethod = "disk" | "washer" | "shell";

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

interface Scene3dCylinder {
  center: Vec3;
  radius: number;
  topRadius: number;
  height: number;
  axis: Axis3;
  label?: string;
  color?: string;
}

interface Scene3dRevolution {
  fn: string;
  innerFn?: string;
  axis: "x" | "y";
  range: [number, number];
  method: RevolutionMethod;
  slices: number;
  label?: string;
  color?: string;
}

interface Scene3dSurface {
  fn: string;
  xRange: [number, number];
  yRange: [number, number];
  steps: number;
  label?: string;
  color?: string;
}

interface Parsed3dPrimitives {
  points: Scene3dPoint[];
  segments: Scene3dSegment[];
  boxes: Scene3dBox[];
  cylinders: Scene3dCylinder[];
  revolutions: Scene3dRevolution[];
  surfaces: Scene3dSurface[];
  showAxes: boolean;
  summary?: string;
}

const SVG_WIDTH = 520;
const SVG_HEIGHT = 330;
const DEFAULT_YAW = 0.62;
const DEFAULT_PITCH = 0.38;
const DEFAULT_ZOOM = 1;
const RING_SEGMENTS = 28;

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

function parseRange2(raw: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(raw) && raw.length >= 2) {
    const a = Number(raw[0]);
    const b = Number(raw[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
      return a < b ? [a, b] : [b, a];
    }
  }
  return fallback;
}

function sanitizeExpression(raw: string): string {
  return raw
    .trim()
    .replace(/^\$+|\$+$/g, "")
    .replace(/^[a-zA-Z]\s*\(\s*[a-zA-Z]\s*(?:,\s*[a-zA-Z]\s*)?\)\s*=\s*/, "")
    .replace(/^[yzr]\s*=\s*/i, "")
    .replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "(($1)/($2))")
    .replace(/\\pi\b/g, "pi")
    .replace(/\\sin\b/g, "sin")
    .replace(/\\cos\b/g, "cos")
    .replace(/\\tan\b/g, "tan")
    .replace(/\\ln\b/g, "log")
    .replace(/\\cdot/g, "*")
    .trim();
}

function createSafe1dEvaluator(expr: string): ((t: number) => number | null) | null {
  const cleaned = sanitizeExpression(expr);
  if (!cleaned) return null;
  try {
    const compiled = compileMathExpr(cleaned);
    return (t: number) => {
      try {
        const val = Number(compiled.evaluate({ x: t, y: t, t }));
        return Number.isFinite(val) ? val : null;
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
}

function createSafe2dEvaluator(expr: string): ((x: number, y: number) => number | null) | null {
  const cleaned = sanitizeExpression(expr);
  if (!cleaned) return null;
  try {
    const compiled = compileMathExpr(cleaned);
    return (x: number, y: number) => {
      try {
        const val = Number(compiled.evaluate({ x, y }));
        return Number.isFinite(val) ? val : null;
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
}

const AUTO_3D_PALETTE = [
  "var(--color-brand-primary)",
  "var(--color-brand-secondary)",
  "var(--color-status-success)",
  "var(--color-status-warning)",
  "var(--color-status-error)",
];

function resolveColorToken(color?: string, fallbackIndex?: number): string {
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
      return typeof fallbackIndex === "number"
        ? AUTO_3D_PALETTE[fallbackIndex % AUTO_3D_PALETTE.length]
        : "var(--color-brand-primary)";
  }
}

function parseRevolutionSpec(rec: Record<string, unknown>): Scene3dRevolution | null {
  const fnRaw = rec.fn ?? rec.formula ?? rec.expression ?? rec.outerFn ?? rec.curve;
  if (typeof fnRaw !== "string" || !fnRaw.trim()) return null;
  const innerRaw = rec.innerFn ?? rec.innerFormula ?? rec.innerCurve;
  const innerFn = typeof innerRaw === "string" && innerRaw.trim() ? innerRaw.trim() : undefined;
  const axis: "x" | "y" = rec.axis === "y" || rec.axis === "Y" ? "y" : "x";
  const range = parseRange2(rec.range ?? rec.xRange ?? rec.yRange ?? rec.domain, [0, 2]);
  const rawMethod = typeof rec.method === "string" ? rec.method.toLowerCase() : "";
  const method: RevolutionMethod =
    rawMethod === "shell" || rawMethod === "kulit_tabung"
      ? "shell"
      : rawMethod === "washer" || rawMethod === "cincin" || innerFn
        ? "washer"
        : "disk";
  const rawSlices = Number(rec.slices ?? rec.partitions ?? rec.n ?? 8);
  const slices = Number.isFinite(rawSlices) ? Math.max(3, Math.min(24, Math.round(rawSlices))) : 8;
  return {
    fn: fnRaw.trim(),
    innerFn,
    axis,
    range,
    method,
    slices,
    label: typeof rec.label === "string" ? rec.label : undefined,
    color: typeof rec.color === "string" ? rec.color : undefined,
  };
}

function parseSurfaceSpec(rec: Record<string, unknown>): Scene3dSurface | null {
  const fnRaw = rec.fn ?? rec.formula ?? rec.expression ?? rec.z;
  if (typeof fnRaw !== "string" || !fnRaw.trim()) return null;
  const xRange = parseRange2(rec.xRange ?? rec.range, [-2, 2]);
  const yRange = parseRange2(rec.yRange ?? rec.range, [-2, 2]);
  const rawSteps = Number(rec.steps ?? rec.resolution ?? 10);
  const steps = Number.isFinite(rawSteps) ? Math.max(4, Math.min(18, Math.round(rawSteps))) : 10;
  return {
    fn: fnRaw.trim(),
    xRange,
    yRange,
    steps,
    label: typeof rec.label === "string" ? rec.label : undefined,
    color: typeof rec.color === "string" ? rec.color : undefined,
  };
}

function extract3dPrimitives(spec: Record<string, unknown>): Parsed3dPrimitives {
  const points: Scene3dPoint[] = [];
  const segments: Scene3dSegment[] = [];
  const boxes: Scene3dBox[] = [];
  const cylinders: Scene3dCylinder[] = [];
  const revolutions: Scene3dRevolution[] = [];
  const surfaces: Scene3dSurface[] = [];

  // Top-level revolution or surface shorthand
  if (spec.type === "revolution" || spec.type === "solid_of_revolution" || spec.kind === "revolution") {
    const rev = parseRevolutionSpec(spec);
    if (rev) revolutions.push(rev);
  } else if (spec.revolution && typeof spec.revolution === "object" && !Array.isArray(spec.revolution)) {
    const rev = parseRevolutionSpec(spec.revolution as Record<string, unknown>);
    if (rev) revolutions.push(rev);
  }

  if (spec.type === "surface" || spec.kind === "surface") {
    const surf = parseSurfaceSpec(spec);
    if (surf) surfaces.push(surf);
  } else if (spec.surface && typeof spec.surface === "object" && !Array.isArray(spec.surface)) {
    const surf = parseSurfaceSpec(spec.surface as Record<string, unknown>);
    if (surf) surfaces.push(surf);
  }

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
    const kind =
      typeof rec.type === "string"
        ? rec.type.toLowerCase()
        : typeof rec.kind === "string"
          ? rec.kind.toLowerCase()
          : "";
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
    } else if (kind === "revolution" || kind === "solid_of_revolution" || kind === "lathe") {
      const rev = parseRevolutionSpec(rec);
      if (rev) revolutions.push(rev);
    } else if (kind === "surface") {
      const surf = parseSurfaceSpec(rec);
      if (surf) surfaces.push(surf);
    } else if (kind === "cylinder" || kind === "disk" || kind === "cone") {
      const center = parseVec3(rec.center ?? rec.position) ?? [0, 0, 0];
      const radius = Number(rec.radius ?? rec.r ?? 1);
      const topRadius =
        kind === "cone"
          ? Number(rec.topRadius ?? 0)
          : Number(rec.topRadius ?? rec.radius ?? rec.r ?? 1);
      const height = Number(rec.height ?? rec.thickness ?? (kind === "disk" ? 0.35 : 2));
      const axis: Axis3 =
        rec.axis === "x" || rec.axis === "y" || rec.axis === "z" ? rec.axis : "y";
      if (Number.isFinite(radius) && Number.isFinite(height) && radius > 0 && height > 0) {
        cylinders.push({
          center,
          radius,
          topRadius: Number.isFinite(topRadius) && topRadius >= 0 ? topRadius : radius,
          height,
          axis,
          label: typeof rec.label === "string" ? rec.label : undefined,
          color: typeof rec.color === "string" ? rec.color : undefined,
        });
      }
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
    cylinders,
    revolutions,
    surfaces,
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

function ringPoint(axis: Axis3, center: Vec3, axialOffset: number, radius: number, theta: number): Vec3 {
  const c = Math.cos(theta) * radius;
  const s = Math.sin(theta) * radius;
  if (axis === "x") return [center[0] + axialOffset, center[1] + c, center[2] + s];
  if (axis === "y") return [center[0] + c, center[1] + axialOffset, center[2] + s];
  return [center[0] + c, center[1] + s, center[2] + axialOffset];
}

interface RenderPolygon {
  points: Vec3[];
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
}

interface RenderPolyline {
  points: Vec3[];
  stroke: string;
  strokeWidth: number;
  strokeOpacity?: number;
  dashed?: boolean;
}

function buildCylinderMesh(
  axis: Axis3,
  center: Vec3,
  offsetStart: number,
  offsetEnd: number,
  rStart: number,
  rEnd: number,
  color: string,
  highlight: boolean,
  segments = RING_SEGMENTS,
): RenderPolygon[] {
  const polys: RenderPolygon[] = [];
  const baseFillOpacity = highlight ? 0.34 : 0.16;
  const strokeOpacity = highlight ? 0.92 : 0.45;
  const strokeWidth = highlight ? 1.3 : 0.8;

  for (let i = 0; i < segments; i++) {
    const t0 = (i / segments) * Math.PI * 2;
    const t1 = ((i + 1) / segments) * Math.PI * 2;
    const p00 = ringPoint(axis, center, offsetStart, rStart, t0);
    const p01 = ringPoint(axis, center, offsetStart, rStart, t1);
    const p11 = ringPoint(axis, center, offsetEnd, rEnd, t1);
    const p10 = ringPoint(axis, center, offsetEnd, rEnd, t0);
    polys.push({
      points: [p00, p01, p11, p10],
      fill: color,
      fillOpacity: baseFillOpacity,
      stroke: color,
      strokeOpacity,
      strokeWidth,
    });
  }

  // Cap rings when radius > 0
  if (rStart > 0.001) {
    const capStart: Vec3[] = [];
    for (let i = 0; i < segments; i++) {
      capStart.push(ringPoint(axis, center, offsetStart, rStart, (i / segments) * Math.PI * 2));
    }
    polys.push({
      points: capStart,
      fill: color,
      fillOpacity: highlight ? 0.24 : 0.08,
      stroke: color,
      strokeOpacity: highlight ? 0.95 : 0.55,
      strokeWidth: highlight ? 1.4 : 0.9,
    });
  }
  if (rEnd > 0.001) {
    const capEnd: Vec3[] = [];
    for (let i = 0; i < segments; i++) {
      capEnd.push(ringPoint(axis, center, offsetEnd, rEnd, (i / segments) * Math.PI * 2));
    }
    polys.push({
      points: capEnd,
      fill: color,
      fillOpacity: highlight ? 0.24 : 0.08,
      stroke: color,
      strokeOpacity: highlight ? 0.95 : 0.55,
      strokeWidth: highlight ? 1.4 : 0.9,
    });
  }

  return polys;
}

function buildRevolutionGeometry(
  rev: Scene3dRevolution,
  sliceCount: number,
  displayMode: "sliced" | "smooth",
): { polygons: RenderPolygon[]; polylines: RenderPolyline[]; sampleCoords: Vec3[] } {
  const outerEval = createSafe1dEvaluator(rev.fn);
  if (!outerEval) return { polygons: [], polylines: [], sampleCoords: [] };
  const innerEval = rev.innerFn ? createSafe1dEvaluator(rev.innerFn) : null;

  const [a, b] = rev.range;
  const span = b - a;
  if (span <= 0) return { polygons: [], polylines: [], sampleCoords: [] };

  const primaryColor = resolveColorToken(rev.color ?? "primary");
  const accentColor = "var(--color-brand-secondary)";
  const polygons: RenderPolygon[] = [];
  const polylines: RenderPolyline[] = [];
  const sampleCoords: Vec3[] = [];

  // Generating profile curve in XY plane
  const curveSteps = 40;
  const outerCurve: Vec3[] = [];
  const innerCurve: Vec3[] = [];
  for (let i = 0; i <= curveSteps; i++) {
    const t = a + (span * i) / curveSteps;
    const rawR = outerEval(t);
    if (rawR !== null) {
      const r = Math.abs(rawR);
      const pt: Vec3 = rev.axis === "x" ? [t, r, 0] : [r, t, 0];
      outerCurve.push(pt);
      sampleCoords.push(pt, rev.axis === "x" ? [t, -r, 0] : [-r, t, 0], rev.axis === "x" ? [t, 0, r] : [0, t, r]);
    }
    if (innerEval) {
      const rawInner = innerEval(t);
      if (rawInner !== null) {
        const ri = Math.abs(rawInner);
        innerCurve.push(rev.axis === "x" ? [t, ri, 0] : [ri, t, 0]);
      }
    }
  }
  if (outerCurve.length > 1) {
    polylines.push({ points: outerCurve, stroke: accentColor, strokeWidth: 2.4, strokeOpacity: 1 });
  }
  if (innerCurve.length > 1) {
    polylines.push({ points: innerCurve, stroke: "var(--color-status-warning)", strokeWidth: 2, strokeOpacity: 0.9, dashed: true });
  }

  if (displayMode === "smooth") {
    const smoothSteps = 20;
    const dt = span / smoothSteps;
    for (let i = 0; i < smoothSteps; i++) {
      const t0 = a + i * dt;
      const t1 = t0 + dt;
      const r0 = Math.abs(outerEval(t0) ?? 0);
      const r1 = Math.abs(outerEval(t1) ?? 0);
      polygons.push(
        ...buildCylinderMesh(rev.axis, [0, 0, 0], t0, t1, r0, r1, primaryColor, false, 24),
      );
      if (innerEval) {
        const ri0 = Math.abs(innerEval(t0) ?? 0);
        const ri1 = Math.abs(innerEval(t1) ?? 0);
        if (ri0 > 0.001 || ri1 > 0.001) {
          polygons.push(
            ...buildCylinderMesh(rev.axis, [0, 0, 0], t0, t1, ri0, ri1, "var(--color-status-warning)", false, 20),
          );
        }
      }
    }
    return { polygons, polylines, sampleCoords };
  }

  // Discrete slices (potongan cakram / cincin / kulit tabung)
  const dt = span / sliceCount;
  const highlightIndex = Math.floor(sliceCount / 2);

  if (rev.method === "shell") {
    // Cylindrical shells coaxial with rotation axis (for shell method around y-axis or x-axis)
    const shellAxis: Axis3 = rev.axis;
    for (let i = 0; i < sliceCount; i++) {
      const tMid = a + (i + 0.5) * dt;
      const hOuter = Math.abs(outerEval(tMid) ?? 0);
      const hInner = innerEval ? Math.abs(innerEval(tMid) ?? 0) : 0;
      const rShell = Math.abs(tMid);
      if (rShell <= 0.001 || Math.abs(hOuter - hInner) <= 0.001) continue;
      const isHighlight = i === highlightIndex;
      polygons.push(
        ...buildCylinderMesh(
          shellAxis,
          [0, 0, 0],
          Math.min(hInner, hOuter),
          Math.max(hInner, hOuter),
          rShell,
          rShell,
          isHighlight ? accentColor : primaryColor,
          isHighlight,
          24,
        ),
      );
    }
  } else {
    // Disk or Washer slices stacked along rotation axis
    const gap = dt * 0.06;
    for (let i = 0; i < sliceCount; i++) {
      const t0 = a + i * dt + gap;
      const t1 = a + (i + 1) * dt - gap;
      const tMid = a + (i + 0.5) * dt;
      const rOuter = Math.abs(outerEval(tMid) ?? 0);
      const rInner = innerEval ? Math.abs(innerEval(tMid) ?? 0) : 0;
      if (rOuter <= 0.001) continue;
      const isHighlight = i === highlightIndex;
      polygons.push(
        ...buildCylinderMesh(
          rev.axis,
          [0, 0, 0],
          t0,
          t1,
          rOuter,
          rOuter,
          isHighlight ? accentColor : primaryColor,
          isHighlight,
          24,
        ),
      );
      if (rInner > 0.001 && rInner < rOuter) {
        polygons.push(
          ...buildCylinderMesh(
            rev.axis,
            [0, 0, 0],
            t0,
            t1,
            rInner,
            rInner,
            "var(--color-status-warning)",
            isHighlight,
            18,
          ),
        );
      }
    }
  }

  return { polygons, polylines, sampleCoords };
}

function buildSurfaceGeometry(surf: Scene3dSurface): { polygons: RenderPolygon[]; sampleCoords: Vec3[] } {
  const fn = createSafe2dEvaluator(surf.fn);
  if (!fn) return { polygons: [], sampleCoords: [] };
  const [x0, x1] = surf.xRange;
  const [y0, y1] = surf.yRange;
  const n = surf.steps;
  const grid: Array<Array<Vec3 | null>> = [];
  const sampleCoords: Vec3[] = [];
  const color = resolveColorToken(surf.color ?? "primary");

  for (let i = 0; i <= n; i++) {
    const row: Array<Vec3 | null> = [];
    const x = x0 + ((x1 - x0) * i) / n;
    for (let j = 0; j <= n; j++) {
      const y = y0 + ((y1 - y0) * j) / n;
      const z = fn(x, y);
      if (z !== null && Math.abs(z) < 1e4) {
        // Map math (x, y, z) -> viewer (x, z, y) so z is vertical height
        const pt: Vec3 = [x, z, y];
        row.push(pt);
        sampleCoords.push(pt);
      } else {
        row.push(null);
      }
    }
    grid.push(row);
  }

  const polygons: RenderPolygon[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p00 = grid[i][j];
      const p10 = grid[i + 1][j];
      const p11 = grid[i + 1][j + 1];
      const p01 = grid[i][j + 1];
      if (p00 && p10 && p11 && p01) {
        polygons.push({
          points: [p00, p10, p11, p01],
          fill: color,
          fillOpacity: 0.16,
          stroke: color,
          strokeOpacity: 0.55,
          strokeWidth: 0.85,
        });
      }
    }
  }

  return { polygons, sampleCoords };
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

  const isPlanarXY = useMemo(() => {
    if (
      primitives.boxes.length > 0 ||
      primitives.cylinders.length > 0 ||
      primitives.revolutions.length > 0 ||
      primitives.surfaces.length > 0
    ) {
      return false;
    }
    const pts: Vec3[] = [
      ...primitives.points.map((p) => p.position),
      ...primitives.segments.flatMap((s) => [s.from, s.to]),
    ];
    return pts.length > 0 && pts.every(([, , z]) => Math.abs(z) < 1e-6);
  }, [primitives]);

  const initialSlices = primitives.revolutions[0]?.slices ?? 8;
  const [sliceCount, setSliceCount] = useState(initialSlices);
  const [revDisplayMode, setRevDisplayMode] = useState<"sliced" | "smooth">("sliced");
  const [yaw, setYaw] = useState(isPlanarXY ? 0 : DEFAULT_YAW);
  const [pitch, setPitch] = useState(isPlanarXY ? 0 : DEFAULT_PITCH);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const generatedMeshes = useMemo(() => {
    const polygons: RenderPolygon[] = [];
    const polylines: RenderPolyline[] = [];
    const sampleCoords: Vec3[] = [];

    for (const rev of primitives.revolutions) {
      const res = buildRevolutionGeometry(rev, sliceCount, revDisplayMode);
      polygons.push(...res.polygons);
      polylines.push(...res.polylines);
      sampleCoords.push(...res.sampleCoords);
    }

    for (const surf of primitives.surfaces) {
      const res = buildSurfaceGeometry(surf);
      polygons.push(...res.polygons);
      sampleCoords.push(...res.sampleCoords);
    }

    for (const cyl of primitives.cylinders) {
      const half = cyl.height / 2;
      const color = resolveColorToken(cyl.color);
      const cylPolys = buildCylinderMesh(
        cyl.axis,
        cyl.center,
        -half,
        half,
        cyl.radius,
        cyl.topRadius,
        color,
        false,
        24,
      );
      polygons.push(...cylPolys);
      sampleCoords.push(
        [cyl.center[0] + cyl.radius, cyl.center[1] + half, cyl.center[2] + cyl.radius],
        [cyl.center[0] - cyl.radius, cyl.center[1] - half, cyl.center[2] - cyl.radius],
      );
    }

    return { polygons, polylines, sampleCoords };
  }, [primitives.cylinders, primitives.revolutions, primitives.surfaces, revDisplayMode, sliceCount]);

  if (interactiveScene.success) {
    return <LazyInteractiveSceneRenderer spec={interactiveScene.data} />;
  }

  const hasGeometry =
    primitives.points.length > 0 ||
    primitives.segments.length > 0 ||
    primitives.boxes.length > 0 ||
    generatedMeshes.polygons.length > 0 ||
    generatedMeshes.polylines.length > 0;

  if (!hasGeometry) {
    return (
      <div
        role="status"
        data-assessment-visual-fallback="scene_3d"
        className="border-l-2 border-border pl-3 py-1 text-body-xs text-muted-foreground"
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
    ...generatedMeshes.sampleCoords,
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

  // Painter's algorithm: sort polygons back-to-front by average projected depth
  const projectedPolygons = generatedMeshes.polygons
    .map((poly) => {
      const pts = poly.points.map(project);
      const avgDepth = pts.reduce((acc, p) => acc + p.depth, 0) / Math.max(1, pts.length);
      return {
        poly,
        avgDepth,
        pointsAttr: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      };
    })
    .sort((a, b) => b.avgDepth - a.avgDepth);

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

  const hasRevolution = primitives.revolutions.length > 0;
  const activeMethodLabel =
    primitives.revolutions[0]?.method === "shell"
      ? "kulit tabung"
      : primitives.revolutions[0]?.method === "washer"
        ? "cincin"
        : "cakram";

  return (
    <div className="space-y-2.5" data-assessment-scene-3d="">
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

          {projectedPolygons.map((item, idx) => (
            <polygon
              key={`poly-${idx}`}
              points={item.pointsAttr}
              fill={item.poly.fill}
              fillOpacity={item.poly.fillOpacity}
              stroke={item.poly.stroke}
              strokeOpacity={item.poly.strokeOpacity}
              strokeWidth={item.poly.strokeWidth}
              strokeLinejoin="round"
            />
          ))}

          {generatedMeshes.polylines.map((line, idx) => {
            const pts = line.points.map(project);
            return (
              <polyline
                key={`curve-${idx}`}
                fill="none"
                points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                stroke={line.stroke}
                strokeWidth={line.strokeWidth}
                strokeOpacity={line.strokeOpacity ?? 1}
                strokeDasharray={line.dashed ? "4 3" : undefined}
              />
            );
          })}

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
            const stroke = resolveColorToken(segment.color, index);
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

      {hasRevolution ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-2">
          <div className="flex min-w-[180px] flex-1 items-center gap-3">
            <span className="shrink-0 text-body-xs font-medium text-muted-foreground tabular-nums">
              {revDisplayMode === "sliced"
                ? `${sliceCount} potongan ${activeMethodLabel}`
                : "Permukaan halus"}
            </span>
            {revDisplayMode === "sliced" ? (
              <Slider
                value={sliceCount}
                min={3}
                max={24}
                step={1}
                onValueChange={(next) => {
                  const val = Array.isArray(next) ? next[0] : next;
                  if (typeof val === "number" && Number.isFinite(val)) {
                    setSliceCount(val);
                  }
                }}
                aria-label="Jumlah potongan benda putar"
                className="flex flex-1 items-center"
              >
                <SliderControl className="flex h-6 w-full cursor-pointer items-center">
                  <SliderTrack className="relative h-1.5 w-full rounded-full bg-muted">
                    <SliderIndicator className="h-full rounded-full bg-brand-primary" />
                    <SliderThumb
                      aria-label="Jumlah potongan benda putar"
                      className="size-4 -translate-y-1/2 top-1/2 rounded-full border border-brand-primary bg-background shadow-sm transition-transform hover:scale-110 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                    />
                  </SliderTrack>
                </SliderControl>
              </Slider>
            ) : null}
          </div>

          <SegmentedControl
            aria-label="Mode tampilan benda putar"
            value={revDisplayMode}
            onValueChange={(next) => {
              if (next === "sliced" || next === "smooth") {
                setRevDisplayMode(next);
              }
            }}
            className="shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 p-0.5"
          >
            <SegmentedControlIndicator className="rounded bg-background shadow-2xs" />
            <SegmentedControlItem
              value="sliced"
              className="rounded px-2 py-0.5 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-checked:text-foreground"
            >
              Potongan
            </SegmentedControlItem>
            <SegmentedControlItem
              value="smooth"
              className="rounded px-2 py-0.5 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-checked:text-foreground"
            >
              Halus
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      ) : null}

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
            <ZoomIn className="size-3.5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Perkecil visual 3D"
            onClick={() => setZoom((prev) => Math.max(0.5, Number((prev - 0.2).toFixed(2))))}
          >
            <ZoomOut className="size-3.5" aria-hidden />
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
            <RotateCcw className="size-3.5" aria-hidden />
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
