"use client";

import React, { useState, useEffect, type ReactNode } from "react";
import katex from "katex";
import { 
  Info, 
  Lightbulb, 
  AlertTriangle, 
  AlertOctagon, 
  Sparkles, 
  Copy, 
  Check 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getYoutubeEmbedUrl } from "@/lib/youtube";
import { Input } from "@/components/ui/input";
import { compileMarkdown } from "@/lib/markdown-compiler";
import { ASTBlock } from "@/lib/ast-validator";
import { getLayoutedGraph, LayoutDiagnostics } from "@/lib/visual-layout-service";
import * as math from "mathjs";
import ReactFlow, { Edge, Node } from "reactflow";
import "reactflow/dist/style.css";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from "recharts";

// --- Types ---

interface MarkdownRendererProps {
  content: string | ASTBlock[];
  className?: string;
}

// --- KaTeX Setup ---

const katexOptions = {
  throwOnError: false,
  strict: false,
  trust: false,
};

function renderMath(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, { ...katexOptions, displayMode });
  } catch (err) {
    console.error("KaTeX render error:", err);
    return value;
  }
}

// --- Inline Parser ---

function parseInline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  let index = 0;
  let textAccumulator = "";

  const flushText = () => {
    if (textAccumulator) {
      result.push(<span key={`txt-${index}-${result.length}`}>{textAccumulator}</span>);
      textAccumulator = "";
    }
  };

  while (index < text.length) {
    const remaining = text.slice(index);

    // 1. Math Block (e.g. $$...$$ or \[...\])
    let mathBlockMatch = remaining.match(/^\$\$([\s\S]+?)\$\$/) || remaining.match(/^\\\[([\s\S]+?)\\\]/);
    if (!mathBlockMatch) {
      const unclosedBlock = remaining.match(/^\$\$([\s\S]*)$/) || remaining.match(/^\\\[([\s\S]*)$/);
      if (unclosedBlock) {
        mathBlockMatch = unclosedBlock;
      }
    }
    if (mathBlockMatch) {
      flushText();
      const content = mathBlockMatch[1] || mathBlockMatch[2] || "";
      result.push(
        <span
          key={`mathblk-${index}`}
          className="my-3 block overflow-x-auto overflow-y-hidden py-1.5 text-center"
          dangerouslySetInnerHTML={{ __html: renderMath(content, true) }}
        />
      );
      index += mathBlockMatch[0].length;
      continue;
    }

    // 2. Math Inline (e.g. $...$ or \(...\))
    let mathInlineMatch = remaining.match(/^\$([^\$\n]+?)\$/) || remaining.match(/^\\\(([\s\S]+?)\\\)/);
    if (!mathInlineMatch) {
      const unclosedInline = remaining.match(/^\$([^\$\n]+)$/) || remaining.match(/^\\\(([\s\S]+)$/);
      if (unclosedInline) {
        const content = unclosedInline[1] || unclosedInline[2] || "";
        const looksLikeMath = /[\+\-\*\/=\\_\^<>]/g.test(content) || content.includes(" ") || content.length > 5;
        if (looksLikeMath) {
          mathInlineMatch = unclosedInline;
        }
      }
    }
    if (mathInlineMatch) {
      flushText();
      const content = mathInlineMatch[1] || mathInlineMatch[2] || "";
      result.push(
        <span
          key={`mathinline-${index}`}
          className="inline-block max-w-full align-baseline px-0.5"
          dangerouslySetInnerHTML={{ __html: renderMath(content, false) }}
        />
      );
      index += mathInlineMatch[0].length;
      continue;
    }

    // 2b. Visual and Glossary Reference (e.g. [[visual:step-response]] or [[kecepatan]])
    const doubleBracketMatch = remaining.match(/^\[\[(.*?)\]\]/);
    if (doubleBracketMatch) {
      flushText();
      const rawRef = doubleBracketMatch[1].trim();
      if (rawRef.toLowerCase().startsWith("visual:")) {
        const visualId = rawRef.slice(7).trim();
        result.push(
          <a
            key={`visref-${index}`}
            href={`#${visualId}`}
            className="text-brand-primary font-semibold hover:underline decoration-brand-primary/40 underline-offset-4"
          >
            Visual [{visualId}]
          </a>
        );
      } else {
        result.push(
          <span
            key={`termref-${index}`}
            className="text-brand-secondary font-semibold border-b border-dashed border-brand-secondary/40 cursor-help"
            title={`Glosarium: ${rawRef}`}
          >
            {rawRef}
          </span>
        );
      }
      index += doubleBracketMatch[0].length;
      continue;
    }

    // 3. Image (e.g. ![alt](src))
    const imgMatch = remaining.match(/^!\[(.*?)\]\((.*?)\)/);
    if (imgMatch) {
      flushText();
      const alt = imgMatch[1];
      const src = imgMatch[2];
      result.push(
        <span key={`img-${index}`} className="block my-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="photo-inline mx-auto rounded-2xl border border-border shadow-sm max-w-full h-auto max-h-[450px]"
          />
          {alt && <span className="block mt-2 text-body-sm text-muted-foreground italic font-sans">{alt}</span>}
        </span>
      );
      index += imgMatch[0].length;
      continue;
    }

    // 4. Link (e.g. [text](href))
    const linkMatch = remaining.match(/^\[(.*?)\]\((.*?)\)/);
    if (linkMatch) {
      flushText();
      const linkText = linkMatch[1];
      const href = linkMatch[2];
      result.push(
        <a
          key={`link-${index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-primary font-semibold hover:underline decoration-brand-primary/40 underline-offset-4"
        >
          {parseInline(linkText)}
        </a>
      );
      index += linkMatch[0].length;
      continue;
    }

    // 5. Bold (e.g. **text** or __text__)
    let boldMatch = remaining.match(/^\*\*([\s\S]+?)\*\*/) || remaining.match(/^__([\s\S]+?)__/);
    if (!boldMatch) {
      boldMatch = remaining.match(/^\*\*([\s\S]+)$/) || remaining.match(/^__([\s\S]+)$/);
    }
    if (boldMatch) {
      flushText();
      const content = boldMatch[1] || boldMatch[2] || "";
      result.push(
        <strong key={`bold-${index}`} className="font-bold">
          {parseInline(content)}
        </strong>
      );
      index += boldMatch[0].length;
      continue;
    }

    // 6. Italic (e.g. *text* or _text_)
    let italicMatch = remaining.match(/^\*([^\*]+?)\*/) || remaining.match(/^_(.+?)_/);
    if (!italicMatch) {
      italicMatch = remaining.match(/^\*([^\*]+)$/) || remaining.match(/^_(.+)$/);
    }
    if (italicMatch) {
      flushText();
      const content = italicMatch[1] || italicMatch[2] || "";
      result.push(
        <em key={`italic-${index}`} className="italic">
          {parseInline(content)}
        </em>
      );
      index += italicMatch[0].length;
      continue;
    }

    // 7. Inline Code (e.g. `code`)
    let codeMatch = remaining.match(/^`([^`]+?)`/);
    if (!codeMatch) {
      codeMatch = remaining.match(/^`([^`]+)$/);
    }
    if (codeMatch) {
      flushText();
      const content = codeMatch[1] || "";
      result.push(
        <code
          key={`code-${index}`}
          className="px-1.5 py-0.5 rounded bg-muted text-body-sm font-mono border border-border text-foreground"
        >
          {content}
        </code>
      );
      index += codeMatch[0].length;
      continue;
    }

    // No match, accumulate character
    textAccumulator += text[index];
    index++;
  }

  flushText();
  return result;
}

export function renderRichText(content: any): React.ReactNode {
  if (content === null || content === undefined) return null;
  if (typeof content === "string") {
    return parseInline(content);
  }
  return content;
}

// --- Inner Components ---

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  return (
    <div className="my-6 overflow-hidden rounded-2xl border border-border/80 bg-zinc-950 dark:bg-zinc-900/60 shadow-md">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 dark:bg-zinc-950/40 border-b border-zinc-800 text-zinc-400 text-[11px] font-mono select-none">
        <span className="font-semibold tracking-wider uppercase text-zinc-400/80">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition-colors py-1 px-2 rounded-md hover:bg-zinc-800"
          type="button"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-400 animate-in fade-in zoom-in-75 duration-200" />
              <span className="text-emerald-400 font-medium">Tersalin</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>Salin</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-zinc-200 font-mono text-[13px] sm:text-body-sm leading-relaxed text-left">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function AlertCallout({
  type,
  content,
}: {
  type: "note" | "tip" | "important" | "warning" | "caution";
  content: string;
}) {
  const config = {
    note: {
      border: "border-blue-500/25 bg-blue-500/5 text-blue-900 dark:text-blue-100",
      icon: <Info className="size-5 text-blue-500 shrink-0 mt-0.5" />,
      label: "Catatan",
      labelColor: "text-blue-600 dark:text-blue-400",
    },
    tip: {
      border: "border-status-success/25 bg-status-success/5 text-emerald-950 dark:text-emerald-50",
      icon: <Lightbulb className="size-5 text-status-success shrink-0 mt-0.5" />,
      label: "Tips & Trik",
      labelColor: "text-status-success dark:text-emerald-400",
    },
    important: {
      border: "border-violet-500/25 bg-violet-500/5 text-violet-950 dark:text-violet-50",
      icon: <Sparkles className="size-5 text-violet-500 shrink-0 mt-0.5" />,
      label: "Penting",
      labelColor: "text-violet-600 dark:text-violet-400",
    },
    warning: {
      border: "border-status-warning/25 bg-status-warning/5 text-amber-950 dark:text-amber-50",
      icon: <AlertTriangle className="size-5 text-status-warning shrink-0 mt-0.5" />,
      label: "Peringatan",
      labelColor: "text-status-warning dark:text-amber-400",
    },
    caution: {
      border: "border-status-error/25 bg-status-error/5 text-rose-950 dark:text-rose-50",
      icon: <AlertOctagon className="size-5 text-status-error shrink-0 mt-0.5" />,
      label: "Perhatian",
      labelColor: "text-status-error dark:text-rose-400",
    },
  }[type];

  return (
    <div className={cn("my-6 p-4 md:p-5 rounded-2xl border flex gap-3.5 leading-relaxed shadow-xs", config.border)}>
      {config.icon}
      <div className="flex-1 text-left">
        <div className={cn("text-body-xs font-bold font-heading uppercase tracking-wider mb-1", config.labelColor)}>
          {config.label}
        </div>
        <div className="text-body-sm leading-relaxed text-foreground/90 font-sans">
          {renderRichText(content)}
        </div>
      </div>
    </div>
  );
}

function InteractiveGraphWidget({ initialFormula }: { initialFormula: string }) {
  const [formula, setFormula] = useState(initialFormula || "x^2 - 2");
  
  const padL = 46;
  const padR = 18;
  const padT = 16;
  const padB = 36;
  const svgW = 600;
  const svgH = 312;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  
  const xMin = -10;
  const xMax = 10;
  const yMin = -8;
  const yMax = 8;

  const mapX = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * plotW;
  const mapY = (y: number) => padT + ((yMax - y) / (yMax - yMin)) * plotH;

  const evalFormula = (xVal: number) => {
    let expr = formula
      .toLowerCase()
      .replace(/\^/g, "**")
      .replace(/sin/g, "Math.sin")
      .replace(/cos/g, "Math.cos")
      .replace(/tan/g, "Math.tan")
      .replace(/sqrt/g, "Math.sqrt")
      .replace(/exp/g, "Math.exp")
      .replace(/log/g, "Math.log")
      .replace(/pi/g, "Math.PI")
      .replace(/e/g, "Math.E");

    // Allow only safe characters
    const sanitized = expr.replace(/[^0-9x+\-*/().\sMath.sincostanqrexplgPIE]/g, "");

    try {
      const fn = new Function("x", `return ${sanitized};`);
      const val = fn(xVal);
      return isNaN(val) ? 0 : val;
    } catch {
      return NaN;
    }
  };

  const graphPath = React.useMemo(() => {
    const steps = 200;
    let path = "";
    let started = false;

    for (let i = 0; i <= steps; i++) {
      const xVal = xMin + (i / steps) * (xMax - xMin);
      const yVal = evalFormula(xVal);

      if (isNaN(yVal)) continue;

      const px = mapX(xVal);
      const py = mapY(Math.min(yMax + 2, Math.max(yMin - 2, yVal)));

      if (!started) {
        path += `M ${px} ${py}`;
        started = true;
      } else {
        path += ` L ${px} ${py}`;
      }
    }
    return path;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula]);

  const xTicks = React.useMemo(() => {
    const ticks = [];
    for (let x = -10; x <= 10; x += 2) ticks.push(x);
    return ticks;
  }, []);

  const yTicks = React.useMemo(() => {
    const ticks = [];
    for (let y = -8; y <= 8; y += 2) ticks.push(y);
    return ticks;
  }, []);

  const showXAxis = yMin < 0 && yMax > 0;
  const showYAxis = xMin < 0 && xMax > 0;
  const y0 = mapY(0);
  const x0 = mapX(0);

  const gridLines: React.ReactNode[] = [];

  for (let gx = -10; gx <= 10; gx++) {
    const major = gx % 5 === 0;
    gridLines.push(
      <line
        key={`vx-${gx}`}
        x1={mapX(gx)}
        y1={padT}
        x2={mapX(gx)}
        y2={padT + plotH}
        stroke={major ? "var(--color-border-strong)" : "var(--color-border)"}
        strokeWidth={major ? 1 : 0.65}
      />
    );
  }

  for (let gy = -8; gy <= 8; gy++) {
    const major = gy % 4 === 0;
    gridLines.push(
      <line
        key={`hy-${gy}`}
        x1={padL}
        y1={mapY(gy)}
        x2={padL + plotW}
        y2={mapY(gy)}
        stroke={major ? "var(--color-border-strong)" : "var(--color-border)"}
        strokeWidth={major ? 1 : 0.65}
      />
    );
  }

  return (
    <div className="my-6 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-md">
      <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-2 font-sans select-none">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white text-[10px] font-bold font-mono">f</span>
        <span className="text-body-sm font-mono text-muted-foreground">y =</span>
        <Input
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="e.g. x^2 - 4"
          className="h-8 font-mono text-body-sm rounded-lg bg-background border-border/80 focus-visible:ring-brand-primary py-1"
        />
      </div>
      <div className="relative bg-card">
        <svg viewBox="0 0 600 312" className="h-[240px] w-full max-w-full md:h-[278px]">
          <g aria-hidden>{gridLines}</g>
          {showXAxis && <line x1={padL} y1={y0} x2={padL + plotW} y2={y0} stroke="var(--color-foreground)" strokeWidth={1.75} />}
          {showYAxis && <line x1={x0} y1={padT} x2={x0} y2={padT + plotH} stroke="var(--color-foreground)" strokeWidth={1.75} />}
          
          {xTicks.map((xv) => (
            <text key={`xt-${xv}`} x={mapX(xv)} y={padT + plotH + 22} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize={11} fontFamily="system-ui">
              {xv}
            </text>
          ))}
          {yTicks.map((yv) => (
            <text key={`yt-${yv}`} x={padL - 10} y={mapY(yv)} textAnchor="end" dominantBaseline="middle" fill="var(--color-muted-foreground)" fontSize={11} fontFamily="system-ui">
              {yv}
            </text>
          ))}

          <clipPath id="plot-clip-embed">
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>

          {graphPath && (
            <path
              d={graphPath}
              fill="none"
              stroke="var(--color-brand-primary)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath="url(#plot-clip-embed)"
            />
          )}
        </svg>
      </div>
    </div>
  );
}


function BoxPlotChart({ data, xLabel, yLabel }: { data: any[]; xLabel?: string; yLabel?: string }) {
  const padding = { top: 20, right: 30, bottom: 50, left: 55 };
  const width = 500;
  const height = 300;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => [d.min, d.q1, d.median, d.q3, d.max].filter(v => typeof v === "number"));
  if (allValues.length === 0) {
    return <div className="text-body-sm text-muted-foreground py-10">Tidak ada data untuk Box Plot</div>;
  }
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;
  const yMin = minVal - valRange * 0.15;
  const yMax = maxVal + valRange * 0.15;

  const mapY = (val: number) => {
    return padding.top + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
  };

  const mapX = (index: number) => {
    return padding.left + (index + 0.5) * (plotWidth / data.length);
  };

  const ticksCount = 5;
  const ticks = Array.from({ length: ticksCount }).map((_, idx) => {
    return yMin + (idx * (yMax - yMin)) / (ticksCount - 1);
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-w-[500px] mx-auto select-none">
        {ticks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={mapY(tick)}
              x2={width - padding.right}
              y2={mapY(tick)}
              className="stroke-border/45"
              strokeWidth={0.65}
            />
            <text
              x={padding.left - 10}
              y={mapY(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px] font-sans"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        ))}

        {yLabel && (
          <text
            transform={`rotate(-90 15 ${height / 2})`}
            x={15}
            y={height / 2}
            textAnchor="middle"
            className="fill-foreground text-[11px] font-heading font-bold"
          >
            {yLabel}
          </text>
        )}

        {data.map((d, idx) => {
          const cx = mapX(idx);
          const yMinPos = mapY(d.min ?? 0);
          const yQ1Pos = mapY(d.q1 ?? 0);
          const yMedPos = mapY(d.median ?? 0);
          const yQ3Pos = mapY(d.q3 ?? 0);
          const yMaxPos = mapY(d.max ?? 0);
          
          const boxWidth = Math.min(50, (plotWidth / data.length) * 0.5);
          const halfWidth = boxWidth / 2;

          return (
            <g key={idx}>
              <line x1={cx} y1={yMinPos} x2={cx} y2={yQ1Pos} className="stroke-brand-primary" strokeWidth={1.5} />
              <line x1={cx} y1={yQ3Pos} x2={cx} y2={yMaxPos} className="stroke-brand-primary" strokeWidth={1.5} />
              
              <line x1={cx - 6} y1={yMinPos} x2={cx + 6} y2={yMinPos} className="stroke-brand-primary" strokeWidth={1.5} />
              <line x1={cx - 6} y1={yMaxPos} x2={cx + 6} y2={yMaxPos} className="stroke-brand-primary" strokeWidth={1.5} />

              <rect
                x={cx - halfWidth}
                y={yQ3Pos}
                width={boxWidth}
                height={Math.max(2, yQ1Pos - yQ3Pos)}
                fill="var(--color-brand-primary)"
                fillOpacity={0.15}
                className="stroke-brand-primary hover:fill-opacity-25 transition-all"
                strokeWidth={1.5}
                rx={4}
              />

              <line
                x1={cx - halfWidth}
                y1={yMedPos}
                x2={cx + halfWidth}
                y2={yMedPos}
                className="stroke-brand-secondary"
                strokeWidth={2}
              />

              <text
                x={cx}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] font-sans"
              >
                {d.x}
              </text>
            </g>
          );
        })}

        {xLabel && (
          <text
            x={padding.left + plotWidth / 2}
            y={height - 10}
            textAnchor="middle"
            className="fill-foreground text-[11px] font-heading font-bold"
          >
            {xLabel}
          </text>
        )}
      </svg>
    </div>
  );
}

function ChartRenderer({ data, title, caption }: { data: any; title?: string; caption?: string }) {
  const chartType = data.chartType;
  const xLabel = data.xLabel;
  const yLabel = data.yLabel;
  
  const formattedData = (data.data || []).map((point: any) => {
    if (chartType === "box") {
      if (point.length >= 6) {
        return {
          x: point[0],
          min: Number(point[1]),
          q1: Number(point[2]),
          median: Number(point[3]),
          q3: Number(point[4]),
          max: Number(point[5]),
        };
      }
      const val = Number(point[1]) || 0;
      return {
        x: point[0],
        min: val * 0.8,
        q1: val * 0.9,
        median: val,
        q3: val * 1.1,
        max: val * 1.2,
      };
    }
    return {
      x: point[0],
      y: Number(point[1]) || 0,
    };
  });

  const renderChart = () => {
    switch (chartType) {
      case "bar":
        return (
          <BarChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5 } : undefined} />
            <YAxis label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft" } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
            <Bar dataKey="y" fill="var(--color-brand-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case "scatter":
        return (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis type="number" dataKey="x" name={xLabel || "X"} />
            <YAxis type="number" dataKey="y" name={yLabel || "Y"} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
            <Scatter name="Data" data={formattedData} fill="var(--color-brand-primary)" />
          </ScatterChart>
        );
      case "pie":
        const COLORS = ["var(--color-brand-primary)", "var(--color-brand-secondary)", "var(--color-tertiary-1)", "var(--color-tertiary-2)", "var(--color-tertiary-3)"];
        return (
          <PieChart>
            <Pie data={formattedData} dataKey="y" nameKey="x" cx="50%" cy="50%" outerRadius={80} fill="var(--color-brand-primary)" label>
              {formattedData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
          </PieChart>
        );
      case "area":
        return (
          <AreaChart data={formattedData}>
            <defs>
              <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-brand-primary)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--color-brand-primary)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5 } : undefined} />
            <YAxis label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft" } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
            <Area type="monotone" dataKey="y" stroke="var(--color-brand-primary)" fillOpacity={1} fill="url(#colorArea)" strokeWidth={2} />
          </AreaChart>
        );
      case "line":
      default:
        return (
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5 } : undefined} />
            <YAxis label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft" } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
            <Line type="monotone" dataKey="y" stroke="var(--color-brand-primary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
    }
  };

  if (chartType === "box") {
    return (
      <div className="my-6 p-5 border border-border bg-card shadow-xs rounded-xl text-center">
        {title && <h4 className="font-heading text-body-base font-bold text-foreground mb-4">{renderRichText(title)}</h4>}
        <BoxPlotChart data={formattedData} xLabel={xLabel} yLabel={yLabel} />
        {caption && <p className="mt-3 text-body-sm text-muted-foreground italic">{renderRichText(caption)}</p>}
      </div>
    );
  }

  return (
    <div className="my-6 p-5 border border-border bg-card shadow-xs rounded-xl text-center">
      {title && <h4 className="font-heading text-body-base font-bold text-foreground mb-4">{renderRichText(title)}</h4>}
      <div className="w-full h-[300px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
      {caption && <p className="mt-3 text-body-sm text-muted-foreground italic">{renderRichText(caption)}</p>}
    </div>
  );
}

function GraphRenderer({ data, title, caption }: { data: any; title?: string; caption?: string }) {
  let functions = data.functions || [];
  if (typeof functions === "string") {
    functions = [functions];
  } else if (!Array.isArray(functions)) {
    functions = [];
  }
  const domain = data.domain || { min: -10, max: 10 };
  const samples = data.samples || 200;

  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; clientX: number; clientY: number } | null>(null);

  const svgW = 600;
  const svgH = 400;
  const pad = 40;

  const xMin = domain.min;
  const xMax = domain.max;

  let yVals: number[] = [];
  const curves = functions.map((fnStr: string) => {
    let code: any = null;
    try {
      const cleanFn = fnStr.replace(/^\s*y\s*=\s*/, "").trim();
      code = math.compile(cleanFn);
    } catch (err) {
      console.error("MathJS compilation failed for:", fnStr, err);
      return [];
    }

    const points: [number, number][] = [];
    const step = (xMax - xMin) / (samples - 1);
    for (let i = 0; i < samples; i++) {
      const x = xMin + i * step;
      try {
        const y = code.evaluate({ x });
        if (typeof y === "number" && !isNaN(y) && isFinite(y)) {
          points.push([x, y]);
          yVals.push(y);
        }
      } catch {
      }
    }
    return points;
  });

  let yMin = -10;
  let yMax = 10;
  if (yVals.length > 0) {
    const computedMin = Math.min(...yVals);
    const computedMax = Math.max(...yVals);
    const padding = (computedMax - computedMin) * 0.1 || 1;
    yMin = Math.max(computedMin - padding, -100);
    yMax = Math.min(computedMax + padding, 100);
    if (yMin > -1) yMin = -2;
    if (yMax < 1) yMax = 2;
  }

  const mapX = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (svgW - 2 * pad);
  const mapY = (y: number) => svgH - pad - ((y - yMin) / (yMax - yMin)) * (svgH - 2 * pad);
  const invX = (svgX: number) => xMin + ((svgX - pad) / (svgW - 2 * pad)) * (xMax - xMin);

  const getPathData = (points: [number, number][]) => {
    if (points.length === 0) return "";
    let d = "";
    points.forEach((pt) => {
      const sx = mapX(pt[0]);
      const sy = mapY(pt[1]);
      if (sx >= pad && sx <= svgW - pad && sy >= pad && sy <= svgH - pad) {
        if (d === "") d = `M ${sx} ${sy}`;
        else d += ` L ${sx} ${sy}`;
      }
    });
    return d;
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const _clientY = e.clientY - rect.top;

    const svgX = (clientX / rect.width) * svgW;
    const x = invX(svgX);

    if (x >= xMin && x <= xMax && curves.length > 0) {
      const firstCurve = curves[0];
      if (firstCurve.length > 0) {
        let closest = firstCurve[0];
        let minDist = Math.abs(firstCurve[0][0] - x);
        for (const pt of firstCurve) {
          const dist = Math.abs(pt[0] - x);
          if (dist < minDist) {
            minDist = dist;
            closest = pt;
          }
        }
        setHoverPoint({
          x: closest[0],
          y: closest[1],
          clientX: (mapX(closest[0]) / svgW) * rect.width,
          clientY: (mapY(closest[1]) / svgH) * rect.height,
        });
        return;
      }
    }
    setHoverPoint(null);
  };

  const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04"];
  const originX = mapX(0);
  const originY = mapY(0);

  return (
    <div className="my-6 p-5 border border-border bg-card shadow-xs rounded-xl text-center relative select-none">
      {title && <h4 className="font-heading text-body-base font-bold text-foreground mb-4">{renderRichText(title)}</h4>}
      <div className="w-full max-w-[600px] mx-auto bg-card relative">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-auto border border-border/60 rounded-lg bg-zinc-50/50 dark:bg-zinc-950/20"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPoint(null)}
        >
          {Array.from({ length: 11 }).map((_, i) => {
            const gridX = pad + (i / 10) * (svgW - 2 * pad);
            const gridY = pad + (i / 10) * (svgH - 2 * pad);
            return (
              <React.Fragment key={i}>
                <line x1={gridX} y1={pad} x2={gridX} y2={svgH - pad} className="stroke-muted/40" strokeWidth={0.5} />
                <line x1={pad} y1={gridY} x2={svgW - pad} y2={gridY} className="stroke-muted/40" strokeWidth={0.5} />
              </React.Fragment>
            );
          })}

          {originY >= pad && originY <= svgH - pad && (
            <line x1={pad} y1={originY} x2={svgW - pad} y2={originY} className="stroke-foreground/60" strokeWidth={1.5} />
          )}
          {originX >= pad && originX <= svgW - pad && (
            <line x1={originX} y1={pad} x2={originX} y2={svgH - pad} className="stroke-foreground/60" strokeWidth={1.5} />
          )}

          {curves.map((curve: [number, number][], curveIdx: number) => (
            <path
              key={curveIdx}
              d={getPathData(curve)}
              fill="none"
              stroke={COLORS[curveIdx % COLORS.length]}
              strokeWidth={2.5}
            />
          ))}

          {hoverPoint && (
            <circle
              cx={mapX(hoverPoint.x)}
              cy={mapY(hoverPoint.y)}
              r={6}
              className="fill-brand-secondary stroke-white"
              strokeWidth={1.5}
            />
          )}
        </svg>

        {hoverPoint && (
          <div
            className="absolute z-10 pointer-events-none bg-zinc-900/90 text-white rounded-lg px-2.5 py-1.5 text-xs font-mono shadow-md border border-zinc-700/50"
            style={{
              left: `${hoverPoint.clientX + 10}px`,
              top: `${hoverPoint.clientY - 40}px`,
            }}
          >
            x: {hoverPoint.x.toFixed(2)}
            <br />
            y: {hoverPoint.y.toFixed(2)}
          </div>
        )}
      </div>
      {caption && <p className="mt-3 text-body-sm text-muted-foreground italic">{renderRichText(caption)}</p>}
    </div>
  );
}

function FlowchartDiagramRenderer({ data, title, caption }: { data: any; title?: string; caption?: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutDiag, setLayoutDiag] = useState<LayoutDiagnostics | null>(null);

  const astNodes = data.nodes || [];
  const astEdges = data.edges || [];

  useEffect(() => {
    if (astNodes.length === 0) {
      setError("VisualRenderError: No nodes generated. Confirm edge descriptions use valid 'A --> B' syntax.");
      setLoading(false);
      return;
    }
    if (astEdges.length === 0) {
      setError("VisualRenderError: No edges generated. Confirm edge descriptions use valid 'A --> B' syntax.");
      setLoading(false);
      return;
    }

    const computeLayout = async () => {
      try {
        setError(null);
        setLoading(true);

        const reactFlowNodes = astNodes.map((n: any) => ({
          id: n.id,
          data: { label: n.label },
          position: { x: 0, y: 0 },
          style: {
            background: "var(--color-card)",
            color: "var(--color-foreground)",
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: "600",
            textAlign: "center",
            boxShadow: "0 1px 3px 0 rgba(0,0,0,0.05)",
          },
        }));

        const reactFlowEdges = astEdges.map((e: any, idx: number) => ({
          id: `e-${idx}`,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: true,
          style: { stroke: "var(--color-border)" },
        }));

        const dir = (data.direction === "DOWN" || data.diagramType === "TD" || data.diagramType === "TB" || data.diagramType === "vertical") ? "DOWN" : "RIGHT";
        const layoutResult = await getLayoutedGraph(reactFlowNodes, reactFlowEdges, dir);

        console.log("ReactFlow Pipeline:", {
          nodes: reactFlowNodes,
          edges: reactFlowEdges,
          layoutedNodes: layoutResult.nodes,
          layoutedEdges: layoutResult.edges,
          diagnostics: layoutResult.diagnostics,
        });

        setNodes(layoutResult.nodes);
        setEdges(layoutResult.edges);
        setLayoutDiag(layoutResult.diagnostics);
      } catch (err: any) {
        console.error("ReactFlow layout parsing failed:", err);
        setError(`VisualRenderError: ELK layout failed: ${err.message || err}`);
      } finally {
        setLoading(false);
      }
    };

    computeLayout();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="my-6 p-5 border border-border bg-card shadow-xs rounded-xl text-center">
      {title && <h4 className="font-heading text-body-base font-bold text-foreground mb-4">{renderRichText(title)}</h4>}
      <div className="w-full h-[350px] border border-border/60 rounded-lg bg-zinc-50/50 dark:bg-zinc-950/20 overflow-hidden relative">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-destructive/5 text-destructive border border-destructive/20 rounded-lg">
            <AlertTriangle className="size-8 mb-2 text-destructive" />
            <span className="font-semibold text-body-sm">Diagram Parsing Failed</span>
            <span className="text-xs text-muted-foreground mt-1 text-center max-w-[80%]">
              {error}
            </span>
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm font-sans">
            Menghitung tata letak...
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            fitView
          />
        )}
      </div>
      {layoutDiag && (
        <div className="mt-2 text-left text-[10px] text-muted-foreground font-mono">
          Layout duration: {layoutDiag.layoutTimeMs}ms | Cache hit: {layoutDiag.cacheHit ? "YES" : "NO"} | Nodes: {layoutDiag.nodeCount} | Edges: {layoutDiag.edgeCount}
        </div>
      )}
      {caption && <p className="mt-3 text-body-sm text-muted-foreground italic">{renderRichText(caption)}</p>}
    </div>
  );
}

export function VisualRenderer({
  id: _id,
  visualType,
  title,
  caption,
  data
}: {
  id: string;
  visualType: "chart" | "graph" | "flowchart" | "diagram";
  title?: string;
  caption?: string;
  data: any;
}) {
  switch (visualType) {
    case "chart":
      return <ChartRenderer data={data} title={title} caption={caption} />;
    case "graph":
      return <GraphRenderer data={data} title={title} caption={caption} />;
    case "flowchart":
    case "diagram":
      return <FlowchartDiagramRenderer data={data} title={title} caption={caption} />;
    default:
      return null;
  }
}

function parseMermaidToDiagramData(content: string) {
  const lines = content.split("\n");
  const edges: any[] = [];
  const nodeMap = new Map<string, { id: string; label: string; stepNumber?: number }>();
  let direction = "RIGHT";

  const registerNode = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    const nodeMatch = trimmed.match(/^([a-zA-Z0-9_-]+)(?:\["([\s\S]*?)"\]|\[([\s\S]*?)\]|\("([\s\S]*?)"\)|\(([\s\S]*?)\)|\{"([\s\S]*?)"\}|\{([\s\S]*?)\})?/);
    if (nodeMatch) {
      const id = nodeMatch[1];
      const label = nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[5] || nodeMatch[6] || nodeMatch[7] || id;

      const cleanId = id.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

      const stepMatch = label.match(/^(?:Langkah|Step|Phase|Stage)\s*(\d+)\s*[:.-]\s*(.+)$/i);
      const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : undefined;
      const cleanLabelText = stepMatch ? stepMatch[2].trim() : label.trim();

      if (!nodeMap.has(cleanId)) {
        nodeMap.set(cleanId, { id: cleanId, label: cleanLabelText, stepNumber });
      }
      return cleanId;
    }

    const cleanId = trimmed.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    if (!nodeMap.has(cleanId)) {
      nodeMap.set(cleanId, { id: cleanId, label: trimmed });
    }
    return cleanId;
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) return;

    if (trimmed.startsWith("graph") || trimmed.startsWith("flowchart")) {
      const dirMatch = trimmed.match(/\b(TD|TB|LR|BT|RL)\b/i);
      if (dirMatch) {
        const d = dirMatch[1].toUpperCase();
        if (d === "TD" || d === "TB") {
          direction = "DOWN";
        } else {
          direction = "RIGHT";
        }
      }
      return;
    }

    const edgeRegex = /^([\s\S]+?)\s*(?:-->|--\s*([\s\S]*?)\s*-->|-->\s*\|([\s\S]*?)\|)\s*([\s\S]+)$/;
    const match = trimmed.match(edgeRegex);
    if (match) {
      const rawSource = match[1].trim();
      const edgeLabel = (match[2] || match[3] || "").trim();
      const rawTarget = match[4].trim();

      const sourceId = registerNode(rawSource);
      const targetId = registerNode(rawTarget);

      if (sourceId && targetId) {
        edges.push({
          source: sourceId,
          target: targetId,
          label: edgeLabel || undefined,
        });
      }
    } else {
      registerNode(trimmed);
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    direction,
    diagramType: direction === "DOWN" ? "TD" : "LR"
  };
}

function ASTBlockRenderer({ block }: { block: ASTBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-body-base leading-relaxed">
          {renderRichText(block.content)}
        </p>
      );

    case "h": {
      const hLvl = block.level || 2;
      const headingClasses = {
        1: "text-h4 md:text-h3 font-heading font-bold mt-14 mb-4 border-b border-border/60 pb-2.5 tracking-tight",
        2: "text-h5 md:text-h4 font-heading font-bold mt-12 mb-4 tracking-tight",
        3: "text-h6 md:text-h5 font-heading font-bold mt-10 mb-3 tracking-tight",
        4: "text-body-lg md:text-h6 font-heading font-semibold mt-8 mb-3 tracking-tight",
        5: "text-body-base md:text-body-lg font-heading font-semibold mt-6 mb-2.5 tracking-tight",
        6: "text-body-sm md:text-body-base font-heading font-semibold text-muted-foreground mt-6 mb-2 tracking-tight",
      };
      const cls = headingClasses[hLvl as 1 | 2 | 3 | 4 | 5 | 6] || headingClasses[2];
      const HeadingTag = `h${hLvl}` as any;
      return (
        <HeadingTag className={cls}>
          {renderRichText(block.content)}
        </HeadingTag>
      );
    }

    case "list": {
      const isOrdered = block.items?.[0]?.ordered || false;
      const ListTag = isOrdered ? "ol" : "ul";
      return (
        <ListTag
          className={cn(
            "my-4 pl-6 space-y-1.5 leading-relaxed text-body-base",
            isOrdered ? "list-decimal" : "list-disc"
          )}
        >
          {block.items?.map((item: any, itemIdx: number) => (
            <li key={itemIdx} className="pl-1">
              {renderRichText(item.text)}
            </li>
          ))}
        </ListTag>
      );
    }

    case "blockquote":
      return (
        <blockquote
          className="my-5 pl-5 border-l-4 border-primary/50 text-muted-foreground italic bg-muted/20 py-2.5 pr-4 rounded-r-xl leading-relaxed text-body-md"
        >
          {renderRichText(block.content)}
        </blockquote>
      );

    case "media": {
      const src = block.metadata?.src || "";
      const caption = block.metadata?.caption || "";
      const sourceLabel = block.metadata?.sourceLabel || "";
      const sourceUrl = block.metadata?.sourceUrl || "";

      const youtubeEmbedUrl = getYoutubeEmbedUrl(src);
      const isVideo = src.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i);

      let mediaElement: React.ReactNode;
      if (!src) {
        return null;
      }

      if (youtubeEmbedUrl) {
        mediaElement = (
          <div className="relative w-full aspect-video rounded-2xl border border-border overflow-hidden shadow-sm max-w-3xl mx-auto">
            <iframe
              src={youtubeEmbedUrl}
              className="absolute inset-0 w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      } else if (isVideo) {
        mediaElement = (
          <video
            src={src}
            controls
            className="mx-auto rounded-2xl border border-border shadow-sm max-w-full h-auto max-h-[450px]"
          />
        );
      } else {
        mediaElement = (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={caption || "Blog media"}
            className="mx-auto rounded-2xl border border-border shadow-sm max-w-full h-auto max-h-[450px]"
          />
        );
      }

      return (
        <div className="my-6 text-center space-y-2 select-none">
          {mediaElement}
          {(caption || sourceLabel) && (
            <div className="text-body-sm text-muted-foreground font-sans">
              {caption && <span className="italic">{caption}</span>}
              {caption && sourceLabel && <span className="mx-2 text-border">|</span>}
              {sourceLabel && (
                <span>
                  Sumber:{" "}
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-primary font-semibold hover:underline decoration-brand-primary/40 underline-offset-4"
                    >
                      {sourceLabel}
                    </a>
                  ) : (
                    <span className="font-semibold">{sourceLabel}</span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    case "table": {
      const alignments = block.alignments || [];
      return (
        <div className="my-6 overflow-x-auto rounded-2xl border border-border shadow-2xs">
          <table className="w-full text-left border-collapse text-body-sm">
            <thead>
              <tr className="bg-muted/80 text-foreground font-semibold border-b border-border/80">
                {block.headers?.map((header: string, headIdx: number) => {
                  const align = alignments[headIdx] || "left";
                  return (
                    <th
                      key={headIdx}
                      className={cn(
                        "px-4 py-3 font-heading font-bold select-none text-foreground/95",
                        align === "center" && "text-center",
                        align === "right" && "text-right"
                      )}
                    >
                      {renderRichText(header)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {block.rows?.map((row: string[], rowIdx: number) => (
                <tr
                  key={rowIdx}
                  className="border-b border-border/40 last:border-b-0 odd:bg-card/30 even:bg-muted/20 transition-colors hover:bg-muted/30"
                >
                  {row.map((cell: string, cellIdx: number) => {
                    const align = alignments[cellIdx] || "left";
                    return (
                      <td
                        key={cellIdx}
                        className={cn(
                          "px-4 py-3 text-foreground/80 font-normal leading-relaxed",
                          align === "center" && "text-center",
                          align === "right" && "text-right"
                        )}
                      >
                        {renderRichText(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "code":
      if (block.language === "desmos" || block.language === "desmos-graph") {
        return (
          <InteractiveGraphWidget
            initialFormula={block.content}
          />
        );
      }
      if (block.language === "mermaid") {
        const parsedData = parseMermaidToDiagramData(block.content);
        return (
          <VisualRenderer
            id={block.id}
            visualType="diagram"
            title={undefined}
            caption={undefined}
            data={parsedData}
          />
        );
      }
      return (
        <CodeBlock
          language={block.language || "plaintext"}
          code={block.content}
        />
      );

    case "hr":
      return <hr className="my-8 border-t border-border/80" />;

    case "concept":
      return (
        <div id={block.id} className="p-5 border border-border bg-card shadow-xs rounded-xl text-left my-6">
          <h3 className="text-h4 font-heading font-bold text-foreground mb-3">{renderRichText(block.content.title)}</h3>
          <MarkdownRenderer content={block.content.bodyMarkdown} />
        </div>
      );

    case "formula":
      const formulaHtml = katex.renderToString(block.content.latex, { throwOnError: false, displayMode: true });
      return (
        <div id={block.id} className="p-5 border border-border bg-card shadow-xs rounded-xl text-left my-6">
          <h4 className="text-h5 font-heading font-bold text-foreground mb-3">{block.content.title ? renderRichText(block.content.title) : "Formula"}</h4>
          <div className="my-4 overflow-x-auto text-center w-full max-w-full" dangerouslySetInnerHTML={{ __html: formulaHtml }} />
          {block.content.interpretation && (
            <div className="mt-3 text-body-sm text-muted-foreground leading-relaxed">
              <MarkdownRenderer content={block.content.interpretation} />
            </div>
          )}
          {block.content.symbols && block.content.symbols.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-body-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/85 text-muted-foreground font-semibold">
                    <th className="py-2 pr-4">Simbol</th>
                    <th className="py-2 pr-4">Satuan</th>
                    <th className="py-2 pr-4">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {block.content.symbols.map((param, idx) => (
                    <tr key={idx} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-4 font-mono font-bold text-brand-secondary">{renderRichText(param.symbol)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{renderRichText(param.unit || "-")}</td>
                      <td className="py-2 pr-4 text-foreground/80">{renderRichText(param.definition)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case "formula_reference":
      const refHtml = katex.renderToString(block.content.latex, { throwOnError: false, displayMode: false });
      return (
        <div className="my-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30 font-medium">
          <span className="text-body-sm text-muted-foreground">{block.content.label ? renderRichText(block.content.label) : "Formula Reference"}:</span>
          <span dangerouslySetInnerHTML={{ __html: refHtml }} />
        </div>
      );

    case "engineering_insight":
      return (
        <div className="my-6 p-5 border border-violet-500/20 bg-violet-500/5 text-violet-950 dark:text-violet-50 rounded-xl">
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 font-heading font-bold uppercase tracking-wider text-body-xs mb-2">
            <Sparkles className="size-4 shrink-0" />
            <span>Wawasan Teknik ({block.metadata.discipline})</span>
          </div>
          <h4 className="text-body-base font-bold mb-2 text-foreground">{renderRichText(block.content.title)}</h4>
          <MarkdownRenderer content={block.content.applicationMarkdown} />
        </div>
      );

    case "example":
      return (
        <div id={block.id} className="p-5 border border-border bg-card shadow-xs rounded-xl text-left my-6 border-l-4 border-l-brand-primary">
          <div className="text-body-xs font-bold font-heading uppercase tracking-wider text-brand-primary mb-2">Contoh Soal ({block.metadata.difficulty})</div>
          <div className="text-body-base text-foreground mb-4">
            <MarkdownRenderer content={block.content.problemStatement} />
          </div>
          <div className="mt-4 pt-4 border-t border-border/45 space-y-4">
            <div className="font-heading font-bold text-body-sm text-muted-foreground uppercase tracking-wide">Solusi:</div>
            {block.content.solutionSteps.map((step, idx) => (
              <div key={idx} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary text-body-xs font-bold">{step.stepIndex}</span>
                <div className="flex-1">
                  <div className="font-semibold text-body-sm mb-1">{renderRichText(step.label)}</div>
                  <div className="text-body-sm text-foreground/80">
                    <MarkdownRenderer content={step.explanationMarkdown} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "misconception":
      return (
        <div id={block.id} className="my-6 border border-border rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-900/40 border-b border-border font-heading font-bold text-body-sm text-foreground">
            Membongkar Mitos & Kesalahpahaman
          </div>
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="p-5 bg-rose-500/5 text-left">
              <strong className="text-rose-600 dark:text-rose-400 font-heading text-body-xs uppercase tracking-wider block mb-2">Salah paham umum:</strong>
              <div className="text-body-sm text-foreground/90 font-medium italic">&ldquo;{renderRichText(block.content.myth)}&rdquo;</div>
            </div>
            <div className="p-5 bg-emerald-500/5 text-left">
              <strong className="text-emerald-600 dark:text-emerald-400 font-heading text-body-xs uppercase tracking-wider block mb-2">Koreksi ilmiah:</strong>
              <div className="text-body-sm text-foreground/90 font-medium leading-relaxed">
                <MarkdownRenderer content={block.content.correctionMarkdown} />
              </div>
            </div>
          </div>
          {block.content.physicalRationaleMarkdown && (
            <div className="p-5 bg-muted/10 text-left border-t border-border">
              <strong className="text-muted-foreground font-heading text-body-xs uppercase tracking-wider block mb-2">Rasionalisasi Fisika:</strong>
              <div className="text-body-sm text-muted-foreground leading-relaxed">
                <MarkdownRenderer content={block.content.physicalRationaleMarkdown} />
              </div>
            </div>
          )}
        </div>
      );

    case "exercise":
      return (
        <div id={block.id} className="p-5 border border-border bg-card shadow-xs rounded-xl text-left my-6 border-l-4 border-l-brand-secondary">
          <div className="text-body-xs font-bold font-heading uppercase tracking-wider text-brand-secondary mb-2">Latihan Mandiri</div>
          <div className="text-body-base text-foreground leading-relaxed mb-4">
            <MarkdownRenderer content={block.content.questionMarkdown} />
          </div>
        </div>
      );

    case "summary":
      return (
        <div className="p-5 border border-border bg-card shadow-xs rounded-xl text-left my-6">
          <div className="font-heading font-bold text-body-sm text-muted-foreground uppercase tracking-wide mb-3">Ringkasan Bab:</div>
          <ul className="list-disc pl-5 space-y-2 text-body-sm text-foreground/80 leading-relaxed">
            {block.content.bullets.map((bullet, idx) => (
              <li key={idx} className="pl-1">
                <MarkdownRenderer content={bullet} />
              </li>
            ))}
          </ul>
        </div>
      );

    case "warning":
    case "note":
      return (
        <AlertCallout
          type={block.type}
          content={block.content.messageMarkdown}
        />
      );

    case "glossary_term":
      return (
        <div className="p-4 border border-border bg-card/60 shadow-2xs rounded-xl my-4 flex gap-3.5 leading-relaxed text-left">
          <Info className="size-5 text-brand-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-body-sm font-bold text-foreground mb-1">Glosarium: {renderRichText(block.content.term)}</div>
            <div className="text-body-sm text-muted-foreground leading-relaxed">{renderRichText(block.content.definition)}</div>
          </div>
        </div>
      );

    case "visual":
      return (
        <VisualRenderer
          id={block.id}
          visualType={block.visualType}
          title={block.title}
          caption={block.caption}
          data={block.data}
        />
      );

    default:
      return null;
  }
}

export function ASTRenderer({ blocks, className }: { blocks: ASTBlock[]; className?: string }) {
  const hasTextColor = className && /\btext-\w+/.test(className);
  if (!blocks || !Array.isArray(blocks)) return null;
  const sortedBlocks = [...blocks].sort((a, b) => a.globalOrderIndex - b.globalOrderIndex);

  return (
    <div
      className={cn(
        "markdown-article text-left space-y-6 font-sans select-text",
        !hasTextColor && "text-foreground/90",
        className
      )}
    >
      {sortedBlocks.map((block, idx) => (
        <ASTBlockRenderer key={block.id || idx} block={block} />
      ))}
    </div>
  );
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // The compile step (parse + validate + diagnostics + stats) is expensive and
  // depends only on the source string, so memoize it. Without this it re-runs on
  // every parent re-render (e.g. every selection/progress tick in the reader).
  const compiled = React.useMemo(() => {
    if (typeof content !== "string" || !content) return null;
    try {
      return { ok: true as const, result: compileMarkdown(content) };
    } catch (err) {
      console.error("Visual compiler failed, fallback to raw rendering:", err);
      return { ok: false as const, error: err };
    }
  }, [content]);

  if (!content) return null;
  if (typeof content !== "string") {
    if (!Array.isArray(content)) return null;
    return <ASTRenderer blocks={content} className={className} />;
  }

  if (!compiled) return null;

  if (!compiled.ok) {
    const err = compiled.error;
    return (
      <div className="p-4 bg-status-error/10 border border-status-error/25 text-status-error rounded-xl text-body-sm font-sans">
        <strong>Visual Compiler Error:</strong>
        <p className="mt-1 font-mono text-xs">{err instanceof Error ? err.message : String(err)}</p>
      </div>
    );
  }

  if (compiled.result.ast.blocks.length === 0) {
    return (
      <pre className="whitespace-pre-wrap text-body-xs font-mono text-muted-foreground border border-dashed border-border p-4 rounded-xl">
        {content}
      </pre>
    );
  }

  return (
    <ASTRenderer blocks={compiled.result.ast.blocks} className={className} />
  );
}
