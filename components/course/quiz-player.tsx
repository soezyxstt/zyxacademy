"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Flag, Timer, Clock, BookOpen, AlertCircle, ChevronLeft, ChevronRight, Loader2, UploadCloud, FileText, Trash2, Check, CheckSquare, CircleDot } from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { quizOptionClasses, quizOptionLetterClasses, quizOptionIndicatorClasses } from "@/components/course/quiz-option-styles";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { useTutor } from "@/components/course/tutor-drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScientificInput } from "@/components/ui/scientific-input";
import { useTranslations } from "@/lib/i18n/client";

type QuizPlayerProps = {
  courseId: string;
  exam: {
    id: string;
    title: string;
    questions: Array<{
      id: string;
      order: number;
      type: string;
      prompt: string;
      options: string[];
      origin?: "zyx_original" | "historical_reference" | "itb_example";
      sourceEventName?: string | null;
      sourceReferenceId?: string | null;
    }>;
    settings?: {
      timeLimitMinutes?: number;
      timeLimitSeconds?: number;
      canGoBack?: boolean;
      requireAllAnswered?: boolean;
      perQuestionTimerEnabled?: boolean;
      perQuestionTimers?: Record<string, number>;
      defaultQuestionTimerSeconds?: number;
      shuffleQuestions?: boolean;
      shuffleOptions?: boolean;
    };
  };
  attemptId: string;
  /** Override the post-submit review redirect (defaults to the standard course quiz URL). */
  getRedirectPath?: (attemptId: string) => string;
  /** Serializable variant of getRedirectPath for server-component callers; `?attemptId=` is appended. */
  redirectBasePath?: string;
  /** Pre-populated answers snapshot from DB if resuming an attempt */
  initialAnswers?: Record<string, any>;
  /** Start time timestamp in ms to calculate exact remaining time relative to real time */
  startedAtMs?: number;
  /** Absolute closing timestamp in ms (e.g. quiz window closes at 20:00). Timer will not exceed this. */
  closeAtMs?: number;
};

/**
 * Checks whether a question allows selecting multiple answers (multi-select / multiple choices).
 */
function isMultipleChoiceQuestion(type?: string): boolean {
  return type === "multiple_choices" || type === "multi_select" || type === "checkbox";
}

/**
 * Interactive student quiz player component with timer, navigation, file uploads, and submission handling.
 */
export function QuizPlayer({ courseId, exam, attemptId, getRedirectPath, redirectBasePath, initialAnswers, startedAtMs, closeAtMs }: QuizPlayerProps) {
  const t = useTranslations("learning");
  const router = useRouter();
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
      const stored = window.localStorage.getItem(`zyx-quiz-answers-${attemptId}`);
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
      const stored = window.localStorage.getItem(`zyx-quiz-flags-${attemptId}`);
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
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
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
          window.localStorage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
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

    if (fileKey) {
      try {
        const res = await fetch("/api/quiz/attachments", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId, fileKey }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(t("quiz.removeFileFailed"));
        }
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
      window.localStorage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
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
  }, [isSubmitted, submitting, uploadingFile, requireAllAnswered, sorted, isQuestionAnswered]);

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
    if (isSubmittedRef.current || submittingRef.current) return;

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
      const formattedAnswers: Record<string, any> = {};
      for (const [qId, val] of Object.entries(latestAnswers)) {
        if (typeof val === "number") {
          formattedAnswers[qId] = [val];
        } else {
          formattedAnswers[qId] = val;
        }
      }

      // Mark all unanswered questions as empty
      for (const question of exam.questions) {
        if (formattedAnswers[question.id] === undefined) {
          formattedAnswers[question.id] = question.type === "short_answer" ? "" : question.type === "essay" ? { text: "", fileName: null, fileKey: null } : [];
        }
      }

      const res = await fetch(`/api/quiz/attempts/${attemptId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answers: formattedAnswers,
          durationSeconds: Math.max(0, durationSeconds - timeLeft),
        }),
      });

      if (!res.ok) {
        let message = t("quiz.submitFailed");
        try {
          const errData = await res.json();
          if (errData?.error) message = t("quiz.submitFailed");
        } catch { /* empty or non-JSON body */ }
        throw new Error(message);
      }

      isSubmittedRef.current = true;
      setIsSubmitted(true);
      emitActivityUpdated({ type: "quiz", attemptId, courseId });
      window.localStorage.removeItem(timerStorageKey);
      window.localStorage.removeItem(`zyx-quiz-answers-${attemptId}`);
      window.localStorage.removeItem(`zyx-quiz-flags-${attemptId}`);
      toast.success(t("quiz.submitted"));

      // Navigate to the review screen for this attempt
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
  }, [courseId, router, timerStorageKey, attemptId, durationSeconds, timeLeft, exam.id, exam.questions, getRedirectPath, redirectBasePath, requireAllAnswered, sorted, isQuestionAnswered, uploadingFile]);

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
            const totalDeadline = Number(window.localStorage.getItem(timerStorageKey));
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
  }, [perQuestionTimerEnabled, isSubmitted, submitting, index, sorted.length, timerStorageKey]);

  useEffect(() => {
    const rawDeadline = window.localStorage.getItem(timerStorageKey);
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

    window.localStorage.setItem(timerStorageKey, String(deadline));

    const nextTimeLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
    const syncTimer = window.setTimeout(() => setTimeLeft(nextTimeLeft), 0);
    return () => window.clearTimeout(syncTimer);
  }, [durationSeconds, timerStorageKey, startedAtMs, closeAtMs]);

  useEffect(() => {
    if (isSubmitted || submitting) return;

    const timer = setInterval(() => {
      const deadline = Number(window.localStorage.getItem(timerStorageKey));
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
  }, [handleSubmit, isSubmitted, submitting, timerStorageKey]);

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
    setAnswers(next);
    window.localStorage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
  }

  /**
   * Toggles the doubt/flag status for a specific question.
   */
  function toggleFlag(qId: string) {
    if (isSubmitted || submitting) return;
    const next = { ...flags, [qId]: !flags[qId] };
    setFlags(next);
    window.localStorage.setItem(`zyx-quiz-flags-${attemptId}`, JSON.stringify(next));
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

  if (!q) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/15 py-10 text-center">
        <p className="text-body-sm text-muted-foreground">{t("quiz.noQuestions")}</p>
      </div>
    );
  }

  const ans = answers[q.id];
  const isMultiple = Boolean(
    q && (
      isMultipleChoiceQuestion(q.type) ||
      (q as any).question_type === "multiple_choices" ||
      (q as any).questionType === "multiple_choices" ||
      Boolean((q as any).multiple)
    )
  );
  const currentFlagged = !!flags[q.id];

  return (
    <div className="grid grid-cols-1 items-start gap-4 font-sans md:gap-6 lg:grid-cols-12">
      
      {/* LEFT COLUMN: Main player and Question details (8 cols on lg) */}
      <div className="space-y-4 md:space-y-5 lg:col-span-8">
        
        {/* Progress Bar & Header */}
        <div className="flex flex-col gap-2.5 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:pb-4">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>{t("quiz.progress")}</span>
              <span>{Math.round(progress)}% ({answeredCount} / {sorted.length} {t("quiz.filled")})</span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md bg-linear-to-r from-brand-primary via-tertiary-1 to-brand-secondary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {perQuestionTimerEnabled && (
              <div className="flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-primary/35 bg-brand-primary/10 px-2.5 py-1 font-mono text-body-sm font-bold text-brand-primary sm:px-3 sm:py-1.5" title={t("quiz.questionTimeLimit")}>
                <Timer className="size-3.5 animate-pulse sm:size-4" />
                <span>{t("quiz.questionNumber", { number: index + 1 })}: {questionTimeLeft}s</span>
              </div>
            )}
            <div className="flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-secondary/35 bg-brand-secondary/10 px-2.5 py-1 font-mono text-body-sm font-bold text-brand-secondary sm:px-3 sm:py-1.5" title={t("quiz.totalTimeRemaining")}>
              <Clock className="size-3.5 sm:size-4" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>
        </div>

        {/* Question Area Box */}
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border border-border/85 bg-card p-4 shadow-xs backdrop-blur-xs md:rounded-2xl md:p-6",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
            currentFlagged && "ring-1 ring-brand-secondary/35 border-brand-secondary/40"
          )}
        >
          {/* Heading */}
          <div className="flex items-start gap-2.5 md:gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-body-xs font-bold text-primary-foreground shadow-xs md:size-8 md:text-body-sm">
              {index + 1}
            </span>
            <div className="space-y-1 flex-1 leading-relaxed text-foreground">
              <div className="font-sans text-body-base font-bold leading-normal">
                <MarkdownRenderer content={q.prompt} className="space-y-3" />
              </div>
            </div>
          </div>

          {/* Options Display / Short Answer / Essay Input */}
          {q.type === "short_answer" || q.type === "essay" ? (
            <div className="mt-4 space-y-3 md:mt-5">
              <label className="block text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {q.type === "short_answer" ? t("quiz.shortAnswerLabel") : t("quiz.essayLabel")}
              </label>
              {q.type === "short_answer" ? (
                <ScientificInput
                  disabled={submitting || isSubmitted}
                  value={typeof ans === "string" ? ans : ans?.text || ""}
                  onChange={(val) => {
                    const next = { ...answers, [q.id]: val };
                    setAnswers(next);
                    window.localStorage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
                  }}
                  placeholder={t("quiz.shortAnswerPlaceholder")}
                />
              ) : (
                <div className="space-y-4">
                  <textarea
                    rows={6}
                    disabled={submitting || isSubmitted}
                    value={typeof ans === "string" ? ans : ans?.text || ""}
                    onChange={(e) => {
                      const currentObj = typeof ans === "object" && ans !== null ? ans : {};
                      const next = { ...answers, [q.id]: { ...currentObj, text: e.target.value } };
                      setAnswers(next);
                      window.localStorage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
                    }}
                    placeholder={t("quiz.essayPlaceholder")}
                    className="w-full rounded-lg border border-border bg-background p-3 font-sans text-body-sm font-medium leading-relaxed transition-all hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none"
                  />

                  {/* Cloudflare R2 file uploader widget for Essay */}
                  <div className="space-y-2.5 pt-1">
                    <span className="block text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("quiz.attachmentLabel")}
                    </span>

                    {!ans?.fileName && !uploadingFile[q.id] ? (
                      <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/10 p-5 text-center transition-all hover:border-brand-primary/40 hover:bg-muted/20">
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          disabled={submitting || isSubmitted}
                          onChange={(e) => handleFileChange(q.id, e)}
                          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                        />
                        <UploadCloud className="mb-2 size-7 text-muted-foreground" />
                        <p className="text-body-xs font-bold text-foreground">{t("quiz.dropFile")}</p>
                        <p className="mt-0.5 text-body-xs text-muted-foreground">{t("quiz.fileTypes")}</p>
                      </div>
                    ) : null}

                    {/* Upload progress */}
                    {uploadingFile[q.id] && (uploadProgress[q.id] ?? 0) < 100 ? (
                      <div className="animate-pulse space-y-2 rounded-xl border border-brand-secondary/35 bg-brand-secondary/5 p-3.5">
                        <div className="flex justify-between text-body-xs font-semibold text-brand-secondary">
                          <span className="max-w-[200px] truncate">{t("quiz.uploading", { fileName: uploadingFile[q.id] })}</span>
                          <span>{uploadProgress[q.id]}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-md bg-muted">
                          <div
                            className="h-full rounded-md bg-brand-secondary transition-all"
                            style={{ width: `${uploadProgress[q.id]}%` }}
                          />
                        </div>
                        <p className="text-body-xs text-muted-foreground">{t("quiz.savingFile")}</p>
                      </div>
                    ) : null}

                    {/* Upload completed display */}
                    {ans?.fileName && (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-status-success/35 bg-status-success/5 p-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-status-success/15 text-status-success">
                            <FileText className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">{ans.fileName}</p>
                            <p className="text-body-2xs text-muted-foreground">{ans.fileSize || t("quiz.pdfImage")} • Cloudflare R2</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={submitting || isSubmitted}
                          onClick={() => handleRemoveFile(q.id)}
                          className="shrink-0 text-muted-foreground hover:bg-status-error/10 hover:text-status-error"
                          title={t("quiz.removeAttachment")}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">{t("quiz.removeAttachment")}</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3 md:mt-5">
              {/* Type indicator banner / info */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2">
                  {isMultiple ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-secondary/35 bg-brand-secondary/10 px-2 py-0.5 text-body-xs font-bold text-brand-secondary">
                        <CheckSquare className="size-3.5" />
                        {t("quiz.multipleChoice")}
                      </span>
                      <span className="text-body-xs font-medium text-muted-foreground">
                        {t("quiz.chooseAllCorrect")}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-body-xs font-medium text-muted-foreground">
                        <CircleDot className="size-3.5" />
                        {t("quiz.singleChoice")}
                      </span>
                      <span className="text-body-xs text-muted-foreground">
                        {t("quiz.chooseOne")}
                      </span>
                    </>
                  )}
                </div>
                {isMultiple && Array.isArray(ans) && ans.length > 0 ? (
                  <span className="text-body-xs font-semibold text-brand-secondary">
                    {t("quiz.selectedCount", { count: ans.length })}
                  </span>
                ) : null}
              </div>

              {/* Options List */}
              <ul
                role={isMultiple ? "group" : "radiogroup"}
                aria-label={isMultiple ? t("quiz.multipleAnswersAria") : t("quiz.singleAnswerAria")}
                className="space-y-2 md:space-y-2.5"
              >
                {q.options.map((opt, i) => {
                  const selected = isMultiple
                    ? Array.isArray(ans)
                      ? ans.includes(i)
                      : ans === i
                    : ans === i || (Array.isArray(ans) && ans.length === 1 && ans[0] === i);

                  return (
                    <li key={i}>
                      <button
                        type="button"
                        role={isMultiple ? "checkbox" : "radio"}
                        aria-checked={selected}
                        disabled={submitting || isSubmitted}
                        onClick={() => selectOption(q.id, i, isMultiple)}
                        className={quizOptionClasses(selected ? "selected" : "idle")}
                      >
                        {/* Circle (Radio) vs Boxie (Checkbox) Option Indicator */}
                        <span
                          aria-hidden="true"
                          className={quizOptionIndicatorClasses(
                            isMultiple ? "multiple" : "single",
                            selected ? "selected" : "idle",
                          )}
                        >
                          {isMultiple ? (
                            selected ? <Check className="size-3 md:size-3.5 stroke-[3] text-white" /> : null
                          ) : (
                            selected ? <span className="size-1.5 md:size-2 rounded-full bg-white" /> : null
                          )}
                        </span>

                        {/* Letter Badge */}
                        <span
                          className={quizOptionLetterClasses(
                            selected ? "selected" : "idle",
                            isMultiple ? "rounded-md" : "rounded-full",
                          )}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>

                        <div className="min-w-0 flex-1 break-words leading-normal text-foreground">
                          <MarkdownRenderer content={opt} className="space-y-3" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Flagging Option Widget inside Card */}
          <div className="mt-4 flex flex-col gap-2.5 border-t border-border/80 pt-3 sm:flex-row sm:items-center sm:justify-between md:mt-5 md:pt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={submitting || isSubmitted}
                checked={currentFlagged}
                onChange={() => toggleFlag(q.id)}
                className="size-4 rounded-sm border-border text-brand-secondary accent-brand-secondary focus:ring-brand-secondary cursor-pointer"
              />
              <span className={cn(
                "flex items-center gap-1 text-body-xs font-semibold transition-colors",
                currentFlagged ? "text-brand-secondary" : "text-muted-foreground hover:text-foreground"
              )}>
                <Flag className={cn("size-3.5", currentFlagged ? "fill-brand-secondary text-brand-secondary" : "")} />
                {t("quiz.markForReview")}
              </span>
            </label>

            <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
              <AlertCircle className="size-3 text-brand-primary" />
              {t("quiz.autoSaved")}
            </span>
          </div>
          <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
        </div>

        {/* Navigation Action Buttons */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {canGoBack ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1 rounded-md border-border/80 px-3 text-body-sm"
              onClick={goPrev}
              disabled={index === 0}
            >
              <ChevronLeft className="size-4" />
              {t("quiz.previous")}
            </Button>
          ) : (
            <span className="text-body-xs font-medium text-muted-foreground italic">
              {t("quiz.linearMode")}
            </span>
          )}

          <div className="flex gap-2">
            {index < sorted.length - 1 ? (
              <Button type="button" className="h-9 gap-1 rounded-md bg-foreground px-4 text-body-sm text-background hover:bg-foreground/90 sm:px-6" onClick={goNext}>
                {t("quiz.next")}
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={submitting || isSubmitted}
                className="h-9 rounded-md bg-brand-primary px-4 text-body-sm font-bold text-primary-foreground hover:bg-brand-primary/95 sm:px-8"
                onClick={handleRequestSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    {t("quiz.submitting")}
                  </>
                ) : (
                  t("quiz.submitAnswers")
                )}
              </Button>
            )}
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Sidebar Question Grid & Info (4 cols on lg) */}
      <div className="space-y-4 lg:col-span-4 lg:space-y-5 lg:border-l lg:border-border lg:pl-6">
        
        {/* Navigation Grid panel */}
        <div className="space-y-3 md:space-y-5">
          <div>
            <h3 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
              <BookOpen className="size-4 text-brand-primary" />
              {t("quiz.questionNavigation")}
            </h3>
            <p className="mt-1 text-body-xs text-muted-foreground">
              {canGoBack
                ? t("quiz.jumpToQuestion")
                : t("quiz.nextQuestionOnly")}
            </p>
          </div>

          {/* Grid buttons list */}
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:gap-2 lg:grid-cols-5">
            {sorted.map((question, idx) => {
              const active = index === idx;
              const isAnswered = isQuestionAnswered(question.id);
              const isFlagged = !!flags[question.id];
              const isAllowed = canGoBack || idx >= index;

              return (
                <button
                  key={question.id}
                  type="button"
                  aria-current={active ? "step" : undefined}
                  aria-label={isAllowed ? t("quiz.questionNumber", { number: idx + 1 }) : t("quiz.lockedQuestion", { number: idx + 1 })}
                  disabled={!isAllowed}
                  onClick={() => {
                    if (isAllowed) setIndex(idx);
                  }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border font-heading text-body-xs font-bold transition-all md:size-9",
                    !isAllowed && "opacity-40 cursor-not-allowed",
                    isAllowed && "cursor-pointer",
                    active
                      ? "border-brand-primary ring-2 ring-brand-primary/20"
                      : "border-transparent",
                    isFlagged
                      ? "bg-brand-secondary/15 text-brand-secondary border-brand-secondary/60 hover:bg-brand-secondary/25"
                      : isAnswered
                      ? "bg-tertiary-1/15 text-tertiary-1 border-tertiary-1/50 hover:bg-tertiary-1/25"
                      : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/80 hover:text-foreground"
                  )}
                  title={isAllowed ? t("quiz.questionNumber", { number: idx + 1 }) : t("quiz.lockedQuestion", { number: idx + 1 })}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Legend indicator */}
          <div className="space-y-2 border-t border-border pt-3 text-body-xs md:pt-4">
            <span className="font-semibold text-foreground block">{t("quiz.colorLegend")}:</span>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-muted/40 border border-border/50 shrink-0" />
                <span>{t("quiz.unanswered")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-tertiary-1/15 border border-tertiary-1/50 shrink-0" />
                <span>{t("quiz.answered")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-brand-secondary/15 border border-brand-secondary/60 shrink-0" />
                <span>{t("quiz.flagged")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded border-2 border-brand-primary shrink-0" />
                <span>{t("quiz.active")}</span>
              </div>
            </div>
          </div>

          {/* Sidebar Submit shortcut */}
          <div className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={submitting || isSubmitted}
              onClick={handleRequestSubmit}
              className="h-9 w-full rounded-md border-border/80 text-body-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("quiz.submitQuiz")}
            </Button>
          </div>
        </div>

      </div>

      {/* Confirmation Dialog before submitting */}
      <Dialog
        open={showConfirmModal}
        onOpenChange={(open) => {
          if (!submitting) setShowConfirmModal(open);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {t("quiz.confirmSubmitTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-1.5">
              {t("quiz.confirmSubmitDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                <span className="block text-body-xs font-semibold text-muted-foreground uppercase">{t("quiz.totalQuestions")}</span>
                <span className="font-heading text-body-base font-bold text-foreground">{sorted.length}</span>
              </div>
              <div className="rounded-xl border border-tertiary-1/30 bg-tertiary-1/10 p-2.5">
                <span className="block text-body-xs font-semibold text-tertiary-1 uppercase">{t("quiz.answered")}</span>
                <span className="font-heading text-body-base font-bold text-tertiary-1">{answeredCount}</span>
              </div>
              <div
                className={cn(
                  "rounded-xl border p-2.5",
                  unansweredCount > 0
                    ? "border-status-error/30 bg-status-error/10 text-status-error"
                    : "border-border bg-muted/30 text-muted-foreground"
                )}
              >
                <span className="block text-body-xs font-semibold uppercase">{t("quiz.empty")}</span>
                <span className="font-heading text-body-base font-bold">{unansweredCount}</span>
              </div>
            </div>

            {flaggedCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-brand-secondary/35 bg-brand-secondary/10 px-3.5 py-2.5 text-body-xs font-semibold text-brand-secondary">
                <Flag className="size-4 shrink-0 fill-brand-secondary" />
                <span>{t("quiz.flaggedCount", { count: flaggedCount })}</span>
              </div>
            )}

            {unansweredCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-body-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{t("quiz.unansweredWarning", { count: unansweredCount })}</span>
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-body-xs text-muted-foreground">
              <span>{t("quiz.remainingTime")}</span>
              <span className="font-mono font-bold text-foreground">{formatTime(timeLeft)}</span>
            </div>

            <p className="text-body-xs text-muted-foreground">
              {t("quiz.cannotEditAfterSubmit")}
            </p>
          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setShowConfirmModal(false)}
              className="w-full sm:w-auto rounded-lg border-border"
            >
              {t("quiz.reviewAgain")}
            </Button>
            <Button
              type="button"
              disabled={submitting}
              isLoading={submitting}
              onClick={() => {
                handleSubmit(false);
              }}
              className="w-full sm:w-auto rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 font-bold"
            >
              {t("quiz.confirmSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
