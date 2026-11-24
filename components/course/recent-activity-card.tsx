"use client";

import { History, BookOpen, CheckCircle2, ClipboardList, Target } from "lucide-react";
import { RecentActivityData } from "@/types/course-learning";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";

function formatRelativeTime(isoString: string, locale: "id" | "en", t: ReturnType<typeof useTranslations>): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return t("course.recentActivity.justNow");
    const diffMins = Math.floor(diffMs / (60 * 1000));
    if (diffMins < 1) return t("course.recentActivity.justNow");
    if (diffMins < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffMins, "minute");
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffHours, "hour");
    const diffDays = Math.floor(diffHours / 24);
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffDays, "day");
  } catch {
    return t("course.recentActivity.recently");
  }
}

export function RecentActivitySkeleton() {
  return (
    <div className="min-w-0" aria-hidden="true">
      <div className="mb-1 h-4 w-28 rounded bg-muted motion-safe:animate-pulse" />
      <div className="divide-y divide-border/30">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-(--related-gap) py-(--row-padding)">
            <div className="flex min-w-0 flex-1 items-center gap-(--compact-gap)">
              <div className="size-4 shrink-0 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-4 w-1/2 rounded bg-muted motion-safe:animate-pulse" />
            </div>
            <div className="h-3 w-16 shrink-0 rounded bg-muted motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

type DailyActivity = { id: string; type: "daily_summary"; title: string; timestamp: string; description?: string };
interface RecentActivityCardProps {
  data: (RecentActivityData | DailyActivity)[] | null;
  isLoading?: boolean;
}

export function RecentActivityCard({
  data,
  isLoading = false,
}: RecentActivityCardProps) {
  const t = useTranslations("studentCourse");
  const { locale } = useAppLocale();
  if (isLoading) {
    return <RecentActivitySkeleton />;
  }

  const isEmpty = !data || data.length === 0;
  const activityTitles: Record<string, string> = {
    "Aktivitas belajar": t("course.recentActivity.learning"),
    "Learning activity": t("course.recentActivity.learning"),
    "Menyelesaikan dokumen": t("course.recentActivity.materialCompleted"),
    "Menjawab kuis": t("course.recentActivity.quizAnswered"),
    "Mengulas flashcard": t("course.recentActivity.flashcardReviewed"),
  };
  const isGenericTitle = (title: string) => title === "Aktivitas belajar" || title === "Learning activity";

  const getIcon = (type: RecentActivityData["type"] | "daily_summary") => {
    switch (type) {
      case "daily_summary":
        return History;
      case "flashcard_review":
        return CheckCircle2;
      case "material_completion":
        return BookOpen;
      case "quiz_completion":
        return ClipboardList;
      case "tryout_completion":
        return Target;
    }
  };

  return (
    <section className="min-w-0">
      <h2 className="mb-1 font-heading text-body-base font-bold text-foreground">
        {t("course.recentActivity.title")}
      </h2>

      {!isEmpty ? (
        <ul className="divide-y divide-border/30">
          {data.map((activity) => {
            const Icon = getIcon(activity.type);
            return (
              <li key={activity.id} className="flex min-w-0 items-start justify-between gap-(--compact-gap) py-(--row-padding)">
                <div className="flex min-w-0 flex-1 items-start gap-(--compact-gap)">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 wrap-anywhere">
                    <p className="text-body-sm font-semibold leading-snug text-foreground">
                      {isGenericTitle(activity.title) && activity.description ? activity.description : activityTitles[activity.title] ?? activity.title}
                    </p>
                    {activity.description && !isGenericTitle(activity.title) && (
                      <p className="mt-0.5 text-body-xs leading-snug text-muted-foreground">
                        {activity.description}
                      </p>
                    )}
                  </div>
                </div>
                <span className="mt-0.5 max-w-1/3 shrink-0 wrap-anywhere text-right text-body-xs tabular-nums text-muted-foreground">
                  {activity.type === "daily_summary" ? activity.timestamp : formatRelativeTime(activity.timestamp, locale, t)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-(--table-row-padding) text-body-sm text-muted-foreground">{t("course.recentActivity.empty")}</p>
      )}
    </section>
  );
}
