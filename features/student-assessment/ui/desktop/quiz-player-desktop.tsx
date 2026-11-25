"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
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
      <div className="min-w-0 space-y-4 lg:col-span-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 pb-2.5">
          <div className="min-w-0 flex-1 basis-40 space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-body-xs font-medium text-muted-foreground">
              <span>{t("quiz.progress")}</span>
              <span>
                {Math.round(progress)}% ({answeredCount} / {sorted.length}{" "}
                {t("quiz.filled")})
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-md bg-muted" role="progressbar" aria-label={t("quiz.progress")} aria-valuenow={Math.round(progress)}>
              <div
                className="h-full rounded-md bg-foreground/75 transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {perQuestionTimerEnabled && (
              <div
                className={cn("flex shrink-0 items-center gap-1.5 font-mono text-body-sm font-semibold tabular-nums", questionTimeLeft <= 10 ? "text-amber-800 dark:text-status-warning" : "text-foreground")}
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
                className={cn("flex shrink-0 items-center gap-1.5 font-mono text-body-sm font-semibold tabular-nums", timeLeft <= 60 ? "text-amber-800 dark:text-status-warning" : "text-foreground")}
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
          <div className="flex items-center justify-end gap-2">
            <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-2">
              {index < sorted.length - 1 && (
                <Button type="button" variant="ghost" disabled={locked} onClick={handleRequestSubmit}>
                  {t("quiz.submitQuiz")}
                </Button>
              )}
              {!canGoBack && <span className="text-body-xs text-muted-foreground">{t("quiz.linearMode")}</span>}
            </div>
            {canGoBack && (
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
            )}

            <div className="flex gap-2">
              {index < sorted.length - 1 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon-lg"
                      className="bg-foreground text-background hover:bg-foreground/85"
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
                  className="h-9 rounded-md bg-foreground px-4 text-body-sm font-bold text-background hover:bg-foreground/85 sm:px-8"
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

      <aside className="hidden lg:sticky lg:top-6 lg:col-span-4 lg:block lg:border-l lg:border-border/40 lg:pl-(--section-gap)">
        <div className="space-y-(--compact-gap) md:space-y-(--group-gap)">
          <div>
            <h3 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
              <BookOpen className="size-4 text-muted-foreground" aria-hidden />
              {t("quiz.questionNavigation")}
            </h3>
            {!canGoBack && (
              <p className="mt-1 text-body-xs text-muted-foreground">
                {t("quiz.nextQuestionOnly")}
              </p>
            )}
          </div>

          <QuizQuestionMapGrid controller={controller} />
        </div>
      </aside>
    </div>
  );
}
