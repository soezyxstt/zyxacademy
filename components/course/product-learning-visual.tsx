"use client";

import React, { useState, useId, useMemo, useCallback } from "react";
import { RotateCcw, Table as TableIcon, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import type {
  PublicEpsilonDeltaGraphSpec,
  PublicLearningCanvasVisualSpec,
  PublicVisualSpec,
} from "@/lib/articles/structured-read-model";
import { evaluateVisualFunction } from "@/lib/materials/visual-contract";

const LazyLearningCanvasRenderer = dynamic(
  () => import("@/components/course/learning-canvas/learning-canvas-renderer").then((module) => module.LearningCanvasRenderer),
  {
    ssr: false,
    loading: () => <p className="p-4 text-body-sm text-muted-foreground">Memuat grafik interaktif...</p>,
  },
);

export interface ProductLearningVisualProps {
  spec: PublicVisualSpec;
  className?: string;
}

function CanvasFallback({ spec }: { spec: PublicLearningCanvasVisualSpec }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-body-sm text-muted-foreground">{spec.canvas.fallback.summary}</p>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-body-xs">
          <caption className="sr-only">{spec.canvas.altText}</caption>
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              {spec.canvas.fallback.columns.map((column) => (
                <th key={column.id} className="px-2 py-1.5 font-semibold text-foreground">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.canvas.fallback.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/60 last:border-b-0">
                {spec.canvas.fallback.columns.map((column, columnIndex) => (
                  <td key={column.id} className="px-2 py-1 font-mono text-foreground">{row[columnIndex] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LearningCanvasVisual({ spec, className }: { spec: PublicLearningCanvasVisualSpec; className?: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!spec.interactive) {
      setIsVisible(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(container);
    return () => observer.disconnect();
  }, [spec.interactive]);

  return (
    <figure ref={containerRef} className={`rounded-lg border border-border bg-card p-4 space-y-3 ${className ?? ""}`}>
      <div className="flex items-start gap-2 border-b border-border pb-3">
        <LineChart className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h3 className="font-heading text-body-sm font-bold text-foreground">{spec.label}</h3>
          <p className="mt-1 text-body-xs text-muted-foreground">{spec.description}</p>
        </div>
      </div>
      {isVisible ? <LazyLearningCanvasRenderer spec={spec.canvas} /> : <CanvasFallback spec={spec} />}
      {!isVisible && spec.interactive ? (
        <p className="text-body-xs text-muted-foreground">Grafik interaktif akan aktif saat bagian ini masuk ke layar. Tabel di atas adalah ringkasan statisnya.</p>
      ) : null}
    </figure>
  );
}

function EpsilonDeltaVisual({ spec, className }: { spec: PublicEpsilonDeltaGraphSpec; className?: string }) {
  const titleId = useId();
  const descId = useId();
  const clipId = useId().replace(/:/g, "");
  const sliderId = useId();
  const [epsilon, setEpsilon] = useState<number>(spec.defaultEpsilon);
  const [showFallback, setShowFallback] = useState<boolean>(false);

  // Compute delta dynamically based on epsilon
  const delta = useMemo(() => {
    if (spec.functionModel.kind === "linear" && spec.functionModel.m !== 0) {
      const computed = epsilon / Math.abs(spec.functionModel.m);
      // Ensure delta does not extend beyond bounds
      const maxDelta = Math.min(
        spec.limitPoint - spec.bounds.xMin,
        spec.bounds.xMax - spec.limitPoint,
      );
      return Math.min(computed, Math.max(0.001, maxDelta));
    }
    // Proportional scaling for other models
    const ratio = spec.defaultDelta / spec.defaultEpsilon;
    const maxDelta = Math.min(
      spec.limitPoint - spec.bounds.xMin,
      spec.bounds.xMax - spec.limitPoint,
    );
    return Math.min(epsilon * ratio, Math.max(0.001, maxDelta));
  }, [epsilon, spec]);

  // ViewBox geometry
  const width = 500;
  const height = 360;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 55;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const { xMin, xMax, yMin, yMax } = spec.bounds;
  const c = spec.limitPoint;
  const L = spec.limitValue;

  const scaleX = useCallback(
    (x: number) => padLeft + ((x - xMin) / (xMax - xMin)) * plotWidth,
    [padLeft, xMin, xMax, plotWidth],
  );
  const scaleY = useCallback(
    (y: number) => padTop + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight,
    [padTop, plotHeight, yMin, yMax],
  );

  // Generate curve path
  const curvePath = useMemo(() => {
    const points: string[] = [];
    const sampleCount = 80;
    for (let i = 0; i <= sampleCount; i++) {
      const xVal = xMin + (i / sampleCount) * (xMax - xMin);
      const yVal = evaluateVisualFunction(spec.functionModel, xVal);
      if (yVal >= yMin && yVal <= yMax) {
        const sx = scaleX(xVal);
        const sy = scaleY(yVal);
        points.push(`${points.length === 0 ? "M" : "L"} ${sx.toFixed(1)} ${sy.toFixed(1)}`);
      }
    }
    return points.join(" ");
  }, [spec.functionModel, xMin, xMax, yMin, yMax, scaleX, scaleY]);

  // Strip coordinates
  const xDeltaMin = Math.max(xMin, c - delta);
  const xDeltaMax = Math.min(xMax, c + delta);
  const yEpsMin = Math.max(yMin, L - epsilon);
  const yEpsMax = Math.min(yMax, L + epsilon);

  const deltaBoxLeft = scaleX(xDeltaMin);
  const deltaBoxWidth = scaleX(xDeltaMax) - deltaBoxLeft;

  const epsBoxTop = scaleY(yEpsMax);
  const epsBoxHeight = scaleY(yEpsMin) - epsBoxTop;

  // Min and max allowable epsilon for slider
  const minEps = Math.max(0.05, Number((spec.defaultEpsilon * 0.1).toFixed(2)));
  const maxEps = Math.min(
    yMax - L,
    L - yMin,
    Number((spec.defaultEpsilon * 2.2).toFixed(2)),
  );

  return (
    <figure
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={`rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LineChart className="size-4 text-primary shrink-0" />
            <h3 id={titleId} className="font-heading text-body-sm font-bold text-foreground truncate">
              {spec.label}
            </h3>
          </div>
          <p id={descId} className="mt-1 text-body-xs text-muted-foreground">
            {spec.description}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowFallback(!showFallback)}
          className="gap-1.5 text-body-xs shrink-0"
          aria-pressed={showFallback}
        >
          <TableIcon className="size-3.5" />
          <span>{showFallback ? "Tampilkan grafik" : "Tampilkan tabel nilai"}</span>
        </Button>
      </div>

      {showFallback ? (
        <div className="space-y-3 p-2">
          {spec.staticFallback.type === "table" ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-body-xs border-collapse">
                <caption className="text-left font-semibold p-3 text-body-xs text-muted-foreground bg-muted/40 border-b border-border">
                  {spec.staticFallback.summary}
                </caption>
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {spec.staticFallback.headers.map((head, idx) => (
                      <th key={idx} className="p-2.5 text-left font-semibold text-foreground">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spec.staticFallback.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-border/60 last:border-0 hover:bg-muted/10">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2.5 font-mono text-body-xs text-foreground">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5 text-body-xs">
              <p className="font-semibold text-foreground">{spec.staticFallback.summary}</p>
              <p className="text-muted-foreground leading-relaxed">{spec.staticFallback.content}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* SVG Graph Canvas */}
          <div className="w-full overflow-x-auto rounded-lg border border-border bg-background p-2">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full max-w-[500px] mx-auto block select-none"
              role="img"
              aria-label={spec.label}
            >
              <title>{spec.label}</title>
              <desc>{spec.description}</desc>

              <defs>
                <clipPath id={clipId}>
                  <rect x={padLeft} y={padTop} width={plotWidth} height={plotHeight} />
                </clipPath>
              </defs>

              {/* Shaded Epsilon Band (Horizontal across plot) */}
              <rect
                x={padLeft}
                y={epsBoxTop}
                width={plotWidth}
                height={Math.max(1, epsBoxHeight)}
                fill="var(--primary)"
                fillOpacity="0.08"
                clipPath={`url(#${clipId})`}
              />

              {/* Shaded Delta Band (Vertical across plot) */}
              <rect
                x={deltaBoxLeft}
                y={padTop}
                width={Math.max(1, deltaBoxWidth)}
                height={plotHeight}
                fill="var(--status-warning, #f59e0b)"
                fillOpacity="0.08"
                clipPath={`url(#${clipId})`}
              />

              {/* Overlapping intersection region */}
              <rect
                x={deltaBoxLeft}
                y={epsBoxTop}
                width={Math.max(1, deltaBoxWidth)}
                height={Math.max(1, epsBoxHeight)}
                fill="var(--status-success, #10b981)"
                fillOpacity="0.18"
                clipPath={`url(#${clipId})`}
              />

              {/* Coordinate Grid / Axes */}
              <g stroke="currentColor" strokeOpacity="0.2" strokeWidth="1">
                {/* Y Axis line */}
                <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotHeight} />
                {/* X Axis line */}
                <line x1={padLeft} y1={padTop + plotHeight} x2={padLeft + plotWidth} y2={padTop + plotHeight} />
              </g>

              {/* Horizontal Epsilon Dashed Lines & Labels */}
              {/* L + epsilon */}
              <line
                x1={padLeft}
                y1={scaleY(yEpsMax)}
                x2={padLeft + plotWidth}
                y2={scaleY(yEpsMax)}
                stroke="var(--primary)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={padLeft - 8}
                y={scaleY(yEpsMax) + 4}
                textAnchor="end"
                className="fill-primary font-mono text-[11px] font-semibold"
              >
                L + ε ({yEpsMax.toFixed(2)})
              </text>

              {/* L Center Line */}
              <line
                x1={padLeft}
                y1={scaleY(L)}
                x2={padLeft + plotWidth}
                y2={scaleY(L)}
                stroke="currentColor"
                strokeOpacity="0.5"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <text
                x={padLeft - 8}
                y={scaleY(L) + 4}
                textAnchor="end"
                className="fill-foreground font-mono text-[11px] font-bold"
              >
                L ({L})
              </text>

              {/* L - epsilon */}
              <line
                x1={padLeft}
                y1={scaleY(yEpsMin)}
                x2={padLeft + plotWidth}
                y2={scaleY(yEpsMin)}
                stroke="var(--primary)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={padLeft - 8}
                y={scaleY(yEpsMin) + 4}
                textAnchor="end"
                className="fill-primary font-mono text-[11px] font-semibold"
              >
                L - ε ({yEpsMin.toFixed(2)})
              </text>

              {/* Vertical Delta Dashed Lines & Labels */}
              {/* c - delta */}
              <line
                x1={scaleX(xDeltaMin)}
                y1={padTop}
                x2={scaleX(xDeltaMin)}
                y2={padTop + plotHeight}
                stroke="var(--status-warning, #f59e0b)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={scaleX(xDeltaMin)}
                y={padTop + plotHeight + 16}
                textAnchor="middle"
                className="fill-foreground font-mono text-[10px]"
              >
                c - δ
              </text>
              <text
                x={scaleX(xDeltaMin)}
                y={padTop + plotHeight + 28}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[9px]"
              >
                {xDeltaMin.toFixed(2)}
              </text>

              {/* c Center Line */}
              <line
                x1={scaleX(c)}
                y1={padTop}
                x2={scaleX(c)}
                y2={padTop + plotHeight}
                stroke="currentColor"
                strokeOpacity="0.5"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <text
                x={scaleX(c)}
                y={padTop + plotHeight + 16}
                textAnchor="middle"
                className="fill-foreground font-mono text-[10px] font-bold"
              >
                c ({c})
              </text>

              {/* c + delta */}
              <line
                x1={scaleX(xDeltaMax)}
                y1={padTop}
                x2={scaleX(xDeltaMax)}
                y2={padTop + plotHeight}
                stroke="var(--status-warning, #f59e0b)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={scaleX(xDeltaMax)}
                y={padTop + plotHeight + 16}
                textAnchor="middle"
                className="fill-foreground font-mono text-[10px]"
              >
                c + δ
              </text>
              <text
                x={scaleX(xDeltaMax)}
                y={padTop + plotHeight + 28}
                textAnchor="middle"
                className="fill-muted-foreground font-mono text-[9px]"
              >
                {xDeltaMax.toFixed(2)}
              </text>

              {/* Plotted Function Curve */}
              <path
                d={curvePath}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                clipPath={`url(#${clipId})`}
                className="text-foreground"
              />

              {/* Function Label */}
              <text
                x={padLeft + plotWidth - 10}
                y={padTop + 20}
                textAnchor="end"
                className="fill-foreground font-mono text-[12px] font-semibold"
              >
                {spec.functionModel.kind === "linear"
                  ? `f(x) = ${spec.functionModel.m}x + ${spec.functionModel.b}`
                  : spec.functionModel.kind === "quadratic"
                    ? `f(x) = ${spec.functionModel.a}x² + ${spec.functionModel.b}x + ${spec.functionModel.c}`
                    : `f(x) = ${spec.functionModel.c}`}
              </text>

              {/* Limit Point Marker (c, L) */}
              <circle
                cx={scaleX(c)}
                cy={scaleY(L)}
                r="5"
                fill="var(--background)"
                stroke="var(--primary)"
                strokeWidth="2.5"
              />
              <text
                x={scaleX(c) + 8}
                y={scaleY(L) - 8}
                className="fill-primary font-mono text-[11px] font-bold"
              >
                (c, L)
              </text>
            </svg>
          </div>

          {/* Interactive Controls */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={sliderId} className="text-body-xs font-semibold text-foreground">
                Toleransi Epsilon (ε): <span className="font-mono text-primary">{epsilon.toFixed(2)}</span>
              </label>
              <div className="flex items-center gap-3">
                <span className="text-body-xs text-muted-foreground font-mono">
                  Maka Delta (δ) = <strong className="text-foreground">{delta.toFixed(2)}</strong>
                </span>
                {epsilon !== spec.defaultEpsilon ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEpsilon(spec.defaultEpsilon)}
                    className="h-7 px-2 text-body-xs gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="size-3" />
                    <span>Reset</span>
                  </Button>
                ) : null}
              </div>
            </div>

            <input
              id={sliderId}
              type="range"
              min={minEps}
              max={maxEps}
              step={0.05}
              value={epsilon}
              onChange={(e) => setEpsilon(Number(e.target.value))}
              aria-label="Toleransi epsilon"
              aria-valuemin={minEps}
              aria-valuemax={maxEps}
              aria-valuenow={epsilon}
              className="w-full accent-primary cursor-pointer h-2 bg-muted rounded-lg"
            />

            <p className="text-body-2xs text-muted-foreground leading-relaxed">
              Saat toleransi epsilon dipersempit, jendela delta otomatis menyesuaikan agar seluruh nilai input di dalam pita menghasilkan keluaran dalam toleransi jarak epsilon ke target limit L.
            </p>
          </div>
        </div>
      )}
    </figure>
  );
}

export function ProductLearningVisual({ spec, className }: ProductLearningVisualProps) {
  if (spec.kind === "learning_canvas") {
    return <LearningCanvasVisual spec={spec} className={className} />;
  }
  return <EpsilonDeltaVisual spec={spec} className={className} />;
}
