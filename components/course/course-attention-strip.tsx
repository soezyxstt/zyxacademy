"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
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
      className={cn(
        "rounded-xl border border-status-warning/30 bg-status-warning/5 p-3.5 text-left shadow-2xs",
        className,
      )}
      aria-label={t("course.attention.title")}
    >
      <div className="flex items-center gap-2 pb-1.5 text-status-warning">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        <h3 className="font-heading text-body-sm font-bold text-foreground">
          {t("course.attention.title")}
        </h3>
      </div>
      <div className="divide-y divide-border/40">
        {attention.items.map((item, idx) => (
          <div
            key={`${item.kind}-${idx}`}
            className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-body-xs font-medium text-foreground">
              <MathText as="span">{item.label}</MathText>
            </p>
            <Link
              href={item.href}
              className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline shrink-0"
            >
              <span>{item.actionLabel}</span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
