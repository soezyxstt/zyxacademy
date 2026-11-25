"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, BookOpen, Flag, Timer } from "lucide-react";
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
 * Focused mobile tryout player:
 * - Sticky compact focus top bar: Timer + Q X/N + Question Map bottom Sheet trigger + Flag.
 * - Thumb-friendly sticky bottom Prev / Next / Submit bar.
 */
export function TryoutFormMobile({
  props,
  controller,
}: {
  props: TryoutFormProps;
  controller: TryoutFormController;
}) {
  const {
    t,
    sorted,
    q,
    index,
    flags,
    timeLeft,
    isSubmitting,
    progress,
    questionMapOpen,
    setQuestionMapOpen,
    setShowConfirmModal,
    toggleFlag,
    goPrev,
    goNext,
  } = controller;

  if (!q) return null;
  const currentFlagged = !!flags[q.id];
  const isLast = index >= sorted.length - 1;

  return (
    <div
      data-tryout-layout="mobile"
      className="flex min-w-0 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] font-sans"
    >
      {/* Sticky compact focus top bar */}
      <div
        data-tryout-mobile-topbar=""
        className="sticky top-(--mobile-navbar-height,0px) z-20 -mx-(--page-gutter) mb-(--compact-gap) border-b border-border/50 bg-background/95 px-(--page-gutter) pt-1 pb-2 backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-body-xs font-semibold tabular-nums">
              {t("tryout.questionProgress", { current: index + 1, total: sorted.length })}
            </span>
            <div
              className={cn("flex shrink-0 items-center gap-1 border-l border-border/60 pl-2 font-mono text-body-xs font-semibold tabular-nums", timeLeft <= 60 && "text-amber-800 dark:text-status-warning")}
              role="timer"
              aria-label={t("tryout.timeRemaining")}
            >
              <Timer aria-hidden className="size-3.5" />
              <span>{formatTryoutTime(timeLeft)}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={isSubmitting}
              aria-pressed={currentFlagged}
              aria-label={t("tryout.markUnsure")}
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
                  aria-label={t("tryout.questionNavigation")}
                  disabled={isSubmitting}
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
          </div>
        </div>

        <div className="mt-1 h-1 overflow-hidden rounded-md bg-muted">
          <div
            className="h-full rounded-md bg-foreground/75 transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Active question body */}
      <TryoutQuestionBody props={props} controller={controller} showFlagRow={false} />

      {/* Thumb-friendly sticky bottom Prev / Next / Submit bar */}
      <div
        data-tryout-mobile-bottombar=""
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/95 px-(--page-gutter) pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md"
      >
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting || index === 0}
            onClick={goPrev}
            className="h-10 px-3"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t("tryout.previous")}
          </Button>

          <Button
            type="button"
            disabled={isSubmitting}
            onClick={isLast ? () => setShowConfirmModal(true) : goNext}
            className="h-10 bg-foreground px-3 text-background hover:bg-foreground/85"
          >
            {isLast ? t("tryout.submitAnswers") : <>{t("tryout.next")}<ArrowRight aria-hidden className="size-4" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}
