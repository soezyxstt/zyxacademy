"use client";

import { useState, useEffect } from "react";
import { X, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";

interface WeeklyReflectionProps {
  reflection: {
    id: string;
    studentId: string;
    weekStart: string;
    payload: {
      completed: {
        quizzes: number;
        flashcards: number;
        modules: number;
      };
      masteryGrowth: number;
      mostImproved: string | null;
      streak: {
        currentStreak: number;
        longestStreak: number;
      };
    };
    createdAt: string | Date;
  } | null;
}

export function WeeklyReflection({ reflection }: WeeklyReflectionProps) {
  const t = useTranslations("student");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!reflection) return;

    const localStorageKey = `reflection-dismissed-${reflection.weekStart}`;
    const isDismissed = localStorage.getItem(localStorageKey) === "true";

    const now = new Date();
    const createdDate = new Date(reflection.createdAt);
    const diffMs = now.getTime() - createdDate.getTime();
    const isRecent = diffMs >= 0 && diffMs <= 3 * 24 * 60 * 60 * 1000;

    const dayOfWeek = now.getDay();
    const isMonToWed = dayOfWeek >= 1 && dayOfWeek <= 3;

    if (!isDismissed && (isRecent || isMonToWed)) {
      setDismissed(false);
    }
  }, [reflection]);

  if (!reflection || dismissed) return null;

  const { completed, masteryGrowth, mostImproved, streak } = reflection.payload;
  const totalCompleted = completed.quizzes + completed.flashcards + completed.modules;

  const handleDismiss = () => {
    const localStorageKey = `reflection-dismissed-${reflection.weekStart}`;
    localStorage.setItem(localStorageKey, "true");
    setDismissed(true);
  };

  const breakdown = [
    completed.quizzes > 0 ? t("dashboard.quizCount", { count: completed.quizzes }) : null,
    completed.flashcards > 0 ? t("dashboard.flashcardCount", { count: completed.flashcards }) : null,
    completed.modules > 0 ? t("dashboard.moduleCount", { count: completed.modules }) : null,
    streak.currentStreak > 0 ? t("dashboard.streakCount", { count: streak.currentStreak }) : null,
  ].filter(Boolean) as string[];

  const summaryHead =
    masteryGrowth > 0
      ? `+${masteryGrowth} ${t("dashboard.masteryPoints")}`
      : `${totalCompleted} ${t("dashboard.completedActivities", { count: totalCompleted })}`;

  return (
    <section className="mb-6 hidden items-center justify-between gap-3 sm:flex">
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted-foreground">
        <TrendingUp className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold text-foreground">{t("dashboard.weeklyReflection")}:</span>
        <span className="tabular-nums text-foreground">{summaryHead}</span>
        {breakdown.length > 0 && (
          <span className="tabular-nums">({breakdown.join(", ")})</span>
        )}
        {mostImproved && (
          <span>
            {t("dashboard.improvement")}{" "}
            <strong className="font-semibold text-foreground">{mostImproved}</strong>
          </span>
        )}
      </p>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleDismiss}
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={t("dashboard.closeReflection")}
      >
        <X className="size-3.5" />
      </Button>
    </section>
  );
}
