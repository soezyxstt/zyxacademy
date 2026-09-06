"use client";

import { BarChart3, Clock, BookOpen, CheckCircle2, Flame } from "lucide-react";
import { StudyStatisticsData } from "@/types/course-learning";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";

export function StudyStatisticsSkeleton() {
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-2">
        <div className="size-5 bg-muted rounded-md animate-pulse" />
        <div className="h-5 w-44 bg-muted rounded-md animate-pulse" />
      </div>
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
  data: StudyStatisticsData | null;
  isLoading?: boolean;
}

export function StudyStatisticsCard({
  data,
  isLoading = false,
}: StudyStatisticsCardProps) {
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
      <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
        <BarChart3 className="size-4.5 text-brand-primary" aria-hidden="true" />
        Statistik Belajar
      </h3>

      <AdminStatStrip className="grid-cols-2 sm:grid-cols-4">
        <AdminStatStripItem icon={Clock} label="Waktu belajar" value={`${stats.studyTimeMin} menit`} tone="brand" />
        <AdminStatStripItem icon={BookOpen} label="Dokumen selesai" value={`${stats.completedMaterialsCount} materi`} tone="info" />
        <AdminStatStripItem icon={CheckCircle2} label="Kartu diulas" value={`${stats.cardsReviewedCount} ulasan`} tone="success" />
        <AdminStatStripItem icon={Flame} label="Streak belajar" value={`${stats.currentStreakDays} hari`} tone="brand-secondary" />
      </AdminStatStrip>
    </div>
  );
}
