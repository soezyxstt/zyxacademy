"use client";

import { History, BookOpen, CheckCircle2, ClipboardList, Target } from "lucide-react";
import { RecentActivityData } from "@/types/course-learning";
import { studentCardClass } from "@/components/course/course-surfaces";
import { cn } from "@/lib/utils";
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
    <div className={cn(studentCardClass(), "w-full")}>
      <div className="flex items-center gap-2 mb-4">
        <div className="size-5 bg-muted rounded-md animate-pulse" />
        <div className="h-5 w-40 bg-muted rounded-md animate-pulse" />
      </div>
      <div className="divide-y divide-border">
        {[1, 2, 3].map((i) => (
          <div key={i} className="py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full">
              <div className="size-8 bg-muted rounded-md animate-pulse shrink-0" />
              <div className="space-y-1.5 w-full">
                <div className="h-4 w-1/3 bg-muted rounded-md animate-pulse" />
                <div className="h-3 w-1/2 bg-muted rounded-md animate-pulse" />
              </div>
            </div>
            <div className="h-3 w-16 bg-muted rounded-md animate-pulse shrink-0" />
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
        return <History className="size-4 text-brand-primary" aria-hidden="true" />;
      case "flashcard_review":
        return <CheckCircle2 className="size-4 text-tertiary-3" aria-hidden="true" />;
      case "material_completion":
        return <BookOpen className="size-4 text-brand-primary" aria-hidden="true" />;
      case "quiz_completion":
        return <ClipboardList className="size-4 text-tertiary-1" aria-hidden="true" />;
      case "tryout_completion":
        return <Target className="size-4 text-brand-secondary" aria-hidden="true" />;
    }
  };

  return (
    <div className={cn(studentCardClass(), "w-full")}>
      <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-2">
        <History className="size-4.5 text-brand-primary" aria-hidden="true" />
        {t("course.recentActivity.title")}
      </h3>

      {!isEmpty ? (
        <div className="divide-y divide-border zebra-no-rows animate-in fade-in slide-in-from-bottom-2 duration-300">
          {data.map((activity) => (
            <div key={activity.id} className="py-3.5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 border border-border/40 mt-0.5">
                  {getIcon(activity.type)}
                </div>
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-foreground leading-tight">
                    {isGenericTitle(activity.title) && activity.description ? activity.description : activityTitles[activity.title] ?? activity.title}
                  </p>
                  {activity.description && !isGenericTitle(activity.title) && (
                    <p className="text-body-xs text-muted-foreground mt-0.5 leading-snug">
                      {activity.description}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-body-xs text-muted-foreground shrink-0 mt-0.5">
                {activity.type === "daily_summary" ? activity.timestamp : formatRelativeTime(activity.timestamp, locale, t)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center animate-in fade-in duration-300">
          <p className="text-body-sm text-muted-foreground">{t("course.recentActivity.empty")}</p>
        </div>
      )}
    </div>
  );
}
