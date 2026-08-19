"use client";

import { useId, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Visual language loosely matched to Desmos (grid weight, axis emphasis, graph blue). */
export const GRAPH_BLUE = "var(--color-brand-primary)";
const BG = "var(--color-card)";
const MINOR_GRID = "var(--color-border)";
const MAJOR_GRID = "var(--color-border-strong)";
const AXIS = "var(--color-foreground)";
const LABEL = "var(--color-muted-foreground)";

type Props = {
  mode: "quadratic" | "sine";
  a: number;
  b: number;
  c: number;
  className?: string;
};

const xMin = -10;
const xMax = 10;
const yMin = -8;
const yMax = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fmt(n: number) {
  const r = Math.round(n * 100) / 100;
  if (Object.is(r, -0)) return "0";
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

function signedSlice(coef: number, suffix: string, isFirst: boolean) {
  if (coef === 0) return "";
  const num = fmt(Math.abs(coef));
  const sign =
    coef > 0 ? (isFirst ? "" : " + ") : isFirst ? "−" : " − ";
  return `${sign}${num}${suffix}`;
}

/** Shared with 3D revolution preview so the “calculator” row stays consistent. */
export function calculatorExpressionDisplay(mode: "quadratic" | "sine", a: number, b: number, c: number) {
  if (mode === "quadratic") {
    let s = signedSlice(a, "x²", true);
    s += signedSlice(b, "x", s === "");
    s += signedSlice(c, "", s === "");
    return `y = ${s || "0"}`;
  }
  if (a === 0) return `y = ${fmt(c)}`;
  const amp = signedSlice(a, "", true);
  const mid = `${amp} sin(${fmt(b)}x)`;
  return `y = ${mid}${signedSlice(c, "", false)}`;
}

function buildPath(
  mode: "quadratic" | "sine",
  a: number,
  b: number,
  c: number,
  mapX: (x: number) => number,
  mapY: (y: number) => number
) {
  const steps = 280;
  let path = "";
  for (let i = 0; i <= steps; i += 1) {
    const x = xMin + (i / steps) * (xMax - xMin);
    let y = 0;
    if (mode === "quadratic") y = a * x * x + b * x + c;
    if (mode === "sine") y = a * Math.sin(b * x) + c;
    y = clamp(y, yMin - 2, yMax + 2);
    const px = mapX(x);
    const py = mapY(y);
    path += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
  }
  return path;
}

export function CalculatorExpressionBar({
  expression,
  subtitle,
}: {
  expression: string;
  subtitle?: string;
}) {
  return (
    <div
      className="flex max-w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted px-3 py-2.5"
    >
      <span
        className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded border border-transparent px-1.5 text-body-xs font-bold text-white shadow-sm"
        style={{ backgroundColor: GRAPH_BLUE }}
        aria-hidden
      >
        f
      </span>
      <code className="min-w-0 max-w-full wrap-break-word text-body-sm font-medium tracking-tight text-foreground">
        {expression}
      </code>
      {subtitle ? (
        <span className="min-w-0 max-w-full wrap-break-word text-body-xs font-normal text-muted-foreground">{subtitle}</span>
      ) : null}
    </div>
  );
}

export function DesmosStyleGraph({ mode, a, b, c, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const padL = 46;
  const padR = 18;
  const padT = 16;
  const padB = 36;
  const svgW = 600;
  const svgH = 312;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const graphPath = useMemo(() => {
    const mx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
    const my = (y: number) => padT + ((yMax - y) / (yMax - yMin)) * plotH;
    return buildPath(mode, a, b, c, mx, my);
  }, [mode, a, b, c, plotW, plotH]);

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = 2;
    for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) ticks.push(x);
    return ticks;
  }, []);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = 2;
    for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) ticks.push(y);
    return ticks;
  }, []);

  const mapX = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const mapY = (y: number) => padT + ((yMax - y) / (yMax - yMin)) * plotH;

  const showXAxis = yMin < 0 && yMax > 0;
  const showYAxis = xMin < 0 && xMax > 0;
  const y0 = mapY(0);
  const x0 = mapX(0);

  const exprDisplay = calculatorExpressionDisplay(mode, a, b, c);

  const gridLines: ReactNode[] = [];

  for (let gx = Math.ceil(xMin); gx <= Math.floor(xMax); gx += 1) {
    const major = gx % 5 === 0;
    gridLines.push(
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
  }

  for (let gy = Math.ceil(yMin); gy <= Math.floor(yMax); gy += 1) {
    const major = gy % 4 === 0;
    gridLines.push(
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
  }

  return (
    <div className={cn("max-w-full min-w-0", className)}>
      <CalculatorExpressionBar expression={exprDisplay} />
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="h-[240px] w-full max-w-full md:h-[278px]"
        role="img"
        aria-label={`Grafik fungsi: ${exprDisplay}`}
      >
        <rect x="0" y="0" width={svgW} height={svgH} fill={BG} />
        <g aria-hidden>{gridLines}</g>

        {showXAxis ? (
          <line x1={padL} y1={y0} x2={padL + plotW} y2={y0} stroke={AXIS} strokeWidth={1.75} />
        ) : null}
        {showYAxis ? (
          <line x1={x0} y1={padT} x2={x0} y2={padT + plotH} stroke={AXIS} strokeWidth={1.75} />
        ) : null}

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

        <path
          d={graphPath}
          fill="none"
          stroke={GRAPH_BLUE}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath={`url(#plot-clip-${uid})`}
        />
      </svg>
    </div>
  );
}
