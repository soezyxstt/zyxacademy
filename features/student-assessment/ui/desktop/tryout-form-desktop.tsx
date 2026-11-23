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
      className="grid grid-cols-1 items-start gap-4 font-sans lg:grid-cols-12"
    >
      <div className="space-y-4 lg:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
            <div className="h-2 overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-brand-secondary/35 bg-brand-secondary/10 px-3.5 py-1.5 font-mono text-body-sm font-bold text-brand-secondary">
            <Timer aria-hidden className="size-4" />
            <span className="sr-only">{t("tryout.timeRemaining")} </span>
            <span>{formatTryoutTime(timeLeft)}</span>
          </div>
          {tabletQuestionMap}
        </div>

        <TryoutQuestionBody props={props} controller={controller} showFlagRow={true} />

        <TooltipProvider>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={t("tryout.previous")}
                  onClick={goPrev}
                  disabled={index === 0}
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
                      onClick={goNext}
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
                  className="bg-brand-primary px-8 font-bold text-primary-foreground hover:bg-brand-primary/95"
                  onClick={() => setShowConfirmModal(true)}
                >
                  {t("tryout.submitAnswers")}
                </Button>
              )}
            </div>
          </div>
        </TooltipProvider>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:col-span-4">
        <div className="space-y-4">
          <div className="hidden border-t border-border pt-3 lg:block">
            <h3 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
              <BookOpen className="size-4 text-brand-primary" />
              {t("tryout.questionNavigation")}
            </h3>
          </div>

          <div className="hidden lg:block">
            <TryoutQuestionMapGrid controller={controller} />
          </div>

          <div className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setShowConfirmModal(true)}
              className="h-9 w-full rounded-md border-border/80 text-body-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("tryout.submitExam")}
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-brand-secondary/20 bg-brand-secondary/5 p-4">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-brand-secondary" />
          <div className="space-y-1">
            <h4 className="text-body-xs font-bold text-foreground">
              {t("tryout.submitOnTime")}
            </h4>
            <p className="text-body-xs leading-relaxed text-muted-foreground">
              {t("tryout.autoSubmitNotice")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
