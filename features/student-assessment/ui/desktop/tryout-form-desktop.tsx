"use client";

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
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, Timer } from "lucide-react";
import type {
  TryoutFormController,
  TryoutFormProps,
} from "@/features/student-assessment/model/use-tryout-draft";
import {
  formatTryoutTime,
  TryoutQuestionBody,
  TryoutQuestionMapGrid,
} from "@/features/student-assessment/ui/shared/tryout-form-parts";

/**
 * Desktop tryout player preserving the side-by-side question and sticky right question map.
 */
export function TryoutFormDesktop({
  props,
  controller,
}: {
  props: TryoutFormProps;
  controller: TryoutFormController;
}) {
  const {
    t,
    sorted,
    index,
    timeLeft,
    isSubmitting,
    progress,
    questionMapOpen,
    setQuestionMapOpen,
    setShowConfirmModal,
    goPrev,
    goNext,
  } = controller;

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
                aria-label={t("tryout.questionNavigation")}
              >
                <BookOpen aria-hidden />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("tryout.questionNavigation")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SheetContent
        side="bottom"
        className="max-h-[75dvh] gap-0 rounded-t-xl"
        aria-describedby={undefined}
      >
        <SheetHeader className="pr-14">
          <SheetTitle>{t("tryout.questionNavigation")}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 overflow-y-auto px-4 pb-4">
          <TryoutQuestionMapGrid
            controller={controller}
            onSelect={() => setQuestionMapOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div
      data-tryout-layout="desktop"
      className="grid grid-cols-1 items-start gap-(--related-gap) font-sans md:gap-(--section-gap) lg:grid-cols-12"
    >
      <div className="min-w-0 space-y-4 lg:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
          <div className="min-w-0 flex-1 basis-36 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-body-xs font-semibold text-muted-foreground">
              <span>{t("tryout.examSimulation")}</span>
              <span>
                {t("tryout.questionProgress", {
                  current: index + 1,
                  total: sorted.length,
                })}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md bg-foreground/75 transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className={cn("flex shrink-0 items-center gap-1.5 font-mono text-body-sm font-semibold tabular-nums", timeLeft <= 60 && "text-amber-800 dark:text-status-warning")}>
            <Timer aria-hidden className="size-4" />
            <span className="sr-only">{t("tryout.timeRemaining")} </span>
            <span>{formatTryoutTime(timeLeft)}</span>
          </div>
          {tabletQuestionMap}
        </div>

        <TryoutQuestionBody props={props} controller={controller} showFlagRow={true} />

        <TooltipProvider>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={t("tryout.previous")}
                  onClick={goPrev}
                  disabled={isSubmitting || index === 0}
                >
                  <ArrowLeft aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tryout.previous")}</TooltipContent>
            </Tooltip>

            <div className="flex gap-2">
              {index < sorted.length - 1 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon-lg"
                      aria-label={t("tryout.next")}
                      disabled={isSubmitting}
                      onClick={goNext}
                      className="bg-foreground text-background hover:bg-foreground/85"
                    >
                      <ArrowRight aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("tryout.next")}</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  disabled={isSubmitting}
                  className="h-9 bg-foreground px-4 text-background hover:bg-foreground/85"
                  onClick={() => setShowConfirmModal(true)}
                >
                  {t("tryout.submitAnswers")}
                </Button>
              )}
            </div>
          </div>
        </TooltipProvider>
      </div>

      <aside className="hidden space-y-(--related-gap) lg:sticky lg:top-6 lg:col-span-4 lg:block lg:border-l lg:border-border/40 lg:pl-(--section-gap)">
        <h3 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
          <BookOpen className="size-4 text-muted-foreground" aria-hidden />
          {t("tryout.questionNavigation")}
        </h3>
        <TryoutQuestionMapGrid controller={controller} />
        <p className="flex items-start gap-2 text-body-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t("tryout.autoSubmitNotice")}</span>
        </p>
      </aside>
    </div>
  );
}
