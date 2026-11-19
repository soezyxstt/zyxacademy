"use client";

import { Clock, BookOpen, CheckCircle2, Flame } from "lucide-react";
import { StudyStatisticsData } from "@/types/course-learning";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { useTranslations } from "@/lib/i18n/client";

export function StudyStatisticsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/40 pb-3.5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="inline-flex items-center gap-1.5">
          <div className="size-3.5 shrink-0 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
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

  return (
    <div className="w-full space-y-2">
      <AdminStatStrip>
        <AdminStatStripItem icon={Clock} label={t("course.statistics.studyTime")} value={stats.studyTimeMin === null ? "-" : t("course.statistics.minutes", { count: stats.studyTimeMin })} />
        <AdminStatStripItem icon={BookOpen} label={t("course.statistics.completedDocuments")} value={t("course.statistics.materials", { count: stats.completedMaterialsCount })} />
        <AdminStatStripItem icon={CheckCircle2} label={t("course.statistics.reviewedCards")} value={stats.cardsReviewedCount === null ? "-" : t("course.statistics.reviews", { count: stats.cardsReviewedCount })} />
        <AdminStatStripItem icon={Flame} iconClassName="text-brand-secondary/80" label={t("course.statistics.streak")} value={t("course.statistics.days", { count: stats.currentStreakDays })} />
      </AdminStatStrip>
    </div>
  );
}
