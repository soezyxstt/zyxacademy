"use client";

import { Button } from "@/components/ui/button";
import { useTutor } from "@/components/course/tutor-drawer";

/**
 * Per-question trigger on the PKA stage review: opens Zyra in mistake mode
 * with the student's wrong answer so they get batched mistake feedback.
 */
export function MistakeFeedbackButton({
  questionId,
  selectedAnswer,
}: {
  questionId: string;
  selectedAnswer: string;
}) {
  const { openMistake } = useTutor();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="rounded-lg"
      onClick={() => openMistake(questionId, selectedAnswer)}
    >
      Tanya Zyra soal ini
    </Button>
  );
}
