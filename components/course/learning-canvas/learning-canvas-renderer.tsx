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
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MathText } from "@/components/course/math-text";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { fitNumericRange, isRepresentableRange, normalizedVectorComponent, zoomNumericRange } from "@/lib/zyra/canvas/viewport";
import { scientificNumberToLatex, scientificNumberToText, scientificValueToMathText } from "@/lib/math/scientific-format";
import { ChevronDown, RotateCcw, SlidersHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
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

const SERIES_PALETTE = [
  "#38bdf8", // Vibrant Sky / Cyan Blue
  "#fb923c", // Warm Coral / Amber Orange
  "#a78bfa", // Soft Violet
  "#34d399", // Emerald Mint
];

function getSeriesColor(index: number): string {
  return SERIES_PALETTE[index % SERIES_PALETTE.length] ?? "#38bdf8";
}

const GRAPH_BLUE = SERIES_PALETTE[0];
const BG = "transparent";
const FlowchartDiagramRenderer = dynamic(() => import("@/components/course/markdown/flowchart-diagram-renderer").then(module => module.FlowchartDiagramRenderer), { ssr: false });

const PAD_L = 84;
const PAD_R = 18;
const PAD_T = 30;
const PAD_B = 62;
const SVG_W = 600;
const SVG_H = 312;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

const UNAVAILABLE_VIEW: Viewport = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

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
  return max - min;
}

function anchoredZoom(view: Viewport, factor: number, fx: number, fy: number): Viewport {
  const x = zoomNumericRange({ min: view.xMin, max: view.xMax }, factor, fx);
  const y = zoomNumericRange({ min: view.yMin, max: view.yMax }, factor, 1 - fy);
  return x && y ? { xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max } : view;
}

function translated(view: Viewport, dx: number, dy: number): Viewport {
  const result = {
    xMin: view.xMin + dx,
    xMax: view.xMax + dx,
    yMin: view.yMin + dy,
    yMax: view.yMax + dy,
  };
  return isRepresentableRange({ min: result.xMin, max: result.xMax }) && isRepresentableRange({ min: result.yMin, max: result.yMax }) ? result : view;
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
function useInteractiveViewport(defaultView: Viewport, enabled = true) {
  const [view, setView] = useState<Viewport>(defaultView);
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<PlotGesture | null>(null);
  const defaultViewRef = useRef(defaultView);

  useEffect(() => {
    if (enabled) return;
    const svg = svgRef.current;
    const pointerIds = [...pointersRef.current.keys()];
    pointersRef.current.clear();
    gestureRef.current = null;
    setIsDragging(false);
    for (const id of pointerIds) {
      if (svg?.hasPointerCapture(id)) svg.releasePointerCapture(id);
    }
  }, [enabled]);

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
    if (!svg || !enabled) return;
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
  }, [enabled]);

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!enabled) return;
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
  }, [enabled, svgScale, view]);

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
        "h-auto w-full max-w-full select-none",
        enabled ? (isDragging ? "touch-none cursor-grabbing" : "touch-none cursor-grab") : "touch-auto",
      ),
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onLostPointerCapture: endPointer,
      onDoubleClick: enabled ? resetView : undefined,
    },
  };
}

function valuesForSpec(spec: CanvasSpec): Record<string, number> {
  return resetCanvasValues(spec.variables);
}

function formatNum(n: number) {
  return scientificNumberToText(n);
}

function mathNumber(value: number): string {
  return `$${scientificNumberToLatex(value)}$`;
}

function quantityLabel(label: string, unit?: string | null): string {
  return unit ? `${label} ($\\pu{${unit}}$)` : label;
}

function SvgMathLabel({ x, y, width = 152, height = 64, fontSize = 14, children }: { x: number; y: number; width?: number; height?: number; fontSize?: number; children: string }) {
  return <foreignObject x={x - width / 2} y={y - height / 2} width={width} height={height}>
    <div style={{ fontSize }} className="flex h-full items-center justify-center break-words px-1 text-center text-foreground"><MathText>{children}</MathText></div>
  </foreignObject>;
}

function usePlotLabelSize(ref: RefObject<SVGSVGElement | null>) {
  const [size, setSize] = useState(12);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setSize(Math.max(6, 12 * SVG_W / entry.contentRect.width));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return size;
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
    if (value + step === value) break;
  }
  return ticks;
}

function fitFunctionViewport(spec: FunctionPlotCanvas): Viewport | null {
  const allY = evaluateFunctionPlot(spec).flatMap(series => series.points.flatMap(point => point.y === null ? [] : [point.y]));
  const x = fitNumericRange([spec.domain.min, spec.domain.max], 0.05);
  const y = fitNumericRange(allY, 0.12);
  if (!x || !y) return null;
  if (spec.equalAxisScale) {
    const scale = Math.max((x.max - x.min) / PLOT_W, (y.max - y.min) / PLOT_H);
    const cx = x.min + (x.max - x.min) / 2;
    const cy = y.min + (y.max - y.min) / 2;
    const result = { xMin: cx - scale * PLOT_W / 2, xMax: cx + scale * PLOT_W / 2, yMin: cy - scale * PLOT_H / 2, yMax: cy + scale * PLOT_H / 2 };
    return isRepresentableRange({ min: result.xMin, max: result.xMax }) && isRepresentableRange({ min: result.yMin, max: result.yMax }) ? result : null;
  }
  return { xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max };
}

function GridLayer({
  view,
  mapX,
  mapY,
  labelSize = 10,
  xLabel,
  yLabel,
}: {
  view: Viewport;
  mapX: (x: number) => number;
  mapY: (y: number) => number;
  labelSize?: number;
  xLabel?: string;
  yLabel?: string;
}) {
  const xSpan = finiteSpan(view.xMin, view.xMax);
  const ySpan = finiteSpan(view.yMin, view.yMax);
  const xStep = useMemo(() => niceStep(xSpan * Math.max(1, labelSize / 12)), [xSpan, labelSize]);
  const yStep = useMemo(() => niceStep(ySpan * Math.max(1, labelSize / 12)), [ySpan, labelSize]);
  const xTicks = useMemo(() => tickValues(view.xMin, view.xMax, xStep), [view.xMin, view.xMax, xStep]);
  const yTicks = useMemo(() => tickValues(view.yMin, view.yMax, yStep), [view.yMin, view.yMax, yStep]);
  const showXAxis = view.yMin < 0 && view.yMax > 0;
  const showYAxis = view.xMin < 0 && view.xMax > 0;
  const axisExponent = (min: number, max: number) => {
    const magnitude = Math.max(Math.abs(min), Math.abs(max));
    return magnitude > 0 && (magnitude < 0.01 || magnitude >= 10000) ? Math.floor(Math.log10(magnitude)) : 0;
  };
  const xExponent = axisExponent(view.xMin, view.xMax);
  const yExponent = axisExponent(view.yMin, view.yMax);
  const y0 = mapY(0);
  const x0 = mapX(0);

  return (
    <>
      <defs>
        <marker id="axis-arrow-x" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 1 L 6 3 L 0 5 z" fill="var(--color-muted-foreground)" opacity={0.7} />
        </marker>
        <marker id="axis-arrow-y" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 1 L 6 3 L 0 5 z" fill="var(--color-muted-foreground)" opacity={0.7} />
        </marker>
      </defs>

      <g aria-hidden>
        {xTicks.map((gx) => {
          const isOrigin = Math.abs(gx) < 1e-9;
          const major = isOrigin || (xStep >= 1 && Math.abs(gx % (xStep * 2)) < 1e-9);
          return (
            <line
              key={`vx-${gx}`}
              x1={mapX(gx)}
              y1={PAD_T}
              x2={mapX(gx)}
              y2={PAD_T + PLOT_H}
              stroke="var(--color-border)"
              strokeOpacity={major ? 0.35 : 0.15}
              strokeWidth={major ? 0.75 : 0.5}
            />
          );
        })}
        {yTicks.map((gy) => {
          const isOrigin = Math.abs(gy) < 1e-9;
          const major = isOrigin || (yStep >= 1 && Math.abs(gy % (yStep * 2)) < 1e-9);
          return (
            <line
              key={`hy-${gy}`}
              x1={PAD_L}
              y1={mapY(gy)}
              x2={PAD_L + PLOT_W}
              y2={mapY(gy)}
              stroke="var(--color-border)"
              strokeOpacity={major ? 0.35 : 0.15}
              strokeWidth={major ? 0.75 : 0.5}
            />
          );
        })}
      </g>

      {/* Axis lines with arrows */}
      {showXAxis && (
        <line
          x1={PAD_L}
          y1={y0}
          x2={PAD_L + PLOT_W + 8}
          y2={y0}
          stroke="var(--color-muted-foreground)"
          strokeOpacity={0.65}
          strokeWidth={1.25}
          markerEnd="url(#axis-arrow-x)"
        />
      )}
      {showYAxis && (
        <line
          x1={x0}
          y1={PAD_T + PLOT_H}
          x2={x0}
          y2={PAD_T - 8}
          stroke="var(--color-muted-foreground)"
          strokeOpacity={0.65}
          strokeWidth={1.25}
          markerEnd="url(#axis-arrow-y)"
        />
      )}

      {/* Axis quantities stay separate from numeric ticks. */}
      <SvgMathLabel x={PAD_L + PLOT_W / 2} y={PAD_T + PLOT_H + 43} width={300} height={38} fontSize={labelSize}>{`${xLabel ?? "$x$"}${xExponent ? ` $\\times10^{${xExponent}}$` : ""}`}</SvgMathLabel>
      <SvgMathLabel x={PAD_L + 110} y={16} width={300} height={38} fontSize={labelSize}>{`${yLabel ?? "$y$"}${yExponent ? ` $\\times10^{${yExponent}}$` : ""}`}</SvgMathLabel>
      {/* Numbers */}
      {xTicks.map((xv) => {
        if (xv === 0 && showYAxis) return null;
        return (
          <SvgMathLabel key={`xt-${xv}`} x={mapX(xv)} y={PAD_T + PLOT_H + 18} width={80} height={38} fontSize={labelSize}>{mathNumber(xv / 10 ** xExponent)}</SvgMathLabel>
        );
      })}
      {yTicks.map((yv) => {
        if (yv === 0 && showXAxis) return null;
        return (
          <SvgMathLabel key={`yt-${yv}`} x={PAD_L - 42} y={mapY(yv)} width={84} height={38} fontSize={labelSize}>{mathNumber(yv / 10 ** yExponent)}</SvgMathLabel>
        );
      })}

      {/* Center 0 label */}
      {showXAxis && showYAxis && view.xMin < 0 && view.xMax > 0 && view.yMin < 0 && view.yMax > 0 && (
        <text
          x={x0 - 8}
          y={y0 + 12}
          textAnchor="end"
          fill="var(--color-muted-foreground)"
          fontSize={labelSize}
          opacity={0.8}
          fontFamily="KaTeX_Main, serif"
        >
          0
        </text>
      )}
    </>
  );
}

/** Renders accessible controls for showing or hiding each plotted series. */
function SeriesLegend({
  spec,
  expressions,
  visibleSeriesIds,
  onToggleSeries,
  compact = false,
}: {
  spec: FunctionPlotCanvas;
  expressions: Record<string, string>;
  visibleSeriesIds: Set<string>;
  onToggleSeries: (seriesId: string) => void;
  compact?: boolean;
}) {
  const t = useTranslations("studentCourse");
  const legendId = useId().replace(/:/g, "");
  return (
    <div role="group" aria-label={t("learningCanvas.functionsOnGraph")} className="flex min-w-0 flex-wrap items-center gap-2">
      {spec.series.map((series, idx) => {
        const rawExpr = expressions[series.id] ?? series.expression;
        const latexFormatted = safeExpressionToLatex(
          rawExpr,
          ["x", ...spec.variables.map((v) => v.id)],
        );
        const isVisible = visibleSeriesIds.has(series.id);
        const color = getSeriesColor(idx);
        return (
          <button
            key={series.id}
            type="button"
            aria-label={t(isVisible ? "learningCanvas.hideSeries" : "learningCanvas.showSeries", { series: series.label })}
            aria-describedby={`graph-equation-${legendId}-${idx}`}
            aria-pressed={isVisible}
            onClick={() => onToggleSeries(series.id)}
            className={cn(
              "group inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border px-2.5 py-1 text-left text-body-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact && "gap-1.5 border-transparent px-1.5 shadow-none",
              isVisible
                ? "border-border/70 bg-muted/30 text-foreground hover:bg-muted/50 shadow-2xs"
                : "border-transparent bg-muted/10 text-muted-foreground opacity-55 hover:opacity-80",
            )}
          >
            <span className="flex items-center gap-1.5" aria-hidden>
              {!compact && <span
                className="inline-block h-2 w-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                style={{ backgroundColor: color }}
              />}
              <span
                className="h-0 w-4 shrink-0"
                style={{
                  borderTop: `2px ${series.lineStyle === "dashed" ? "dashed" : series.lineStyle === "dotted" ? "dotted" : "solid"} ${color}`,
                }}
              />
            </span>
            <span id={`graph-equation-${legendId}-${idx}`} className="min-w-0 max-w-full overflow-x-auto">
              <MathText as="span" className={cn("text-body-sm font-semibold tracking-tight text-foreground", !isVisible && "line-through opacity-60")}>
                {`$y = ${latexFormatted}${series.unit ? `\\quad [\\pu{${series.unit}}]` : ""}$`}
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
  compact = false,
}: {
  spec: FunctionPlotCanvas;
  values: Record<string, number>;
  setValues: Dispatch<SetStateAction<Record<string, number>>>;
  onResetAll: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("studentCourse");
  if (spec.controls.length === 0) return null;
  return (
    <div className={compact ? "space-y-3 border-t border-border py-3" : "border-t border-border bg-card px-4 py-3.5 md:px-5 space-y-3"}>
      <div className={compact ? "space-y-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
        {spec.controls.map((control) => {
          const variable = spec.variables.find((item) => item.id === control.variableId);
          if (!variable) return null;
          const value = values[variable.id] ?? variable.defaultValue;
          return (
            <div key={control.variableId} className={compact ? "space-y-2" : "space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5"}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-body-sm font-semibold text-foreground">
                  <MathText>{`${quantityLabel(control.label, variable.unit)}: ${mathNumber(value)}`}</MathText>
                </span>
                {control.presets && control.presets.length > 0 && (
                  <div className="flex gap-1">
                    {control.presets.slice(0, 4).map((p) => (
                      <button
                        key={p}
                        type="button"
                aria-label={t("learningCanvas.setParameter", { parameter: control.label, value: p })}
                        aria-pressed={value === p}
                        onClick={() => setValues((curr) => ({ ...curr, [variable.id]: p }))}
                        className={cn(
                          "min-h-8 rounded-md px-2 py-1 text-body-sm font-mono font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          value === p
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <MathText>{mathNumber(p)}</MathText>
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
                aria-label={t("learningCanvas.changeValue", { parameter: control.label })}
                className="h-6 w-full cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        {!compact && <span>{t("learningCanvas.dragCoefficients")}</span>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compact ? "text-body-sm" : undefined}
          onClick={onResetAll}
        >
          {compact ? t("learningCanvas.resetParameters") : t("learningCanvas.resetVisualization")}
        </Button>
      </div>
    </div>
  );
}

/** Renders an interactive function plot with editable formulas and series visibility. */
function FunctionPlot({ spec, embedded = false }: { spec: FunctionPlotCanvas; embedded?: boolean }) {
  const t = useTranslations("studentCourse");
  const uid = useId().replace(/:/g, "");
  const editable = !embedded;
  const [interactionActive, setInteractionActive] = useState(false);
  const interactive = !embedded || interactionActive;
  const interactionButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showParameters, setShowParameters] = useState(false);
  const [values, setValues] = useState(() => valuesForSpec(spec));
  const [expressions, setExpressions] = useState<Record<string, string>>(() => (
    Object.fromEntries(spec.series.map((series) => [series.id, series.expression]))
  ));
  const [visibleSeriesIds, setVisibleSeriesIds] = useState<Set<string>>(() => (
    new Set(spec.series.map((series) => series.id))
  ));
  const [showFormulaInput, setShowFormulaInput] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const [hoverData, setHoverData] = useState<{
    label: string;
    color: string;
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);

  const defaultView = useMemo(() => fitFunctionViewport(spec), [spec]);
  const { view, isDragging, resetView, nudge, zoomBy, bind } = useInteractiveViewport(defaultView ?? UNAVAILABLE_VIEW, interactive);
  const labelSize = usePlotLabelSize(bind.ref);

  const finishInteraction = () => {
    setInteractionActive(false);
    setHoverData(null);
    interactionButtonRef.current?.focus();
  };

  const evaluated = useMemo(
    () => evaluateFunctionPlot(spec, values, expressions, { min: view.xMin, max: view.xMax, sampleCount: 241 }),
    [spec, values, expressions, view.xMin, view.xMax],
  );

  const valueTableSpec = useMemo(() => {
    const tableSeries = evaluateFunctionPlot(spec, values, expressions, { min: view.xMin, max: view.xMax, sampleCount: 7 });
    return {
      ...spec,
      fallback: {
        summary: t("learningCanvas.functionTableSummary"),
        columns: [{ id: "x", label: "x" }, ...spec.series.map(series => ({ id: series.id, label: series.label }))],
        rows: (tableSeries[0]?.points ?? []).map(point => [
          mathNumber(point.x),
          ...tableSeries.map(series => {
            const value = series.points.find(sample => sample.x === point.x)?.y;
            return value === null || value === undefined ? "N/A" : mathNumber(value);
          }),
        ]),
      },
    };
  }, [spec, values, expressions, view.xMin, view.xMax, t]);

  const invalidSeries = evaluated.filter((series) => series.points.length > 0 && series.points.every((point) => point.y === null));

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
        color: getSeriesColor(idx),
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
            color: getSeriesColor(seriesIndex),
          });
        }
      }
      return result;
    });
  }, [evaluated, visibleSeriesIds, view.xMin, view.xMax, view.yMin, view.yMax]);

  const intersections = useMemo(() => {
    if (embedded) return [];
    const visibleSeries = evaluated.filter((s) => visibleSeriesIds.has(s.id));
    if (visibleSeries.length < 2) return [];

    const results: Array<{ id: string; x: number; y: number; label: string }> = [];

    for (let i = 0; i < visibleSeries.length - 1; i += 1) {
      for (let j = i + 1; j < visibleSeries.length; j += 1) {
        const s1 = visibleSeries[i];
        const s2 = visibleSeries[j];
        const count = Math.min(s1.points.length, s2.points.length);

        for (let k = 1; k < count; k += 1) {
          const p1Prev = s1.points[k - 1];
          const p1Curr = s1.points[k];
          const p2Prev = s2.points[k - 1];
          const p2Curr = s2.points[k];

          if (
            !p1Prev || !p1Curr || !p2Prev || !p2Curr ||
            p1Prev.y === null || p1Curr.y === null ||
            p2Prev.y === null || p2Curr.y === null
          ) continue;

          const diffPrev = p1Prev.y - p2Prev.y;
          const diffCurr = p1Curr.y - p2Curr.y;

          if (diffPrev === 0 || Math.sign(diffPrev) !== Math.sign(diffCurr)) {
            const denom = Math.abs(diffPrev) + Math.abs(diffCurr);
            const ratio = denom === 0 ? 0 : Math.abs(diffPrev) / denom;
            const ix = p1Prev.x + (p1Curr.x - p1Prev.x) * ratio;
            const iy = p1Prev.y + (p1Curr.y - p1Prev.y) * ratio;

            if (
              Number.isFinite(ix) && Number.isFinite(iy) &&
              ix >= view.xMin && ix <= view.xMax &&
              iy >= view.yMin && iy <= view.yMax
            ) {
              const roundedX = Math.round(ix * 100) / 100;
              const roundedY = Math.round(iy * 100) / 100;
              const exists = results.some(
                (r) => Math.abs(r.x - roundedX) < 0.04 && Math.abs(r.y - roundedY) < 0.04,
              );
              if (!exists) {
                results.push({
                  id: `intersect-${s1.id}-${s2.id}-${k}`,
                  x: roundedX,
                  y: roundedY,
                  label: `(${formatNum(roundedX)}, ${formatNum(roundedY)})`,
                });
              }
            }
          }
        }
      }
    }
    return results;
  }, [embedded, evaluated, visibleSeriesIds, view.xMin, view.xMax, view.yMin, view.yMax]);

  const handleHoverMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (isDragging || !interactive) return;
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
            color: getSeriesColor(seriesIndex),
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
    if (!interactive) return;
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
  }, [interactive, nudge, resetView, zoomBy]);

  const resetAll = useCallback(() => {
    setValues(valuesForSpec(spec));
    setExpressions(Object.fromEntries(spec.series.map((s) => [s.id, s.expression])));
    setVisibleSeriesIds(new Set(spec.series.map((series) => series.id)));
    setHoverData(null);
    resetView();
  }, [spec, resetView]);

  if (!defaultView) return <div className="space-y-2"><p role="status" className="text-body-sm text-muted-foreground">{t("learningCanvas.rangePrecisionWarning")}</p><FallbackTable spec={spec} /></div>;

  return (
    <div
      className="relative mx-auto w-full min-w-0 max-w-full space-y-2"
      onKeyDown={(event) => {
        if (embedded && interactionActive && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finishInteraction();
        }
      }}
    >
      {/* Top Header / Legend (Open Toolbar, Not A Card) */}
      <div className="flex max-w-full min-w-0 flex-wrap items-center justify-between gap-2 px-0.5">
        <SeriesLegend
          spec={spec}
          expressions={expressions}
          visibleSeriesIds={visibleSeriesIds}
          onToggleSeries={toggleSeries}
          compact={embedded}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          {editable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowFormulaInput((prev) => !prev)}
              className="h-8 text-body-xs text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {showFormulaInput ? t("learningCanvas.hideFormulaEditor") : t("learningCanvas.editFormula")}
            </Button>
          ) : null}
        </div>
      </div>

      {editable && showFormulaInput && (
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2">
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

      {/* Math Canvas Viewport */}
      <div className="relative w-full overflow-hidden rounded-xl border border-border/60 bg-muted/15 select-none shadow-2xs transition-colors">
        <svg
          {...bind}
          className={cn(bind.className, "block h-auto w-full md:h-auto")}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
          id={`graph-plot-${uid}`}
          tabIndex={interactive ? 0 : undefined}
          aria-describedby={hoverData ? `graph-tooltip-${uid}` : undefined}
          aria-keyshortcuts={interactive ? "ArrowLeft ArrowRight ArrowUp ArrowDown Plus = Minus 0" : undefined}
          aria-label={interactive ? `${spec.altText} Seret untuk menggeser, scroll untuk memperbesar, klik dua kali untuk mengatur ulang. Dengan keyboard, gunakan tombol panah untuk menggeser, Plus atau sama dengan untuk memperbesar, Minus untuk memperkecil, dan 0 untuk mengatur ulang.` : spec.altText}
          onMouseMove={handleHoverMove}
          onMouseLeave={() => setHoverData(null)}
          onKeyDown={handlePlotKeyDown}
        >
          <rect x="0" y="0" width={SVG_W} height={SVG_H} fill={BG} />

          <GridLayer view={view} mapX={mapX} mapY={mapY} labelSize={labelSize} />

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
              strokeWidth={2.75}
              strokeDasharray={spec.series[idx]?.lineStyle === "dashed" ? "8 6" : spec.series[idx]?.lineStyle === "dotted" ? "2 5" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              display={series.visible ? undefined : "none"}
              clipPath={`url(#plot-clip-${uid})`}
            />
          ))}

          {/* Intersections between curves (Points of Interest) */}
          {!embedded && intersections.map((pt) => {
            const cx = mapX(pt.x);
            const cy = mapY(pt.y);
            return (
              <g key={pt.id} clipPath={`url(#plot-clip-${uid})`} className="cursor-pointer">
                <circle
                  cx={cx}
                  cy={cy}
                  r={7}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  opacity={0.8}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  fill="var(--color-background)"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                >
                  <title>{`Titik potong: (${formatNum(pt.x)}, ${formatNum(pt.y)})`}</title>
                </circle>
                <g transform={`translate(${cx > PAD_L + PLOT_W - 60 ? cx - 52 : cx + 8}, ${cy < PAD_T + 22 ? cy + 16 : cy - 8})`}>
                  <rect
                    x={-3}
                    y={-10}
                    width={formatNum(pt.x).length * 7 + formatNum(pt.y).length * 7 + 18}
                    height={15}
                    rx={4}
                    fill="var(--color-background)"
                    fillOpacity={0.88}
                    stroke="var(--color-border)"
                    strokeWidth={0.75}
                  />
                  <SvgMathLabel x={42} y={0} width={100} height={24} fontSize={11}>{`$(${scientificNumberToLatex(pt.x)}, ${scientificNumberToLatex(pt.y)})$`}</SvgMathLabel>
                </g>
              </g>
            );
          })}

          {(spec.pointMarkers ?? []).filter(marker => visibleSeriesIds.has(marker.seriesId)).map((marker, index) => (
            <g key={`point-${index}`} clipPath={`url(#plot-clip-${uid})`}>
              <circle
                data-point-kind={marker.kind}
                cx={mapX(marker.x)}
                cy={mapY(marker.y)}
                r={6}
                fill={marker.kind === "open" ? "var(--color-background)" : GRAPH_BLUE}
                stroke={GRAPH_BLUE}
                strokeWidth={2.5}
              ><title>{marker.label}</title></circle>
              <SvgMathLabel x={Math.max(PAD_L + 65, Math.min(PAD_L + PLOT_W - 65, mapX(marker.x)))} y={mapY(marker.y) - 22} width={130} height={32}>{marker.label}</SvgMathLabel>
            </g>
          ))}
          {roots.map((root) => (
            <circle
              key={root.id}
              cx={mapX(root.x)}
              cy={mapY(0)}
              r={4}
              fill={root.color}
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
                stroke="var(--color-background)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>



        {!hasPlottableCurve && (
          <div className="m-2 rounded-lg border border-status-warning/30 bg-background/95 p-2.5 text-left text-body-xs text-foreground">
            {visibleSeriesIds.size === 0
              ? t("learningCanvas.noSeriesVisible")
              : t("learningCanvas.plotUnavailable")}
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
            <MathText>{`$x = ${scientificNumberToLatex(hoverData.x)},\\quad y = ${scientificNumberToLatex(hoverData.y)}$`}</MathText>
          </div>
        )}
      </div>

      {/* Keep navigation outside the plotted quantities and ticks. */}
        {interactive && <TooltipProvider><div className="ml-auto flex w-fit items-center gap-0.5 rounded-lg border border-border/60 bg-background/95 p-1 shadow-xs">
          <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("learningCanvas.zoomIn")}
            onClick={() => zoomBy(0.8)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          </TooltipTrigger>
          <TooltipContent>{t("learningCanvas.zoomInShort")}</TooltipContent>
          </Tooltip>
          <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("learningCanvas.zoomOut")}
            onClick={() => zoomBy(1.25)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          </TooltipTrigger>
          <TooltipContent>{t("learningCanvas.zoomOutShort")}</TooltipContent>
          </Tooltip>
          <div className="mx-0.5 h-3.5 w-[1px] bg-border/60" />
          <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("learningCanvas.resetGraphView")}
            onClick={resetView}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          </TooltipTrigger>
          <TooltipContent>{t("learningCanvas.resetView")}</TooltipContent>
          </Tooltip>
        </div></TooltipProvider>}

      {!embedded && <VariableControls
        spec={spec}
        values={values}
        setValues={setValues}
        onResetAll={resetAll}
      />}

      <Collapsible open={showParameters} onOpenChange={setShowParameters}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {embedded && (
          <Button
            ref={interactionButtonRef}
            type="button"
            variant={interactionActive ? "secondary" : "outline"}
            size="sm"
            className="text-body-sm"
            aria-pressed={interactionActive}
            aria-controls={`graph-plot-${uid}`}
            onClick={() => interactionActive ? finishInteraction() : setInteractionActive(true)}
          >
            {interactionActive ? t("learningCanvas.done") : t("learningCanvas.graphInteraction")}
          </Button>
        )}
        {embedded && spec.controls.length > 0 && (
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-body-sm">
              <ChevronDown className={cn("mr-1.5 h-3.5 w-3.5", showParameters && "rotate-180")} />
              {t("learningCanvas.parameters")}
            </Button>
          </CollapsibleTrigger>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={showValues}
          aria-controls={`graph-values-${uid}`}
          onClick={() => setShowValues((value) => !value)}
          className="h-8 text-body-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("mr-1.5 h-3.5 w-3.5 transition-transform duration-200", showValues && "rotate-180")} />
          {showValues ? t("learningCanvas.hideGraphValues") : t("learningCanvas.graphValues")}
        </Button>
        {!embedded && <span className="text-body-xs text-muted-foreground/60">
          {t("learningCanvas.graphHelp")}
        </span>}
      </div>
      {embedded && spec.controls.length > 0 && (
        <CollapsibleContent>
          <VariableControls spec={spec} values={values} setValues={setValues} compact onResetAll={() => setValues(valuesForSpec(spec))} />
        </CollapsibleContent>
      )}
      </Collapsible>
      {showValues ? (
        <div id={`graph-values-${uid}`}>
          <FallbackTable spec={valueTableSpec} className="mt-2 rounded-xl border border-border/60 bg-muted/10 shadow-none" />
        </div>
      ) : null}
    </div>
  );
}

function FallbackTable({ spec, className }: { spec: CanvasSpec; className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-card p-4", className)}>
      <MathText as="p" className="text-body-sm text-muted-foreground">{spec.fallback.summary}</MathText>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">{spec.altText}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              {spec.fallback.columns.map((column) => (
                <th key={column.id} className="px-2 py-1.5 font-semibold text-foreground">
                  <MathText>{quantityLabel(column.label, column.unit)}</MathText>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.fallback.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/60">
                {spec.fallback.columns.map((column, columnIndex) => (
                  <td key={column.id} className="px-2 py-1 font-mono">
                    <MathText>{scientificValueToMathText(row[columnIndex] ?? "")}</MathText>
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

function fitDataViewport(spec: DataPlotCanvas): Viewport | null {
  const x = fitNumericRange(spec.points.map(point => point.x));
  const y = fitNumericRange(spec.points.map(point => point.y));
  return x && y ? { xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max } : null;
}

function DataPlot({ spec }: { spec: DataPlotCanvas }) {
  const t = useTranslations("studentCourse");
  const uid = useId().replace(/:/g, "");
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  const defaultView = useMemo(() => fitDataViewport(spec), [spec]);
  const { view, isDragging, resetView, bind } = useInteractiveViewport(defaultView ?? UNAVAILABLE_VIEW);
  const labelSize = usePlotLabelSize(bind.ref);

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

  if (!defaultView) return <div className="space-y-2"><p role="status" className="text-body-sm text-muted-foreground">{t("learningCanvas.rangePrecisionWarning")}</p><FallbackTable spec={{ ...spec, fallback: { summary: t("learningCanvas.dataValuesSummary"), columns: [{ id: "x", label: spec.xLabel, unit: spec.xUnit }, { id: "y", label: spec.yLabel, unit: spec.yUnit }], rows: spec.points.map(point => [mathNumber(point.x), mathNumber(point.y)]) } }} /></div>;

  return (
    <div className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-md ring-1 ring-black/5">
      <div className="flex max-w-full min-w-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <span className="min-w-0 text-body-sm font-semibold text-foreground">
          <MathText>{`${quantityLabel(spec.yLabel, spec.yUnit)} terhadap ${quantityLabel(spec.xLabel, spec.xUnit)}`}</MathText>
        </span>
        <button
          type="button"
          onClick={resetView}
          className="shrink-0 pl-3 text-body-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("learningCanvas.resetView")}
        </button>
      </div>
      <div className="relative w-full bg-card overflow-hidden select-none">
        <svg
          {...bind}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
            aria-label={`${spec.altText} ${t("learningCanvas.dataPlotHelp")}`}
        >
          <rect x="0" y="0" width={SVG_W} height={SVG_H} fill={BG} />

          <GridLayer view={view} mapX={mapX} mapY={mapY} labelSize={labelSize} xLabel={quantityLabel(spec.xLabel, spec.xUnit)} yLabel={quantityLabel(spec.yLabel, spec.yUnit)} />

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
                className="cursor-pointer hover:opacity-80"
                style={{ pointerEvents: isDragging ? "none" : undefined }}
                onMouseEnter={() => setHoverPoint({ x: pt.x, y: pt.y, px, py })}
                onMouseLeave={() => setHoverPoint(null)}
              />
            );
          })}
        </svg>

        {hoverPoint && (
          <div role="tooltip" className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-popover/90 px-2.5 py-1 text-body-xs font-mono font-medium text-popover-foreground shadow-sm backdrop-blur-xs">
            <MathText>{`${quantityLabel(spec.xLabel, spec.xUnit)}: ${mathNumber(hoverPoint.x)}, ${quantityLabel(spec.yLabel, spec.yUnit)}: ${mathNumber(hoverPoint.y)}`}</MathText>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-muted/10 px-4 py-3">
        <details className="text-body-sm group">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
            {t("learningCanvas.showDataTable", { count: spec.points.length })}
          </summary>
          <div className="mt-3 overflow-x-auto max-h-48">
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-2 py-1 font-semibold"><MathText>{quantityLabel(spec.xLabel, spec.xUnit)}</MathText></th>
                  <th className="px-2 py-1 font-semibold"><MathText>{quantityLabel(spec.yLabel, spec.yUnit)}</MathText></th>
                </tr>
              </thead>
              <tbody>
                {spec.points.map((point, index) => (
                  <tr key={`${point.x}-${point.y}-${index}`} className="border-b border-border/60">
                    <td className="px-2 py-1 font-mono"><MathText>{mathNumber(point.x)}</MathText></td>
                    <td className="px-2 py-1 font-mono"><MathText>{mathNumber(point.y)}</MathText></td>
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
            <MathText as="p" className="font-semibold text-foreground">{step.label}</MathText>
            <MathText as="div" className="overflow-x-auto text-body-sm text-foreground">{`$$${step.expression}$$`}</MathText>
            <MathText as="p" className="text-body-sm text-muted-foreground">{step.explanation}</MathText>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Diagram({ spec }: { spec: DiagramCanvas }) {
  const t = useTranslations("studentCourse");
  const markerId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{
    width: number; height: number;
    nodes: Record<string, { x: number; y: number; width: number; height: number }>;
  }>({ width: 360, height: 0, nodes: {} });
  const columns = spec.direction === "down" ? 1 : Math.min(4, spec.nodes.length, Math.max(1, Math.floor(geometry.width / 260)));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const nodes: Record<string, { x: number; y: number; width: number; height: number }> = {};
      container.querySelectorAll<HTMLElement>("[data-diagram-node]").forEach(element => {
        const node = element.getBoundingClientRect();
        nodes[element.dataset.diagramNode!] = { x: node.left - bounds.left + node.width / 2, y: node.top - bounds.top + node.height / 2, width: node.width, height: node.height };
      });
      const next = { width: bounds.width, height: bounds.height, nodes };
      setGeometry(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll("[data-diagram-node]").forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [spec.nodes]);

  return (
    <div className="space-y-3">
      <div ref={containerRef} role="group" aria-label={spec.altText}
        className={cn("relative grid w-full gap-x-32 gap-y-20 py-4", spec.direction === "down" && "mx-auto max-w-[360px]")}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        <svg width={geometry.width} height={geometry.height} role="img" aria-label={t("learningCanvas.conceptRelationships")} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <defs><marker id={`${markerId}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted-foreground)" /></marker></defs>
          {spec.edges.map((edge, index) => {
            const source = geometry.nodes[edge.source];
            const target = geometry.nodes[edge.target];
            if (!source || !target) return null;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            if (dx === 0 && dy === 0) return null;
            const sourceInset = Math.min(source.width / 2 / Math.abs(dx), source.height / 2 / Math.abs(dy));
            const targetInset = Math.min(target.width / 2 / Math.abs(dx), target.height / 2 / Math.abs(dy));
            const start = { x: source.x + dx * sourceInset, y: source.y + dy * sourceInset };
            const end = { x: target.x - dx * targetInset, y: target.y - dy * targetInset };
            return <g key={`${edge.source}-${edge.target}-${index}`}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--color-muted-foreground)" strokeWidth="2" markerEnd={`url(#${markerId}-arrow)`} />
              {edge.label ? <foreignObject x={(start.x + end.x) / 2 - 120} y={(start.y + end.y) / 2 - (Math.abs(dx) > Math.abs(dy) ? 48 : 16)} width={240} height={32}>
                <div className="flex h-full items-center justify-center text-body-sm"><MathText as="span" className="bg-background px-1">{edge.label}</MathText></div>
              </foreignObject> : null}
            </g>;
          })}
        </svg>
        {spec.nodes.map(node => <div key={node.id} data-diagram-node={node.id}
          className="relative z-10 flex min-h-20 min-w-0 items-center justify-center rounded-lg border border-primary bg-muted px-3 py-4 text-center text-body-sm">
          <MathText as="div" className="min-w-0 max-w-full overflow-x-auto break-words">{node.label}</MathText>
        </div>)}
      </div>
      <ul className="space-y-1 text-body-sm">
        {spec.edges.filter(edge => edge.label).map((edge, index) => <li key={`${edge.source}-${edge.target}-${index}`}>
          <MathText as="div" className="overflow-x-auto">{`${spec.nodes.find(node => node.id === edge.source)?.label ?? edge.source} menuju ${spec.nodes.find(node => node.id === edge.target)?.label ?? edge.target}: ${edge.label}`}</MathText>
        </li>)}
      </ul>
      <FallbackTable spec={spec} />
    </div>
  );
}

function VectorDiagram({ spec }: { spec: VectorCanvas }) {
  const markerId = useId().replace(/:/g, "");
  const width = 720;
  const height = 320;
  const max = Math.max(...spec.vectors.flatMap((vector) => [Math.abs(vector.x), Math.abs(vector.y)]));
  const origin = { x: width / 2, y: height / 2 };
  const scale = Math.min(width, height) * 0.34;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.altText} className="h-auto w-full">
          <title>{spec.altText}</title>
          <defs><marker id={`${markerId}-vector`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
          <line x1={origin.x} y1="20" x2={origin.x} y2={height - 20} stroke="var(--color-border)" />
          <line x1="20" y1={origin.y} x2={width - 20} y2={origin.y} stroke="var(--color-border)" />
          {spec.vectors.map((vector, index) => {
            const endX = origin.x + normalizedVectorComponent(vector.x, max) * scale;
            const endY = origin.y - normalizedVectorComponent(vector.y, max) * scale;
            return (
              <g key={vector.id}>
                <line x1={origin.x} y1={origin.y} x2={endX} y2={endY} stroke={index % 2 === 0 ? "var(--color-primary)" : "var(--color-secondary)"} strokeWidth="3" markerEnd={`url(#${markerId}-vector)`} />
                <text x={endX + 7} y={endY - 7} fill="var(--color-foreground)" fontSize="13">
                  {index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {spec.originLabel ? <MathText as="p" className="text-body-sm">{spec.originLabel}</MathText> : null}
      <ol className="list-decimal space-y-1 pl-5 text-body-sm">
        {spec.vectors.map(vector => <li key={vector.id}><MathText>{`${vector.label}: $(${scientificNumberToLatex(vector.x)}, ${scientificNumberToLatex(vector.y)})\\,\\pu{${vector.unit}}$`}</MathText></li>)}
      </ol>
      <FallbackTable spec={spec} />
    </div>
  );
}

function ChemistryReaction({ spec }: { spec: ChemistryCanvas }) {
  const format = (items: ChemistryCanvas["reactants"]) =>
    items.map((item) => `${item.coefficient === 1 ? "" : `${item.coefficient} `}${item.formula}`).join(" + ");
  return (
    <div className="space-y-3">
      <MathText as="div" className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-center text-body-base text-foreground">
        {`$$\\ce{${format(spec.reactants)} -> ${format(spec.products)}}$$`}
      </MathText>
      <FallbackTable spec={spec} />
    </div>
  );
}

export function LearningCanvasRenderer({ spec, embedded = false }: { spec: CanvasSpec; embedded?: boolean }) {
  const titleId = useId();
  const isFunctionPlot = spec.type === "function_plot";
  const compactPlot = embedded && isFunctionPlot;
  return (
    <section
      aria-labelledby={compactPlot ? undefined : titleId}
      aria-label={compactPlot ? spec.title : undefined}
      className={isFunctionPlot ? "w-full min-w-0 my-3 space-y-2" : compactPlot ? "w-full min-w-0" : "my-6 w-full min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 md:p-5"}
    >
      {!compactPlot && !isFunctionPlot ? (
        <div>
          <h3 id={titleId} className="font-heading text-body-base font-semibold text-foreground">
            <MathText>{spec.title}</MathText>
          </h3>
          <MathText as="p" className="mt-1 text-body-sm text-muted-foreground">{spec.purpose}</MathText>
        </div>
      ) : null}
      {spec.type === "function_plot" ? (
        <FunctionPlot spec={spec} embedded={embedded} />
      ) : spec.type === "data_plot" ? (
        <DataPlot spec={spec} />
      ) : spec.type === "derivation" ? (
        <Derivation spec={spec} />
      ) : spec.type === "flowchart" ? (
        <div className="space-y-3">
          <ol className="sr-only" aria-label="Langkah flowchart">{spec.nodes.map(node => <li key={node.id}><MathText>{node.label}</MathText></li>)}</ol>
          <FlowchartDiagramRenderer data={spec} embedded />
          <FallbackTable spec={spec} />
        </div>
      ) : spec.type === "concept_map" ? (
        <Diagram spec={spec} />
      ) : spec.type === "vector_diagram" || spec.type === "free_body" ? (
        <VectorDiagram spec={spec} />
      ) : spec.type === "chemistry_reaction" ? (
        <ChemistryReaction spec={spec} />
      ) : (
        <FallbackTable spec={spec.type === "table" ? { ...spec, fallback: { ...spec.fallback, rows: spec.rows } } : spec} />
      )}
    </section>
  );
}
