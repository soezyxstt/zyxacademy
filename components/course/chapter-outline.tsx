import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import type { ChapterOutlineItem } from "@/lib/course-utils";
import { cn } from "@/lib/utils";
import { getTranslations } from "@/lib/i18n/server";

type ChapterOutlineProps = {
  courseId: string;
  chapters: ChapterOutlineItem[];
  isEnrolled: boolean;
};

export async function ChapterOutline({ courseId, chapters }: ChapterOutlineProps) {
  const t = await getTranslations("studentCourse");
  if (chapters.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
          <h2 className="font-heading text-body-base font-bold text-foreground">{t("course.chapterOutline.title")}</h2>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-muted/15 py-10 text-center">
          <p className="text-body-sm text-muted-foreground">
            {t("course.chapterOutline.empty")}
          </p>
        </div>
      </section>
    );
  }

  const doneCount = chapters.filter((c) => c.completed).length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
        <h2 className="font-heading text-body-base font-bold text-foreground">{t("course.chapterOutline.title")}</h2>
        <span className="text-body-sm text-muted-foreground">
          {t("course.chapterOutline.chapterCount", { completed: doneCount, total: chapters.length })}
        </span>
      </div>

      <ul className="divide-y divide-border/60 zebra-no-rows overflow-hidden rounded-xl border border-border/70 bg-card">
        {chapters.map((ch, idx) => {
          const statusLabel = ch.hasMaterial
            ? ch.completed
              ? t("course.chapterOutline.completed")
              : ch.completionPercent > 0
                ? t("course.chapterOutline.percentRead", { percent: ch.completionPercent })
                : t("course.chapterOutline.unread")
            : t("course.chapterOutline.unavailable");

          const inner = (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold",
                    ch.completed
                      ? "bg-status-success/12 text-status-success"
                      : "bg-brand-primary/10 text-brand-primary",
                  )}
                >
                  {ch.completed ? <CheckCircle2 className="size-4" aria-hidden /> : idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="break-words text-body-sm font-semibold text-foreground">{ch.title}</p>
                  <p className="text-body-xs text-muted-foreground">{statusLabel}</p>
                </div>
              </div>
              {ch.hasMaterial && (
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-brand-primary"
                  aria-hidden
                />
              )}
            </div>
          );

          if (ch.hasMaterial && ch.materialId) {
            return (
              <li key={ch.id}>
                <Link
                  href={`/courses/${courseId}/material/${ch.materialId}`}
                  className="group block transition-colors hover:bg-muted/30"
                >
                  {inner}
                </Link>
              </li>
            );
          }

          return (
            <li key={ch.id} className="opacity-70">
              {inner}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
