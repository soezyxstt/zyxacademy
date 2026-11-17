"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { submitReviewAction } from "./actions";
import { toast } from "@/components/ui/toast";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { appendFlashcardRetry, skipFlashcardInSession } from "@/lib/flashcard-session";
import { useTranslations } from "@/lib/i18n/client";
import { FLASHCARD_BATCH_SIZE as BATCH_SIZE } from "@/lib/demo/flashcard-resume";
import type { FlashcardClientProps, QueueItem } from "@/lib/flashcards/player-types";

export function useFlashcardSession({ courseId, initialQueue, studentId, adapter }: FlashcardClientProps) {
  const t = useTranslations("learning");
  const [queue, setQueue] = useState<QueueItem[]>(() => adapter?.resume ? adapter.resume.queue.map(({ id, dueStatus }) => ({ ...initialQueue.find(item => item.card.id === id)!, dueStatus })) : initialQueue);
  const [batchOffset, setBatchOffset] = useState(adapter?.resume?.batchOffset ?? 0);
  const [currentIndex, setCurrentIndex] = useState(adapter?.resume?.currentIndex ?? 0);
  const [isFlipped, setIsFlipped] = useState(adapter?.resume?.isFlipped ?? false);
  const [mode, setMode] = useState<"standard" | "exam">(adapter?.resume?.mode ?? "standard");
  const [typedAnswer, setTypedAnswer] = useState(adapter?.resume?.typedAnswer ?? "");
  const [isChecked, setIsChecked] = useState(adapter?.resume?.isChecked ?? false);
  const [passedExam, setPassedExam] = useState<boolean | null>(adapter?.resume?.passedExam ?? null);
  const inFlight = useRef(false);
  const { mutateAsync: saveReview, isPending: loading } = useMutation({
    mutationKey: ["zyx", "v1", "flashcard-review", studentId, courseId],
    mutationFn: async ({ cardId, grade, answer, exam }: { cardId: string; grade: number; answer?: string; exam: boolean }) => {
      if (adapter) await adapter.onReview(cardId, grade);
      else await submitReviewAction(studentId, cardId, grade, answer, exam, courseId);
    },
    retry: false, networkMode: "always", gcTime: 0,
  });
  const [completedCount, setCompletedCount] = useState(adapter?.resume?.completedCount ?? 0);
  const onStateChange = adapter?.onStateChange;
  useEffect(() => {
    onStateChange?.({ queue: queue.map(item => ({ id: item.card.id, dueStatus: item.dueStatus })), batchOffset, currentIndex, isFlipped, mode, typedAnswer, isChecked, passedExam, completedCount });
  }, [onStateChange, queue, batchOffset, currentIndex, isFlipped, mode, typedAnswer, isChecked, passedExam, completedCount]);

  const activeBatch = queue.slice(batchOffset, batchOffset + BATCH_SIZE);
  const currentItem = activeBatch[currentIndex];

  const handleFlip = () => {
    if (mode === "exam" && !isChecked) {
      toast.warning(t("flashcards.checkBeforeFlip"));
      return;
    }
    setIsFlipped(!isFlipped);
  };

  const handleCheckAnswer = () => {
    if (!typedAnswer.trim()) {
      toast.error(t("flashcards.answerRequired"));
      return;
    }

    if (!currentItem) return;

    // Normalization & verification client-side
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const normUser = normalize(typedAnswer);
    const normCorrect = normalize(currentItem.card.back);

    const isCorrect = normCorrect.includes(normUser) || normUser.includes(normCorrect);
    setPassedExam(isCorrect);
    setIsChecked(true);
    setIsFlipped(true); // Flip automatically to show answer/explanation
  };

  const handleGrade = async (grade: number) => {
    if (!currentItem || inFlight.current) return;
    inFlight.current = true;
    try {
      await saveReview({ cardId: currentItem.card.id, grade, answer: mode === "exam" ? typedAnswer : undefined, exam: mode === "exam" });

      toast.success(t("flashcards.gradeSaved"));
      setCompletedCount((prev) => prev + 1);
      if (!adapter) emitActivityUpdated({ type: "flashcard", courseId, cardId: currentItem.card.id });

      // If user selected "Again / Ulangi" (grade 1), put the card back at the end of the queue for retry
      if (grade === 1) {
        setQueue((prevQueue) => appendFlashcardRetry(prevQueue, {
            ...currentItem,
            dueStatus: "review",
          }));
      }

      // Move to next card in active batch
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      setTypedAnswer("");
      setIsChecked(false);
      setPassedExam(null);
    } catch (err: unknown) {
      console.error("Error submitting review:", err);
      toast.error(t("flashcards.saveReviewFailed"));
    } finally {
      inFlight.current = false;
    }
  };

  const handleSkip = () => {
    if (!currentItem || queue.length - (batchOffset + currentIndex) <= 1 || loading) return;
    setQueue((current) => skipFlashcardInSession(current, batchOffset + currentIndex));
    setIsFlipped(false);
    setTypedAnswer("");
    setIsChecked(false);
    setPassedExam(null);
  };

  return { t, queue, batchOffset, setBatchOffset, currentIndex, setCurrentIndex, isFlipped, setIsFlipped, mode, setMode, typedAnswer, setTypedAnswer, isChecked, setIsChecked, passedExam, setPassedExam, loading, completedCount, activeBatch, currentItem, handleFlip, handleCheckAnswer, handleGrade, handleSkip };
}
