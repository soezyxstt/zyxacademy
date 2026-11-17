"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { useTutor } from "@/components/course/tutor-drawer";
import { useTranslations } from "@/lib/i18n/client";
import { quizSubmissionMutation, quizUploadSchema, removeQuizAttachment, formatQuizAnswers } from "@/lib/quiz/client";
import type { QuizPlayerProps } from "@/lib/quiz/player-types";

export function useQuizPlayer({ courseId, exam, attemptId, getRedirectPath, redirectBasePath, initialAnswers, startedAtMs, closeAtMs, transport }: QuizPlayerProps) {
  const t = useTranslations("learning");
  const storage = useMemo(() => {
    const fallback = new Map<string, string>();
    return {
      getItem: (key: string) => { try { return window.localStorage.getItem(key); } catch { return fallback.get(key) ?? null; } },
      setItem: (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { fallback.set(key, value); } },
      removeItem: (key: string) => { try { window.localStorage.removeItem(key); } catch { fallback.delete(key); } },
    };
  }, []);
  const router = useRouter();
  const { mutateAsync: submit } = useMutation(quizSubmissionMutation(attemptId, transport));
  const submissionLockRef = useRef(false);
  const autoSubmitAttemptedRef = useRef(false);
  const { setSuppressPet } = useTutor();
  const durationSeconds =
    exam.settings?.timeLimitSeconds ?? (exam.settings?.timeLimitMinutes ?? 15) * 60;
  const timerStorageKey = useMemo(() => `zyx-quiz-timer-deadline-${attemptId}`, [attemptId]);

  useEffect(() => {
    setSuppressPet(true);
    return () => setSuppressPet(false);
  }, [setSuppressPet]);

  const canGoBack = exam.settings?.canGoBack ?? true;
  const requireAllAnswered = exam.settings?.requireAllAnswered ?? false;
  const perQuestionTimerEnabled = exam.settings?.perQuestionTimerEnabled ?? false;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>(() => {
    if (typeof window !== "undefined") {
      const stored = storage.getItem(`zyx-quiz-answers-${attemptId}`);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          // ignore
        }
      }
    }
    return initialAnswers ?? {};
  });

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Flag state for "Ragu-ragu"
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const stored = storage.getItem(`zyx-quiz-flags-${attemptId}`);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          // ignore
        }
      }
    }
    return {};
  });

  // Timer states
  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittedRef = useRef(false);
  const submittingRef = useRef(false);
  const activeUploadPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Cloudflare R2 upload state for essay attachments
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFile, setUploadingFile] = useState<Record<string, string>>({});

  const sorted = useMemo(
    () => [...exam.questions].sort((a, b) => a.order - b.order),
    [exam.questions],
  );

  /**
   * Checks whether a specific question has an existing valid answer from the student.
   */
  const isQuestionAnswered = useCallback((questionId: string) => {
    const val = answers[questionId];
    if (val === undefined || val === null) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "number") return true;
    if (typeof val === "string") return val.trim().length > 0;
    if (typeof val === "object") {
      const textDone = typeof val.text === "string" && val.text.trim().length > 0;
      const fileDone = Boolean(val.fileName || val.fileKey);
      return textDone || fileDone;
    }
    return true;
  }, [answers]);

  /**
   * Uploads an essay file attachment for a question, tracking progress and updating attempt state.
   */
  function uploadEssayAttachment(questionId: string, file: File) {
    if (transport) {
      toast.error(t("quiz.uploadFailed"));
      return;
    }
    setUploadingFile((prev) => ({ ...prev, [questionId]: file.name }));
    setUploadProgress((prev) => ({ ...prev, [questionId]: 0 }));

    let finishUpload: () => void = () => {};
    const uploadPromise = new Promise<void>((resolve) => {
      finishUpload = resolve;
    });
    activeUploadPromisesRef.current.set(questionId, uploadPromise);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("attemptId", attemptId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/quiz/attachments");
    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setUploadProgress((prev) => ({ ...prev, [questionId]: pct }));
      }
    });
    xhr.addEventListener("load", () => {
      try {
        const parsed = quizUploadSchema.safeParse(JSON.parse(xhr.responseText));
        const data = parsed.success ? parsed.data : null;
        if (xhr.status >= 200 && xhr.status < 300 && data) {
          if (isSubmittedRef.current || submittingRef.current) {
            return;
          }
          const currentAns = answersRef.current[questionId];
          const currentText = typeof currentAns === "string" ? currentAns : currentAns?.text || "";
          const next = {
            ...answersRef.current,
            [questionId]: {
              text: currentText,
              fileName: data.fileName as string,
              fileSize: data.fileSize as string,
              fileKey: data.key as string,
            },
          };
          answersRef.current = next;
          setAnswers(next);
          storage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
          toast.success(t("quiz.uploadSuccess", { fileName: file.name }));
        } else {
          toast.error(t("quiz.uploadFailed"));
        }
      } catch {
        toast.error(t("quiz.uploadFailed"));
      } finally {
        activeUploadPromisesRef.current.delete(questionId);
        finishUpload();
        setUploadingFile((prev) => {
          const copy = { ...prev };
          delete copy[questionId];
          return copy;
        });
      }
    });
    xhr.addEventListener("error", () => {
      toast.error(t("quiz.uploadFailed"));
      activeUploadPromisesRef.current.delete(questionId);
      finishUpload();
      setUploadingFile((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
    });
    xhr.addEventListener("abort", () => {
      activeUploadPromisesRef.current.delete(questionId);
      finishUpload();
      setUploadingFile((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
    });
    xhr.send(formData);
  }

  /**
   * Handles selecting a file from input and starting upload.
   */
  function handleFileChange(questionId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      uploadEssayAttachment(questionId, f);
      e.target.value = "";
    }
  }

  /**
   * Deletes an uploaded attachment from server storage and removes it from local answer state.
   */
  async function handleRemoveFile(questionId: string) {
    const currentAns = answers[questionId];
    const fileKey = typeof currentAns === "object" && currentAns !== null ? currentAns.fileKey : null;

    if (fileKey && !transport) {
      try {
        await removeQuizAttachment(attemptId, fileKey);
      } catch (err: any) {
        toast.error(err?.message || "Gagal menghapus berkas.");
        return;
      }
    }

    setAnswers((prev) => {
      const current = prev[questionId];
      const currentText = typeof current === "string" ? current : current?.text || "";
      const next = {
        ...prev,
        [questionId]: {
          text: currentText,
          fileName: null,
          fileSize: undefined,
          fileKey: null,
        },
      };
      answersRef.current = next;
      storage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
      return next;
    });

    setUploadProgress((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
    setUploadingFile((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
      toast.info(t("quiz.attachmentRemoved"));
  }

  /**
   * Validates prerequisites before opening the submission confirmation dialog.
   */
  const handleRequestSubmit = useCallback(() => {
    if (isSubmitted || submitting) return;

    if (Object.keys(uploadingFile).length > 0) {
      toast.warning(t("quiz.waitForUpload"));
      return;
    }

    if (requireAllAnswered) {
      const unansweredIndex = sorted.findIndex((question) => !isQuestionAnswered(question.id));
      if (unansweredIndex !== -1) {
        toast.error(t("quiz.answerAll"));
        setIndex(unansweredIndex);
        return;
      }
    }

    setShowConfirmModal(true);
  }, [isSubmitted, submitting, uploadingFile, requireAllAnswered, t, sorted, isQuestionAnswered]);

  // Per-question timer state
  const currentQuestionId = sorted[index]?.id;
  const currentQuestionDuration =
    (currentQuestionId && exam.settings?.perQuestionTimers?.[currentQuestionId]) ||
    exam.settings?.defaultQuestionTimerSeconds ||
    60;
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number>(currentQuestionDuration);

  useEffect(() => {
    if (!perQuestionTimerEnabled) return;
    setQuestionTimeLeft(currentQuestionDuration);
  }, [index, currentQuestionDuration, perQuestionTimerEnabled]);

  /**
   * Submits the quiz attempt, optionally waiting for active uploads to finish on timeout.
   */
  const handleSubmit = useCallback(async (isAutoSubmit = false) => {
    if (isSubmittedRef.current || submittingRef.current || submissionLockRef.current) return;
    if (isAutoSubmit && autoSubmitAttemptedRef.current) return;
    if (isAutoSubmit) autoSubmitAttemptedRef.current = true;
    submissionLockRef.current = true;
    try {
      if (isAutoSubmit && activeUploadPromisesRef.current.size > 0) {
        // Wait for all in-flight uploads to settle before snapshotting answers
        await Promise.race([
          Promise.all(Array.from(activeUploadPromisesRef.current.values())),
          new Promise((resolve) => setTimeout(resolve, 8000)),
        ]);
      } else if (Object.keys(uploadingFile).length > 0) {
        if (!isAutoSubmit) {
          toast.warning(t("quiz.waitForUpload"));
          return;
        }
      }

      if (requireAllAnswered && !isAutoSubmit) {
        const unansweredIndex = sorted.findIndex((question) => !isQuestionAnswered(question.id));
        if (unansweredIndex !== -1) {
          toast.error(t("quiz.answerAll"));
          setIndex(unansweredIndex);
          return;
        }
      }

      try {
        submittingRef.current = true;
        setSubmitting(true);

        // Read latest answers snapshot after active uploads finish
        const latestAnswers = answersRef.current;
        const formattedAnswers = formatQuizAnswers(latestAnswers, exam.questions);
        await submit({ answers: formattedAnswers, durationSeconds: Math.max(0, durationSeconds - timeLeft) });

        isSubmittedRef.current = true;
        setIsSubmitted(true);
        if (!transport) emitActivityUpdated({ type: "quiz", attemptId, courseId });
        storage.removeItem(timerStorageKey);
        storage.removeItem(`zyx-quiz-answers-${attemptId}`);
        storage.removeItem(`zyx-quiz-flags-${attemptId}`);
        if (!transport) toast.success(t("quiz.submitted"));

        // Demo transport owns its result presentation and navigation.
        if (transport) return;
        const reviewPath = getRedirectPath
          ? getRedirectPath(attemptId)
          : redirectBasePath
            ? `${redirectBasePath}?attemptId=${attemptId}`
            : `/courses/${courseId}/quiz/${exam.id}?attemptId=${attemptId}`;
        router.replace(reviewPath);
        router.refresh();
      } catch (err: unknown) {
        const message = err instanceof Error && err.message === t("quiz.removeFileFailed")
          ? err.message
          : t("quiz.retrySubmit");
        toast.error(message);
        submittingRef.current = false;
        setSubmitting(false);
      }
    } finally {
      submissionLockRef.current = false;
    }
  }, [uploadingFile, requireAllAnswered, t, sorted, isQuestionAnswered, attemptId, durationSeconds, timeLeft, courseId, timerStorageKey, getRedirectPath, redirectBasePath, exam.id, exam.questions, router, transport, storage, submit]);

  // Per-question timer interval
  useEffect(() => {
    if (!perQuestionTimerEnabled || isSubmitted || submitting) return;

    const qTimer = setInterval(() => {
      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(qTimer);
          if (index < sorted.length - 1) {
            toast.info(t("quiz.questionTimeEnded"));
            setIndex((i) => i + 1);
          } else {
            const totalDeadline = Number(storage.getItem(timerStorageKey));
            const totalRemaining = Number.isFinite(totalDeadline)
              ? Math.max(0, Math.ceil((totalDeadline - Date.now()) / 1000))
              : 0;
            if (totalRemaining > 0) {
              toast.info(t("quiz.questionTimeEndedFinal"));
            }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(qTimer);
  }, [perQuestionTimerEnabled, isSubmitted, submitting, index, sorted.length, timerStorageKey, t, storage]);

  useEffect(() => {
    const rawDeadline = storage.getItem(timerStorageKey);
    const storedDeadline = rawDeadline ? Number(rawDeadline) : NaN;
    const now = Date.now();
    let deadline: number;

    if (Number.isFinite(storedDeadline)) {
      deadline = storedDeadline;
    } else if (startedAtMs) {
      deadline = startedAtMs + durationSeconds * 1000;
    } else {
      deadline = now + durationSeconds * 1000;
    }

    // Cap the deadline if an absolute closing time (closeAtMs) is specified
    if (closeAtMs && Number.isFinite(closeAtMs)) {
      deadline = Math.min(deadline, closeAtMs);
    }

    storage.setItem(timerStorageKey, String(deadline));

    const nextTimeLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
    const syncTimer = window.setTimeout(() => setTimeLeft(nextTimeLeft), 0);
    return () => window.clearTimeout(syncTimer);
  }, [durationSeconds, timerStorageKey, startedAtMs, closeAtMs, storage]);

  useEffect(() => {
    if (isSubmitted || submitting) return;

    const timer = setInterval(() => {
      const deadline = Number(storage.getItem(timerStorageKey));
      const remaining = Number.isFinite(deadline)
        ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
        : 0;

      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        toast.warning(t("quiz.timeExpired"));
        handleSubmit(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [handleSubmit, isSubmitted, submitting, t, timerStorageKey, storage]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const q = sorted[index];
  const answeredCount = sorted.filter((question) => isQuestionAnswered(question.id)).length;
  const unansweredCount = sorted.length - answeredCount;
  const flaggedCount = sorted.filter((question) => flags[question.id]).length;
  const progress = sorted.length > 0 ? (answeredCount / sorted.length) * 100 : 0;

  /**
   * Updates answer state for an option, supporting multi-select toggle or single-choice assignment.
   */
  function selectOption(qId: string, optionIndex: number, isMultiple: boolean) {
    if (isSubmitted || submitting) return;

    let nextValue: any;
    if (isMultiple) {
      const current = answers[qId];
      let currentIndices: number[] = [];
      if (Array.isArray(current)) {
        currentIndices = current.filter((x): x is number => typeof x === "number");
      } else if (typeof current === "number") {
        currentIndices = [current];
      }

      if (currentIndices.includes(optionIndex)) {
        nextValue = currentIndices.filter((idx) => idx !== optionIndex);
      } else {
        nextValue = [...currentIndices, optionIndex].sort((a, b) => a - b);
      }
    } else {
      nextValue = optionIndex;
    }

    const next = { ...answers, [qId]: nextValue };
    answersRef.current = next;
    setAnswers(next);
    storage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
  }

  /**
   * Toggles the doubt/flag status for a specific question.
   */
  function toggleFlag(qId: string) {
    if (isSubmitted || submitting) return;
    const next = { ...flags, [qId]: !flags[qId] };
    setFlags(next);
    storage.setItem(`zyx-quiz-flags-${attemptId}`, JSON.stringify(next));
  }

  /**
   * Navigates to the next question in the sequence.
   */
  function goNext() {
    if (index < sorted.length - 1) setIndex((i) => i + 1);
  }

  /**
   * Navigates to the previous question in the sequence.
   */
  function goPrev() {
    if (index > 0) setIndex((i) => i - 1);
  }

  function updateTextAnswer(questionId: string, value: string, essay = false) {
    if (isSubmittedRef.current || submittingRef.current) return;
    const current = answersRef.current[questionId];
    const next = { ...answersRef.current, [questionId]: essay ? { ...(typeof current === "object" && !Array.isArray(current) ? current : {}), text: value } : value };
    answersRef.current = next;
    setAnswers(next);
    storage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
  }
  return { t, q, answers, flags, sorted, index, setIndex, progress, answeredCount, unansweredCount, flaggedCount, canGoBack, requireAllAnswered, perQuestionTimerEnabled, questionTimeLeft, timeLeft, formatTime, submitting, isSubmitted, uploadingFile, uploadProgress, selectOption, toggleFlag, goNext, goPrev, handleFileChange, handleRemoveFile, handleRequestSubmit, isQuestionAnswered, handleSubmit, showConfirmModal, setShowConfirmModal, updateTextAnswer };
}
