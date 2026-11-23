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
import { useHideMobileBottomNav } from "@/components/navigation";
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
 * - Hides MobileBottomNav during active attempt.
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
  useHideMobileBottomNav(!locked);

  const q = sorted[index];
  if (!q) return null;
  const currentFlagged = !!flags[q.id];
  const isLast = index >= sorted.length - 1;

  return (
    <div
      data-quiz-layout="mobile"
      className="flex min-w-0 flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))] font-sans"
    >
      {/* Sticky compact focus top bar */}
      <div
        data-quiz-mobile-topbar=""
        className="sticky top-(--mobile-navbar-height,3.25rem) z-20 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {perQuestionTimerEnabled && (
              <div
                className="flex shrink-0 items-center gap-1 rounded-md border border-brand-primary/35 bg-brand-primary/10 px-2 py-1 font-mono text-body-xs font-bold text-brand-primary tabular-nums"
                role="timer"
                aria-label={t("quiz.questionTimeLimit")}
              >
                <Timer aria-hidden className="size-3.5" />
                <span>{formatQuizTime(questionTimeLeft)}</span>
              </div>
            )}
            {timeLeft !== null && (
              <div
                className="flex shrink-0 items-center gap-1 rounded-md border border-brand-secondary/35 bg-brand-secondary/10 px-2 py-1 font-mono text-body-xs font-bold text-brand-secondary tabular-nums"
                role="timer"
                aria-label={t("quiz.totalTimeRemaining")}
              >
                <Clock aria-hidden className="size-3.5" />
                <span>{formatQuizTime(timeLeft)}</span>
              </div>
            )}
            <span className="truncate font-heading text-body-sm font-semibold tabular-nums text-foreground">
              Q {index + 1}/{sorted.length}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="icon-sm"
              variant={currentFlagged ? "secondary" : "outline"}
              disabled={locked}
              aria-pressed={currentFlagged}
              aria-label={t("quiz.markForReview")}
              onClick={() => toggleFlag(q.id)}
              className={cn(
                "size-9",
                currentFlagged &&
                  "border-brand-secondary/50 bg-brand-secondary/15 text-brand-secondary"
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
                  variant="outline"
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

        <div className="mt-2 h-1.5 overflow-hidden rounded-md bg-muted">
          <div
            className="h-full rounded-md bg-linear-to-r from-brand-primary via-tertiary-1 to-brand-secondary transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Main question body */}
      <QuizQuestionBody props={props} controller={controller} showFlagRow={false} />

      {/* Thumb-friendly sticky bottom Prev / Next / Submit bar */}
      <div
        data-quiz-mobile-bottombar=""
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          {canGoBack ? (
            <Button
              type="button"
              variant="outline"
              disabled={locked || index === 0}
              onClick={() => {
                if (!locked) goPrev();
              }}
              className="min-h-11 flex-1 text-body-sm"
            >
              <ChevronLeft aria-hidden className="size-4" />
              {t("quiz.previous")}
            </Button>
          ) : (
            <span className="flex-1 truncate text-body-xs font-medium text-muted-foreground">
              {t("quiz.linearMode")}
            </span>
          )}

          {!isLast ? (
            <>
              <Button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (!locked) goNext();
                }}
                className="min-h-11 flex-1 text-body-sm"
              >
                {t("quiz.next")}
                <ChevronRight aria-hidden className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={locked}
                onClick={handleRequestSubmit}
                className="min-h-11 shrink-0 px-3 text-body-sm"
              >
                {t("quiz.submitQuiz")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={locked}
              onClick={handleRequestSubmit}
              className="min-h-11 flex-1 bg-brand-primary text-body-sm font-semibold text-primary-foreground hover:bg-brand-primary/95"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  {t("quiz.submitting")}
                </>
              ) : (
                t("quiz.submitAnswers")
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
