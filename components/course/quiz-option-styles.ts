import { cn } from "@/lib/utils";

/**
 * Shared visual recipe for quiz answer option rows.
 *
 * Single source of truth consumed by the real quiz player
 * (`components/course/quiz-player.tsx`) and the landing-page quiz demo
 * (`components/landing/demo/quiz-option-row.tsx`) so the marketing mock can
 * never drift from the product UI.
 */
export type QuizOptionState = "idle" | "selected" | "correct" | "wrong";

const optionStateClasses: Record<QuizOptionState, string> = {
  idle: "border-border/80 bg-background hover:border-brand-primary/45 hover:bg-muted/30",
  selected: "border-brand-primary bg-brand-primary/10 shadow-sm",
  correct: "border-status-success bg-status-success/10 shadow-sm",
  wrong: "border-status-error bg-status-error/10 shadow-sm",
};

export type QuizChoiceControl = "single" | "multiple";

export function quizOptionClasses(state: QuizOptionState, className?: string) {
  return cn(
    "group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-body-sm font-medium transition-all duration-200 cursor-pointer disabled:cursor-not-allowed md:gap-3 md:rounded-xl md:px-4 md:py-3",
    optionStateClasses[state],
    className,
  );
}

const letterStateClasses: Record<QuizOptionState, string> = {
  idle: "bg-muted text-foreground",
  selected: "bg-brand-primary text-primary-foreground",
  correct: "bg-status-success/15 text-foreground",
  wrong: "bg-status-error/15 text-foreground",
};

/**
 * Returns class names for styling option letter badges (A, B, C...) based on state.
 */
export function quizOptionLetterClasses(state: QuizOptionState, className?: string) {
  return cn(
    "flex size-6 shrink-0 items-center justify-center rounded-md text-body-xs font-bold transition-colors md:size-7",
    letterStateClasses[state],
    className,
  );
}

/**
 * Returns class names for styling choice indicator controls (circle radio vs boxie checkbox) based on state.
 */
export function quizOptionIndicatorClasses(
  control: QuizChoiceControl,
  state: QuizOptionState,
  className?: string,
) {
  const isCircle = control === "single";
  const shape = isCircle ? "rounded-full" : "rounded-md";
  const stateColor =
    state === "selected"
      ? "border-brand-primary bg-brand-primary text-primary-foreground"
      : state === "correct"
        ? "border-status-success bg-status-success/15 text-foreground"
        : state === "wrong"
          ? "border-status-error bg-status-error/15 text-foreground"
          : "border-muted-foreground/35 bg-background group-hover:border-brand-primary/60";

  return cn(
    "flex size-4 shrink-0 items-center justify-center border-2 transition-all md:size-5",
    shape,
    stateColor,
    className,
  );
}

