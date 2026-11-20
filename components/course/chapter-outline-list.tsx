"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type ChapterOutlineRow = {
  id: string;
  title: string;
  number: number;
  completionPercent: number;
  completed: boolean;
  hasMaterial: boolean;
  href?: string;
  statusLabel?: string;
};

export function ChapterOutlineList({ chapters, showCount = true }: { chapters: ChapterOutlineRow[]; showCount?: boolean }) {
  const t = useTranslations("studentCourse");
  if (!chapters.length) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
          <h2 className="font-heading text-body-base font-bold text-foreground">
            {t("course.chapterOutline.title")}
          </h2>
        </div>
        <div className="py-3">
          <p className="text-body-sm text-muted-foreground">{t("course.chapterOutline.empty")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="mb-1.5 flex items-center justify-between gap-4 border-b border-border/40 pb-2">
        <h2 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("course.chapterOutline.title")}
        </h2>
        {showCount && (
          <span className="text-body-xs font-medium tabular-nums text-muted-foreground">
            {t("course.chapterOutline.chapterCount", {
              completed: chapters.filter((chapter) => chapter.completed).length,
              total: chapters.length,
            })}
          </span>
        )}
      </div>
      <ul className="divide-y divide-border/30 zebra-no-rows">
        {chapters.map((chapter) => {
          const isUnavailable = !chapter.hasMaterial;
          const status =
            chapter.statusLabel ??
            (chapter.hasMaterial
              ? chapter.completed
                ? t("course.chapterOutline.completed")
                : chapter.completionPercent > 0
                  ? t("course.chapterOutline.percentRead", { percent: chapter.completionPercent })
                  : t("course.chapterOutline.unread")
              : t("course.chapterOutline.unavailable"));

          const row = (
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg text-body-xs font-bold tabular-nums",
                    chapter.completed
                      ? "bg-status-success/15 text-status-success"
                      : isUnavailable
                        ? "bg-muted/60 text-muted-foreground"
                        : "bg-muted text-foreground",
                  )}
                >
                  {chapter.completed ? (
                    <CheckCircle2 className="size-4" aria-hidden />
                  ) : isUnavailable ? (
                    <Lock className="size-3.5" aria-hidden />
                  ) : (
                    chapter.number
                  )}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      "break-words text-body-sm font-semibold leading-snug",
                      isUnavailable
                        ? "text-muted-foreground"
                        : "text-foreground transition-colors group-hover:text-brand-primary",
                    )}
                  >
                    {chapter.title}
                  </span>
                  <span
                    className={cn(
                      "text-body-xs leading-snug",
                      chapter.completed ? "font-medium text-status-success" : "text-muted-foreground",
                    )}
                  >
                    {status}
                  </span>
                </div>
              </div>
              {chapter.href && (
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden
                />
              )}
            </div>
          );

          return (
            <li key={chapter.id} className={isUnavailable && !chapter.href ? "opacity-45" : undefined}>
              {chapter.href ? (
                <Link href={chapter.href} className="group -mx-2.5 block rounded-lg px-2.5 transition-colors hover:bg-muted/40">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
