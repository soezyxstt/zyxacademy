"use client";

import React from "react";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import { MarkdownRenderer, type MarkdownDensity } from "@/components/course/markdown-renderer";
import type { ASTBlock } from "@/lib/ast-validator";

export interface ArticleReadingCanvasProps {
  content: string | ASTBlock[];
  courseTitle?: string;
  chapterTitle?: string;
  sectionTitle?: string;
  breadcrumb?: React.ReactNode;
  breadcrumbItems?: string[];
  conceptTags?: string[];
  density?: MarkdownDensity;
  showDivider?: boolean;
  className?: string;
  contentClassName?: string;
}

export function ArticleReadingCanvas({
  content,
  chapterTitle,
  sectionTitle,
  conceptTags,
  density = "default",
  showDivider = true,
  className,
  contentClassName,
}: ArticleReadingCanvasProps) {
  const hasHeaderInfo = Boolean(
    chapterTitle ||
    (conceptTags && conceptTags.length > 0) ||
    sectionTitle
  );

  return (
    <div className={cn("max-w-2xl mx-auto px-6 py-8", className)}>
      {/* Chapter Title */}
      {chapterTitle && (
        <h1 className="text-h5 font-bold text-primary font-heading tracking-tight mt-1 mb-2">
          <MathText className="normal-case">{chapterTitle}</MathText>
        </h1>
      )}

      {/* Concept tags row */}
      {conceptTags && conceptTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 mt-2">
          {conceptTags.map((tag) => (
            <span
              key={tag}
              className="bg-primary/5 text-primary text-body-xs font-semibold px-2 py-0.5 rounded-md"
            >
              <MathText className="normal-case">{tag}</MathText>
            </span>
          ))}
        </div>
      )}

      {/* Divider */}
      {showDivider && hasHeaderInfo && (
        <hr className="border-border/80 my-4" />
      )}

      {/* Section heading below divider */}
      {sectionTitle && (
        <h2 className="font-heading text-body-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          <MathText className="normal-case">{sectionTitle}</MathText>
        </h2>
      )}

      {/* Section content */}
      <div className={cn("w-full", contentClassName)}>
        <MarkdownRenderer content={content} density={density} />
      </div>
    </div>
  );
}
