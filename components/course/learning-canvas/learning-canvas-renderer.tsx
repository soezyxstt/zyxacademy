"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import {
  evaluateFunctionPlot,
  resetCanvasValues,
  safeExpressionToLatex,
  type CanvasSpec,
  type ChemistryCanvas,
  type DataPlotCanvas,
  type DerivationCanvas,
  type DiagramCanvas,
  type FunctionPlotCanvas,
  type VectorCanvas,
} from "@/lib/zyra/canvas";

const GRAPH_BLUE = "var(--color-brand-primary)";
const GRAPH_SECONDARY = "var(--color-brand-secondary)";
const BG = "var(--color-card)";
const MINOR_GRID = "var(--color-border)";
const MAJOR_GRID = "var(--color-border-strong)";
const AXIS = "var(--color-foreground)";
const LABEL = "var(--color-muted-foreground)";

const PAD_L = 46;
const PAD_R = 18;
const PAD_T = 16;
const PAD_B = 36;
const SVG_W = 600;
const SVG_H = 312;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

const VIEW_SPAN_MIN = 1e-2;
const VIEW_SPAN_MAX = 1e6;

interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function finiteSpan(min: number, max: number): number {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return 1;
  return Math.min(VIEW_SPAN_MAX, Math.max(VIEW_SPAN_MIN, span));
}

function anchoredZoom(view: Viewport, factor: number, fx: number, fy: number): Viewport {
  const spanX = clamp(finiteSpan(view.xMin, view.xMax) * factor, VIEW_SPAN_MIN, VIEW_SPAN_MAX);
  const spanY = clamp(finiteSpan(view.yMin, view.yMax) * factor, VIEW_SPAN_MIN, VIEW_SPAN_MAX);
  const anchorX = view.xMin + fx * (view.xMax - view.xMin);
  const anchorY = view.yMax - fy * (view.yMax - view.yMin);
  const xMin = anchorX - fx * spanX;
  const yMax = anchorY + fy * spanY;
  return { xMin, xMax: xMin + spanX, yMin: yMax - spanY, yMax };
}

function translated(view: Viewport, dx: number, dy: number): Viewport {
  return {
    xMin: view.xMin + dx,
    xMax: view.xMax + dx,
    yMin: view.yMin + dy,
    yMax: view.yMax + dy,
  };
}

type PlotGesture =
  | { mode: "pan"; startClientX: number; startClientY: number; startView: Viewport }
  | {
      mode: "pinch";
      startDistPx: number;
      startFx: number;
      startFy: number;
      startMidClientX: number;
      startMidClientY: number;
      startView: Viewport;
    };

/**
 * Shared pan/zoom viewport for Learning Canvas plots. Drag pans, scroll or
 * pinch zooms around the pointer, double-click resets to the fitted view.
 */
function useInteractiveViewport(defaultView: Viewport) {
  const [view, setView] = useState<Viewport>(defaultView);
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<PlotGesture | null>(null);
  const defaultViewRef = useRef(defaultView);

  useEffect(() => {
    defaultViewRef.current = defaultView;
    setView(defaultView);
    pointersRef.current.clear();
    gestureRef.current = null;
    setIsDragging(false);
  }, [defaultView]);

  const resetView = useCallback(() => {
    setView({ ...defaultViewRef.current });
  }, []);

  const nudge = useCallback((xFraction: number, yFraction: number) => {
    setView((current) => translated(
      current,
      finiteSpan(current.xMin, current.xMax) * xFraction,
      finiteSpan(current.yMin, current.yMax) * yFraction,
    ));
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setView((current) => anchoredZoom(current, factor, 0.5, 0.5));
  }, []);

  const svgScale = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return { sx: 1, sy: 1 };
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { sx: 1, sy: 1 };
    return { sx: SVG_W / rect.width, sy: SVG_H / rect.height };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = ((event.clientX - rect.left) / rect.width) * SVG_W;
      const py = ((event.clientY - rect.top) / rect.height) * SVG_H;
      const fx = clamp01((px - PAD_L) / PLOT_W);
      const fy = clamp01((py - PAD_T) / PLOT_H);
      const factor = Math.exp(event.deltaY * 0.0012);
      setView((current) => anchoredZoom(current, factor, fx, fy));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        mode: "pan",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startView: view,
      };
      setIsDragging(true);
      return;
    }

    if (pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      const first = points[points.length - 2];
      const second = points[points.length - 1];
      if (!first || !second) return;
      const distPx = Math.hypot(second.x - first.x, second.y - first.y);
      if (distPx < 8) return;
      const scale = svgScale();
      const midPx = ((first.x + second.x) / 2 - (svgRef.current?.getBoundingClientRect().left ?? 0)) * scale.sx;
      const midPy = ((first.y + second.y) / 2 - (svgRef.current?.getBoundingClientRect().top ?? 0)) * scale.sy;
      gestureRef.current = {
        mode: "pinch",
        startDistPx: distPx,
        startFx: clamp01((midPx - PAD_L) / PLOT_W),
        startFy: clamp01((midPy - PAD_T) / PLOT_H),
        startMidClientX: (first.x + second.x) / 2,
        startMidClientY: (first.y + second.y) / 2,
        startView: view,
      };
      setIsDragging(true);
    }
  }, [svgScale, view]);

  const onPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || !pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (gesture.mode === "pan") {
      const { sx, sy } = svgScale();
      const dxWorld = -(((event.clientX - gesture.startClientX) * sx) / PLOT_W)
        * finiteSpan(gesture.startView.xMin, gesture.startView.xMax);
      const dyWorld = (((event.clientY - gesture.startClientY) * sy) / PLOT_H)
        * finiteSpan(gesture.startView.yMin, gesture.startView.yMax);
      setView(translated(gesture.startView, dxWorld, dyWorld));
      return;
    }

    const points = [...pointersRef.current.values()];
    if (points.length < 2) return;
    const first = points[points.length - 2];
    const second = points[points.length - 1];
    if (!first || !second) return;
    const distPx = Math.hypot(second.x - first.x, second.y - first.y) || 1;
    const zoomFactor = gesture.startDistPx / distPx;

    const { sx } = svgScale();
    const midDxPx = (first.x + second.x) / 2 - gesture.startMidClientX;
    const zoomed = anchoredZoom(gesture.startView, zoomFactor, gesture.startFx, gesture.startFy);
    const panWorldX = -((midDxPx * sx) / PLOT_W) * finiteSpan(zoomed.xMin, zoomed.xMax);
    setView(translated(zoomed, panWorldX, 0));
  }, [svgScale]);

  const endPointer = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      setIsDragging(false);
    } else if (pointersRef.current.size === 1 && gestureRef.current?.mode === "pinch") {
      const remaining = [...pointersRef.current.values()][0];
      if (remaining) {
        gestureRef.current = {
          mode: "pan",
          startClientX: remaining.x,
          startClientY: remaining.y,
          startView: view,
        };
      }
    }
  }, [view]);

  return {
    view,
    isDragging,
    resetView,
    nudge,
    zoomBy,
    bind: {
      ref: svgRef,
      className: cn(
        "h-[260px] w-full max-w-full touch-none select-none md:h-[300px]",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      ),
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onLostPointerCapture: endPointer,
      onDoubleClick: resetView,
    },
  };
}

function valuesForSpec(spec: CanvasSpec): Record<string, number> {
  return resetCanvasValues(spec.variables);
}

function formatNum(n: number) {
  const r = Math.round(n * 100) / 100;
  if (Object.is(r, -0)) return "0";
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

function formatTick(value: number, step: number): string {
  const decimals = clamp(Math.ceil(-Math.log10(step) + 1e-9), 0, 4);
  const rounded = Number(value.toFixed(decimals));
  if (Object.is(rounded, -0)) return "0";
  return rounded.toFixed(decimals);
}

function niceStep(range: number) {
  const raw = range / 8;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const multiplier of [1, 2, 5, 10]) {
    if (raw <= multiplier * magnitude) return multiplier * magnitude;
  }
  return 10 * magnitude;
}

function tickValues(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  const epsilon = step * 1e-6;
  for (let value = Math.ceil((min + epsilon) / step) * step; value <= max + epsilon; value += step) {
    ticks.push(Math.round(value / step) * step);
    if (ticks.length > 64) break;
  }
  return ticks;
}

function fitFunctionViewport(spec: FunctionPlotCanvas): Viewport {
  const evaluated = evaluateFunctionPlot(spec, {}, {});
  const allY = evaluated.flatMap((series) =>
    series.points.flatMap((point) => (point.y !== null && Number.isFinite(point.y) ? [point.y] : [])),
  );
  let yMin = -8;
  let yMax = 8;
  if (allY.length > 0) {
    const sorted = [...allY].sort((a, b) => a - b);
    const q05 = sorted[Math.floor(sorted.length * 0.05)] ?? -8;
    const q95 = sorted[Math.floor(sorted.length * 0.95)] ?? 8;
    let min = Math.max(Math.min(...allY), q05 - Math.abs(q95 - q05) * 0.5);
    let max = Math.min(Math.max(...allY), q95 + Math.abs(q95 - q05) * 0.5);
    if (min === max) {
      min -= 4;
      max += 4;
    }
    const span = Math.max(1, max - min);
    let plotMin = Math.floor(min - span * 0.12);
    let plotMax = Math.ceil(max + span * 0.12);
    if (plotMin > -1 && plotMax > 1) plotMin = -2;
    if (plotMax < 1 && plotMin < -1) plotMax = 2;
    yMin = clamp(plotMin, -100, 100);
    yMax = clamp(plotMax, -100, 100);
  }
  return { xMin: spec.domain.min, xMax: spec.domain.max, yMin, yMax };
}

function GridLayer({
  view,
  mapX,
  mapY,
}: {
  view: Viewport;
  mapX: (x: number) => number;
  mapY: (y: number) => number;
}) {
  const xSpan = finiteSpan(view.xMin, view.xMax);
  const ySpan = finiteSpan(view.yMin, view.yMax);
  const xStep = useMemo(() => niceStep(xSpan), [xSpan]);
  const yStep = useMemo(() => niceStep(ySpan), [ySpan]);
  const xTicks = useMemo(() => tickValues(view.xMin, view.xMax, xStep), [view.xMin, view.xMax, xStep]);
  const yTicks = useMemo(() => tickValues(view.yMin, view.yMax, yStep), [view.yMin, view.yMax, yStep]);
  const showXAxis = view.yMin < 0 && view.yMax > 0;
  const showYAxis = view.xMin < 0 && view.xMax > 0;
  const y0 = mapY(0);
  const x0 = mapX(0);

  return (
    <>
      <g aria-hidden>
        {xTicks.map((gx) => {
          const major = Math.abs(gx) < 1e-9 || (xStep >= 1 && Math.abs(gx % (xStep * 2)) < 1e-9);
          return (
            <line
              key={`vx-${gx}`}
              x1={mapX(gx)}
              y1={PAD_T}
              x2={mapX(gx)}
              y2={PAD_T + PLOT_H}
              stroke={major ? MAJOR_GRID : MINOR_GRID}
              strokeWidth={major ? 1 : 0.65}
            />
          );
        })}
        {yTicks.map((gy) => {
          const major = Math.abs(gy) < 1e-9 || (yStep >= 1 && Math.abs(gy % (yStep * 2)) < 1e-9);
          return (
            <line
              key={`hy-${gy}`}
              x1={PAD_L}
              y1={mapY(gy)}
              x2={PAD_L + PLOT_W}
              y2={mapY(gy)}
              stroke={major ? MAJOR_GRID : MINOR_GRID}
              strokeWidth={major ? 1 : 0.65}
            />
          );
        })}
      </g>

      {showXAxis && <line x1={PAD_L} y1={y0} x2={PAD_L + PLOT_W} y2={y0} stroke={AXIS} strokeWidth={1.75} />}
      {showYAxis && <line x1={x0} y1={PAD_T} x2={x0} y2={PAD_T + PLOT_H} stroke={AXIS} strokeWidth={1.75} />}

      {xTicks.map((xv) => (
        <text
          key={`xt-${xv}`}
          x={mapX(xv)}
          y={PAD_T + PLOT_H + 22}
          textAnchor="middle"
          fill={LABEL}
          fontSize={11}
          fontFamily='system-ui, "Segoe UI", sans-serif'
        >
          {formatTick(xv, xStep)}
        </text>
      ))}
      {yTicks.map((yv) => (
        <text
          key={`yt-${yv}`}
          x={PAD_L - 10}
          y={mapY(yv)}
          textAnchor="end"
          dominantBaseline="middle"
          fill={LABEL}
          fontSize={11}
          fontFamily='system-ui, "Segoe UI", sans-serif'
        >
          {formatTick(yv, yStep)}
        </text>
      ))}
    </>
  );
}

/** Renders accessible controls for showing or hiding each plotted series. */
function SeriesLegend({
  spec,
  expressions,
  visibleSeriesIds,
  onToggleSeries,
}: {
  spec: FunctionPlotCanvas;
  expressions: Record<string, string>;
  visibleSeriesIds: Set<string>;
  onToggleSeries: (seriesId: string) => void;
}) {
  const legendId = useId().replace(/:/g, "");
  return (
    <div role="group" aria-label="Fungsi pada grafik" className="flex min-w-0 flex-wrap items-center gap-2">
      {spec.series.map((series, idx) => {
        const rawExpr = expressions[series.id] ?? series.expression;
        const latexFormatted = safeExpressionToLatex(
          rawExpr,
          ["x", ...spec.variables.map((v) => v.id)],
        );
        const isVisible = visibleSeriesIds.has(series.id);
        const color = idx === 0 ? GRAPH_BLUE : GRAPH_SECONDARY;
        return (
          <button
            key={series.id}
            type="button"
            aria-label={`${isVisible ? "Sembunyikan" : "Tampilkan"} ${series.label}`}
            aria-describedby={`graph-equation-${legendId}-${idx}`}
            aria-pressed={isVisible}
            onClick={() => onToggleSeries(series.id)}
            className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left text-body-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border border-transparent px-1.5 text-body-xs font-bold text-white shadow-xs",
                !isVisible && "opacity-50",
              )}
              style={{ backgroundColor: color }}
              aria-hidden
            >
              {series.label.length <= 2 ? series.label : `f${idx + 1}`}
            </span>
            <span
              aria-hidden
              className={cn("h-0 w-7 shrink-0", !isVisible && "opacity-40")}
              style={{
                borderTop: `2px ${series.lineStyle === "dashed" ? "dashed" : series.lineStyle === "dotted" ? "dotted" : "solid"} ${color}`,
              }}
            />
            <span id={`graph-equation-${legendId}-${idx}`} className="min-w-0 max-w-full">
              <MathText as="span" className={cn("text-body-sm font-semibold tracking-tight text-foreground", !isVisible && "opacity-60")}>
                {`y = \\(${latexFormatted}\\)`}
              </MathText>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function VariableControls({
  spec,
  values,
  setValues,
  onResetAll,
}: {
  spec: FunctionPlotCanvas;
  values: Record<string, number>;
  setValues: Dispatch<SetStateAction<Record<string, number>>>;
  onResetAll: () => void;
}) {
  if (spec.controls.length === 0) return null;
  return (
    <div className="border-t border-border bg-card px-4 py-3.5 md:px-5 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {spec.controls.map((control) => {
          const variable = spec.variables.find((item) => item.id === control.variableId);
          if (!variable) return null;
          const value = values[variable.id] ?? variable.defaultValue;
          return (
            <div key={control.variableId} className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-body-sm font-semibold text-foreground">
                  {control.label}: <span className="text-brand-primary font-bold">{formatNum(value)}</span>
                </span>
                {control.presets && control.presets.length > 0 && (
                  <div className="flex gap-1">
                    {control.presets.slice(0, 4).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setValues((curr) => ({ ...curr, [variable.id]: p }))}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors",
                          value === p
                            ? "bg-brand-primary text-white font-bold"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={value}
                aria-label={`Ubah nilai ${control.label}`}
                className="h-1.5 w-full cursor-pointer accent-brand-secondary"
                onChange={(event) => setValues((current) => ({
                  ...current,
                  [variable.id]: Number(event.target.value),
                }))}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 text-body-xs text-muted-foreground">
        <span>Geser koefisien untuk melihat perubahan kurva secara interaktif.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResetAll}
        >
          Reset visual
        </Button>
      </div>
    </div>
  );
}

/** Renders an interactive function plot with editable formulas and series visibility. */
function FunctionPlot({ spec }: { spec: FunctionPlotCanvas }) {
  const uid = useId().replace(/:/g, "");
  const [values, setValues] = useState(() => valuesForSpec(spec));
  const [expressions, setExpressions] = useState<Record<string, string>>(() => (
    Object.fromEntries(spec.series.map((series) => [series.id, series.expression]))
  ));
  const [visibleSeriesIds, setVisibleSeriesIds] = useState<Set<string>>(() => (
    new Set(spec.series.map((series) => series.id))
  ));
  const [showFormulaInput, setShowFormulaInput] = useState(false);
  const [hoverData, setHoverData] = useState<{
    label: string;
    color: string;
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);

  const defaultView = useMemo(() => fitFunctionViewport(spec), [spec]);
  const { view, isDragging, resetView, nudge, zoomBy, bind } = useInteractiveViewport(defaultView);

  const sampledSpec = useMemo(
    () => ({
      ...spec,
      domain: { ...spec.domain, min: view.xMin, max: view.xMax, sampleCount: 241 },
    }),
    [spec, view.xMin, view.xMax],
  );

  const evaluated = useMemo(
    () => evaluateFunctionPlot(sampledSpec, values, expressions),
    [sampledSpec, values, expressions],
  );

  const invalidSeries = evaluated.filter((series) => series.points.every((point) => point.y === null));

  const mapX = useCallback((x: number) => PAD_L + ((x - view.xMin) / (view.xMax - view.xMin)) * PLOT_W, [view.xMin, view.xMax]);
  const mapY = useCallback((y: number) => PAD_T + ((view.yMax - y) / (view.yMax - view.yMin)) * PLOT_H, [view.yMin, view.yMax]);

  const seriesPaths = useMemo(() => {
    return evaluated.map((series, idx) => {
      let path = "";
      let started = false;
      const points = series.points;
      const marginY = finiteSpan(view.yMin, view.yMax);
      for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        if (!pt || pt.y === null || !Number.isFinite(pt.y)) {
          started = false;
          continue;
        }
        const clampedY = clamp(pt.y, view.yMin - marginY, view.yMax + marginY);
        const px = mapX(pt.x);
        const py = mapY(clampedY);
        if (!started) {
          path += `M ${px.toFixed(1)} ${py.toFixed(1)}`;
          started = true;
        } else {
          path += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
        }
      }
      return {
        id: series.id,
        path,
        color: idx === 0 ? GRAPH_BLUE : GRAPH_SECONDARY,
        visible: visibleSeriesIds.has(series.id),
      };
    });
  }, [evaluated, mapX, mapY, view.yMin, view.yMax, visibleSeriesIds]);

  const roots = useMemo(() => {
    return evaluated.flatMap((series, seriesIndex) => {
      if (!visibleSeriesIds.has(series.id)) return [];
      const result: Array<{ id: string; x: number; color: string }> = [];
      for (let i = 1; i < series.points.length; i += 1) {
        const prev = series.points[i - 1];
        const curr = series.points[i];
        if (!prev || !curr || prev.y === null || curr.y === null) continue;
        if (Math.sign(prev.y) === Math.sign(curr.y)) continue;
        if (Math.abs(prev.y - curr.y) > (view.yMax - view.yMin) * 0.8) continue;
        const ratio = Math.abs(prev.y) / (Math.abs(prev.y) + Math.abs(curr.y));
        const rootX = prev.x + (curr.x - prev.x) * ratio;
        if (Number.isFinite(rootX) && rootX >= view.xMin && rootX <= view.xMax) {
          result.push({
            id: `${series.id}-root-${i}`,
            x: rootX,
            color: seriesIndex === 0 ? GRAPH_BLUE : GRAPH_SECONDARY,
          });
        }
      }
      return result;
    });
  }, [evaluated, visibleSeriesIds, view.xMin, view.xMax, view.yMin, view.yMax]);

  const handleHoverMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (isDragging) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const py = ((e.clientY - rect.top) / rect.height) * SVG_H;
    if (px < PAD_L || px > PAD_L + PLOT_W || py < PAD_T || py > PAD_T + PLOT_H) {
      setHoverData(null);
      return;
    }
    let closest: {
      label: string;
      color: string;
      x: number;
      y: number;
      px: number;
      py: number;
      distanceSquared: number;
    } | null = null;
    const ySpan = finiteSpan(view.yMin, view.yMax);
    for (let seriesIndex = 0; seriesIndex < evaluated.length; seriesIndex += 1) {
      const series = evaluated[seriesIndex];
      if (!series || !visibleSeriesIds.has(series.id)) continue;
      for (const point of series.points) {
        if (point.y === null || !Number.isFinite(point.y)) continue;
        const pointPx = mapX(point.x);
        const pointPy = mapY(clamp(point.y, view.yMin - ySpan, view.yMax + ySpan));
        const dx = pointPx - px;
        const dy = pointPy - py;
        const distanceSquared = dx * dx + dy * dy;
        if (!closest || distanceSquared < closest.distanceSquared) {
          closest = {
            label: series.label,
            color: seriesIndex === 0 ? GRAPH_BLUE : GRAPH_SECONDARY,
            x: point.x,
            y: point.y,
            px: pointPx,
            py: pointPy,
            distanceSquared,
          };
        }
      }
    }
    if (closest && closest.distanceSquared <= 24 * 24) {
      setHoverData({
        label: closest.label,
        color: closest.color,
        x: closest.x,
        y: closest.y,
        px: closest.px,
        py: closest.py,
      });
      return;
    }
    setHoverData(null);
  };

  const hasPlottableCurve = evaluated.some((series) => visibleSeriesIds.has(series.id) && series.points.some((point) => point.y !== null));

  const toggleSeries = useCallback((seriesId: string) => {
    setVisibleSeriesIds((current) => {
      const next = new Set(current);
      if (next.has(seriesId)) next.delete(seriesId);
      else next.add(seriesId);
      return next;
    });
    setHoverData(null);
  }, []);

  const handlePlotKeyDown = useCallback((event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "+" || event.key === "=" || event.key === "-" || event.key === "0") {
      event.preventDefault();
    }
    if (event.key === "ArrowLeft") nudge(-0.1, 0);
    else if (event.key === "ArrowRight") nudge(0.1, 0);
    else if (event.key === "ArrowUp") nudge(0, 0.1);
    else if (event.key === "ArrowDown") nudge(0, -0.1);
    else if (event.key === "+" || event.key === "=") zoomBy(0.8);
    else if (event.key === "-") zoomBy(1.25);
    else if (event.key === "0") resetView();
  }, [nudge, resetView, zoomBy]);

  const resetAll = useCallback(() => {
    setValues(valuesForSpec(spec));
    setExpressions(Object.fromEntries(spec.series.map((s) => [s.id, s.expression])));
    setVisibleSeriesIds(new Set(spec.series.map((series) => series.id)));
    setHoverData(null);
    resetView();
  }, [spec, resetView]);

  return (
    <div className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-md ring-1 ring-black/5">
      <div className="flex max-w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <SeriesLegend
          spec={spec}
          expressions={expressions}
          visibleSeriesIds={visibleSeriesIds}
          onToggleSeries={toggleSeries}
        />
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={resetView}
            className="text-body-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset tampilan
          </button>
          <button
            type="button"
            onClick={() => setShowFormulaInput((prev) => !prev)}
            className="text-body-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showFormulaInput ? "Sembunyikan edit rumus" : "Ubah rumus"}
          </button>
        </div>
      </div>

      {showFormulaInput && (
        <div className="border-b border-border bg-muted/20 px-4 py-3 space-y-2">
          {spec.series.map((series) => (
            <label key={series.id} className="block space-y-1 text-body-sm font-semibold text-foreground">
              <span>{series.label}</span>
              <Input
                value={expressions[series.id] ?? ""}
                aria-label={`Formula ${series.label}`}
                onChange={(event) => setExpressions((current) => ({
                  ...current,
                  [series.id]: event.target.value,
                }))}
                className="font-mono bg-background"
                placeholder="misal: a*x^2 + b*x + c"
              />
              {invalidSeries.some((item) => item.id === series.id) && (
                <span role="alert" className="block text-body-xs font-normal text-status-error">
                  Rumus belum dapat dibaca. Gunakan angka, variabel yang tersedia, dan operasi matematika dasar.
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      <div className="relative w-full bg-card overflow-hidden select-none">
        <svg
          {...bind}
          className="block h-auto w-full touch-none"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
          tabIndex={0}
          aria-describedby={hoverData ? `graph-tooltip-${uid}` : undefined}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Plus = Minus 0"
          aria-label={`${spec.altText} Seret untuk menggeser, scroll untuk memperbesar, klik dua kali untuk mengatur ulang. Dengan keyboard, gunakan tombol panah untuk menggeser, Plus atau sama dengan untuk memperbesar, Minus untuk memperkecil, dan 0 untuk mengatur ulang.`}
          onMouseMove={handleHoverMove}
          onMouseLeave={() => setHoverData(null)}
          onKeyDown={handlePlotKeyDown}
        >
          <rect x="0" y="0" width={SVG_W} height={SVG_H} fill={BG} />

          <GridLayer view={view} mapX={mapX} mapY={mapY} />

          <clipPath id={`plot-clip-${uid}`}>
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} />
          </clipPath>

          {seriesPaths.map((series, idx) => (
            <path
              key={series.id}
              data-series-id={series.id}
              d={series.path}
              fill="none"
              stroke={series.color}
              strokeWidth={3}
              strokeDasharray={spec.series[idx]?.lineStyle === "dashed" ? "8 6" : spec.series[idx]?.lineStyle === "dotted" ? "2 5" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              display={series.visible ? undefined : "none"}
              clipPath={`url(#plot-clip-${uid})`}
            />
          ))}

          {roots.map((root) => (
            <circle
              key={root.id}
              cx={mapX(root.x)}
              cy={mapY(0)}
              r={4}
              fill="var(--color-card)"
              stroke={root.color}
              strokeWidth={2}
              clipPath={`url(#plot-clip-${uid})`}
            />
          ))}

          {hoverData && (
            <g clipPath={`url(#plot-clip-${uid})`}>
              <line
                x1={hoverData.px}
                y1={PAD_T}
                x2={hoverData.px}
                y2={PAD_T + PLOT_H}
                stroke="var(--color-muted-foreground)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <line
                x1={PAD_L}
                y1={hoverData.py}
                x2={PAD_L + PLOT_W}
                y2={hoverData.py}
                stroke="var(--color-muted-foreground)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={hoverData.px}
                cy={hoverData.py}
                r={5}
                fill={hoverData.color}
                stroke="var(--color-card)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {!hasPlottableCurve && (
          <div className="absolute inset-x-6 bottom-3 rounded-lg border border-status-warning/30 bg-background/95 p-2.5 text-left text-body-xs text-foreground shadow-sm">
            {visibleSeriesIds.size === 0
              ? "Tidak ada fungsi yang ditampilkan. Aktifkan fungsi di atas untuk melihat kurvanya."
              : "Grafik belum dapat digambar pada tampilan ini. Coba geser atau atur ulang tampilan, atau periksa kembali rumusnya."}
          </div>
        )}

        {hoverData && (
          <div
            id={`graph-tooltip-${uid}`}
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-[calc(100%-1.5rem)] rounded-md border border-border bg-popover/95 px-2.5 py-1.5 text-body-xs text-popover-foreground shadow-sm backdrop-blur-xs"
            style={{
              left: `clamp(0.75rem, ${((hoverData.px / SVG_W) * 100).toFixed(2)}%, calc(100% - 12rem))`,
              top: `clamp(0.75rem, calc(${((hoverData.py / SVG_H) * 100).toFixed(2)}% - 3.25rem), calc(100% - 3rem))`,
            }}
          >
            <span className="block font-semibold" style={{ color: hoverData.color }}>{hoverData.label}</span>
            <span className="font-mono">x: {formatNum(hoverData.x)}, y: {formatNum(hoverData.y)}</span>
          </div>
        )}
      </div>

      <VariableControls
        spec={spec}
        values={values}
        setValues={setValues}
        onResetAll={resetAll}
      />

    </div>
  );
}

function FallbackTable({ spec }: { spec: CanvasSpec }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-body-sm text-muted-foreground">{spec.fallback.summary}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">{spec.altText}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              {spec.fallback.columns.map((column) => (
                <th key={column.id} className="px-2 py-1.5 font-semibold text-foreground">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.fallback.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/60">
                {spec.fallback.columns.map((column, columnIndex) => (
                  <td key={column.id} className="px-2 py-1 font-mono">
                    {row[columnIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fitDataViewport(spec: DataPlotCanvas): Viewport {
  const xValues = spec.points.map((point) => point.x);
  const yValues = spec.points.map((point) => point.y);
  const rawXMin = Math.min(...xValues);
  const rawXMax = Math.max(...xValues);
  const rawYMin = Math.min(...yValues);
  const rawYMax = Math.max(...yValues);
  const xSpan = Math.max(1, rawXMax - rawXMin);
  const ySpan = Math.max(1, rawYMax - rawYMin);
  return {
    xMin: rawXMin - xSpan * 0.15,
    xMax: rawXMax + xSpan * 0.15,
    yMin: rawYMin - ySpan * 0.15,
    yMax: rawYMax + ySpan * 0.15,
  };
}

function DataPlot({ spec }: { spec: DataPlotCanvas }) {
  const uid = useId().replace(/:/g, "");
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  const defaultView = useMemo(() => fitDataViewport(spec), [spec]);
  const { view, isDragging, resetView, bind } = useInteractiveViewport(defaultView);

  const mapX = useCallback((x: number) => PAD_L + ((x - view.xMin) / (view.xMax - view.xMin)) * PLOT_W, [view.xMin, view.xMax]);
  const mapY = useCallback((y: number) => PAD_T + ((view.yMax - y) / (view.yMax - view.yMin)) * PLOT_H, [view.yMin, view.yMax]);

  const linePath = useMemo(() => {
    if (spec.points.length === 0) return "";
    return spec.points.reduce((acc, pt, idx) => {
      const px = mapX(pt.x);
      const py = mapY(pt.y);
      return idx === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : `${acc} L ${px.toFixed(1)} ${py.toFixed(1)}`;
    }, "");
  }, [spec.points, mapX, mapY]);

  return (
    <div className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-md ring-1 ring-black/5">
      <div className="flex max-w-full min-w-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <span className="min-w-0 truncate font-mono text-body-sm font-semibold text-foreground">
          {spec.xLabel} vs {spec.yLabel}
        </span>
        <button
          type="button"
          onClick={resetView}
          className="shrink-0 pl-3 text-body-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset tampilan
        </button>
      </div>
      <div className="relative w-full bg-card overflow-hidden select-none">
        <svg
          {...bind}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
          aria-label={`${spec.altText} Seret untuk menggeser, scroll untuk memperbesar, klik dua kali untuk mengatur ulang.`}
        >
          <rect x="0" y="0" width={SVG_W} height={SVG_H} fill={BG} />

          <GridLayer view={view} mapX={mapX} mapY={mapY} />

          <clipPath id={`data-clip-${uid}`}>
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} />
          </clipPath>

          {linePath && (
            <path d={linePath} fill="none" stroke={GRAPH_BLUE} strokeWidth={2} strokeDasharray="4 4" clipPath={`url(#data-clip-${uid})`} />
          )}

          {spec.points.map((pt, idx) => {
            const px = mapX(pt.x);
            const py = mapY(pt.y);
            if (px < PAD_L || px > PAD_L + PLOT_W || py < PAD_T || py > PAD_T + PLOT_H) return null;
            return (
              <circle
                key={idx}
                cx={px}
                cy={py}
                r={5}
                fill={GRAPH_BLUE}
                stroke="var(--color-card)"
                strokeWidth={2}
                className="cursor-pointer transition-transform hover:scale-125"
                style={{ pointerEvents: isDragging ? "none" : undefined }}
                onMouseEnter={() => setHoverPoint({ x: pt.x, y: pt.y, px, py })}
                onMouseLeave={() => setHoverPoint(null)}
              />
            );
          })}
        </svg>

        {hoverPoint && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-popover/90 px-2.5 py-1 text-body-xs font-mono font-medium text-popover-foreground shadow-sm backdrop-blur-xs">
            {spec.xLabel}: {formatNum(hoverPoint.x)}, {spec.yLabel}: {formatNum(hoverPoint.y)}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-muted/10 px-4 py-3">
        <details className="text-body-sm group">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
            Lihat tabel data ({spec.points.length} titik)
          </summary>
          <div className="mt-3 overflow-x-auto max-h-48">
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-2 py-1 font-semibold">{spec.xLabel}</th>
                  <th className="px-2 py-1 font-semibold">{spec.yLabel}</th>
                </tr>
              </thead>
              <tbody>
                {spec.points.map((point, index) => (
                  <tr key={`${point.x}-${point.y}-${index}`} className="border-b border-border/60">
                    <td className="px-2 py-1 font-mono">{point.x}</td>
                    <td className="px-2 py-1 font-mono">{point.y}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}

function Derivation({ spec }: { spec: DerivationCanvas }) {
  return (
    <ol className="space-y-3" aria-label={spec.altText}>
      {spec.steps.map((step, index) => (
        <li key={step.id} className="grid gap-1 rounded-lg border border-border bg-background p-3 md:grid-cols-[2rem_1fr]">
          <span className="font-semibold text-muted-foreground">{index + 1}.</span>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{step.label}</p>
            <MathText as="div" className="overflow-x-auto text-body-sm text-foreground">{`$$${step.expression}$$`}</MathText>
            <p className="text-body-sm text-muted-foreground">{step.explanation}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Diagram({ spec }: { spec: DiagramCanvas }) {
  const markerId = useId().replace(/:/g, "");
  const width = 720;
  const columns = spec.direction === "down" ? 1 : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(spec.nodes.length))));
  const rows = Math.ceil(spec.nodes.length / columns);
  const height = Math.max(180, rows * 84 + 36);
  const positions = new Map(spec.nodes.map((node, index) => [
    node.id,
    {
      x: columns === 1 ? width / 2 : ((index % columns) + 0.5) * (width / columns),
      y: (Math.floor(index / columns) + 0.5) * (height / rows),
    },
  ]));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.altText} className="h-auto min-w-[560px] w-full">
          <title>{spec.altText}</title>
          <defs>
            <marker id={`${markerId}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted-foreground)" />
            </marker>
          </defs>
          {spec.edges.map((edge, index) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) return null;
            return (
              <g key={`${edge.source}-${edge.target}-${index}`}>
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="var(--color-muted-foreground)" strokeWidth="2" markerEnd={`url(#${markerId}-arrow)`} />
                {edge.label && (
                  <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="11">
                    {edge.label.slice(0, 28)}
                  </text>
                )}
              </g>
            );
          })}
          {spec.nodes.map((node) => {
            const position = positions.get(node.id);
            if (!position) return null;
            return (
              <g key={node.id}>
                <rect x={position.x - 76} y={position.y - 22} width="152" height="44" rx="8" fill="var(--color-muted)" stroke="var(--color-primary)" />
                <text x={position.x} y={position.y + 5} textAnchor="middle" fill="var(--color-foreground)" fontSize="13">
                  {node.label.slice(0, 24)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <FallbackTable spec={spec} />
    </div>
  );
}

function VectorDiagram({ spec }: { spec: VectorCanvas }) {
  const width = 720;
  const height = 320;
  const max = Math.max(1, ...spec.vectors.flatMap((vector) => [Math.abs(vector.x), Math.abs(vector.y)]));
  const origin = { x: width / 2, y: height / 2 };
  const scale = (Math.min(width, height) * 0.34) / max;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.altText} className="h-auto min-w-[560px] w-full">
          <title>{spec.altText}</title>
          <line x1={origin.x} y1="20" x2={origin.x} y2={height - 20} stroke="var(--color-border)" />
          <line x1="20" y1={origin.y} x2={width - 20} y2={origin.y} stroke="var(--color-border)" />
          {spec.vectors.map((vector, index) => {
            const endX = origin.x + vector.x * scale;
            const endY = origin.y - vector.y * scale;
            return (
              <g key={vector.id}>
                <line x1={origin.x} y1={origin.y} x2={endX} y2={endY} stroke={index % 2 === 0 ? "var(--color-primary)" : "var(--color-secondary)"} strokeWidth="3" />
                <circle cx={endX} cy={endY} r="5" fill="var(--color-primary)" />
                <text x={endX + 7} y={endY - 7} fill="var(--color-foreground)" fontSize="13">
                  {vector.label.slice(0, 20)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <FallbackTable spec={spec} />
    </div>
  );
}

function ChemistryReaction({ spec }: { spec: ChemistryCanvas }) {
  const format = (items: ChemistryCanvas["reactants"]) =>
    items.map((item) => `${item.coefficient === 1 ? "" : `${item.coefficient} `}${item.formula}`).join(" + ");
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-border bg-background p-4 text-center font-mono text-body-base text-foreground" aria-label={spec.altText}>
        {format(spec.reactants)} → {format(spec.products)}
      </p>
      <FallbackTable spec={spec} />
    </div>
  );
}

export function LearningCanvasRenderer({ spec, embedded = false }: { spec: CanvasSpec; embedded?: boolean }) {
  const titleId = useId();
  const compactPlot = embedded && spec.type === "function_plot";
  return (
    <section aria-labelledby={compactPlot ? undefined : titleId} aria-label={compactPlot ? spec.title : undefined} className={compactPlot ? "w-full min-w-0" : "my-6 w-full min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 md:p-5"}>
      {!compactPlot ? <div>
        <h3 id={titleId} className="font-heading text-body-base font-semibold text-foreground">
          {spec.title}
        </h3>
        <p className="mt-1 text-body-sm text-muted-foreground">{spec.purpose}</p>
      </div> : null}
      {spec.type === "function_plot" ? (
        <FunctionPlot spec={spec} />
      ) : spec.type === "data_plot" ? (
        <DataPlot spec={spec} />
      ) : spec.type === "derivation" ? (
        <Derivation spec={spec} />
      ) : spec.type === "flowchart" || spec.type === "concept_map" ? (
        <Diagram spec={spec} />
      ) : spec.type === "vector_diagram" || spec.type === "free_body" ? (
        <VectorDiagram spec={spec} />
      ) : spec.type === "chemistry_reaction" ? (
        <ChemistryReaction spec={spec} />
      ) : (
        <FallbackTable spec={spec} />
      )}
    </section>
  );
}
