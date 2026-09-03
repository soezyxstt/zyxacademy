"use client";

import { useState } from "react";
import { Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DailyQuizPopup } from "./daily-quiz-popup";

type DailyQuizSectionProps = {
  courseId: string;
  courseTitle: string;
  dailyTrivia?: {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  } | null;
};

export function DailyQuizSection({ courseId, courseTitle, dailyTrivia }: DailyQuizSectionProps) {
  const [manualTrigger, setManualTrigger] = useState(false);

  if (!dailyTrivia) return null;

  return (
    <div className="font-sans">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/40 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Brain className="size-4 shrink-0 text-brand-primary" aria-hidden />
          <div className="min-w-0">
            <span className="text-body-sm font-semibold text-foreground">Trivia Harian</span>
            <span className="ml-2 hidden text-body-sm text-muted-foreground sm:inline">
              Uji pemahamanmu dengan satu soal cepat.
            </span>
          </div>
        </div>
        <Button
          type="button"
          id="daily-trivia-trigger"
          onClick={() => setManualTrigger(true)}
          size="sm"
          variant="outline"
          className="interactive shrink-0 gap-1.5 rounded-md"
        >
          Mulai
        </Button>
      </div>

      <DailyQuizPopup
        courseId={courseId}
        courseTitle={courseTitle}
        triggerManual={manualTrigger}
        onCloseManual={() => setManualTrigger(false)}
        dailyTrivia={dailyTrivia}
      />
    </div>
  );
}
