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

  return (
    <section className="relative mb-4 hidden border-b border-border/50 pb-3 sm:block">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary shrink-0" aria-hidden />
            <span className="font-heading text-body-sm font-bold text-foreground">
              {t("dashboard.weeklyReflection")}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 border-l border-border/50 pl-3">
            {masteryGrowth > 0 ? (
              <>
                <span className="font-heading text-body-base font-bold tabular-nums text-status-success">
                  +{masteryGrowth}
                </span>
                <span className="text-body-xs text-muted-foreground">{t("dashboard.masteryPoints")}</span>
              </>
            ) : (
              <>
                <span className="font-heading text-body-base font-bold tabular-nums text-foreground">
                  {totalCompleted}
                </span>
                <span className="text-body-xs text-muted-foreground">
                  {t("dashboard.completedActivities", { count: totalCompleted })}
                </span>
              </>
            )}
          </div>
          {breakdown.length > 0 && (
            <div className="hidden lg:flex items-center gap-x-3 text-body-xs tabular-nums text-muted-foreground">
              {breakdown.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {mostImproved && (
            <span className="text-body-xs text-muted-foreground hidden md:inline">
              {t("dashboard.improvement")} <strong className="text-foreground">{mostImproved}</strong>
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={t("dashboard.closeReflection")}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
