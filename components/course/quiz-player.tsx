"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Flag, Timer, Clock, BookOpen, AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { quizOptionClasses, quizOptionLetterClasses } from "@/components/course/quiz-option-styles";
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
      correctIndex?: number;
      origin?: "zyx_original" | "itb_example";
      sourceEventName?: string | null;
      sourceReferenceId?: string | null;
    }>;
    settings?: {
      timeLimitMinutes?: number;
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

export function QuizPlayer({ courseId, exam, attemptId, getRedirectPath, redirectBasePath, initialAnswers, startedAtMs, closeAtMs }: QuizPlayerProps) {
  const router = useRouter();
  const { setSuppressPet } = useTutor();
  const durationSeconds = (exam.settings?.timeLimitMinutes ?? 15) * 60;
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const sorted = useMemo(
    () => [...exam.questions].sort((a, b) => a.order - b.order),
    [exam.questions],
  );

  const isQuestionAnswered = useCallback((questionId: string) => {
    const val = answers[questionId];
    if (val === undefined || val === null) return false;
    if (typeof val === "string") return val.trim().length > 0;
    return true;
  }, [answers]);

  const handleRequestSubmit = useCallback(() => {
    if (isSubmitted || submitting) return;

    if (requireAllAnswered) {
      const unansweredIndex = sorted.findIndex((question) => !isQuestionAnswered(question.id));
      if (unansweredIndex !== -1) {
        toast.error("Harap jawab semua butir soal sebelum mengumpulkan kuis.");
        setIndex(unansweredIndex);
        return;
      }
    }

    setShowConfirmModal(true);
  }, [isSubmitted, submitting, requireAllAnswered, sorted, isQuestionAnswered]);

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

  const handleSubmit = useCallback(async (isAutoSubmit = false) => {
    if (isSubmitted || submitting) return;

    if (requireAllAnswered && !isAutoSubmit) {
      const unansweredIndex = sorted.findIndex((question) => !isQuestionAnswered(question.id));
      if (unansweredIndex !== -1) {
        toast.error("Harap jawab semua butir soal sebelum mengumpulkan kuis.");
        setIndex(unansweredIndex);
        return;
      }
    }

    try {
      setSubmitting(true);
      window.localStorage.removeItem(timerStorageKey);
      window.localStorage.removeItem(`zyx-quiz-answers-${attemptId}`);
      window.localStorage.removeItem(`zyx-quiz-flags-${attemptId}`);

      // Transform answers to standard Record<string, any> format
      const formattedAnswers: Record<string, any> = {};
      for (const [qId, val] of Object.entries(answers)) {
        if (typeof val === "number") {
          formattedAnswers[qId] = [val];
        } else {
          formattedAnswers[qId] = val;
        }
      }

      // Mark all unanswered questions as empty
      for (const question of exam.questions) {
        if (formattedAnswers[question.id] === undefined) {
          formattedAnswers[question.id] = question.type === "short_answer" || question.type === "essay" ? "" : [];
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
        let message = "Gagal mengumpulkan kuis";
        try {
          const errData = await res.json();
          if (errData?.error) message = typeof errData.error === "string" ? errData.error : "Terjadi kesalahan";
        } catch { /* empty or non-JSON body */ }
        throw new Error(message);
      }

      setIsSubmitted(true);
      toast.success("Kuis berhasil dikumpulkan! Mengarahkan ke pembahasan...");

      // Navigate to the review screen for this attempt
      const reviewPath = getRedirectPath
        ? getRedirectPath(attemptId)
        : redirectBasePath
          ? `${redirectBasePath}?attemptId=${attemptId}`
          : `/courses/${courseId}/quiz/${exam.id}?attemptId=${attemptId}`;
      router.replace(reviewPath);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mengumpulkan kuis. Silakan coba kembali.";
      toast.error(message);
      setSubmitting(false);
    }
  }, [courseId, isSubmitted, submitting, router, timerStorageKey, attemptId, answers, durationSeconds, timeLeft, exam.id, exam.questions, getRedirectPath, redirectBasePath, requireAllAnswered, sorted, isQuestionAnswered]);

  // Per-question timer interval
  useEffect(() => {
    if (!perQuestionTimerEnabled || isSubmitted || submitting) return;

    const qTimer = setInterval(() => {
      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(qTimer);
          if (index < sorted.length - 1) {
            toast.info("Waktu untuk butir soal ini telah habis. Beralih ke soal berikutnya.");
            setIndex((i) => i + 1);
          } else {
            const totalDeadline = Number(window.localStorage.getItem(timerStorageKey));
            const totalRemaining = Number.isFinite(totalDeadline)
              ? Math.max(0, Math.ceil((totalDeadline - Date.now()) / 1000))
              : 0;
            if (totalRemaining > 0) {
              toast.info("Waktu untuk butir soal ini telah habis. Periksa jawaban Anda dan kumpulkan sebelum waktu total berakhir.");
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
        toast.warning("Waktu habis! Jawaban Anda otomatis terkirim.");
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

  function selectOption(qId: string, optionIndex: number) {
    if (isSubmitted || submitting) return;
    const next = { ...answers, [qId]: optionIndex };
    setAnswers(next);
    window.localStorage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
  }

  function toggleFlag(qId: string) {
    if (isSubmitted || submitting) return;
    const next = { ...flags, [qId]: !flags[qId] };
    setFlags(next);
    window.localStorage.setItem(`zyx-quiz-flags-${attemptId}`, JSON.stringify(next));
  }

  function goNext() {
    if (index < sorted.length - 1) setIndex((i) => i + 1);
  }

  function goPrev() {
    if (index > 0) setIndex((i) => i - 1);
  }

  if (!q) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/15 py-10 text-center">
        <p className="text-body-sm text-muted-foreground">Tidak ada pertanyaan untuk kuis ini.</p>
      </div>
    );
  }

  const ans = answers[q.id];
  const currentFlagged = !!flags[q.id];

  return (
    <div className="grid grid-cols-1 items-start gap-4 font-sans md:gap-6 lg:grid-cols-12">
      
      {/* LEFT COLUMN: Main player and Question details (8 cols on lg) */}
      <div className="space-y-4 md:space-y-5 lg:col-span-8">
        
        {/* Progress Bar & Header */}
        <div className="flex flex-col gap-2.5 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:pb-4">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-body-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>PROGRES PENGERJAAN</span>
              <span>{Math.round(progress)}% ({answeredCount} / {sorted.length} Terisi)</span>
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
              <div className="flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-primary/35 bg-brand-primary/10 px-2.5 py-1 font-mono text-body-sm font-bold text-brand-primary sm:px-3 sm:py-1.5" title="Batas waktu untuk nomor ini">
                <Timer className="size-3.5 animate-pulse sm:size-4" />
                <span>Soal: {questionTimeLeft}s</span>
              </div>
            )}
            <div className="flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-secondary/35 bg-brand-secondary/10 px-2.5 py-1 font-mono text-body-sm font-bold text-brand-secondary sm:px-3 sm:py-1.5" title="Total sisa waktu kuis">
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
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-body-xs font-bold text-white shadow-xs md:size-8 md:text-body-sm">
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
            <div className="mt-4 md:mt-5 space-y-3">
              <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                {q.type === "short_answer" ? "Ketik Jawaban Singkat Anda:" : "Tuliskan Jawaban Essay Anda:"}
              </label>
              {q.type === "short_answer" ? (
                <input
                  type="text"
                  disabled={submitting || isSubmitted}
                  value={typeof ans === "string" ? ans : ""}
                  onChange={(e) => {
                    const next = { ...answers, [q.id]: e.target.value };
                    setAnswers(next);
                    window.localStorage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
                  }}
                  placeholder="Ketik jawaban singkat di sini..."
                  className="w-full rounded-lg border border-border bg-background p-3 text-body-sm font-medium hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all"
                />
              ) : (
                <textarea
                  rows={5}
                  disabled={submitting || isSubmitted}
                  value={typeof ans === "string" ? ans : ""}
                  onChange={(e) => {
                    const next = { ...answers, [q.id]: e.target.value };
                    setAnswers(next);
                    window.localStorage.setItem(`zyx-quiz-answers-${attemptId}`, JSON.stringify(next));
                  }}
                  placeholder="Tuliskan jawaban essay Anda selengkap mungkin..."
                  className="w-full rounded-lg border border-border bg-background p-3 text-body-sm font-medium hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none transition-all font-sans"
                />
              )}
            </div>
          ) : (
            <ul className="mt-4 space-y-2 md:mt-5 md:space-y-2.5">
              {q.options.map((opt, i) => {
                const selected = ans === i;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={submitting || isSubmitted}
                      onClick={() => selectOption(q.id, i)}
                      className={quizOptionClasses(selected ? "selected" : "idle")}
                    >
                      <span
                        className={quizOptionLetterClasses(selected ? "selected" : "idle")}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <div className="text-foreground leading-normal flex-1">
                        <MarkdownRenderer content={opt} className="space-y-3" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
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
                Ragu-ragu / Tandai Soal
              </span>
            </label>

            <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
              <AlertCircle className="size-3 text-brand-primary" />
              Progress tersimpan otomatis
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
              Sebelumnya
            </Button>
          ) : (
            <span className="text-body-xs font-medium text-muted-foreground italic">
              Mode linier (navigasi satu arah)
            </span>
          )}

          <div className="flex gap-2">
            {index < sorted.length - 1 ? (
              <Button type="button" className="h-9 gap-1 rounded-md bg-foreground px-4 text-body-sm text-background hover:bg-foreground/90 sm:px-6" onClick={goNext}>
                Lanjut
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={submitting || isSubmitted}
                className="h-9 rounded-md bg-brand-primary px-4 text-body-sm font-bold text-white hover:bg-brand-primary/95 sm:px-8"
                onClick={handleRequestSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  "Kirim Jawaban"
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
              Navigasi Pertanyaan
            </h3>
            <p className="mt-1 text-body-xs text-muted-foreground">
              {canGoBack
                ? "Lompat langsung ke butir soal dengan klik tombol angka di bawah:"
                : "Klik butir soal berikutnya untuk berpindah (soal sebelumnya terkunci):"}
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
                  disabled={!isAllowed}
                  onClick={() => {
                    if (isAllowed) setIndex(idx);
                  }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border font-heading text-body-xs font-bold transition-all md:size-9",
                    !isAllowed && "opacity-40 cursor-not-allowed",
                    isAllowed && "cursor-pointer",
                    active
                      ? "border-brand-primary ring-2 ring-brand-primary/20 scale-105"
                      : "border-transparent",
                    isFlagged
                      ? "bg-brand-secondary/15 text-brand-secondary border-brand-secondary/60 hover:bg-brand-secondary/25"
                      : isAnswered
                      ? "bg-tertiary-1/15 text-tertiary-1 border-tertiary-1/50 hover:bg-tertiary-1/25"
                      : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/80 hover:text-foreground"
                  )}
                  title={`Soal ${idx + 1}${!isAllowed ? " (Terkunci)" : ""}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Legend indicator */}
          <div className="space-y-2 border-t border-border pt-3 text-body-xs md:pt-4">
            <span className="font-semibold text-foreground block">Keterangan Warna:</span>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-muted/40 border border-border/50 shrink-0" />
                <span>Belum diisi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-tertiary-1/15 border border-tertiary-1/50 shrink-0" />
                <span>Terjawab</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-brand-secondary/15 border border-brand-secondary/60 shrink-0" />
                <span>Ragu-ragu</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded border-2 border-brand-primary shrink-0" />
                <span>Aktif</span>
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
              Kumpulkan Kuis
            </Button>
          </div>
        </div>

      </div>

      {/* Confirmation Dialog before submitting */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-md rounded-2xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              Kumpulkan Lembar Jawaban Kuis?
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-1.5">
              Periksa kembali ringkasan pengerjaan sebelum mengumpulkan jawaban Anda.
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border bg-muted/30 p-2.5">
                <span className="block text-body-xs font-semibold text-muted-foreground uppercase">Total Soal</span>
                <span className="font-heading text-body-base font-bold text-foreground">{sorted.length}</span>
              </div>
              <div className="rounded-xl border border-tertiary-1/30 bg-tertiary-1/10 p-2.5">
                <span className="block text-body-xs font-semibold text-tertiary-1 uppercase">Terjawab</span>
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
                <span className="block text-body-xs font-semibold uppercase">Kosong</span>
                <span className="font-heading text-body-base font-bold">{unansweredCount}</span>
              </div>
            </div>

            {flaggedCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-brand-secondary/35 bg-brand-secondary/10 px-3.5 py-2.5 text-body-xs font-semibold text-brand-secondary">
                <Flag className="size-4 shrink-0 fill-brand-secondary" />
                <span>Masih ada {flaggedCount} butir soal yang ditandai ragu-ragu.</span>
              </div>
            )}

            {unansweredCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-body-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>Terdapat {unansweredCount} butir soal belum diisi. Soal yang kosong akan dianggap bernilai nol.</span>
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-body-xs text-muted-foreground">
              <span>Sisa waktu pengerjaan:</span>
              <span className="font-mono font-bold text-foreground">{formatTime(timeLeft)}</span>
            </div>

            <p className="text-body-xs text-muted-foreground">
              Setelah dikumpulkan, lembar jawaban Anda akan dinilai dan tidak dapat diubah lagi.
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
              Cek Kembali
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => {
                setShowConfirmModal(false);
                handleSubmit(false);
              }}
              className="w-full sm:w-auto rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 font-bold"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Mengirim...
                </>
              ) : (
                "Ya, Kumpulkan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
