"use client";

import { useId, useMemo, useState, useCallback, type MouseEvent, type TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import {
  evaluateFunctionPlot,
  resetCanvasValues,
  safeExpressionToLatex,
  type ChemistryCanvas,
  type CanvasSpec,
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

function valuesForSpec(spec: CanvasSpec): Record<string, number> {
  return resetCanvasValues(spec.variables);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNum(n: number) {
  const r = Math.round(n * 100) / 100;
  if (Object.is(r, -0)) return "0";
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

function niceStep(range: number) {
  if (range <= 6) return 1;
  if (range <= 16) return 2;
  if (range <= 40) return 5;
  if (range <= 100) return 10;
  return Math.pow(10, Math.floor(Math.log10(range))) || 1;
}

function FunctionPlot({ spec }: { spec: FunctionPlotCanvas }) {
  const uid = useId().replace(/:/g, "");
  const [values, setValues] = useState(() => valuesForSpec(spec));
  const [expressions, setExpressions] = useState<Record<string, string>>(() => (
    Object.fromEntries(spec.series.map((series) => [series.id, series.expression]))
  ));
  const [showFormulaInput, setShowFormulaInput] = useState(false);
  const [hoverData, setHoverData] = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  const evaluated = useMemo(
    () => evaluateFunctionPlot(spec, values, expressions),
    [expressions, spec, values],
  );

  const invalidSeries = evaluated.filter((series) => series.points.every((point) => point.y === null));

  const xMin = spec.domain.min;
  const xMax = spec.domain.max;
  const allY = evaluated.flatMap((series) => series.points.flatMap((point) => point.y !== null && Number.isFinite(point.y) ? [point.y] : []));

  const { yMin, yMax } = useMemo(() => {
    if (allY.length === 0) return { yMin: -8, yMax: 8 };
    const sorted = [...allY].sort((a, b) => a - b);
    const q10 = sorted[Math.floor(sorted.length * 0.05)] ?? -8;
    const q90 = sorted[Math.floor(sorted.length * 0.95)] ?? 8;
    let min = Math.max(Math.min(...allY), q10 - Math.abs(q90 - q10) * 0.5);
    let max = Math.min(Math.max(...allY), q90 + Math.abs(q90 - q10) * 0.5);

    if (min === max) {
      min -= 4;
      max += 4;
    }
    const span = Math.max(1, max - min);
    let plotMin = Math.floor(min - span * 0.12);
    let plotMax = Math.ceil(max + span * 0.12);

    if (plotMin > -1 && plotMax > 1) plotMin = -2;
    if (plotMax < 1 && plotMin < -1) plotMax = 2;

    return { yMin: Math.max(-100, plotMin), yMax: Math.min(100, plotMax) };
  }, [allY]);

  const padL = 46;
  const padR = 18;
  const padT = 16;
  const padB = 36;
  const svgW = 600;
  const svgH = 312;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const mapX = useCallback((x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW, [xMin, xMax, plotW]);
  const mapY = useCallback((y: number) => padT + ((yMax - y) / (yMax - yMin)) * plotH, [yMin, yMax, plotH]);
  const invX = useCallback((px: number) => xMin + ((px - padL) / plotW) * (xMax - xMin), [xMin, xMax, plotW]);

  const seriesPaths = useMemo(() => {
    return evaluated.map((series) => {
      let path = "";
      let started = false;
      const points = series.points;

      for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        if (!pt || pt.y === null || !Number.isFinite(pt.y)) {
          started = false;
          continue;
        }

        const clampedY = clamp(pt.y, yMin - 10, yMax + 10);
        const px = mapX(pt.x);
        const py = mapY(clampedY);

        if (!started) {
          path += `M ${px.toFixed(1)} ${py.toFixed(1)}`;
          started = true;
        } else {
          path += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
        }
      }
      return { id: series.id, label: series.label, path };
    });
  }, [evaluated, mapX, mapY, yMin, yMax]);

  const roots = useMemo(() => {
    return evaluated.flatMap((series, seriesIndex) => {
      const result: Array<{ id: string; x: number; color: string }> = [];
      for (let i = 1; i < series.points.length; i += 1) {
        const prev = series.points[i - 1];
        const curr = series.points[i];
        if (!prev || !curr || prev.y === null || curr.y === null) continue;
        if (Math.sign(prev.y) === Math.sign(curr.y)) continue;
        if (Math.abs(prev.y - curr.y) > (yMax - yMin) * 0.8) continue;

        const ratio = Math.abs(prev.y) / (Math.abs(prev.y) + Math.abs(curr.y));
        const rootX = prev.x + (curr.x - prev.x) * ratio;
        if (Number.isFinite(rootX) && rootX >= xMin && rootX <= xMax) {
          result.push({
            id: `${series.id}-root-${i}`,
            x: rootX,
            color: seriesIndex === 0 ? GRAPH_BLUE : GRAPH_SECONDARY,
          });
        }
      }
      return result;
    });
  }, [evaluated, xMin, xMax, yMin, yMax]);

  const xStep = niceStep(xMax - xMin);
  const yStep = niceStep(yMax - yMin);

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      ticks.push(x);
    }
    return ticks;
  }, [xMin, xMax, xStep]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      ticks.push(y);
    }
    return ticks;
  }, [yMin, yMax, yStep]);

  const showXAxis = yMin < 0 && yMax > 0;
  const showYAxis = xMin < 0 && xMax > 0;
  const y0 = mapY(0);
  const x0 = mapX(0);

  const handlePointerMove = (e: MouseEvent<SVGSVGElement> | TouchEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const px = ((clientX - rect.left) / rect.width) * svgW;

    if (px >= padL && px <= padL + plotW) {
      const curX = invX(px);
      const activeSeries = evaluated.find((s) => s.points.some((p) => p.y !== null));
      if (activeSeries) {
        let closestPoint = activeSeries.points[0];
        let minDist = Infinity;
        for (const pt of activeSeries.points) {
          if (pt.y !== null && Math.abs(pt.x - curX) < minDist) {
            minDist = Math.abs(pt.x - curX);
            closestPoint = pt;
          }
        }
        if (closestPoint && closestPoint.y !== null) {
          setHoverData({
            x: closestPoint.x,
            y: closestPoint.y,
            px: mapX(closestPoint.x),
            py: mapY(closestPoint.y),
          });
          return;
        }
      }
    }
    setHoverData(null);
  };

  return (
    <div className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-md ring-1 ring-black/5">
      <div className="flex max-w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {spec.series.map((series, idx) => {
            const rawExpr = expressions[series.id] ?? series.expression;
            const latexFormatted = safeExpressionToLatex(
              rawExpr,
              ["x", ...spec.variables.map((v) => v.id)],
            );
            return (
              <div key={series.id} className="inline-flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border border-transparent px-1.5 text-body-xs font-bold text-white shadow-xs"
                  style={{ backgroundColor: idx === 0 ? GRAPH_BLUE : GRAPH_SECONDARY }}
                  aria-hidden
                >
                  {series.label.length <= 2 ? series.label : `f${idx + 1}`}
                </span>
                <code className="min-w-0 max-w-full truncate font-mono text-body-sm font-semibold tracking-tight text-foreground">
                  {`y = ${latexFormatted}`}
                </code>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowFormulaInput((prev) => !prev)}
          className="text-body-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showFormulaInput ? "Sembunyikan edit rumus" : "Ubah rumus"}
        </button>
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
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="h-[260px] w-full max-w-full md:h-[300px] touch-none"
          role="img"
          aria-label={spec.altText}
          onMouseMove={handlePointerMove}
          onMouseLeave={() => setHoverData(null)}
          onTouchMove={handlePointerMove}
          onTouchEnd={() => setHoverData(null)}
        >
          <rect x="0" y="0" width={svgW} height={svgH} fill={BG} />

          <g aria-hidden>
            {xTicks.map((gx) => {
              const major = gx === 0 || (xStep >= 2 && gx % (xStep * 2) === 0);
              return (
                <line
                  key={`vx-${gx}`}
                  x1={mapX(gx)}
                  y1={padT}
                  x2={mapX(gx)}
                  y2={padT + plotH}
                  stroke={major ? MAJOR_GRID : MINOR_GRID}
                  strokeWidth={major ? 1 : 0.65}
                />
              );
            })}

            {yTicks.map((gy) => {
              const major = gy === 0 || (yStep >= 2 && gy % (yStep * 2) === 0);
              return (
                <line
                  key={`hy-${gy}`}
                  x1={padL}
                  y1={mapY(gy)}
                  x2={padL + plotW}
                  y2={mapY(gy)}
                  stroke={major ? MAJOR_GRID : MINOR_GRID}
                  strokeWidth={major ? 1 : 0.65}
                />
              );
            })}
          </g>

          {showXAxis && (
            <line x1={padL} y1={y0} x2={padL + plotW} y2={y0} stroke={AXIS} strokeWidth={1.75} />
          )}
          {showYAxis && (
            <line x1={x0} y1={padT} x2={x0} y2={padT + plotH} stroke={AXIS} strokeWidth={1.75} />
          )}

          {xTicks.map((xv) => (
            <text
              key={`xt-${xv}`}
              x={mapX(xv)}
              y={padT + plotH + 22}
              textAnchor="middle"
              fill={LABEL}
              fontSize={11}
              fontFamily='system-ui, "Segoe UI", sans-serif'
            >
              {xv}
            </text>
          ))}

          {yTicks.map((yv) => (
            <text
              key={`yt-${yv}`}
              x={padL - 10}
              y={mapY(yv)}
              textAnchor="end"
              dominantBaseline="middle"
              fill={LABEL}
              fontSize={11}
              fontFamily='system-ui, "Segoe UI", sans-serif'
            >
              {yv}
            </text>
          ))}

          <clipPath id={`plot-clip-${uid}`}>
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>

          {seriesPaths.map((series, idx) => (
            <path
              key={series.id}
              d={series.path}
              fill="none"
              stroke={idx === 0 ? GRAPH_BLUE : GRAPH_SECONDARY}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath={`url(#plot-clip-${uid})`}
            />
          ))}

          {roots.map((root) => (
            <circle
              key={root.id}
              cx={mapX(root.x)}
              cy={y0}
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
                y1={padT}
                x2={hoverData.px}
                y2={padT + plotH}
                stroke="var(--color-muted-foreground)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <line
                x1={padL}
                y1={hoverData.py}
                x2={padL + plotW}
                y2={hoverData.py}
                stroke="var(--color-muted-foreground)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={hoverData.px}
                cy={hoverData.py}
                r={5}
                fill={GRAPH_BLUE}
                stroke="var(--color-card)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {hoverData && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-popover/90 px-2.5 py-1 text-body-xs font-mono font-medium text-popover-foreground shadow-sm backdrop-blur-xs">
            x: {formatNum(hoverData.x)}, y: {formatNum(hoverData.y)}
          </div>
        )}
      </div>

      {spec.controls.length > 0 && (
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
            <span>Geser koefisien untuk melihat perubahan kurva grafik secara interaktif.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setValues(valuesForSpec(spec));
                setExpressions(Object.fromEntries(spec.series.map((s) => [s.id, s.expression])));
              }}
            >
              Reset visual
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-border bg-muted/10 px-4 py-3">
        <details className="text-body-sm group">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
            Lihat ringkasan tabel data grafik
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-body-sm">
              <caption className="sr-only">{spec.altText}</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-2 py-1 font-semibold">Fungsi</th>
                  <th className="px-2 py-1 font-semibold">Rentang x</th>
                  <th className="px-2 py-1 font-semibold">Jumlah titik</th>
                </tr>
              </thead>
              <tbody>
                {evaluated.map((series) => (
                  <tr key={series.id} className="border-b border-border/60">
                    <td className="px-2 py-1 font-mono">{series.label}</td>
                    <td className="px-2 py-1 font-mono">{spec.domain.min} sampai {spec.domain.max}</td>
                    <td className="px-2 py-1">{series.points.filter((point) => point.y !== null).length}</td>
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

function DataPlot({ spec }: { spec: DataPlotCanvas }) {
  const uid = useId().replace(/:/g, "");
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  const xValues = spec.points.map((point) => point.x);
  const yValues = spec.points.map((point) => point.y);
  const rawXMin = Math.min(...xValues);
  const rawXMax = Math.max(...xValues);
  const rawYMin = Math.min(...yValues);
  const rawYMax = Math.max(...yValues);
  const xSpan = Math.max(1, rawXMax - rawXMin);
  const ySpan = Math.max(1, rawYMax - rawYMin);

  const xMin = rawXMin - xSpan * 0.1;
  const xMax = rawXMax + xSpan * 0.1;
  const yMin = rawYMin - ySpan * 0.1;
  const yMax = rawYMax + ySpan * 0.1;

  const padL = 46;
  const padR = 18;
  const padT = 16;
  const padB = 36;
  const svgW = 600;
  const svgH = 312;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const mapX = useCallback((x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW, [xMin, xMax, plotW]);
  const mapY = useCallback((y: number) => padT + ((yMax - y) / (yMax - yMin)) * plotH, [yMin, yMax, plotH]);

  const xStep = niceStep(xMax - xMin);
  const yStep = niceStep(yMax - yMin);

  const xTicks: number[] = [];
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) xTicks.push(x);

  const yTicks: number[] = [];
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) yTicks.push(y);

  const showXAxis = yMin < 0 && yMax > 0;
  const showYAxis = xMin < 0 && xMax > 0;

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
      <div className="flex max-w-full min-w-0 items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2.5">
        <span className="font-mono text-body-sm font-semibold text-foreground">
          {spec.xLabel} vs {spec.yLabel}
        </span>
      </div>
      <div className="relative w-full bg-card overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="h-[260px] w-full max-w-full md:h-[300px] touch-none"
          role="img"
          aria-label={spec.altText}
        >
          <rect x="0" y="0" width={svgW} height={svgH} fill={BG} />
          <g aria-hidden>
            {xTicks.map((gx) => (
              <line key={`vx-${gx}`} x1={mapX(gx)} y1={padT} x2={mapX(gx)} y2={padT + plotH} stroke={MINOR_GRID} strokeWidth={0.65} />
            ))}
            {yTicks.map((gy) => (
              <line key={`hy-${gy}`} x1={padL} y1={mapY(gy)} x2={padL + plotW} y2={mapY(gy)} stroke={MINOR_GRID} strokeWidth={0.65} />
            ))}
          </g>

          {showXAxis && <line x1={padL} y1={mapY(0)} x2={padL + plotW} y2={mapY(0)} stroke={AXIS} strokeWidth={1.75} />}
          {showYAxis && <line x1={mapX(0)} y1={padT} x2={mapX(0)} y2={padT + plotH} stroke={AXIS} strokeWidth={1.75} />}

          {xTicks.map((xv) => (
            <text key={`xt-${xv}`} x={mapX(xv)} y={padT + plotH + 22} textAnchor="middle" fill={LABEL} fontSize={11} fontFamily='system-ui, "Segoe UI", sans-serif'>
              {formatNum(xv)}
            </text>
          ))}
          {yTicks.map((yv) => (
            <text key={`yt-${yv}`} x={padL - 10} y={mapY(yv)} textAnchor="end" dominantBaseline="middle" fill={LABEL} fontSize={11} fontFamily='system-ui, "Segoe UI", sans-serif'>
              {formatNum(yv)}
            </text>
          ))}

          <clipPath id={`data-clip-${uid}`}>
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>

          {linePath && (
            <path d={linePath} fill="none" stroke={GRAPH_BLUE} strokeWidth={2} strokeDasharray="4 4" clipPath={`url(#data-clip-${uid})`} />
          )}

          {spec.points.map((pt, idx) => {
            const px = mapX(pt.x);
            const py = mapY(pt.y);
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

export function LearningCanvasRenderer({ spec }: { spec: CanvasSpec }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="my-6 w-full min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
      <div>
        <h3 id={titleId} className="font-heading text-body-base font-semibold text-foreground">
          {spec.title}
        </h3>
        <p className="mt-1 text-body-sm text-muted-foreground">{spec.purpose}</p>
      </div>
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
