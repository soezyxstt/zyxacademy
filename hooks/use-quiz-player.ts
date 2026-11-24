"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { useTutor } from "@/components/course/tutor-drawer";
import { useTranslations } from "@/lib/i18n/client";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { uploadQuizAttachment, removeQuizAttachment } from "@/lib/quiz/client";
import { ApiError } from "@/lib/query/http";
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from "@/lib/native/haptics";
import { usePullToRefreshLock } from "@/hooks/use-pull-to-refresh-lock";
import { closeDialogsThen } from "@/hooks/use-dialog-history";
import {
  asEssayAnswer, createQuizStorage, createQuizSubmissionGate, formatQuizAnswers,
  isQuizAnswerComplete, quizStorageKeys, readQuizAnswers, readQuizFlags,
  remainingQuizSeconds, resolveQuizDeadline, resolveQuizDuration, selectQuizOption, waitForQuizUploads,
  type QuizAnswer, type QuizAnswers, type QuizPlayerProps, type QuizSubmission,
} from "@/lib/quiz/player-state";

type Upload = { controller: AbortController; promise: Promise<void> };

export function useQuizPlayer(props: QuizPlayerProps, submit: (payload: QuizSubmission) => Promise<unknown>) {
  const { courseId, exam, attemptId, getRedirectPath, redirectBasePath, initialAnswers, startedAtMs, closeAtMs, transport } = props;
  const t = useTranslations("learning");
  const router = useRouter();
  const { setSuppressPet } = useTutor();
  const storage = useMemo(createQuizStorage, []);
  const keys = useMemo(() => quizStorageKeys(attemptId), [attemptId]);
  const gate = useMemo(createQuizSubmissionGate, []);
  const alive = useRef(true);
  const uploads = useRef(new Map<string, Upload>());
  const removals = useRef(new Map<string, Promise<void>>());
  const deadlineRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const expiryHandled = useRef(false);
  const lowTimeWarned = useRef(false);
  const durationSeconds = resolveQuizDuration(exam.settings);
  const canGoBack = exam.settings?.canGoBack ?? true;
  const requireAllAnswered = exam.settings?.requireAllAnswered ?? false;
  const perQuestionTimerEnabled = exam.settings?.perQuestionTimerEnabled ?? false;
  const sorted = useMemo(() => [...exam.questions].sort((a, b) => a.order - b.order), [exam.questions]);
  const [index, setIndex] = useState(0);
  // The first client render matches SSR. Restore browser-only recovery after hydration.
  const [answers, setAnswers] = useState<QuizAnswers>(() => readQuizAnswers(null, exam.questions, initialAnswers));
  const answersRef = useRef(answers);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFile, setUploadingFile] = useState<Record<string, string>>({});

  usePullToRefreshLock(!isSubmitted, "active-quiz");
  usePullToRefreshLock(submitting, "quiz-submit");
  usePullToRefreshLock(Object.keys(uploadingFile).length > 0, "quiz-upload");

  useEffect(() => {
    alive.current = true;
    setSuppressPet(true);
    const pendingUploads = uploads.current;
    return () => {
      alive.current = false;
      for (const upload of pendingUploads.values()) upload.controller.abort();
      pendingUploads.clear();
      setSuppressPet(false);
    };
  }, [setSuppressPet]);

  useEffect(() => {
    const recovered = readQuizAnswers(storage.getItem(keys.answers), exam.questions, initialAnswers);
    answersRef.current = recovered;
    setAnswers(recovered);
    setFlags(readQuizFlags(storage.getItem(keys.flags), exam.questions));
    const now = Date.now();
    const deadline = resolveQuizDeadline({ stored: storage.getItem(keys.deadline), startedAtMs, closeAtMs, durationSeconds, now });
    deadlineRef.current = deadline;
    startedAtRef.current = typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
      ? startedAtMs
      : now;
    if (durationSeconds === null) storage.removeItem(keys.deadline);
    else if (deadline !== null) storage.setItem(keys.deadline, String(deadline));
    setTimeLeft(deadline === null ? null : remainingQuizSeconds(deadline, now));
    setReady(true);
    void hapticMedium();
    // The component is keyed by account and attempt, so these are mount snapshots.
    // New server props must never overwrite a student's current local answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, storage]);

  const saveAnswers = useCallback((next: QuizAnswers) => {
    // Update the ref before the render, including the last input before a timeout.
    answersRef.current = next;
    setAnswers(next);
    storage.setItem(keys.answers, JSON.stringify(next));
  }, [keys.answers, storage]);

  const isQuestionAnswered = useCallback((questionId: string) => isQuizAnswerComplete(answers[questionId]), [answers]);

  function setAnswer(questionId: string, value: QuizAnswer) {
    if (!ready || gate.phase !== "idle") return;
    saveAnswers({ ...answersRef.current, [questionId]: value });
  }

  function setAnswerText(questionId: string, text: string, essay = false) {
    setAnswer(questionId, essay ? { ...asEssayAnswer(answersRef.current[questionId]), text } : text);
  }

  function selectOption(questionId: string, optionIndex: number, isMultiple: boolean) {
    void hapticSelection();
    setAnswer(questionId, selectQuizOption(answersRef.current[questionId], optionIndex, isMultiple));
  }

  function toggleFlag(questionId: string) {
    if (!ready || gate.phase !== "idle") return;
    void hapticLight();
    setFlags((current) => {
      const next = { ...current, [questionId]: !current[questionId] };
      storage.setItem(keys.flags, JSON.stringify(next));
      return next;
    });
  }

  function handleFileChange(questionId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !ready || gate.phase !== "idle" || uploads.current.has(questionId)) return;
    if (transport) { toast.error(t("quiz.uploadFailed")); return; }
    const controller = new AbortController();
    setUploadingFile((current) => ({ ...current, [questionId]: file.name }));
    setUploadProgress((current) => ({ ...current, [questionId]: 0 }));
    const promise = uploadQuizAttachment({
      attemptId, file, signal: controller.signal,
      onProgress: (percent) => {
        if (alive.current) setUploadProgress((current) => ({ ...current, [questionId]: percent }));
      },
    }).then((attachment) => {
      if (!alive.current || gate.phase === "sending" || gate.phase === "submitted") return;
      const current = answersRef.current[questionId];
      saveAnswers({
        ...answersRef.current,
        [questionId]: {
          text: typeof current === "string" ? current : asEssayAnswer(current)?.text ?? "",
          fileName: attachment.fileName, fileSize: attachment.fileSize, fileKey: attachment.key,
        },
      });
      toast.success(t("quiz.uploadSuccess", { fileName: file.name }));
    }).catch((error: unknown) => {
      if (alive.current && !(error instanceof DOMException && error.name === "AbortError")) toast.error(t("quiz.uploadFailed"));
    }).finally(() => {
      if (uploads.current.get(questionId)?.controller !== controller) return;
      uploads.current.delete(questionId);
      if (alive.current) setUploadingFile((current) => {
        const next = { ...current };
        delete next[questionId];
        return next;
      });
    });
    uploads.current.set(questionId, { controller, promise });
  }

  function handleRemoveFile(questionId: string) {
    if (!ready || gate.phase !== "idle" || removals.current.has(questionId)) return;
    const fileKey = asEssayAnswer(answersRef.current[questionId])?.fileKey;
    const promise = (async () => {
      try {
        if (fileKey && !transport) await removeQuizAttachment(attemptId, fileKey);
        if (!alive.current || gate.phase === "sending" || gate.phase === "submitted") return;
        const current = answersRef.current[questionId];
        // A late delete response cannot erase a newer attachment.
        if (asEssayAnswer(current)?.fileKey !== fileKey) return;
        saveAnswers({ ...answersRef.current, [questionId]: {
          text: typeof current === "string" ? current : asEssayAnswer(current)?.text ?? "",
          fileName: null, fileKey: null,
        } });
        setUploadProgress((current) => {
          const next = { ...current };
          delete next[questionId];
          return next;
        });
        toast.info(t("quiz.attachmentRemoved"));
      } catch {
        if (alive.current) toast.error(t("quiz.removeFileFailed"));
      }
    })().finally(() => { removals.current.delete(questionId); });
    removals.current.set(questionId, promise);
  }

  const handleRequestSubmit = useCallback(() => {
    if (!ready || gate.phase !== "idle") return;
    if (uploads.current.size || removals.current.size) { toast.warning(t("quiz.waitForUpload")); return; }
    const expired = deadlineRef.current !== null && remainingQuizSeconds(deadlineRef.current, Date.now()) === 0;
    if (requireAllAnswered && !expired) {
      const missing = sorted.findIndex((question) => !isQuizAnswerComplete(answersRef.current[question.id]));
      if (missing !== -1) { toast.error(t("quiz.answerAll")); setIndex(missing); return; }
    }
    void hapticMedium();
    setShowConfirmModal(true);
  }, [gate, ready, requireAllAnswered, sorted, t]);

  const handleSubmit = useCallback(async (isAutoSubmit = false) => {
    if (!ready || !alive.current || gate.phase !== "idle") return;
    const expired = deadlineRef.current !== null && remainingQuizSeconds(deadlineRef.current, Date.now()) === 0;
    const timeout = isAutoSubmit || expired;
    if (!timeout && (uploads.current.size || removals.current.size)) { toast.warning(t("quiz.waitForUpload")); return; }
    if (requireAllAnswered && !timeout) {
      const missing = sorted.findIndex((question) => !isQuizAnswerComplete(answersRef.current[question.id]));
      if (missing !== -1) { toast.error(t("quiz.answerAll")); setIndex(missing); return; }
    }
    setSubmitting(true);
    try {
      await gate.run({
        waitForUploads: async () => {
          if (timeout && (uploads.current.size || removals.current.size)) {
            await waitForQuizUploads([
              ...Array.from(uploads.current.values(), (upload) => upload.promise),
              ...removals.current.values(),
            ]);
          }
          if (!alive.current) throw new DOMException("Quiz left", "AbortError");
        },
        snapshot: () => {
          const elapsed = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
          return {
            answers: formatQuizAnswers(exam.questions, answersRef.current),
            durationSeconds: durationSeconds === null ? elapsed : Math.min(elapsed, durationSeconds),
          };
        },
        submit,
        onSuccess: () => {
          // Clear recovery only after the server or demo adapter confirms the write.
          storage.removeItem(keys.deadline);
          storage.removeItem(keys.answers);
          storage.removeItem(keys.flags);
          if (!alive.current) return;
          void hapticSuccess();
          if (transport) {
            setIsSubmitted(true);
            return;
          }
          emitActivityUpdated({ type: "quiz", attemptId, courseId, queryCacheUpdated: true });
          toast.success(t("quiz.submitted"));
          const path = getRedirectPath ? getRedirectPath(attemptId)
            : redirectBasePath ? `${redirectBasePath}?attemptId=${encodeURIComponent(attemptId)}`
            : `/courses/${encodeURIComponent(courseId)}/quiz/${encodeURIComponent(exam.id)}?attemptId=${encodeURIComponent(attemptId)}`;
          closeDialogsThen(() => {
            setIsSubmitted(true);
            setShowConfirmModal(false);
          }, () => {
            router.replace(path);
            router.refresh();
          });
        },
      });
    } catch (error) {
      if (alive.current) {
        toast.error(t(error instanceof ApiError && error.status === 409 ? "quizTake.attemptLimitReached" : "quiz.retrySubmit"));
        setSubmitting(false);
      }
    }
  }, [ready, gate, requireAllAnswered, sorted, t, exam.questions, exam.id, durationSeconds, submit, storage, keys, transport, attemptId, courseId, getRedirectPath, redirectBasePath, router]);

  // Keep the total clock interval stable while answers or translations change.
  const onExpired = useRef(handleSubmit);
  const notifyExpired = useRef(() => toast.warning(t("quiz.timeExpired")));
  useEffect(() => {
    onExpired.current = handleSubmit;
    notifyExpired.current = () => toast.warning(t("quiz.timeExpired"));
  }, [handleSubmit, t]);
  useEffect(() => {
    if (!ready || isSubmitted || deadlineRef.current === null) return;
    const tick = () => {
      if (deadlineRef.current === null) return;
      const remaining = remainingQuizSeconds(deadlineRef.current, Date.now());
      setTimeLeft(remaining);
      if (remaining > 0 && remaining <= 60 && !lowTimeWarned.current) {
        lowTimeWarned.current = true;
        void hapticWarning();
      }
      if (remaining === 0 && !expiryHandled.current && gate.phase === "idle") {
        expiryHandled.current = true;
        notifyExpired.current();
        void onExpired.current(true);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [gate, ready, isSubmitted]);

  const currentQuestionDuration = (sorted[index]?.id && exam.settings?.perQuestionTimers?.[sorted[index].id]) || exam.settings?.defaultQuestionTimerSeconds || 60;
  const [questionTimeLeft, setQuestionTimeLeft] = useState(currentQuestionDuration);
  const questionClock = useRef({ index: -1, duration: 0, remaining: currentQuestionDuration });
  useEffect(() => {
    if (!ready || !perQuestionTimerEnabled || submitting || isSubmitted) return;
    const clock = questionClock.current;
    if (clock.index !== index || clock.duration !== currentQuestionDuration) {
      clock.index = index;
      clock.duration = currentQuestionDuration;
      clock.remaining = currentQuestionDuration;
    }
    setQuestionTimeLeft(clock.remaining);
    if (clock.remaining === 0) return;
    const endTime = Date.now() + clock.remaining * 1000;
    const timer = window.setInterval(() => {
      clock.remaining = remainingQuizSeconds(endTime, Date.now());
      setQuestionTimeLeft(clock.remaining);
      if (clock.remaining > 0) return;
      window.clearInterval(timer);
      if (index < sorted.length - 1) {
        toast.info(t("quiz.questionTimeEnded"));
        setIndex((current) => current + 1);
      } else if (deadlineRef.current === null || remainingQuizSeconds(deadlineRef.current, Date.now()) > 0) {
        toast.info(t("quiz.questionTimeEndedFinal"));
      }
    }, 1000);
    return () => {
      clock.remaining = remainingQuizSeconds(endTime, Date.now());
      window.clearInterval(timer);
    };
  }, [ready, perQuestionTimerEnabled, currentQuestionDuration, index, sorted.length, submitting, isSubmitted, t]);

  const navigateToIndex = useCallback((next: number | ((current: number) => number)) => {
    void hapticLight();
    setIndex(next);
  }, []);

  const answeredCount = sorted.filter((question) => isQuizAnswerComplete(answers[question.id])).length;
  return {
    t, answers, flags, sorted, index, setIndex: navigateToIndex, timeLeft, questionTimeLeft,
    submitting: submitting || !ready, isSubmitted, canGoBack, perQuestionTimerEnabled,
    showConfirmModal, setShowConfirmModal, uploadingFile, uploadProgress,
    answeredCount, unansweredCount: sorted.length - answeredCount,
    flaggedCount: sorted.filter((question) => flags[question.id]).length,
    progress: sorted.length ? answeredCount / sorted.length * 100 : 0,
    isQuestionAnswered, setAnswerText, selectOption, toggleFlag,
    handleFileChange, handleRemoveFile, handleRequestSubmit, handleSubmit,
    goNext: () => { if (index < sorted.length - 1) { void hapticLight(); setIndex((current) => current + 1); } },
    goPrev: () => { if (index > 0) { void hapticLight(); setIndex((current) => current - 1); } },
  };
}
