"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, Layers, Target } from "lucide-react";
import type { CourseAttentionData } from "@/types/course-learning";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface CourseAttentionStripProps {
  attention: CourseAttentionData | null;
  className?: string;
}

export function CourseAttentionStrip({ attention, className }: CourseAttentionStripProps) {
  const t = useTranslations("studentCourse");
  if (!attention || attention.items.length === 0) {
    return null;
  }

  return (
    <section
      className={cn("text-left", className)}
      aria-label={t("course.attention.title")}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-status-warning">
        <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
        <h3 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("course.attention.title")}
        </h3>
      </div>
      <div className="space-y-0.5">
        {attention.items.map((item, idx) => {
          const Icon = item.kind === "flashcard" ? Layers : Target;
          const displayText =
            item.kind === "flashcard"
              ? item.count != null
                ? t("course.attention.flashcardsDue", { count: item.count })
                : item.label
              : item.conceptName ?? item.label;

          return (
            <Link
              key={`${item.kind}-${idx}`}
              href={item.href}
              className="group -mx-2.5 flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-status-warning/10 text-status-warning">
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-foreground transition-colors group-hover:text-brand-primary">
                <MathText as="span">{displayText}</MathText>
              </span>
              {item.masteryScore != null && (
                <span className="shrink-0 rounded-md bg-status-warning/12 px-2 py-0.5 text-body-xs font-semibold tabular-nums text-status-warning">
                  {item.masteryScore}%
                </span>
              )}
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
