"use client";

import type { StudyStatisticsData } from "@/types/course-learning";
import { useTranslations } from "@/lib/i18n/client";

const comparisonLayout = "grid min-w-0 divide-y divide-border/30 md:grid-cols-4 md:gap-x-(--group-gap) md:divide-y-0";
const metricRow = "flex min-w-0 items-baseline justify-between gap-x-(--compact-gap) py-(--table-row-padding) md:flex-col md:items-start md:gap-y-1";

export function StudyStatisticsSkeleton() {
  return (
    <div className={comparisonLayout} aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={metricRow}>
          <div className="h-4 w-24 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-16 rounded bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

interface StudyStatisticsCardProps {
  data: (Omit<StudyStatisticsData, "studyTimeMin" | "cardsReviewedCount"> & { studyTimeMin: number | null; cardsReviewedCount: number | null }) | null;
  isLoading?: boolean;
}

export function StudyStatisticsCard({
  data,
  isLoading = false,
}: StudyStatisticsCardProps) {
  const t = useTranslations("studentCourse");
  if (isLoading) {
    return <StudyStatisticsSkeleton />;
  }

  const stats = data || {
    studyTimeMin: 0,
    completedMaterialsCount: 0,
    cardsReviewedCount: 0,
    currentStreakDays: 0,
  };
  const metrics = [
    { id: "studyTime", value: stats.studyTimeMin === null ? "-" : t("course.statistics.minutes", { count: stats.studyTimeMin }) },
    { id: "completedDocuments", value: t("course.statistics.materials", { count: stats.completedMaterialsCount }) },
    { id: "reviewedCards", value: stats.cardsReviewedCount === null ? "-" : t("course.statistics.reviews", { count: stats.cardsReviewedCount }) },
    { id: "streak", value: t("course.statistics.days", { count: stats.currentStreakDays }) },
  ] as const;

  return (
    <dl className={comparisonLayout} aria-label={t("course.statistics.title")}>
      {metrics.map(({ id, value }) => (
        <div key={id} className={metricRow}>
          <dt className="min-w-0 wrap-anywhere text-body-sm text-muted-foreground">{t(`course.statistics.${id}`)}</dt>
          <dd className="shrink-0 text-body-sm font-semibold tabular-nums text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
