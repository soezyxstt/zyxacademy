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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
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
 * Desktop quiz player preserving the side-by-side question and sticky right question map.
 */
export function QuizPlayerDesktop({
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
    timeLeft,
    questionTimeLeft,
    submitting,
    isSubmitted,
    canGoBack,
    perQuestionTimerEnabled,
    answeredCount,
    progress,
    handleRequestSubmit,
    goNext,
    goPrev,
  } = controller;
  const locked = submitting || isSubmitted;

  const tabletQuestionMap = (
    <Sheet open={questionMapOpen} onOpenChange={setQuestionMapOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button
                type="button"
                size="icon-lg"
                variant="outline"
                className="shrink-0 lg:hidden"
                aria-label={t("quiz.questionNavigation")}
                disabled={locked}
              >
                <BookOpen aria-hidden />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("quiz.questionNavigation")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
  );

  return (
    <div
      data-quiz-layout="desktop"
      className="grid grid-cols-1 items-start gap-(--related-gap) font-sans md:gap-(--section-gap) lg:grid-cols-12"
    >
      <div className="space-y-(--related-gap) md:space-y-(--group-gap) lg:col-span-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-2 md:pb-3">
          <div className="min-w-0 flex-1 basis-40 space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>{t("quiz.progress")}</span>
              <span>
                {Math.round(progress)}% ({answeredCount} / {sorted.length}{" "}
                {t("quiz.filled")})
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md bg-linear-to-r from-brand-primary via-tertiary-1 to-brand-secondary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {perQuestionTimerEnabled && (
              <div
                className="flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-primary/35 bg-brand-primary/10 px-2.5 py-1 font-mono text-body-sm font-bold text-brand-primary sm:px-3 sm:py-1.5"
                role="timer"
                aria-label={t("quiz.questionTimeLimit")}
                title={t("quiz.questionTimeLimit")}
              >
                <Timer aria-hidden className="size-3.5 sm:size-4" />
                <span>{formatQuizTime(questionTimeLeft)}</span>
              </div>
            )}
            {timeLeft !== null && (
              <div
                className="flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-secondary/35 bg-brand-secondary/10 px-2.5 py-1 font-mono text-body-sm font-bold text-brand-secondary sm:px-3 sm:py-1.5"
                role="timer"
                aria-label={t("quiz.totalTimeRemaining")}
                title={t("quiz.totalTimeRemaining")}
              >
                <Clock aria-hidden className="size-3.5 sm:size-4" />
                <span>{formatQuizTime(timeLeft)}</span>
              </div>
            )}
            {tabletQuestionMap}
          </div>
        </div>

        <QuizQuestionBody props={props} controller={controller} showFlagRow={true} />

        <TooltipProvider>
          <div className="flex items-center justify-between gap-2">
            {canGoBack ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={t("quiz.previous")}
                    onClick={() => {
                      if (!locked) goPrev();
                    }}
                    disabled={locked || index === 0}
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("quiz.previous")}</TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-body-xs font-medium italic text-muted-foreground">
                {t("quiz.linearMode")}
              </span>
            )}

            <div className="flex gap-2">
              {index < sorted.length - 1 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon-lg"
                      aria-label={t("quiz.next")}
                      disabled={locked}
                      onClick={() => {
                        if (!locked) goNext();
                      }}
                    >
                      <ChevronRight aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("quiz.next")}</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  disabled={locked}
                  className="h-9 rounded-md bg-brand-primary px-4 text-body-sm font-bold text-primary-foreground hover:bg-brand-primary/95 sm:px-8"
                  onClick={handleRequestSubmit}
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
        </TooltipProvider>
      </div>

      <div className="space-y-(--related-gap) lg:sticky lg:top-6 lg:col-span-4 lg:space-y-(--group-gap) lg:border-l lg:border-border lg:pl-(--section-gap)">
        <div className="space-y-(--compact-gap) md:space-y-(--group-gap)">
          <div className="hidden lg:block">
            <h3 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
              <BookOpen className="size-4 text-brand-primary" />
              {t("quiz.questionNavigation")}
            </h3>
            {!canGoBack && (
              <p className="mt-1 text-body-xs text-muted-foreground">
                {t("quiz.nextQuestionOnly")}
              </p>
            )}
          </div>

          <div className="hidden lg:block">
            <QuizQuestionMapGrid controller={controller} />
          </div>

          <div className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              onClick={handleRequestSubmit}
              className="h-9 w-full rounded-md border-border/80 text-body-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("quiz.submitQuiz")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
