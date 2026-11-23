"use client";

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
 * - Hides MobileBottomNav during active attempt.
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
    submitted,
    progress,
    questionMapOpen,
    setQuestionMapOpen,
    setShowConfirmModal,
    toggleFlag,
    goPrev,
    goNext,
  } = controller;

  useHideMobileBottomNav(!submitted);

  if (!q) return null;
  const currentFlagged = !!flags[q.id];
  const isLast = index >= sorted.length - 1;

  return (
    <div
      data-tryout-layout="mobile"
      className="flex min-w-0 flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))] font-sans"
    >
      {/* Sticky compact focus top bar */}
      <div
        data-tryout-mobile-topbar=""
        className="sticky top-(--mobile-navbar-height,3.25rem) z-20 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex shrink-0 items-center gap-1 rounded-md border border-brand-secondary/35 bg-brand-secondary/10 px-2 py-1 font-mono text-body-xs font-bold text-brand-secondary tabular-nums"
              role="timer"
              aria-label={t("tryout.timeRemaining")}
            >
              <Timer aria-hidden className="size-3.5" />
              <span>{formatTryoutTime(timeLeft)}</span>
            </div>
            <span className="truncate font-heading text-body-sm font-semibold tabular-nums text-foreground">
              Q {index + 1}/{sorted.length}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="icon-sm"
              variant={currentFlagged ? "secondary" : "outline"}
              disabled={isSubmitting}
              aria-pressed={currentFlagged}
              aria-label={t("tryout.markUnsure")}
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

        <div className="mt-2 h-1.5 overflow-hidden rounded-md bg-muted">
          <div
            className="h-full rounded-md bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Active question body */}
      <TryoutQuestionBody props={props} controller={controller} showFlagRow={false} />

      {/* Thumb-friendly sticky bottom Prev / Next / Submit bar */}
      <div
        data-tryout-mobile-bottombar=""
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting || index === 0}
            onClick={goPrev}
            className="min-h-11 flex-1 text-body-sm"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t("tryout.previous")}
          </Button>

          {!isLast ? (
            <>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={goNext}
                className="min-h-11 flex-1 text-body-sm"
              >
                {t("tryout.next")}
                <ArrowRight aria-hidden className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(true)}
                className="min-h-11 shrink-0 px-3 text-body-sm"
              >
                {t("tryout.submitExam")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => setShowConfirmModal(true)}
              className="min-h-11 flex-1 bg-brand-primary text-body-sm font-semibold text-primary-foreground hover:bg-brand-primary/95"
            >
              {t("tryout.submitAnswers")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
