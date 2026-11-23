"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { appendFlashcardRetry, skipFlashcardInSession } from "@/lib/flashcard-session";
import { useTranslations } from "@/lib/i18n/client";
import { FLASHCARD_BATCH_SIZE } from "@/lib/demo/flashcard-resume";
import { submitFlashcardReview } from "@/lib/flashcards/review-api";
import type { FlashcardQueueItem, FlashcardReviewInput, FlashcardSessionProps } from "@/lib/flashcards/review-contract";
import { queryKeys } from "@/lib/query/keys";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { ApiError } from "@/lib/query/http";
import { invalidateLearningQueries } from "@/lib/query/invalidation";
import { hapticSuccess } from "@/lib/native/haptics";

export function useFlashcardSession({ courseId, initialQueue, studentId, adapter }: FlashcardSessionProps) {
  const t = useTranslations("learning");
  const client = useQueryClient();
  // The RSC queue becomes this session's order. Background summary refetches
  // must not replace a card while the learner is typing or grading it.
  const [queue, setQueue] = useState<FlashcardQueueItem[]>(() => adapter?.resume
    ? adapter.resume.queue.map(({ id, dueStatus }) => ({ ...initialQueue.find(item => item.card.id === id)!, dueStatus }))
    : initialQueue);
  const [batchOffset, setBatchOffset] = useState(adapter?.resume?.batchOffset ?? 0);
  const [currentIndex, setCurrentIndex] = useState(adapter?.resume?.currentIndex ?? 0);
  const [isFlipped, setIsFlipped] = useState(adapter?.resume?.isFlipped ?? false);
  const [mode, setMode] = useState<"standard" | "exam">(adapter?.resume?.mode ?? "standard");
  const [typedAnswer, setTypedAnswer] = useState(adapter?.resume?.typedAnswer ?? "");
  const [isChecked, setIsChecked] = useState(adapter?.resume?.isChecked ?? false);
  const [passedExam, setPassedExam] = useState<boolean | null>(adapter?.resume?.passedExam ?? null);
  const [completedCount, setCompletedCount] = useState(adapter?.resume?.completedCount ?? 0);
  const pendingGrade = useRef(false);
  const mountedRef = useRef(false);
  const onStateChange = adapter?.onStateChange;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    onStateChange?.({ queue: queue.map(item => ({ id: item.card.id, dueStatus: item.dueStatus })), batchOffset, currentIndex, isFlipped, mode, typedAnswer, isChecked, passedExam, completedCount });
  }, [onStateChange, queue, batchOffset, currentIndex, isFlipped, mode, typedAnswer, isChecked, passedExam, completedCount]);

  const review = useMutation({
    mutationKey: [...queryKeys.flashcards.all(studentId), "review", courseId],
    mutationFn: async (input: FlashcardReviewInput) => {
      if (adapter) return adapter.onReview(input.flashcardId, input.grade);
      if (!isQueryAccountCurrent(client, studentId)) throw new ApiError(409, "Account changed");
      return submitFlashcardReview(input);
    },
    // The backend appends a review and advances SM-2 for each call. Neither
    // automatic retries nor an offline replay are safe without a request ID.
    retry: false,
    networkMode: "always",
    onSuccess: (_, input) => {
      if (adapter || !isQueryAccountCurrent(client, studentId)) return;
      void invalidateLearningQueries(client, studentId, { courseId, cardId: input.flashcardId });
      emitActivityUpdated({ type: "flashcard", courseId, cardId: input.flashcardId, queryCacheUpdated: true });
    },
  });

  const activeBatch = queue.slice(batchOffset, batchOffset + FLASHCARD_BATCH_SIZE);
  const currentItem = activeBatch[currentIndex];

  const resetCard = useCallback(() => {
    setIsFlipped(false);
    setTypedAnswer("");
    setIsChecked(false);
    setPassedExam(null);
  }, []);

  const handleFlip = () => {
    if (pendingGrade.current) return;
    if (mode === "exam" && !isChecked) {
      toast.warning(t("flashcards.checkBeforeFlip"));
      return;
    }
    setIsFlipped(!isFlipped);
  };

  const handleCheckAnswer = () => {
    if (pendingGrade.current) return;
    if (!typedAnswer.trim()) {
      toast.error(t("flashcards.answerRequired"));
      return;
    }
    if (!currentItem) return;
    const normalize = (text: string) => text.toLowerCase().trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    const user = normalize(typedAnswer);
    const correct = normalize(currentItem.card.back);
    setPassedExam(Boolean(user && correct && (correct.includes(user) || user.includes(correct))));
    setIsChecked(true);
    setIsFlipped(true);
  };

  const handleGrade = async (grade: number) => {
    if (!currentItem || pendingGrade.current || (!adapter && !isQueryAccountCurrent(client, studentId))) return;
    // React has not necessarily rendered disabled buttons before a second click.
    pendingGrade.current = true;
    try {
      await review.mutateAsync({
        studentId,
        courseId,
        flashcardId: currentItem.card.id,
        grade,
        manualAnswer: mode === "exam" ? typedAnswer : undefined,
        isExamMode: mode === "exam",
      });
      if (!mountedRef.current || (!adapter && !isQueryAccountCurrent(client, studentId))) return;
      void hapticSuccess();
      toast.success(t("flashcards.gradeSaved"));
      setCompletedCount((previous) => previous + 1);
      if (grade === 1) {
        setQueue((previous) => appendFlashcardRetry(previous, { ...currentItem, dueStatus: "review" }));
      }
      setCurrentIndex((previous) => previous + 1);
      resetCard();
    } catch {
      if (mountedRef.current && (adapter || isQueryAccountCurrent(client, studentId))) {
        toast.error(t("flashcards.saveReviewFailed"));
      }
    } finally {
      pendingGrade.current = false;
    }
  };

  const handleSkip = () => {
    if (!currentItem || queue.length - (batchOffset + currentIndex) <= 1 || pendingGrade.current) return;
    setQueue((current) => skipFlashcardInSession(current, batchOffset + currentIndex));
    resetCard();
  };
  const changeMode = (value: string) => {
    if (pendingGrade.current || (value !== "standard" && value !== "exam")) return;
    setMode(value);
    resetCard();
  };
  const startNextBatch = () => {
    setBatchOffset((previous) => previous + FLASHCARD_BATCH_SIZE);
    setCurrentIndex(0);
    resetCard();
  };

  return {
    queue, activeBatch, currentItem, batchOffset, currentIndex, isFlipped, mode,
    typedAnswer, setTypedAnswer, isChecked, passedExam, completedCount,
    loading: review.isPending,
    handleFlip, handleCheckAnswer, handleGrade, handleSkip,
    changeMode, startNextBatch, resetCard,
  };
}
