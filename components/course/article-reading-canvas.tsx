"use client";

import React from "react";
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
  courseTitle,
  chapterTitle,
  sectionTitle,
  breadcrumb,
  breadcrumbItems,
  conceptTags,
  density = "default",
  showDivider = true,
  className,
  contentClassName,
}: ArticleReadingCanvasProps) {
  const hasBreadcrumb = Boolean(
    breadcrumb ||
    (breadcrumbItems && breadcrumbItems.length > 0) ||
    courseTitle ||
    chapterTitle ||
    sectionTitle
  );

  const hasHeaderInfo = Boolean(
    hasBreadcrumb ||
    chapterTitle ||
    (conceptTags && conceptTags.length > 0) ||
    sectionTitle
  );

  return (
    <div className={cn("max-w-2xl mx-auto px-6 py-8", className)}>
      {/* Breadcrumb */}
      {breadcrumb ? (
        <div className="mb-1">{breadcrumb}</div>
      ) : breadcrumbItems && breadcrumbItems.length > 0 ? (
        <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground mb-1 select-none font-medium flex-wrap">
          {breadcrumbItems.map((item, idx) => {
            const isLast = idx === breadcrumbItems.length - 1;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <span>&rarr;</span>}
                <span className={cn(isLast && "text-foreground font-semibold")}>
                  {item}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      ) : hasBreadcrumb ? (
        <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground mb-1 select-none font-medium flex-wrap">
          {courseTitle && <span>{courseTitle}</span>}
          {courseTitle && (chapterTitle || sectionTitle) && <span>&rarr;</span>}
          {chapterTitle && (
            <span className={cn(!sectionTitle && "text-foreground font-semibold")}>
              {chapterTitle}
            </span>
          )}
          {chapterTitle && sectionTitle && <span>&rarr;</span>}
          {sectionTitle && (
            <span className="text-foreground font-semibold">{sectionTitle}</span>
          )}
        </div>
      ) : null}

      {/* Chapter Title */}
      {chapterTitle && (
        <h1 className="text-h5 font-bold text-primary font-heading tracking-tight mt-1 mb-2">
          {chapterTitle}
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
              {tag}
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
          {sectionTitle}
        </h2>
      )}

      {/* Section content */}
      <div className={cn("w-full", contentClassName)}>
        <MarkdownRenderer content={content} density={density} />
      </div>
    </div>
  );
}
