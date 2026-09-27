import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import {
  quizOptionClasses,
  quizOptionLetterClasses,
  quizOptionIndicatorClasses,
  type QuizOptionState,
  type QuizChoiceControl,
} from "@/components/course/quiz-option-styles";

type QuizOptionRowProps = {
  letter: string;
  state: QuizOptionState;
  control?: QuizChoiceControl;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

/**
 * One answer option row sharing the exact visual recipe of the real quiz
 * player (`quiz-option-styles.ts`), plus landing-only correct/wrong marks.
 */
export function QuizOptionRow({ letter, state, control = "single", children, onClick, disabled }: QuizOptionRowProps) {
  const isMultiple = control === "multiple";
  const selected = state === "selected";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={state !== "idle"}
      className={quizOptionClasses(state)}
    >
      <span
        aria-hidden="true"
        className={quizOptionIndicatorClasses(control, state)}
      >
        {isMultiple ? (
          selected ? <Check className="size-3 md:size-3.5 stroke-[3] text-white" /> : null
        ) : (
          selected ? <span className="size-1.5 md:size-2 rounded-full bg-white" /> : null
        )}
      </span>
      <span className={quizOptionLetterClasses(state, isMultiple ? "rounded-md" : "rounded-full")}>{letter}</span>
      <span className="flex-1 leading-normal text-foreground">{children}</span>
      {state === "correct" ? (
        <Check className="size-4 shrink-0 text-status-success" aria-hidden />
      ) : state === "wrong" ? (
        <X className="size-4 shrink-0 text-status-error" aria-hidden />
      ) : null}
    </button>
  );
}
