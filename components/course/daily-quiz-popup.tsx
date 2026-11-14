"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, CheckCircle2, XCircle, BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { cn } from "@/lib/utils";
import { jakartaDay } from "@/lib/date-utils";
import { useTranslations } from "@/lib/i18n/client";

const DAILY_QUIZ_STORAGE_PREFIX = "zyx-daily-quiz";

function getTodayString() {
  return jakartaDay();
}

function getLegacyTodayString() {
  const today = new Date();

  return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

function getDailyQuizStorageKey(courseId: string) {
  return `${DAILY_QUIZ_STORAGE_PREFIX}-${courseId}-${getTodayString()}`;
}

function getLegacyDailyQuizStorageKey(courseId: string) {
  return `${DAILY_QUIZ_STORAGE_PREFIX}-${courseId}-${getLegacyTodayString()}`;
}

function hasCompletedDailyQuizToday(courseId: string) {
  if (typeof window === "undefined") return true;

  return (
    window.localStorage.getItem(getDailyQuizStorageKey(courseId)) === "completed" ||
    window.localStorage.getItem(getLegacyDailyQuizStorageKey(courseId)) === "completed"
  );
}

function markDailyQuizCompletedToday(courseId: string) {
  window.localStorage.setItem(getDailyQuizStorageKey(courseId), "completed");
}

type DailyQuizPopupProps = {
  courseId: string;
  courseTitle: string;
  triggerManual?: boolean;
  onCloseManual?: () => void;
  dailyTrivia?: {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  } | null;
};

export function DailyQuizPopup({
  courseId,
  courseTitle,
  triggerManual = false,
  onCloseManual,
  dailyTrivia,
}: DailyQuizPopupProps) {
  const t = useTranslations("studentCourse");
  const [show, setShow] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const trivia = dailyTrivia;

  useEffect(() => {
    const quizCompleted = hasCompletedDailyQuizToday(courseId);
    const delay = triggerManual ? 0 : 800;

    if (triggerManual) {
      if (quizCompleted) {
        const timer = setTimeout(() => onCloseManual?.(), delay);
        return () => clearTimeout(timer);
      }

      const timer = setTimeout(() => {
        setShow(true);
        setSubmitted(false);
        setSelectedIdx(null);
      }, delay);
      return () => clearTimeout(timer);
    } else if (!quizCompleted) {
      const timer = setTimeout(() => {
        setShow(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [courseId, triggerManual, onCloseManual]);

  // Listen to simulator reset events
  useEffect(() => {
    const handleReset = () => {
      if (!triggerManual) {
        setShow(false);
        setSubmitted(false);
        setSelectedIdx(null);
      }
    };
    window.addEventListener("zyx-daily-quiz-reset", handleReset);
    return () => window.removeEventListener("zyx-daily-quiz-reset", handleReset);
  }, [triggerManual]);

  function handleSubmit() {
    if (selectedIdx === null || !trivia) return;

    const correct = selectedIdx === trivia.correctIndex;
    setIsCorrect(correct);
    setSubmitted(true);

    markDailyQuizCompletedToday(courseId);
  }

  function handleClose() {
    setShow(false);
    if (onCloseManual) {
      onCloseManual();
    }
  }

  if (!show || !trivia) return null;

  return (
    <Dialog open={show} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent aria-describedby={undefined} closeLabel={t("course.dailyQuiz.close")} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-5 font-sans">
        <div className="flex items-center gap-2.5 pr-8">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
            <BrainCircuit className="size-5" />
          </span>
          <DialogTitle className="min-w-0 break-words leading-tight">{courseTitle} Trivia</DialogTitle>
        </div>

        {!submitted ? (
          <div className="mt-4">
            <MarkdownRenderer content={trivia.question} className="text-body-base font-semibold text-foreground leading-relaxed" />

            <ul className="mt-4 space-y-2">
              {trivia.options.map((opt, idx) => {
                const selected = selectedIdx === idx;
                return (
                  <li key={idx}>
                    <div
                      onClick={(event) => {
                        if ((event.target as Element).closest("button, input, select, textarea, a, figure, [data-learning-visual]")) return;
                        setSelectedIdx(idx);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-body-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        selected
                          ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary"
                          : "border-border bg-muted/20 hover:border-brand-primary/30 hover:bg-muted/40"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedIdx(idx)}
                        aria-pressed={selected}
                        aria-labelledby={`daily-quiz-letter-${idx} daily-quiz-option-${idx}`}
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center self-start rounded-lg text-body-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          selected ? "bg-brand-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <span id={`daily-quiz-letter-${idx}`}>{String.fromCharCode(65 + idx)}</span>
                      </button>
                      <div id={`daily-quiz-option-${idx}`} className="min-w-0 flex-1 break-words text-foreground"><MarkdownRenderer content={opt} density="compact" /></div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={handleClose} className="rounded-md">
                {t("course.dailyQuiz.later")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={selectedIdx === null}
                className="rounded-md bg-brand-primary text-primary-foreground px-6"
              >
                {t("course.dailyQuiz.sendAnswer")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div
              className={cn(
                "rounded-lg border p-3 flex items-start gap-3",
                isCorrect
                  ? "bg-status-success/10 border-status-success/20 text-foreground"
                  : "bg-status-error/10 border-status-error/20 text-foreground"
              )}
            >
              {isCorrect ? (
                <CheckCircle2 className="size-6 shrink-0 mt-0.5 text-status-success" />
              ) : (
                <XCircle className="size-6 shrink-0 mt-0.5 text-status-error" />
              )}
              <div>
                <p className="font-bold text-body-base leading-none">
                  {isCorrect ? t("course.dailyQuiz.correct") : t("course.dailyQuiz.incorrect")}
                </p>
                <div className="text-body-xs mt-1 text-foreground/80">
                  {isCorrect
                    ? t("course.dailyQuiz.success")
                    : (
                      <>
                        {t("course.dailyQuiz.correctAnswer")}{" "}
                        <MarkdownRenderer content={trivia.options[trivia.correctIndex]} density="compact" />
                      </>
                    )}
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <h4 className="font-heading text-body-xs font-bold text-brand-primary flex items-center gap-1.5">
                <BookOpenCheck className="size-3.5" />
                {t("course.dailyQuiz.explanation")}
              </h4>
              <MarkdownRenderer content={trivia.explanation} density="compact" className="mt-2 text-body-xs text-muted-foreground leading-relaxed" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={handleClose} className="rounded-md bg-foreground text-background hover:bg-foreground/90 px-6">
                {t("course.dailyQuiz.doneClose")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
