"use client";

import { Clock, BookOpen, CheckCircle2, Flame } from "lucide-react";
import { StudyStatisticsData } from "@/types/course-learning";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { useTranslations } from "@/lib/i18n/client";

export function StudyStatisticsSkeleton() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex min-h-11 items-center gap-2 bg-card/75 px-3 py-2">
            <div className="size-3.5 bg-muted rounded-md animate-pulse" />
            <div className="h-3 w-16 bg-muted rounded-md animate-pulse" />
            <div className="ml-auto h-4 w-10 bg-muted rounded-md animate-pulse" />
          </div>
        ))}
      </div>
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
      <AdminStatStrip className="grid-cols-2 sm:grid-cols-4">
        <AdminStatStripItem icon={Clock} iconClassName="text-brand-primary" label={t("course.statistics.studyTime")} value={stats.studyTimeMin === null ? "-" : t("course.statistics.minutes", { count: stats.studyTimeMin })} />
        <AdminStatStripItem icon={BookOpen} iconClassName="text-status-info" label={t("course.statistics.completedDocuments")} value={t("course.statistics.materials", { count: stats.completedMaterialsCount })} />
        <AdminStatStripItem icon={CheckCircle2} iconClassName="text-status-success" label={t("course.statistics.reviewedCards")} value={stats.cardsReviewedCount === null ? "-" : t("course.statistics.reviews", { count: stats.cardsReviewedCount })} />
        <AdminStatStripItem icon={Flame} iconClassName="text-brand-secondary" label={t("course.statistics.streak")} value={t("course.statistics.days", { count: stats.currentStreakDays })} />
      </AdminStatStrip>
    </div>
  );
}
