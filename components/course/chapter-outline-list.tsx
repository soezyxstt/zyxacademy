"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Lock } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { courseListRowClass } from "./course-surfaces";

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
      <div className="mb-2 flex items-center justify-between gap-4 border-b border-border/40 pb-2">
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
      <ul className="zebra-no-rows divide-y divide-border/30">
        {chapters.map((chapter) => {
          const isUnavailable = !chapter.hasMaterial;
          const isInProgress = chapter.hasMaterial && !chapter.completed && chapter.completionPercent > 0;
          const clampedPercent = Math.min(100, Math.max(0, chapter.completionPercent));
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
            <div className="flex min-w-0 items-center gap-3 py-(--row-padding)">
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
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    "break-words text-body-sm font-semibold leading-snug",
                    isUnavailable
                      ? "text-muted-foreground"
                      : "text-foreground",
                  )}
                >
                  {chapter.title}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-body-xs leading-snug tabular-nums",
                      chapter.completed ? "font-medium text-status-success" : "text-muted-foreground",
                    )}
                  >
                    {status}
                  </span>
                  {isInProgress && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-1 w-14 overflow-hidden rounded-sm bg-muted"
                    >
                      <span
                        className="block h-full bg-primary transition-[width]"
                        style={{ width: `${clampedPercent}%` }}
                      />
                    </span>
                  )}
                </div>
              </div>
              {chapter.href && (
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden="true"
                />
              )}
            </div>
          );

          return (
            <li key={chapter.id}>
              {chapter.href ? (
                <Link href={chapter.href} className={courseListRowClass("-mx-2.5 block px-2.5 py-0")}>
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
