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
import { deriveEpsilonDelta, sampleEpsilonDeltaCurve } from "@/lib/materials/epsilon-delta";
import { QuestionImage } from "@/components/course/question-image";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { Geometry2dVisual } from "@/components/course/geometry-2d-visual";
import { MathText } from "@/components/course/math-text";
import { scientificNumberToLatex, scientificValueToMathText } from "@/lib/math/scientific-format";
import { visualFunctionToLatex } from "@/lib/math/visual-function-latex";
import type { InteractiveSceneSpec } from "@/lib/materials/interactive-scene";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { useInteractiveDocumentUrl } from "@/components/course/interactive-document-context";
import { InteractiveDocumentVisual } from "@/components/course/interactive-document-visual";

function ScopedInteractiveDocument({ spec }: { spec: InteractiveDocumentSpec }) {
  const assetUrl = useInteractiveDocumentUrl(spec);
  return <InteractiveDocumentVisual spec={spec} assetUrl={assetUrl} />;
}

const LazyInteractiveScene = dynamic(() => import("@/components/course/interactive-scene-renderer").then(module => module.InteractiveSceneRenderer), {
  ssr: false, loading: () => <p role="status" className="text-body-sm text-muted-foreground">Memuat visual...</p>,
});

function InteractiveSceneVisual({ spec, className }: { spec: InteractiveSceneSpec; className?: string }) {
  const ref = React.useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <figure ref={ref} id={spec.id} aria-label={spec.label} className={`space-y-2 ${className ?? ""}`}>
    {visible ? <LazyInteractiveScene spec={spec} /> : <p className="text-body-sm text-muted-foreground">{spec.staticFallback.summary}</p>}
  </figure>;
}

const LazyLearningCanvasRenderer = dynamic(
  () => import("@/components/course/learning-canvas/learning-canvas-renderer").then((module) => module.LearningCanvasRenderer),
  {
    ssr: false,
    loading: () => <p className="p-4 text-body-sm text-muted-foreground">Memuat grafik interaktif...</p>,
  },
);

const LazyEpsilonDeltaBoard = dynamic(
  () => import("@/components/course/epsilon-delta-board").then((module) => module.EpsilonDeltaBoard),
  { ssr: false, loading: () => <p role="status" className="text-body-sm text-muted-foreground">Memuat grafik...</p> },
);

export interface ProductLearningVisualProps {
  spec?: PublicVisualSpec;
  visual?: PublicVisualSpec;
  className?: string;
  engine?: "legacy" | "jsxgraph";
}

function SvgMathLabel({ x, y, width = 88, children }: { x: number; y: number; width?: number; children: string }) {
  return <foreignObject x={x - width / 2} y={y - 13} width={width} height={30}>
    <div className="flex h-full items-center justify-center text-foreground" style={{ fontSize: 20 }}><MathText>{`$${children}$`}</MathText></div>
  </foreignObject>;
}

function CanvasFallback({ spec }: { spec: PublicLearningCanvasVisualSpec }) {
  return (
    <div data-visual-fallback className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <MathText as="p" className="text-body-sm text-muted-foreground">{spec.canvas.fallback.summary}</MathText>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-body-xs">
          <caption className="sr-only">{spec.canvas.altText}</caption>
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              {spec.canvas.fallback.columns.map((column) => (
                <th key={column.id} className="px-2 py-1.5 font-semibold text-foreground"><MathText>{column.label}</MathText></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.canvas.fallback.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/60 last:border-b-0">
                {spec.canvas.fallback.columns.map((column, columnIndex) => (
                  <td key={column.id} className="px-2 py-1 text-foreground"><MathText>{scientificValueToMathText(row[columnIndex] ?? "")}</MathText></td>
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
  const [showFallback, setShowFallback] = useState(false);
  const fallbackId = useId();
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
    <figure id={spec.id} ref={containerRef} aria-label={spec.label} className={`space-y-2 ${className ?? ""}`}>
      <Button type="button" variant="outline" size="sm" aria-pressed={showFallback} aria-controls={fallbackId} onClick={() => setShowFallback((value) => !value)}><TableIcon className="mr-2 size-4" />{showFallback ? "Tampilkan visual" : "Tampilkan tabel nilai"}</Button>
      <div hidden={showFallback}>{isVisible ? <LazyLearningCanvasRenderer spec={spec.canvas} embedded /> : null}</div>
      <div id={fallbackId} hidden={isVisible && !showFallback}><CanvasFallback spec={spec} /></div>
      {!isVisible && spec.interactive ? (
        <p className="sr-only">{spec.description}</p>
      ) : null}
    </figure>
  );
}

function EpsilonDeltaVisual({ spec, className, engine }: { spec: PublicEpsilonDeltaGraphSpec; className?: string; engine?: "legacy" | "jsxgraph" }) {
  const titleId = useId();
  const descId = useId();
  const clipId = useId().replace(/:/g, "");
  const sliderId = useId();
  const [epsilon, setEpsilon] = useState<number>(spec.defaultEpsilon);
  const [showFallback, setShowFallback] = useState<boolean>(false);

  React.useEffect(() => {
    setEpsilon(spec.defaultEpsilon);
  }, [spec]);

  const deltaResult = useMemo(() => deriveEpsilonDelta(spec, epsilon), [epsilon, spec]);
  const delta = deltaResult.delta ?? 0;

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
  const curvePath = useMemo(() => sampleEpsilonDeltaCurve(spec)
    .map((segment) => segment.map(({ x, y }, index) =>
      `${index === 0 ? "M" : "L"} ${scaleX(x).toFixed(1)} ${scaleY(y).toFixed(1)}`,
    ).join(" ")).join(" "), [spec, scaleX, scaleY]);

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
  const minEps = spec.defaultEpsilon * 0.1 || spec.defaultEpsilon;
  const maxEps = Math.min(
    yMax - L,
    L - yMin,
    spec.defaultEpsilon * 2.2,
  );

  return (
    <figure
      id={spec.id}
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={`rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LineChart className="size-4 text-primary shrink-0" />
            <h3 id={titleId} className="min-w-0 break-words font-heading text-body-sm font-bold text-foreground">
              <MathText>{spec.label}</MathText>
            </h3>
          </div>
          <p id={descId} className="mt-1 text-body-xs text-muted-foreground">
            <MathText>{spec.description}</MathText>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowFallback(!showFallback)}
          className="gap-1.5 text-body-sm shrink-0"
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
                  <MathText>{spec.staticFallback.summary}</MathText>
                </caption>
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {spec.staticFallback.headers.map((head, idx) => (
                      <th key={idx} className="p-2.5 text-left font-semibold text-foreground">
                        <MathText>{head}</MathText>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spec.staticFallback.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="border-b border-border/60 last:border-0 hover:bg-muted/10">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2.5 text-body-sm text-foreground">
                          <MathText>{scientificValueToMathText(cell)}</MathText>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1.5 text-body-xs">
              <MathText as="p" className="font-semibold text-foreground">{spec.staticFallback.summary}</MathText>
              <MathText as="p" className="text-muted-foreground leading-relaxed">{spec.staticFallback.content}</MathText>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* SVG Graph Canvas */}
          {deltaResult.status === "resolution_limited" ? (
            <p role="status" className="text-body-sm text-muted-foreground">
              Delta belum dapat dijamin pada toleransi ini karena batas presisi numerik atau nilai target. Perbesar epsilon atau periksa model.
            </p>
          ) : engine === "jsxgraph" ? <LazyEpsilonDeltaBoard spec={spec} epsilon={epsilon} delta={deltaResult.delta} /> : <div className="w-full overflow-x-auto rounded-lg border border-border bg-background p-2">
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
              <SvgMathLabel x={padLeft / 2} y={scaleY(L + epsilon)} width={62}>{"L+\\varepsilon"}</SvgMathLabel>

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
              <SvgMathLabel x={padLeft / 2} y={scaleY(L)} width={62}>{"L"}</SvgMathLabel>

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
              <SvgMathLabel x={padLeft / 2} y={scaleY(L - epsilon)} width={62}>{"L-\\varepsilon"}</SvgMathLabel>

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
              {deltaBoxWidth > 110 ? <SvgMathLabel x={scaleX(c - delta)} y={padTop + plotHeight + 19}>{"c-\\delta"}</SvgMathLabel> : null}


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
              <SvgMathLabel x={scaleX(c)} y={padTop + plotHeight + 19}>{"c"}</SvgMathLabel>

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
              {deltaBoxWidth > 110 ? <SvgMathLabel x={scaleX(c + delta)} y={padTop + plotHeight + 19}>{"c+\\delta"}</SvgMathLabel> : null}


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
              <SvgMathLabel x={padLeft + plotWidth - 100} y={padTop + 20} width={200}>{visualFunctionToLatex(spec.functionModel)}</SvgMathLabel>

              {/* Polynomial models are defined at c; the punctured neighborhood does not create a hole. */}
              <circle
                cx={scaleX(c)}
                cy={scaleY(evaluateVisualFunction(spec.functionModel, c))}
                r="5"
                fill="var(--primary)"
                stroke="var(--primary)"
                strokeWidth="2.5"
              >
                <title>{`Nilai fungsi terdefinisi: f(${c}) = ${evaluateVisualFunction(spec.functionModel, c)}. Sasaran limit L = ${L}.`}</title>
              </circle>

            </svg>
          </div>}

          {deltaResult.delta !== null ? <div className="grid gap-2 text-body-sm" aria-label="Batas lingkungan dan toleransi">
            <MathText>{`$c-\\delta\\approx ${scientificNumberToLatex(c - delta)},\\quad c+\\delta\\approx ${scientificNumberToLatex(c + delta)}$`}</MathText>
            <MathText>{`$L-\\varepsilon\\approx ${scientificNumberToLatex(L - epsilon)},\\quad L+\\varepsilon\\approx ${scientificNumberToLatex(L + epsilon)}$`}</MathText>
          </div> : null}

          {/* Interactive Controls */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={sliderId} className="text-body-sm font-semibold text-foreground">
                Toleransi <MathText className="text-primary">{`$\\varepsilon=${scientificNumberToLatex(epsilon)}$`}</MathText>
              </label>
              <div className="flex items-center gap-3">
                <span className="text-body-sm text-muted-foreground">
                  <MathText>{deltaResult.delta === null ? "$\\delta$: belum tersedia" : `$\\delta\\approx ${scientificNumberToLatex(delta)}$`}</MathText>
                </span>
                {epsilon !== spec.defaultEpsilon ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEpsilon(spec.defaultEpsilon)}
                    className="h-7 px-2 text-body-sm gap-1 text-muted-foreground hover:text-foreground"
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
              step={spec.defaultEpsilon / 100 || "any"}
              value={epsilon}
              onChange={(e) => setEpsilon(Number(e.target.value))}
              aria-label="Toleransi epsilon"
              aria-valuemin={minEps}
              aria-valuemax={maxEps}
              aria-valuenow={epsilon}
              className="w-full accent-primary cursor-pointer h-2 bg-muted rounded-lg"
            />

            {deltaResult.status === "guaranteed" ? (
              <MathText as="p" className="text-body-sm text-muted-foreground leading-relaxed">
                {"Untuk $0<|x-c|<\\delta$, model menjamin $|f(x)-L|<\\varepsilon$. Nilai $\\delta$ ini cukup dan tidak harus terbesar; nilainya diturunkan dari batas analitis fungsi."}
              </MathText>
            ) : null}
          </div>
        </div>
      )}
    </figure>
  );
}

export function ProductLearningVisual({ spec: specProp, visual, className, engine }: ProductLearningVisualProps) {
  const spec = specProp ?? visual;
  if (!spec) return null;
  if (spec.kind === "interactive_document") return <ScopedInteractiveDocument spec={spec} />;
  if (spec.kind === "interactive_scene") return <InteractiveSceneVisual spec={spec} className={className} />;
  if (spec.kind === "geometry_2d") return <Geometry2dVisual spec={spec} className={className} />;
  if (spec.kind === "source_figure") return <figure className={`space-y-3 ${className ?? ""}`} aria-label={spec.label} data-source-figure>
    <figcaption className="font-heading text-body-base font-bold"><MathText>{spec.label}</MathText></figcaption>
    <MathText as="p" className="text-body-sm">{spec.description}</MathText>
    {spec.asset ? <QuestionImage src={spec.asset.imageUrl} alt={spec.label} showCaption={false} /> : <p role="status" className="rounded-lg border border-border p-3 text-body-sm text-muted-foreground">Gambar belum tersedia.</p>}
    {spec.captionMarkdown ? <MarkdownRenderer content={spec.captionMarkdown} /> : null}
    {spec.asset?.attribution ? <p className="text-body-xs text-muted-foreground">{spec.asset.attribution}</p> : null}
    <div data-visual-fallback className="space-y-2">
    <MathText as="p" className="text-body-sm">{spec.staticFallback.summary}</MathText>
    {spec.staticFallback.type === "text" ? <MathText as="p" className="text-body-sm">{spec.staticFallback.content}</MathText> : <div className="overflow-x-auto"><table className="w-full text-left text-body-sm"><thead><tr>{spec.staticFallback.headers.map((header, index) => <th key={index} className="border-b border-border px-2 py-1 font-semibold"><MathText>{header}</MathText></th>)}</tr></thead><tbody>{spec.staticFallback.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="border-b border-border px-2 py-1"><MathText>{scientificValueToMathText(cell)}</MathText></td>)}</tr>)}</tbody></table></div>}
    </div>
  </figure>;
  if (spec.kind === "learning_canvas") {
    return <LearningCanvasVisual spec={spec} className={className} />;
  }
  return <EpsilonDeltaVisual spec={spec} className={className} engine={engine} />;
}
