"use client";

import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Calculator } from "lucide-react";
import { cn } from "@/lib/utils";

interface ZyraFormulaPreviewProps {
  input: string;
  className?: string;
}

/**
 * Detects if the input string contains mathematical markup (LaTeX, delimiters, or math keywords)
 */
function containsMathSyntax(text: string): boolean {
  if (!text) return false;
  // Checks for $, \, ^, _, common LaTeX commands, or math symbols
  return /\$|\\(?:[a-zA-Z]+)|\^|\_|[√π≤≥≠θ±∓∞∫∬∂Σ∏→∈∉⊂⊆∪∩∅⇒⇔°αβγδελμφωΩ]/.test(text);
}

function normalizeUnicodeMath(expr: string): string {
  return expr
    .replace(/√\s*\(\s*([^()]*)\s*\)/g, "\\sqrt{$1}")
    .replace(/√\s*([^\s()]+)/g, "\\sqrt{$1}")
    .replace(/√/g, "\\sqrt{}")
    .replace(/π/g, "\\pi ")
    .replace(/≤/g, "\\le ")
    .replace(/≥/g, "\\ge ")
    .replace(/≠/g, "\\ne ")
    .replace(/θ/g, "\\theta ")
    .replace(/±/g, "\\pm ")
    .replace(/∓/g, "\\mp ")
    .replace(/∞/g, "\\infty ")
    .replace(/∫/g, "\\int ")
    .replace(/∬/g, "\\iint ")
    .replace(/∂/g, "\\partial ")
    .replace(/Σ/g, "\\sum ")
    .replace(/∏/g, "\\prod ")
    .replace(/→/g, "\\to ")
    .replace(/∈/g, "\\in ")
    .replace(/∉/g, "\\notin ")
    .replace(/⊂/g, "\\subset ")
    .replace(/⊆/g, "\\subseteq ")
    .replace(/∪/g, "\\cup ")
    .replace(/∩/g, "\\cap ")
    .replace(/∅/g, "\\emptyset ")
    .replace(/⇒/g, "\\Rightarrow ")
    .replace(/⇔/g, "\\Leftrightarrow ")
    .replace(/°/g, "^\\circ ");
}

/**
 * Live formula preview component for the Zyra composer.
 * Renders mathematical expressions as the user types them.
 */
export function ZyraFormulaPreview({ input, className }: ZyraFormulaPreviewProps) {
  const isMath = useMemo(() => containsMathSyntax(input), [input]);

  const renderedHtml = useMemo(() => {
    if (!isMath || !input.trim()) return null;

    // Check if input is already wrapped in $, if not wrap in inline math
    let mathExpr = input.trim();
    if (mathExpr.startsWith("$$") && mathExpr.endsWith("$$")) {
      mathExpr = mathExpr.slice(2, -2).trim();
    } else if (mathExpr.startsWith("$") && mathExpr.endsWith("$")) {
      mathExpr = mathExpr.slice(1, -1).trim();
    }

    mathExpr = normalizeUnicodeMath(mathExpr);

    try {
      return katex.renderToString(mathExpr, {
        displayMode: false,
        throwOnError: false,
        output: "htmlAndMathml",
      });
    } catch {
      return null;
    }
  }, [input, isMath]);

  if (!isMath || !renderedHtml) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-body-xs transition-all",
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-1 font-semibold text-brand-primary">
        <Calculator className="size-3.5" aria-hidden />
        <span>Pratinjau Rumus:</span>
      </div>
      <div
        className="min-w-0 flex-1 overflow-x-auto py-0.5 text-foreground font-sans scrollbar-none"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
}
