"use client";

import { useState } from "react";
import Link from "next/link";
import { Brain, Check, X, RotateCw, RefreshCw, SkipForward } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/course/math-text";
import { submitReviewAction } from "./actions";
import { toast } from "@/components/ui/toast";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { appendFlashcardRetry, skipFlashcardInSession } from "@/lib/flashcard-session";
import { useTranslations } from "@/lib/i18n/client";

interface Flashcard {
  id: string;
  setId: string;
  koId: string | null;
  front: string;
  back: string;
  explanation: string | null;
  status: string;
  metadata: any;
  createdAt: Date;
}

interface QueueItem {
  card: Flashcard;
  progress: any;
  dueStatus: "new" | "review";
  nextReviewDue: Date;
  ideaId: string | null;
  masteryScore: number | null;
  confidence: number | null;
  seenBefore: boolean;
  priorityReason: string;
}

type FlashcardClientProps = {
  courseId: string;
  initialQueue: QueueItem[];
  studentId: string;
};

const BATCH_SIZE = 10;

export function FlashcardClient({ courseId, initialQueue, studentId }: FlashcardClientProps) {
  const t = useTranslations("learning");
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [batchOffset, setBatchOffset] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mode, setMode] = useState<"standard" | "exam">("standard");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [isChecked, setIsChecked] = useState(false);
  const [passedExam, setPassedExam] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

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
    if (!currentItem) return;

    setLoading(true);
    try {
      // Call server action wrapper
      await submitReviewAction(
        studentId,
        currentItem.card.id,
        grade,
        mode === "exam" ? typedAnswer : undefined,
        mode === "exam",
        courseId
      );

      toast.success(t("flashcards.gradeSaved"));
      setCompletedCount((prev) => prev + 1);
      emitActivityUpdated({ type: "flashcard", courseId, cardId: currentItem.card.id });

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
    } catch (err: any) {
      console.error("Error submitting review:", err);
      toast.error(t("flashcards.saveReviewFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (!currentItem || queue.length - currentIndex <= 1 || loading) return;
    setQueue((current) => skipFlashcardInSession(current, currentIndex));
    setIsFlipped(false);
    setTypedAnswer("");
    setIsChecked(false);
    setPassedExam(null);
  };

  // Helper styles for 3D card
  const cardStyle: React.CSSProperties = {
    perspective: "1000px",
  };

  const innerStyle = (flipped: boolean): React.CSSProperties => ({
    transformStyle: "preserve-3d",
    transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
    transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
  });

  const faceStyle: React.CSSProperties = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border/60 bg-muted/15 p-6">
        <p className="text-body-sm text-muted-foreground">
          {t("flashcards.empty")}
        </p>
      </div>
    );
  }

  const isBatchFinished = currentIndex >= activeBatch.length;
  const hasMoreCards = batchOffset + BATCH_SIZE < queue.length;

  if (isBatchFinished) {
    const currentSessionNum = Math.floor(batchOffset / BATCH_SIZE) + 1;
    const totalSessions = Math.ceil(queue.length / BATCH_SIZE);
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border/60 bg-card p-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          <Check className="size-6" />
        </div>
        <h3 className="mt-4 font-heading text-body-base font-bold text-foreground">
          {t("flashcards.sessionDone", { current: currentSessionNum, total: totalSessions })}
        </h3>
        <p className="mt-2 text-body-sm text-muted-foreground">
          {t("flashcards.sessionSummary", { count: activeBatch.length, completed: completedCount })}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {hasMoreCards ? (
            <Button
              type="button"
              onClick={() => {
                setBatchOffset((prev) => prev + BATCH_SIZE);
                setCurrentIndex(0);
                setIsFlipped(false);
                setTypedAnswer("");
                setIsChecked(false);
                setPassedExam(null);
              }}
              className="rounded-md"
            >
              <RefreshCw className="mr-1.5 size-4" />
              {t("flashcards.nextSession", { count: Math.min(BATCH_SIZE, queue.length - (batchOffset + BATCH_SIZE)) })}
            </Button>
          ) : (
            <Button type="button" onClick={() => window.location.reload()} className="rounded-md">
              <RefreshCw className="mr-1.5 size-4" />
              {t("flashcards.restart")}
            </Button>
          )}
          <Button asChild variant="outline" className="rounded-md">
            <Link href={`/courses/${courseId}`}>{t("flashcards.backToOverview")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const activeCard = currentItem.card;
  const reasonKey: Record<string, string> = {
    "Tanpa pemetaan Idea": "reasonUnmapped",
    "Perlu dikuasai": "reasonMastery",
    "Kartu baru": "reasonNew",
    "Waktunya mengulang": "reasonDue",
  };
  const localizedReason = reasonKey[currentItem.priorityReason]
    ? t(`flashcards.${reasonKey[currentItem.priorityReason]}`)
    : currentItem.priorityReason;
  const currentSessionNum = Math.floor(batchOffset / BATCH_SIZE) + 1;
  const totalSessions = Math.ceil(queue.length / BATCH_SIZE);
  const progressPercent = Math.round((currentIndex / activeBatch.length) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Top Controls and Stats - Flat Header without Card border */}
      <div className="space-y-2">
        <div className="h-1 w-full overflow-hidden rounded-md bg-muted">
          <div
            className="h-full bg-brand-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="text-body-xs font-medium text-muted-foreground">
            {t("flashcards.sessionProgress", { session: currentSessionNum, total: totalSessions, current: currentIndex + 1, count: activeBatch.length, all: queue.length })}
          </span>

          <RadioGroup aria-label={t("flashcards.mode")} orientation="horizontal" className="flex items-center gap-3" value={mode} onValueChange={(value) => {
            setMode(value as "standard" | "exam");
            setIsFlipped(false);
            setTypedAnswer("");
            setIsChecked(false);
          }}>
            <label className="flex items-center gap-2 text-body-sm"><RadioGroupItem value="standard" disabled={loading} />{t("flashcards.standard")}</label>
            <label className="flex items-center gap-2 text-body-sm"><RadioGroupItem value="exam" disabled={loading} />{t("flashcards.typeAnswer")}</label>
          </RadioGroup>
        </div>
      </div>

      {/* Spaced Repetition Info Alert */}
      {currentItem.dueStatus === "review" && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3 text-body-xs text-brand-primary">
          <Brain className="size-4 shrink-0" />
          <span>{t("flashcards.dueForReview")}</span>
        </div>
      )}

      {/* 3D Flip Card Container */}
      <div
        className="relative w-full h-80 select-none cursor-pointer"
        style={cardStyle}
        onClick={(e) => {
          // Avoid flipping when clicking buttons or input elements
          const target = e.target as HTMLElement;
          if (target.closest("button") || target.closest("input") || target.closest("textarea")) {
            return;
          }
          handleFlip();
        }}
      >
        <div
          className="relative w-full h-full transform-style-3d"
          style={innerStyle(isFlipped)}
        >
          {/* FRONT FACE */}
          <div
            className="absolute inset-0 w-full h-full rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between"
            style={faceStyle}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex rounded-md border border-brand-primary/20 bg-brand-primary/5 px-2 py-0.5 text-body-xs font-semibold text-brand-primary">{localizedReason}</span>
              <span className="text-body-xs font-medium text-muted-foreground">
                {t("flashcards.question")}
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center py-4 overflow-y-auto">
              <MathText className="font-sans text-body-base font-semibold text-foreground text-center" as="div">
                {activeCard.front}
              </MathText>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-body-xs text-muted-foreground">
              <RotateCw className="size-3" />
              <span>{t("flashcards.flipCard")}</span>
            </div>
          </div>

          {/* BACK FACE */}
          <div
            className="absolute inset-0 w-full h-full rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between rotate-y-180"
            style={faceStyle}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-body-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {t("flashcards.answer")}
              </span>
              {typeof activeCard.metadata?.recallDifficulty === "number" ? (
                <span
                  className="flex items-center gap-1 text-body-xs font-medium text-muted-foreground"
                  title={t("flashcards.recallLevel", { level: activeCard.metadata.recallDifficulty })}
                >
                  <span className="hidden sm:inline">{t("flashcards.recall")}</span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={
                          "size-1.5 rounded-full " +
                          (n <= activeCard.metadata.recallDifficulty ? "bg-status-warning" : "bg-muted")
                        }
                      />
                    ))}
                  </span>
                </span>
              ) : (
                <span className="text-body-xs font-medium text-muted-foreground">{t("flashcards.details")}</span>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-center py-4 overflow-y-auto space-y-3">
              <MathText className="font-heading text-body-base font-bold text-foreground text-center" as="div">
                {activeCard.back}
              </MathText>
              {activeCard.explanation && (
                <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
                  <div className="text-body-xs font-semibold text-muted-foreground mb-0.5">{t("flashcards.explanation")}</div>
                  <MathText className="text-body-xs text-muted-foreground" as="div">
                    {activeCard.explanation}
                  </MathText>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-1.5 text-body-xs text-muted-foreground">
              <RotateCw className="size-3" />
              <span>{t("flashcards.flipToQuestion")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={handleSkip} disabled={loading || queue.length - currentIndex <= 1} className="rounded-md text-body-sm text-muted-foreground hover:text-foreground">
          {t("flashcards.skip")} <SkipForward className="ml-1.5 size-4" />
        </Button>
      </div>

      {/* Interactive Input Area for Exam Mode */}
      {mode === "exam" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-body-sm font-semibold text-foreground">
              {t("flashcards.yourAnswer")}
            </label>
            {isChecked && (
              <span className={`flex items-center gap-1 text-body-xs font-bold ${passedExam ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                {passedExam ? (
                  <>
                    <Check className="size-3.5" /> {t("flashcards.correctMatch")}
                  </>
                ) : (
                  <>
                    <X className="size-3.5" /> {t("flashcards.incorrect")}
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              disabled={isChecked || loading}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder={t("flashcards.answerPlaceholder")}
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
            />
            {!isChecked ? (
              <Button
                onClick={handleCheckAnswer}
                disabled={loading}
                size="lg"
                className="rounded-md bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 h-9"
              >
                {t("flashcards.check")}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setIsChecked(false);
                  setTypedAnswer("");
                  setPassedExam(null);
                  setIsFlipped(false);
                }}
                variant="outline"
                size="lg"
                className="rounded-md h-9"
              >
                {t("flashcards.tryAgain")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Recall Self-Evaluation Grade Buttons (Visible when flipped or checked) */}
      {(isFlipped || isChecked) && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button
              type="button"
              disabled={loading}
              onClick={() => handleGrade(1)}
              className="w-full rounded-md border border-transparent bg-status-error/10 text-status-error hover:bg-status-error/20 active:scale-[0.98] text-body-sm font-semibold py-3 h-auto transition-colors"
            >
              {t("flashcards.again")}
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={() => handleGrade(2)}
              className="w-full rounded-md border border-transparent bg-status-warning/10 text-status-warning hover:bg-status-warning/20 active:scale-[0.98] text-body-sm font-semibold py-3 h-auto transition-colors"
            >
              {t("flashcards.hard")}
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={() => handleGrade(3)}
              className="w-full rounded-md border border-transparent bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 active:scale-[0.98] text-body-sm font-semibold py-3 h-auto transition-colors"
            >
              {t("flashcards.understood")}
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={() => handleGrade(4)}
              className="w-full rounded-md border border-transparent bg-status-success/10 text-status-success hover:bg-status-success/20 active:scale-[0.98] text-body-sm font-semibold py-3 h-auto transition-colors"
            >
              {t("flashcards.easy")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
