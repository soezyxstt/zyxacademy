"use client";

import React, { useState, type ReactNode } from "react";
import { renderKatexToString } from "@/lib/math/katex-render";
import { 
  Info, 
  BookOpenCheck,
  AlertTriangle, 
  AlertOctagon, 
  AlertCircle,
  Compass,
  Copy, 
  Check 
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { getYoutubeEmbedUrl } from "@/lib/youtube";
import dynamic from "next/dynamic";
import { compileMarkdown } from "@/lib/markdown-compiler";
import { ASTBlock } from "@/lib/ast-validator";
import { compileSafeExpression, normalizeLegacyGraphExpression } from "@/lib/zyra/canvas";
import { splitScientificText } from "@/lib/math/text-segments";
import { scientificValueToMathText } from "@/lib/math/scientific-format";
import { MathText } from "@/components/course/math-text";
import { ArticleParts } from "@/components/course/article-parts";
import { extractEmbeddedArticleParts } from "@/lib/tutor/answer-sanitizer";

function CanvasLoading({ labelKey }: { labelKey: "chartLoading" | "diagramLoading" | "interactiveGraphLoading" }) {
  const t = useTranslations("studentCourse");
  return (
    <div className="w-full h-[350px] flex items-center justify-center text-muted-foreground text-body-sm font-sans">
      {t(`learningCanvas.${labelKey}`)}
    </div>
  );
}

const ChartRenderer = dynamic(
  () => import("@/components/course/markdown/chart-renderer").then((m) => m.ChartRenderer),
  {
    ssr: false,
    loading: () => <CanvasLoading labelKey="chartLoading" />,
  }
);

const FlowchartDiagramRenderer = dynamic(
  () => import("@/components/course/markdown/flowchart-diagram-renderer").then((m) => m.FlowchartDiagramRenderer),
  {
    ssr: false,
    loading: () => <CanvasLoading labelKey="diagramLoading" />,
  }
);

const InteractiveGraphWidget = dynamic(
  () => import("@/components/course/interactive-graph-widget").then((m) => m.InteractiveGraphWidget),
  {
    ssr: false,
    loading: () => <CanvasLoading labelKey="interactiveGraphLoading" />,
  }
);

// --- Types ---

export type MarkdownDensity = "default" | "compact";

const MarkdownDensityContext = React.createContext<MarkdownDensity>("default");

export function useMarkdownDensity(): MarkdownDensity {
  return React.useContext(MarkdownDensityContext);
}

export interface MarkdownRendererProps {
  content: string | ASTBlock[];
  className?: string;
  density?: MarkdownDensity;
}

// --- KaTeX Setup ---

const katexOptions = {
  throwOnError: false,
  strict: false,
  trust: false,
};

const semanticEmphasis = {
  remember: {
    label: "Ingat",
    className: "border-status-success/60 bg-status-success/10 text-status-success dark:text-emerald-300",
  },
  avoid: {
    label: "Hindari",
    className: "border-status-error/60 bg-status-error/10 text-status-error dark:text-rose-300",
  },
  caution: {
    label: "Hati-hati",
    className: "text-foreground",
  },
  definition: {
    label: "Definisi",
    className: "border-border/80 bg-muted/60 text-foreground font-semibold px-1.5 py-0.5 rounded",
  },
  formula: {
    label: "Rumus",
    className: "border-border/70 bg-muted/40 text-foreground font-mono font-medium px-1.5 py-0.5 rounded",
  },
} as const;

type SemanticEmphasisTone = keyof typeof semanticEmphasis;

/** Detects a block containing only a display math expression. */
function isStandaloneMathBlock(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
    const inner = trimmed.slice(2, -2);
    return inner.trim().length > 0 && !inner.includes("$$") && !inner.includes("\\[") && !inner.includes("\\]");
  }
  if (trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 4) {
    const inner = trimmed.slice(2, -2);
    return inner.trim().length > 0 && !inner.includes("$$") && !inner.includes("\\[") && !inner.includes("\\]");
  }
  return false;
}

/** Removes display math delimiters so a formula can be rendered on its own row. */
function standaloneMathSource(content: string): string {
  const trimmed = content.trim();
  return trimmed.slice(2, -2);
}

function renderMath(value: string, displayMode: boolean): string {
  try {
    return renderKatexToString(value, { ...katexOptions, displayMode });
  } catch (err) {
    console.error("KaTeX render error:", err);
    return value;
  }
}

// --- Inline Parser ---

/** Converts inline Markdown tokens into text, math, and emphasis nodes. */
function parseInline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  let index = 0;
  let textAccumulator = "";

  const flushText = () => {
    if (textAccumulator) {
      result.push(
        <MathText key={`txt-${index}-${result.length}`} as="span">
          {textAccumulator}
        </MathText>
      );
      textAccumulator = "";
    }
  };

  while (index < text.length) {
    const remaining = text.slice(index);
    if (remaining.startsWith("\\$") || remaining.startsWith("\\[") || remaining.startsWith("\\(")) {
      let slashCount = 1;
      for (let before = index - 1; before >= 0 && text[before] === "\\"; before--) slashCount++;
      if (remaining.startsWith("\\$") ? slashCount % 2 === 1 : slashCount % 2 === 0) {
        textAccumulator += remaining.slice(0, 2);
        index += 2;
        continue;
      }
    }
    if (remaining.startsWith("`")) {
      const first = splitScientificText(remaining)[0];
      if (first?.type === "code") {
        flushText();
        result.push(<code key={`literal-code-${index}`} className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-body-sm", first.display && "block whitespace-pre-wrap overflow-x-auto")}>{first.value}</code>);
        index += first.sourceLength;
        continue;
      }
    }


    // Typed inline emphasis. This is intentionally allowlisted and rendered
    // as text, so author content cannot inject HTML or CSS. Example:
    // [[emphasis:remember]]syarat domain[[/emphasis]]
    const emphasisMatch = remaining.match(/^\[\[emphasis:(remember|avoid|caution|definition|formula)\]\]([\s\S]*?)\[\[\/emphasis\]\]/i);
    if (emphasisMatch) {
      flushText();
      const tone = emphasisMatch[1].toLowerCase() as SemanticEmphasisTone;
      const config = semanticEmphasis[tone];
      const emphasizedText = emphasisMatch[2].replace(new RegExp(`^\\s*${config.label}(?=\\s|[:.!-]|$)\\s*[:.!-]?\\s*`, "i"), "");
      result.push(
        <span
          key={`emphasis-${index}`}
          className={cn("inline align-baseline", config.className)}
          data-semantic-emphasis={tone}
          role="note"
        >
          <span className="mr-1 font-heading text-body-sm font-semibold" aria-hidden="true">
            {config.label}
          </span>
          <span className="sr-only">{config.label}: </span>
          {parseInline(emphasizedText)}
        </span>,
      );
      index += emphasisMatch[0].length;
      continue;
    }

    // 1. Math Block (e.g. $$...$$ or \[...\])
    let mathBlockMatch = remaining.match(/^`?\$\$([\s\S]+?)\$\$`?/) || remaining.match(/^`?\\\[([\s\S]+?)\\\]`?/);
    if (!mathBlockMatch) {
      const unclosedBlock = remaining.match(/^`?\$\$([\s\S]*)$/) || remaining.match(/^`?\\\[([\s\S]*)$/);
      if (unclosedBlock) {
        mathBlockMatch = unclosedBlock;
      }
    }
    if (mathBlockMatch) {
      flushText();
      let content = mathBlockMatch[1] || mathBlockMatch[2] || "";
      if (content.endsWith("`")) content = content.substring(0, content.length - 1);
      result.push(
        <span
          key={`mathblk-${index}`}
          data-math-scroll role="region" aria-label="Rumus matematika" tabIndex={0}
          className="my-2 block max-w-full overflow-x-auto overflow-y-hidden py-1 text-left [&_.katex-display]:my-0 [&_.katex-display]:text-left"
          dangerouslySetInnerHTML={{ __html: renderMath(content, true) }}
        />
      );
      index += mathBlockMatch[0].length;
      continue;
    }

    // 2. Math Inline (e.g. $...$ or \(...\))
    let mathInlineMatch = remaining.match(/^`?\$([^$]+?)\$`?/) || remaining.match(/^`?\\\(([\s\S]+?)\\\)`?/);
    if (!mathInlineMatch) {
      const unclosedInline = remaining.match(/^`?\$([^$]+)$/) || remaining.match(/^`?\\\(([\s\S]+)$/);
      if (unclosedInline) {
        let content = unclosedInline[1] || unclosedInline[2] || "";
        if (content.endsWith("`")) content = content.substring(0, content.length - 1);
        const looksLikeMath = /[\+\-\*\/=\\_\^<>]/g.test(content) || content.includes(" ") || content.length > 5;
        if (looksLikeMath) {
          mathInlineMatch = unclosedInline;
        }
      }
    }
    if (mathInlineMatch) {
      flushText();
      let content = mathInlineMatch[1] || mathInlineMatch[2] || "";
      if (content.endsWith("`")) content = content.substring(0, content.length - 1);
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

    // 4b. Raw URL (e.g. https://... or http://...)
    const rawUrlMatch = remaining.match(/^(https?:\/\/[^\s<)]+)/);
    if (rawUrlMatch) {
      flushText();
      const rawUrl = rawUrlMatch[1];
      result.push(
        <a
          key={`rawurl-${index}`}
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-primary font-semibold hover:underline decoration-brand-primary/40 underline-offset-4 break-all cursor-pointer"
        >
          {rawUrl}
        </a>
      );
      index += rawUrl.length;
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

function CodeBlock({ language, code, density }: { language: string; code: string; density?: MarkdownDensity }) {
  const isCompact = density === "compact";
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
    <div className={cn(
      "overflow-hidden border border-border/80 bg-zinc-950 dark:bg-zinc-900/60 shadow-md",
      isCompact ? "my-3 rounded-xl" : "my-6 rounded-2xl"
    )}>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 dark:bg-zinc-950/40 border-b border-zinc-800 text-zinc-400 text-body-xs font-mono select-none">
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
      <pre className={cn(
        "overflow-x-auto text-zinc-200 font-mono text-body-sm leading-relaxed text-left",
        isCompact ? "p-3" : "p-4"
      )}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function AlertCallout({
  type,
  content,
  density,
}: {
  type: "note" | "tip" | "important" | "warning" | "caution";
  content: string;
  density?: MarkdownDensity;
}) {
  const isCompact = density === "compact";
  const config = {
    note: {
      border: "border-blue-500/25 bg-blue-500/5 text-blue-900 dark:text-blue-100",
      icon: <Info className="size-5 text-blue-500 shrink-0 mt-0.5" />,
      label: "Catatan",
      labelColor: "text-blue-600 dark:text-blue-400",
    },
    tip: {
      border: "border-status-success/25 bg-status-success/5 text-emerald-950 dark:text-emerald-50",
      icon: <BookOpenCheck className="size-5 text-status-success shrink-0 mt-0.5" />,
      label: "Tips & Trik",
      labelColor: "text-status-success dark:text-emerald-400",
    },
    important: {
      border: "border-status-warning/30 bg-status-warning/10 text-amber-950 dark:text-amber-50",
      icon: <AlertCircle className="size-5 text-status-warning shrink-0 mt-0.5" />,
      label: "Penting",
      labelColor: "text-status-warning dark:text-amber-400",
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
    <div className={cn(
      "border flex leading-relaxed shadow-xs",
      isCompact ? "my-3 p-3 md:p-3.5 rounded-xl gap-3" : "my-6 p-4 md:p-5 rounded-2xl gap-3.5",
      config.border
    )}>
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


function GraphRenderer({ data, title, caption, density }: { data: any; title?: string; caption?: string; density?: MarkdownDensity }) {
  const isCompact = density === "compact";
  const rawFunctions = data.functions ?? data.function ?? data.equations ?? data.equation ?? data.formula ?? [];
  const functions = (Array.isArray(rawFunctions) ? rawFunctions : [rawFunctions])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(normalizeLegacyGraphExpression);
  const domain = data.domain || { min: -10, max: 10 };
  const samples = data.samples || 200;

  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; clientX: number; clientY: number } | null>(null);

  const svgW = 600;
  const svgH = 400;
  const pad = 40;

  const xMin = domain.min;
  const xMax = domain.max;

  let yVals: number[] = [];
  const curves = functions.map((expression: string) => {
    let compiled: ReturnType<typeof compileSafeExpression> | null = null;
    try {
      compiled = compileSafeExpression(expression, { variables: ["x"] });
    } catch (err) {
      console.error("Safe graph compilation failed for:", expression, err);
      return [];
    }

    const points: [number, number][] = [];
    const step = (xMax - xMin) / (samples - 1);
    for (let i = 0; i < samples; i++) {
      const x = xMin + i * step;
      try {
        const y = compiled.evaluate({ x });
        if (typeof y === "number" && !isNaN(y) && isFinite(y)) {
          points.push([x, y]);
          yVals.push(y);
        }
      } catch {
      }
    }
    return points;
  });
  const hasPlottableCurve = curves.some((curve: [number, number][]) => curve.length > 1);

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

  const COLORS = [
    "var(--color-brand-primary)",
    "var(--color-brand-secondary)",
    "var(--color-tertiary-1)",
    "var(--color-status-warning)",
  ];
  const originX = mapX(0);
  const originY = mapY(0);
  const titleEquationIndex = title?.search(/\b(?:y|f\s*\(\s*x\s*\))\s*=/i) ?? -1;
  const titlePrefix = titleEquationIndex >= 0 ? title?.slice(0, titleEquationIndex).trim() : title;
  const titleExpression = titleEquationIndex >= 0 && title
    ? normalizeLegacyGraphExpression(title.slice(titleEquationIndex))
    : null;

  return (
    <div className={cn("border border-border bg-card shadow-xs text-center relative select-none", isCompact ? "my-3 p-3.5 rounded-lg" : "my-6 p-5 rounded-xl")}>
      {title && <h4 className={cn("font-heading text-body-base font-bold text-foreground", isCompact ? "mb-2" : "mb-4")}>{titlePrefix}{titleExpression && <><span aria-hidden> </span><MathText>{`$y = ${titleExpression}$`}</MathText></>}</h4>}
      {functions.length > 0 && (
        <div className={cn("flex flex-wrap justify-center gap-3 text-body-sm text-muted-foreground", isCompact ? "mb-2" : "mb-3")}>
          {functions.map((expression: string, index: number) => (
            <span key={`${expression}-${index}`} className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <MathText>{`$y = ${expression}$`}</MathText>
            </span>
          ))}
        </div>
      )}
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

          {curves.flatMap((curve: [number, number][], curveIndex: number) => curve.slice(1).flatMap((point, pointIndex) => {
            const previous = curve[pointIndex];
            if (!previous || Math.sign(previous[1]) === Math.sign(point[1]) || previous[1] === point[1]) return [];
            const ratio = Math.abs(previous[1]) / (Math.abs(previous[1]) + Math.abs(point[1]));
            const rootX = previous[0] + (point[0] - previous[0]) * ratio;
            return [
              <g key={`root-${curveIndex}-${pointIndex}`}>
                <circle cx={mapX(rootX)} cy={originY} r="5" fill="var(--color-background)" stroke={COLORS[curveIndex % COLORS.length]} strokeWidth="2" />
                <text x={mapX(rootX)} y={originY - 10} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="11">{rootX.toFixed(2)}</text>
              </g>,
            ];
          }))}

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

        {!hasPlottableCurve && (
          <div className="absolute inset-x-4 bottom-4 rounded-lg border border-status-warning/30 bg-background/95 p-3 text-left text-body-sm text-foreground shadow-sm">
            Grafik tidak dapat dibaca. Periksa kembali rumus fungsi yang diberikan.
          </div>
        )}

        {hoverPoint && (
          <div
            className="absolute z-10 pointer-events-none bg-zinc-900/90 text-white rounded-lg px-2.5 py-1.5 text-body-xs font-mono shadow-md border border-zinc-700/50"
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
      {caption && (
        <div className={cn(
          "border-t border-border/60 bg-muted/20 text-left text-body-sm text-muted-foreground",
          isCompact ? "mt-3 -mx-3.5 -mb-3.5 p-3 rounded-b-lg" : "mt-4 -mx-5 -mb-5 p-4 rounded-b-xl"
        )}>
          {renderRichText(caption)}
        </div>
      )}
    </div>
  );
}


export function VisualRenderer({
  id: _id,
  visualType,
  title,
  caption,
  data,
  density,
}: {
  id: string;
  visualType: "chart" | "graph" | "flowchart" | "diagram";
  title?: string;
  caption?: string;
  data: any;
  density?: MarkdownDensity;
}) {
  switch (visualType) {
    case "chart":
      return <ChartRenderer data={data} title={title} caption={caption} density={density} />;
    case "graph":
      return <GraphRenderer data={data} title={title} caption={caption} density={density} />;
    case "flowchart":
    case "diagram":
      return <FlowchartDiagramRenderer data={data} title={title} caption={caption} density={density} />;
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

/** Renders a parsed Markdown block, including standalone formulas and formula lists. */
function ASTBlockRenderer({ block, density }: { block: ASTBlock; density?: MarkdownDensity }) {
  const isCompact = density === "compact";

  switch (block.type) {
    case "p":
      if (isStandaloneMathBlock(block.content)) {
        return (
          <div
            className={cn(
              "formula-focus max-w-full overflow-x-auto overflow-y-hidden rounded-lg border-l-3 border-primary bg-primary/[0.03] px-3.5 py-2 text-left [&_.katex-display]:my-0 [&_.katex-display]:py-0 [&_.katex-display]:text-left",
              isCompact ? "my-1.5" : "my-2.5",
            )}
            data-content-kind="formula"
            data-math-scroll role="region" tabIndex={0}
            aria-label="Rumus utama"
          >
            <span dangerouslySetInnerHTML={{ __html: renderMath(standaloneMathSource(block.content), true) }} />
          </div>
        );
      }
      return (
        <p className="text-body-base leading-relaxed">
          {renderRichText(block.content)}
        </p>
      );

    case "h": {
      const hLvl = block.level || 2;
      const headingClasses = isCompact
        ? {
            1: "text-h5 font-heading font-bold mt-6 mb-2 border-b border-border/60 pb-1.5 tracking-tight",
            2: "text-body-base font-heading font-bold mt-5 mb-2 tracking-tight",
            3: "text-body-sm font-heading font-bold mt-4 mb-1.5 tracking-tight",
            4: "text-body-sm font-heading font-semibold mt-3 mb-1.5 tracking-tight",
            5: "text-body-sm font-heading font-semibold mt-2.5 mb-1 tracking-tight",
            6: "text-body-sm md:text-body-base font-heading font-semibold text-muted-foreground mt-2.5 mb-1 tracking-tight",
          }
        : {
            1: "text-h5 font-heading font-bold mt-14 mb-4 border-b border-border/60 pb-2.5 tracking-tight",
            2: "text-body-base font-heading font-bold mt-12 mb-4 tracking-tight",
            3: "text-body-sm font-heading font-bold mt-10 mb-3 tracking-tight",
            4: "text-body-sm font-heading font-semibold mt-8 mb-3 tracking-tight",
            5: "text-body-sm font-heading font-semibold mt-6 mb-2.5 tracking-tight",
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
      const parseFormulaItem = (text: string) => {
        const trimmed = text.trim();
        if (isStandaloneMathBlock(trimmed)) {
          return { math: standaloneMathSource(trimmed), note: undefined };
        }
        const match = trimmed.match(/^(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])\s*(?:[:—–-]|untuk|dengan)?\s*([\s\S]*)$/i);
        if (match && match[1]) {
          return { math: standaloneMathSource(match[1]), note: match[2]?.trim() || undefined };
        }
        return null;
      };

      const parsedItems = block.items?.map((it: any) => parseFormulaItem(it.text || ""));
      const mathItemCount = parsedItems?.filter(Boolean).length || 0;
      const isMathList = !isOrdered && Boolean(block.items?.length) && mathItemCount >= Math.ceil((block.items?.length || 1) / 2);

      if (isMathList) {
        return (
          <div
            className={cn(
              "min-w-0 max-w-full space-y-1 text-left",
              isCompact ? "my-2" : "my-2.5",
            )}
            data-content-kind="formula-property-list"
          >
            {block.items?.map((item: any, itemIdx: number) => {
              const parsed = parsedItems?.[itemIdx];
              if (parsed) {
                return (
                  <div
                    key={itemIdx}
                    className="min-w-0 space-y-1"
                  >
                    <div className="article-formula-row"
                    data-math-scroll role="region" aria-label="Rumus matematika" tabIndex={0}>
                      <span className="block" dangerouslySetInnerHTML={{ __html: renderMath(parsed.math, true) }} />
                    </div>
                    {parsed.note ? (
                      <div className="text-body-xs text-muted-foreground leading-relaxed">
                        {renderRichText(parsed.note)}
                      </div>
                    ) : null}
                  </div>
                );
              }
              return (
                <div key={itemIdx} className="py-1 text-body-sm text-foreground">
                  {renderRichText(item.text)}
                </div>
              );
            })}
          </div>
        );
      }

      const ListTag = isOrdered ? "ol" : "ul";
      return (
        <ListTag
          className={cn(
            isCompact ? "my-2.5 pl-8 space-y-1" : "my-4 pl-9 space-y-1.5",
            "leading-relaxed text-body-base",
            isOrdered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items?.map((item: any, itemIdx: number) => {
            const isMath = !isOrdered && isStandaloneMathBlock(item.text);
            if (isMath) {
              return (
                <li
                  key={itemIdx}
                  className="list-none my-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <span
                    data-math-scroll role="region" aria-label="Rumus matematika" tabIndex={0}
                    className="block max-w-full overflow-x-auto overflow-y-hidden [&_.katex-display]:my-0 [&_.katex-display]:text-left"
                    dangerouslySetInnerHTML={{ __html: renderMath(standaloneMathSource(item.text), true) }}
                  />
                </li>
              );
            }
            return (
              <li key={itemIdx} className="pl-2 marker:text-muted-foreground">
                {renderRichText(item.text)}
              </li>
            );
          })}
        </ListTag>
      );
    }

    case "blockquote":
      return (
        <blockquote
          className={cn(
            "border-l-4 border-primary/50 text-muted-foreground italic bg-muted/20 leading-relaxed text-body-base",
            isCompact ? "my-3 pl-3.5 py-1.5 pr-3 rounded-r-lg" : "my-5 pl-5 py-2.5 pr-4 rounded-r-xl"
          )}
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
        <div className={cn(isCompact ? "my-3 space-y-1.5" : "my-6 space-y-2", "text-center select-none")}>
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
        <div className={cn(
          "overflow-x-auto border border-border shadow-2xs",
          isCompact ? "my-3 rounded-xl" : "my-6 rounded-2xl"
        )}>
          <table className="w-full text-left border-collapse text-body-sm">
            <thead>
              <tr className="bg-muted/80 text-foreground font-semibold border-b border-border/80">
                {block.headers?.map((header: string, headIdx: number) => {
                  const align = alignments[headIdx] || "left";
                  return (
                    <th
                      key={headIdx}
                      className={cn(
                        "font-heading font-bold select-none text-foreground/95",
                        isCompact ? "px-3 py-2" : "px-4 py-3",
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
                          "text-foreground/80 font-normal leading-relaxed",
                          isCompact ? "px-3 py-2" : "px-4 py-3",
                          align === "center" && "text-center",
                          align === "right" && "text-right"
                        )}
                      >
                        {renderRichText(scientificValueToMathText(cell))}
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
            density={density}
          />
        );
      }
      return (
        <CodeBlock
          language={block.language || "plaintext"}
          code={block.content}
          density={density}
        />
      );

    case "hr":
      return <hr className={cn("border-t border-border/80", isCompact ? "my-4" : "my-8")} />;

    case "concept":
      return (
        <div id={block.id} className={cn(
          "border border-border bg-card shadow-xs text-left",
          isCompact ? "p-3.5 rounded-lg my-3" : "p-5 rounded-xl my-6"
        )}>
          <h3 className={cn("text-body-base font-heading font-bold text-foreground", isCompact ? "mb-2" : "mb-3")}>{renderRichText(block.content.title)}</h3>
          <MarkdownRenderer content={block.content.bodyMarkdown} density={density} />
        </div>
      );

    case "formula":
      const formulaHtml = renderKatexToString(block.content.latex, { throwOnError: false, displayMode: true });
      return (
        <div id={block.id} className={cn(
          "border border-border bg-card shadow-xs text-left",
          isCompact ? "p-3 rounded-lg my-2" : "p-3.5 rounded-xl my-2.5"
        )}>
          <h4 className={cn("text-body-sm font-heading font-bold text-foreground", isCompact ? "mb-1.5" : "mb-2")}>{block.content.title ? renderRichText(block.content.title) : "Formula"}</h4>
          <div
            className={cn("article-formula-row w-full max-w-full [&_.katex-display]:my-0 [&_.katex-display]:py-0 [&_.katex-display]:text-left", isCompact ? "my-1.5" : "my-2")}
            data-math-scroll
            role="region"
            aria-label="Rumus matematika"
            tabIndex={0}
            dangerouslySetInnerHTML={{ __html: formulaHtml }}
          />
          {block.content.interpretation && (
            <div className={cn("text-body-xs text-muted-foreground leading-relaxed", isCompact ? "mt-1.5" : "mt-2")}>
              <MarkdownRenderer content={block.content.interpretation} density={density} />
            </div>
          )}
          {block.content.symbols && block.content.symbols.length > 0 && (
            <div className={cn("overflow-x-auto", isCompact ? "mt-2.5" : "mt-4")}>
              <table className="w-full text-left text-body-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/85 text-muted-foreground font-semibold">
                    <th className={cn(isCompact ? "py-1.5 pr-3" : "py-2 pr-4")}>Simbol</th>
                    <th className={cn(isCompact ? "py-1.5 pr-3" : "py-2 pr-4")}>Satuan</th>
                    <th className={cn(isCompact ? "py-1.5 pr-3" : "py-2 pr-4")}>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {block.content.symbols.map((param, idx) => (
                    <tr key={idx} className="border-b border-border/40 last:border-0">
                      <td className={cn("font-mono font-bold text-brand-secondary", isCompact ? "py-1.5 pr-3" : "py-2 pr-4")}>{renderRichText(param.symbol)}</td>
                      <td className={cn("text-muted-foreground", isCompact ? "py-1.5 pr-3" : "py-2 pr-4")}>{renderRichText(param.unit || "-")}</td>
                      <td className={cn("text-foreground/80", isCompact ? "py-1.5 pr-3" : "py-2 pr-4")}>{renderRichText(param.definition)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case "formula_reference":
      const refHtml = renderKatexToString(block.content.latex, { throwOnError: false, displayMode: false });
      return (
        <div className={cn(
          "inline-flex items-center border border-border bg-muted/30 font-medium",
          isCompact ? "my-2 gap-1.5 px-2.5 py-1 rounded-md" : "my-4 gap-2 px-3 py-1.5 rounded-lg"
        )}>
          <span className="text-body-sm text-muted-foreground">{block.content.label ? renderRichText(block.content.label) : "Formula Reference"}:</span>
          <span dangerouslySetInnerHTML={{ __html: refHtml }} />
        </div>
      );

    case "engineering_insight":
      return (
        <div className={cn(
          "border border-brand-primary/20 bg-brand-primary/[0.04] text-foreground",
          isCompact ? "my-3 p-3.5 rounded-lg" : "my-6 p-5 rounded-xl"
        )}>
          <div className={cn(
            "flex items-center gap-2 text-brand-primary font-heading font-bold uppercase tracking-wider text-body-xs",
            isCompact ? "mb-1.5" : "mb-2"
          )}>
            <Compass className="size-4 shrink-0" />
            <span>Wawasan Teknik ({block.metadata.discipline})</span>
          </div>
          <h4 className={cn("text-body-base font-bold text-foreground", isCompact ? "mb-1.5" : "mb-2")}>{renderRichText(block.content.title)}</h4>
          <MarkdownRenderer content={block.content.applicationMarkdown} density={density} />
        </div>
      );

    case "example":
      return (
        <div id={block.id} className={cn(
          "border border-border bg-card shadow-xs text-left border-l-4 border-l-brand-primary",
          isCompact ? "p-3.5 rounded-lg my-3" : "p-5 rounded-xl my-6"
        )}>
          <div className={cn("text-body-xs font-bold font-heading uppercase tracking-wider text-brand-primary", isCompact ? "mb-1.5" : "mb-2")}>Contoh Soal ({block.metadata.difficulty})</div>
          <div className={cn("text-body-base text-foreground", isCompact ? "mb-2.5" : "mb-4")}>
            <MarkdownRenderer content={block.content.problemStatement} density={density} />
          </div>
          <div className={cn(
            "border-t border-border/45",
            isCompact ? "mt-3 pt-3 space-y-2.5" : "mt-4 pt-4 space-y-4"
          )}>
            <div className="font-heading font-bold text-body-sm text-muted-foreground uppercase tracking-wide">Solusi:</div>
            {block.content.solutionSteps.map((step, idx) => (
              <div key={idx} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary text-body-xs font-bold">{step.stepIndex}</span>
                <div className="flex-1">
                  <div className="font-semibold text-body-sm mb-1">{renderRichText(step.label)}</div>
                  <div className="text-body-sm text-foreground/80">
                    <MarkdownRenderer content={step.explanationMarkdown} density={density} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "misconception":
      return (
        <div id={block.id} className={cn(
          "border border-border overflow-hidden shadow-xs",
          isCompact ? "my-3 rounded-lg" : "my-6 rounded-xl"
        )}>
          <div className={cn(
            "bg-zinc-50 dark:bg-zinc-900/40 border-b border-border font-heading font-bold text-body-sm text-foreground",
            isCompact ? "p-3" : "p-4"
          )}>
            Membongkar Mitos & Kesalahpahaman
          </div>
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className={cn("bg-rose-500/5 text-left", isCompact ? "p-3.5" : "p-5")}>
              <strong className="text-rose-600 dark:text-rose-400 font-heading text-body-xs uppercase tracking-wider block mb-2">Salah paham umum:</strong>
              <div className="text-body-sm text-foreground/90 font-medium italic">&ldquo;{renderRichText(block.content.myth)}&rdquo;</div>
            </div>
            <div className={cn("bg-emerald-500/5 text-left", isCompact ? "p-3.5" : "p-5")}>
              <strong className="text-emerald-600 dark:text-emerald-400 font-heading text-body-xs uppercase tracking-wider block mb-2">Koreksi ilmiah:</strong>
              <div className="text-body-sm text-foreground/90 font-medium leading-relaxed">
                <MarkdownRenderer content={block.content.correctionMarkdown} density={density} />
              </div>
            </div>
          </div>
          {block.content.physicalRationaleMarkdown && (
            <div className={cn("bg-muted/10 text-left border-t border-border", isCompact ? "p-3.5" : "p-5")}>
              <strong className="text-muted-foreground font-heading text-body-xs uppercase tracking-wider block mb-2">Rasionalisasi Fisika:</strong>
              <div className="text-body-sm text-muted-foreground leading-relaxed">
                <MarkdownRenderer content={block.content.physicalRationaleMarkdown} density={density} />
              </div>
            </div>
          )}
        </div>
      );

    case "exercise":
      return (
        <div id={block.id} className={cn(
          "border border-border bg-card shadow-xs text-left border-l-4 border-l-brand-secondary",
          isCompact ? "p-3.5 rounded-lg my-3" : "p-5 rounded-xl my-6"
        )}>
          <div className={cn("text-body-xs font-bold font-heading uppercase tracking-wider text-brand-secondary", isCompact ? "mb-1.5" : "mb-2")}>Latihan Mandiri</div>
          <div className={cn("text-body-base text-foreground leading-relaxed", isCompact ? "mb-2.5" : "mb-4")}>
            <MarkdownRenderer content={block.content.questionMarkdown} density={density} />
          </div>
        </div>
      );

    case "summary":
      return (
        <div className={cn(
          "border border-border bg-card shadow-xs text-left",
          isCompact ? "p-3.5 rounded-lg my-3" : "p-5 rounded-xl my-6"
        )}>
          <div className={cn("font-heading font-bold text-body-sm text-muted-foreground uppercase tracking-wide", isCompact ? "mb-2" : "mb-3")}>Ringkasan Bab:</div>
          <ul className={cn("list-disc pl-5 text-body-sm text-foreground/80 leading-relaxed", isCompact ? "space-y-1.5" : "space-y-2")}>
            {block.content.bullets.map((bullet, idx) => (
              <li key={idx} className="pl-1">
                <MarkdownRenderer content={bullet} density={density} />
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
          density={density}
        />
      );

    case "glossary_term":
      return (
        <div className={cn(
          "border border-border bg-card/60 shadow-2xs flex leading-relaxed text-left",
          isCompact ? "p-3 rounded-lg my-2.5 gap-2.5" : "p-4 rounded-xl my-4 gap-3.5"
        )}>
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
          density={density}
        />
      );

    default:
      return null;
  }
}

export interface ASTRendererProps {
  blocks: ASTBlock[];
  className?: string;
  density?: MarkdownDensity;
}

export function ASTRenderer({ blocks, className, density }: ASTRendererProps) {
  const contextDensity = useMarkdownDensity();
  const activeDensity = density ?? contextDensity;
  const hasTextColor = className && /\btext-\w+/.test(className);
  if (!blocks || !Array.isArray(blocks)) return null;
  const sortedBlocks = [...blocks].sort((a, b) => a.globalOrderIndex - b.globalOrderIndex);

  // Group consecutive standalone math paragraph blocks into a unified container
  type ParagraphASTBlock = Extract<ASTBlock, { type: "p" }>;
  type RenderGroupItem =
    | { kind: "block"; block: ASTBlock }
    | { kind: "math-group"; blocks: ParagraphASTBlock[] };

  const renderItems: RenderGroupItem[] = [];
  let pendingMathGroup: ParagraphASTBlock[] = [];

  const flushMathGroup = () => {
    if (pendingMathGroup.length === 1) {
      renderItems.push({ kind: "block", block: pendingMathGroup[0] });
    } else if (pendingMathGroup.length > 1) {
      renderItems.push({ kind: "math-group", blocks: [...pendingMathGroup] });
    }
    pendingMathGroup = [];
  };

  for (const block of sortedBlocks) {
    if (block.type === "p" && isStandaloneMathBlock(block.content)) {
      pendingMathGroup.push(block);
    } else {
      flushMathGroup();
      renderItems.push({ kind: "block", block });
    }
  }
  flushMathGroup();

  return (
    <MarkdownDensityContext.Provider value={activeDensity}>
      <div
        className={cn(
          "markdown-article min-w-0 max-w-full text-left font-sans select-text",
          activeDensity === "compact" ? "space-y-3" : "space-y-6",
          !hasTextColor && "text-foreground/90",
          className
        )}
      >
        {renderItems.map((item, idx) => {
          if (item.kind === "math-group") {
            return (
              <div
                key={`math-group-${idx}`}
                className={cn(
                  "min-w-0 max-w-full space-y-1 text-left",
                  activeDensity === "compact" ? "my-2" : "my-2.5"
                )}
                data-content-kind="formula-group"
              >
                {item.blocks.map((mathBlock, bIdx) => (
                  <div
                    key={mathBlock.id || bIdx}
                    className="article-formula-row"
                    data-math-scroll role="region" aria-label="Rumus matematika" tabIndex={0}
                  >
                    <span className="block" dangerouslySetInnerHTML={{ __html: renderMath(standaloneMathSource(mathBlock.content), true) }} />
                  </div>
                ))}
              </div>
            );
          }
          return <ASTBlockRenderer key={item.block.id || idx} block={item.block} density={activeDensity} />;
        })}
      </div>
    </MarkdownDensityContext.Provider>
  );
}

function VisualCompilerErrorFallback() {
  let title = "Kesalahan Kompilator Visual";
  let description = "Kompilator visual tidak tersedia untuk merender bagian ini.";
  try {
    const t = useTranslations("studentCourse");
    title = t("learningCanvas.visualCompilerError");
    description = t("learningCanvas.visualCompilerUnavailable");
  } catch {
    // Fallback when rendered outside NextIntlClientProvider (e.g. SSR/contract tests)
  }
  return (
    <div className="p-4 bg-status-error/10 border border-status-error/25 text-status-error rounded-xl text-body-sm font-sans">
      <strong>{title}</strong>
      <p className="mt-1 text-body-xs">{description}</p>
    </div>
  );
}

export function MarkdownRenderer({ content, className, density }: MarkdownRendererProps) {
  const contextDensity = useMarkdownDensity();
  const activeDensity = density ?? contextDensity;

  const embeddedParts = React.useMemo(() => {
    if (typeof content !== "string" || !content) return null;
    return extractEmbeddedArticleParts(content);
  }, [content]);

  // The compile step (parse + validate + diagnostics + stats) is expensive and
  // depends only on the source string, so memoize it. Without this it re-runs on
  // every parent re-render (e.g. every selection/progress tick in the reader).
  const compiled = React.useMemo(() => {
    if (typeof content !== "string" || !content || embeddedParts) return null;
    try {
      return { ok: true as const, result: compileMarkdown(content) };
    } catch (err) {
      console.error("Visual compiler failed, fallback to raw rendering:", err);
      return { ok: false as const, error: err };
    }
  }, [content, embeddedParts]);

  if (!content) return null;
  if (typeof content !== "string") {
    if (!Array.isArray(content)) return null;
    return <ASTRenderer blocks={content} className={className} density={activeDensity} />;
  }

  if (embeddedParts) {
    return (
      <div className={cn("min-w-0 max-w-full", className)}>
        <ArticleParts parts={embeddedParts} density={activeDensity} />
      </div>
    );
  }

  if (!compiled) return null;

  if (!compiled.ok) {
    return <VisualCompilerErrorFallback />;
  }

  if (compiled.result.ast.blocks.length === 0) {
    return (
      <pre className="whitespace-pre-wrap text-body-xs font-mono text-muted-foreground border border-dashed border-border p-4 rounded-xl">
        {content}
      </pre>
    );
  }

  return (
    <ASTRenderer blocks={compiled.result.ast.blocks} className={className} density={activeDensity} />
  );
}
