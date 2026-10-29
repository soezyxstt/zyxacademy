"use client";

import React, { useMemo } from "react";
import "katex/dist/katex.min.css";
import { Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/course/math-text";
import { normalizeTutorMathMarkdown } from "@/lib/tutor/math-markdown";

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
  return /\$|\\(?:[a-zA-Z]+)|\^|\_|[\u221a\u03c0\u2264\u2265\u2260\u03b8\u00b1\u2213\u221e\u222b\u222c\u2202\u03a3\u220f\u2192\u2208\u2209\u2282\u2286\u222a\u2229\u2205\u21d2\u21d4\u00b0\u03b1\u03b2\u03b3\u03b4\u03b5\u03bb\u03bc\u03c6\u03c9\u03a9]/.test(text);
}

function normalizeUnicodeMath(expr: string): string {
  return expr
    .replace(/\u221a\s*\(\s*([^()]*)\s*\)/g, "\\sqrt{$1}")
    .replace(/\u221a\s*([^\s()]+)/g, "\\sqrt{$1}")
    .replace(/\u221a/g, "\\sqrt{}")
    .replace(/\u03c0/g, "\\pi ")
    .replace(/\u2264/g, "\\le ")
    .replace(/\u2265/g, "\\ge ")
    .replace(/\u2260/g, "\\ne ")
    .replace(/\u03b8/g, "\\theta ")
    .replace(/\u00b1/g, "\\pm ")
    .replace(/\u2213/g, "\\mp ")
    .replace(/\u221e/g, "\\infty ")
    .replace(/\u222b/g, "\\int ")
    .replace(/\u222c/g, "\\iint ")
    .replace(/\u2202/g, "\\partial ")
    .replace(/\u03a3/g, "\\sum ")
    .replace(/\u220f/g, "\\prod ")
    .replace(/\u2192/g, "\\to ")
    .replace(/\u2208/g, "\\in ")
    .replace(/\u2209/g, "\\notin ")
    .replace(/\u2282/g, "\\subset ")
    .replace(/\u2286/g, "\\subseteq ")
    .replace(/\u222a/g, "\\cup ")
    .replace(/\u2229/g, "\\cap ")
    .replace(/\u2205/g, "\\emptyset ")
    .replace(/\u21d2/g, "\\Rightarrow ")
    .replace(/\u21d4/g, "\\Leftrightarrow ")
    .replace(/\u00b0/g, "^\\circ ");
}

/**
 * Live formula preview component for the Zyra composer.
 * Uses the unified Artikel v4 MathText / KaTeX + mhchem pipeline.
 */
export function ZyraFormulaPreview({ input, className }: ZyraFormulaPreviewProps) {
  const isMath = useMemo(() => containsMathSyntax(input), [input]);

  const previewTarget = useMemo(() => {
    if (!isMath || !input.trim()) return null;
    const normalized = normalizeTutorMathMarkdown(normalizeUnicodeMath(input.trim()));
    const hasExplicitDelimiters = /\$|\\\[|\\\(|\\ce\{/.test(normalized);
    const looksLikeProseWithMath = /[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(
      normalized.replace(/\\[a-zA-Z]+/g, ""),
    );
    const bareMath = !hasExplicitDelimiters && !looksLikeProseWithMath;
    return { text: normalized, bareMath };
  }, [input, isMath]);

  if (!isMath || !previewTarget) return null;

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
      <div className="min-w-0 flex-1 overflow-x-auto py-0.5 text-foreground font-sans scrollbar-none">
        <MathText bareMath={previewTarget.bareMath}>{previewTarget.text}</MathText>
      </div>
    </div>
  );
}
