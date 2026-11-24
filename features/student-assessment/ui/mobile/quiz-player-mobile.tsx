"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
  Timer,
} from "lucide-react";
import type { QuizPlayerProps } from "@/lib/quiz/player-state";
import {
  formatQuizTime,
  QuizQuestionBody,
  QuizQuestionMapGrid,
  type QuizPlayerController,
} from "@/features/student-assessment/ui/shared/quiz-player-parts";

/**
 * Focused mobile quiz player:
 * - Sticky compact focus top bar: Timer + Q X/N + Question Map bottom Sheet trigger + Flag.
 * - Thumb-friendly sticky bottom Prev / Next / Submit bar.
 */
export function QuizPlayerMobile({
  props,
  controller,
}: {
  props: QuizPlayerProps;
  controller: QuizPlayerController;
}) {
  const [questionMapOpen, setQuestionMapOpen] = useState(false);
  const {
    t,
    sorted,
    index,
    flags,
    timeLeft,
    questionTimeLeft,
    submitting,
    isSubmitted,
    canGoBack,
    perQuestionTimerEnabled,
    progress,
    toggleFlag,
    handleRequestSubmit,
    goNext,
    goPrev,
  } = controller;

  const locked = submitting || isSubmitted;
  const q = sorted[index];
  if (!q) return null;
  const currentFlagged = !!flags[q.id];
  const isLast = index >= sorted.length - 1;

  return (
    <div
      data-quiz-layout="mobile"
      className="flex min-w-0 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] font-sans"
    >
      {/* Sticky compact focus top bar */}
      <div
        data-quiz-mobile-topbar=""
        className="sticky top-(--mobile-navbar-height,0px) z-20 -mx-(--page-gutter) mb-(--compact-gap) border-b border-border/50 bg-background/95 px-(--page-gutter) pt-1 pb-2 backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-body-xs font-semibold tabular-nums">
              {t("quiz.questionNumber", { number: `${index + 1}/${sorted.length}` })}
            </span>
            {perQuestionTimerEnabled && (
              <div
                className={cn("flex shrink-0 items-center gap-1 border-l border-border/60 pl-2 font-mono text-body-xs font-semibold tabular-nums", questionTimeLeft <= 10 ? "text-amber-800 dark:text-status-warning" : "text-foreground")}
                role="timer"
                aria-label={t("quiz.questionTimeLimit")}
              >
                <Timer aria-hidden className="size-3.5" />
                <span>{formatQuizTime(questionTimeLeft)}</span>
              </div>
            )}
            {timeLeft !== null && (
              <div
                className={cn("flex shrink-0 items-center gap-1 font-mono text-body-xs font-semibold tabular-nums", !perQuestionTimerEnabled && "border-l border-border/60 pl-2", timeLeft <= 60 ? "text-amber-800 dark:text-status-warning" : "text-foreground")}
                role="timer"
                aria-label={t("quiz.totalTimeRemaining")}
              >
                <Clock aria-hidden className="size-3.5" />
                <span>{formatQuizTime(timeLeft)}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={locked}
              aria-pressed={currentFlagged}
              aria-label={t("quiz.markForReview")}
              onClick={() => toggleFlag(q.id)}
              className={cn(
                "size-9",
                currentFlagged &&
                  "bg-brand-secondary/15 text-brand-secondary"
              )}
            >
              <Flag
                aria-hidden
                className={cn("size-4", currentFlagged && "fill-brand-secondary")}
              />
            </Button>

            <Sheet open={questionMapOpen} onOpenChange={setQuestionMapOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-9 shrink-0"
                  aria-label={t("quiz.questionNavigation")}
                  disabled={locked}
                >
                  <BookOpen aria-hidden className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[75dvh] gap-0 rounded-t-xl"
                aria-describedby={undefined}
              >
                <SheetHeader className="pr-14">
                  <SheetTitle>{t("quiz.questionNavigation")}</SheetTitle>
                </SheetHeader>
                <div className="min-h-0 overflow-y-auto px-4 pb-4">
                  {!canGoBack && (
                    <p className="mb-3 text-body-xs text-muted-foreground">
                      {t("quiz.nextQuestionOnly")}
                    </p>
                  )}
                  <QuizQuestionMapGrid
                    controller={controller}
                    onSelect={() => setQuestionMapOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="mt-1 h-1 overflow-hidden rounded-md bg-muted" role="progressbar" aria-label={t("quiz.progress")} aria-valuenow={Math.round(progress)}>
          <div
            className="h-full rounded-md bg-foreground/75 transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Main question body */}
      <QuizQuestionBody props={props} controller={controller} showFlagRow={false} />

      {/* Thumb-friendly sticky bottom Prev / Next / Submit bar */}
      <div
        data-quiz-mobile-bottombar=""
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/95 px-(--page-gutter) pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md"
      >
        <div className="flex items-center justify-end gap-2">
          {canGoBack ? (
            <Button
              type="button"
              variant="ghost"
              disabled={locked || index === 0}
              onClick={() => {
                if (!locked) goPrev();
              }}
              className="h-10 px-3"
            >
              <ChevronLeft aria-hidden className="size-4" />
              {t("quiz.previous")}
            </Button>
          ) : (
            <span className="flex-1 truncate text-body-xs font-medium text-muted-foreground">
              {t("quiz.linearMode")}
            </span>
          )}

          <Button
            type="button"
            disabled={locked}
            onClick={isLast ? handleRequestSubmit : goNext}
            className="h-10 bg-foreground px-3 text-background hover:bg-foreground/85"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("quiz.submitting")}
              </>
            ) : isLast ? (
              t("quiz.submitAnswers")
            ) : (
              <>
                {t("quiz.next")}
                <ChevronRight aria-hidden className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
