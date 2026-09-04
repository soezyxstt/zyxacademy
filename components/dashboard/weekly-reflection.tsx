"use client";

import { useState, useEffect } from "react";
import { X, TrendingUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { studentCardClass } from "@/components/course/course-surfaces";

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
  const [dismissed, setDismissed] = useState(true); // Default to true to avoid hydration flicker

  useEffect(() => {
    if (!reflection) return;

    // Check localStorage for dismissal
    const localStorageKey = `reflection-dismissed-${reflection.weekStart}`;
    const isDismissed = localStorage.getItem(localStorageKey) === "true";

    // Check if the reflection is recent (created within the last 72 hours / 3 days)
    const now = new Date();
    const createdDate = new Date(reflection.createdAt);
    const diffMs = now.getTime() - createdDate.getTime();
    const isRecent = diffMs >= 0 && diffMs <= 3 * 24 * 60 * 60 * 1000;

    // Also check if current day is Mon, Tue, or Wed as fallback
    const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday, etc.
    const isMonToWed = dayOfWeek >= 1 && dayOfWeek <= 3;

    // Show if not dismissed and (either recent/seeded or currently Mon-Wed)
    if (!isDismissed && (isRecent || isMonToWed)) {
      setDismissed(false);
    }
  }, [reflection]);

  if (!reflection || dismissed) {
    return null;
  }

  const { completed, masteryGrowth, mostImproved, streak } = reflection.payload;
  const totalCompleted = completed.quizzes + completed.flashcards + completed.modules;

  const handleDismiss = () => {
    const localStorageKey = `reflection-dismissed-${reflection.weekStart}`;
    localStorage.setItem(localStorageKey, "true");
    setDismissed(true);
  };

  return (
    <section className={studentCardClass("relative overflow-hidden mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300")}>
      <div className="flex items-center justify-between">
        <h2 className="text-body-base font-heading font-bold text-foreground flex items-center gap-2">
          <Sparkles className="size-4.5 text-brand-primary" />
          Refleksi mingguan
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label="Tutup refleksi mingguan"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-4">
        {masteryGrowth > 0 ? (
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-h3 font-bold text-status-success tabular-nums">
              +{masteryGrowth}
            </span>
            <span className="text-body-sm text-muted-foreground">poin penguasaan</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-h3 font-bold text-foreground tabular-nums">
              {totalCompleted}
            </span>
            <span className="text-body-sm text-muted-foreground">aktivitas selesai</span>
          </div>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm text-muted-foreground mt-2">
          <span>{completed.quizzes} kuis</span>
          <span>{completed.flashcards} flashcard</span>
          <span>{completed.modules} modul</span>
          <span>{streak.currentStreak} hari streak</span>
        </div>

        {mostImproved && (
          <p className="text-body-sm mt-3 flex items-center gap-1.5 pt-2 border-t border-border/40">
            <span className="text-muted-foreground">Peningkatan terbesar:</span>{" "}
            <span className="font-semibold text-foreground">{mostImproved}</span>
            <TrendingUp className="size-3.5 text-status-success shrink-0" />
          </p>
        )}
      </div>
    </section>
  );
}
