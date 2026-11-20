"use client";

import React, { useEffect, useRef, type CSSProperties } from "react";
import { Brain, Check, X, RotateCw, RefreshCw, SkipForward } from "lucide-react";
import { TutorAppearanceContext } from "@/components/course/tutor-message-frame";
import { ZyraCosmeticAvatar } from "@/components/gamification/zyra-cosmetic-avatar";
import { DEFAULT_PET_ID } from "@/lib/gamification/pet-studio";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";

import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { useTranslations } from "@/lib/i18n/client";
import { FLASHCARD_BATCH_SIZE } from "@/lib/demo/flashcard-resume";
import type { FlashcardSessionProps } from "@/lib/flashcards/review-contract";
import { useFlashcardSession } from "@/hooks/use-flashcard-session";
import { useQueryAccountCurrent } from "@/hooks/use-query-account";

export type { FlashcardQueueItem as QueueItem } from "@/lib/flashcards/review-contract";

const BATCH_SIZE = FLASHCARD_BATCH_SIZE;

export function FlashcardClient(props: FlashcardSessionProps) {
  const currentAccount = useQueryAccountCurrent(props.studentId);
  if (!props.adapter && !currentAccount) return null;
  return <FlashcardSession key={JSON.stringify([props.studentId, props.courseId])} {...props} />;
}

function PetRecall({ avatarId, isFlipped }: { avatarId: string | null; isFlipped: boolean }) {
  const t = useTranslations("learning");
  const [note, setNote] = React.useState("");
  if (isFlipped && !note.trim()) return null;
  return (
    <details className="px-1">
      <summary className="w-fit cursor-pointer rounded-md text-body-sm focus-visible:outline-primary">
        <span className="inline-flex items-center gap-2 align-middle">
          <ZyraCosmeticAvatar cosmeticId={avatarId ?? DEFAULT_PET_ID} headOnly size={32} />
          {t("flashcards.recallWithPet")}
        </span>
      </summary>
      <label className="mt-2 block text-body-xs">
        {t(isFlipped ? "flashcards.compareRecall" : "flashcards.writeRecall")}
        <Textarea className="mt-1" value={note} onChange={event => setNote(event.target.value)} readOnly={isFlipped} />
      </label>
    </details>
  );
}

function FlashcardSession(props: FlashcardSessionProps) {
  const { adapter } = props;
  const appearance = React.useContext(TutorAppearanceContext);
  const t = useTranslations("learning");
  const {
    queue, activeBatch, currentItem, batchOffset, currentIndex, isFlipped, mode,
    typedAnswer, setTypedAnswer, isChecked, passedExam, completedCount, loading,
    handleFlip, handleCheckAnswer, handleGrade, handleSkip,
    changeMode, startNextBatch, resetCard,
  } = useFlashcardSession(props);

  const frontFlipButton = useRef<HTMLButtonElement>(null);
  const backFlipButton = useRef<HTMLButtonElement>(null);
  const restoreFlipFocus = useRef(false);
  useEffect(() => {
    if (!restoreFlipFocus.current) return;
    restoreFlipFocus.current = false;
    (isFlipped ? backFlipButton : frontFlipButton).current?.focus({ preventScroll: true });
  }, [isFlipped]);

  function flipFromButton() {
    if (!loading && (mode !== "exam" || isChecked)) {
      restoreFlipFocus.current = true;
    }
    handleFlip();
  }

  // Helper styles for 3D card
  const cardStyle: CSSProperties = {
    perspective: "1000px",
  };

  const innerStyle = (flipped: boolean): CSSProperties => ({
    transformStyle: "preserve-3d",
    transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
  });

  const faceStyle: CSSProperties = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-3 py-5 text-center">
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
      <div className="mx-auto max-w-2xl px-3 py-5 text-center">
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
              onClick={startNextBatch}
              className="rounded-md"
            >
              <RefreshCw className="mr-1.5 size-4" />
              {t("flashcards.nextSession", { count: Math.min(BATCH_SIZE, queue.length - (batchOffset + BATCH_SIZE)) })}
            </Button>
          ) : (
            <Button type="button" onClick={() => adapter?.onRestart ? adapter.onRestart() : window.location.reload()} className="rounded-md">
              <RefreshCw className="mr-1.5 size-4" />
              {t("flashcards.restart")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const activeCard = currentItem.card;
  const prompt = activeCard.front.trim();
  const shortPrompt = prompt.length <= 120 && !prompt.includes("\n");
  const recallDifficulty = activeCard.metadata?.recallDifficulty;
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
    <div className="mx-auto max-w-2xl space-y-(--related-gap)">
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

          <RadioGroup aria-label={t("flashcards.mode")} orientation="horizontal" className="flex items-center gap-3" value={mode} onValueChange={changeMode}>
            <label className="flex items-center gap-2 text-body-sm"><RadioGroupItem value="standard" disabled={loading} />{t("flashcards.standard")}</label>
            <label className="flex items-center gap-2 text-body-sm"><RadioGroupItem value="exam" disabled={loading} />{t("flashcards.typeAnswer")}</label>
          </RadioGroup>
        </div>
      </div>

      {appearance.petAccess && !adapter && mode === "standard" && (
        <PetRecall key={JSON.stringify([batchOffset + currentIndex, activeCard.id])} avatarId={appearance.avatarId} isFlipped={isFlipped} />
      )}

      {/* Spaced Repetition Info Alert */}
      {currentItem.dueStatus === "review" && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3 text-body-xs text-brand-primary">
          <Brain className="size-4 shrink-0" />
          <span>{t("flashcards.dueForReview")}</span>
        </div>
      )}

      {/* 3D Flip Card Container */}
      <div
        className="relative w-full cursor-pointer"
        style={cardStyle}
        onClick={(e) => {
          // Visual controls and plot gestures must not flip the card.
          const target = e.target as HTMLElement;
          if (target.closest("button, input, textarea, select, a, figure, [data-learning-visual]")) {
            return;
          }
          handleFlip();
        }}
      >
        <div
          className="relative grid w-full min-w-0 transform-style-3d motion-safe:transition-transform motion-safe:duration-[600ms]"
          style={innerStyle(isFlipped)}
        >
          {/* FRONT FACE */}
          <div
            data-flashcard-face="front"
            inert={isFlipped}
            className="col-start-1 row-start-1 flex min-h-64 min-w-0 flex-col justify-between gap-(--related-gap) rounded-2xl border border-border bg-card p-(--panel-padding) shadow-sm sm:p-(--group-gap)"
            style={faceStyle}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex rounded-md border border-brand-primary/20 bg-brand-primary/5 px-2 py-0.5 text-body-xs font-semibold text-brand-primary">{localizedReason}</span>
              <span className="text-body-xs font-medium text-muted-foreground">
                {t("flashcards.question")}
              </span>
            </div>

            <div className="flex min-w-0 flex-1 items-center">
              <div className="w-full min-w-0">
                <MarkdownRenderer
                  content={activeCard.front}
                  className={shortPrompt ? "text-body-md font-medium text-center text-foreground [&>p]:text-body-md" : "text-center text-foreground"}
                />
              </div>
            </div>

            <Button ref={frontFlipButton} type="button" variant="ghost" size="sm" onClick={flipFromButton} className="self-center text-muted-foreground">
              <RotateCw className="size-4" />
              {t("flashcards.flipCard")}
            </Button>
          </div>

          {/* BACK FACE */}
          <div
            data-flashcard-face="back"
            inert={!isFlipped}
            className="col-start-1 row-start-1 flex min-h-64 min-w-0 flex-col justify-between gap-(--related-gap) rounded-2xl border border-border bg-card p-(--panel-padding) shadow-sm sm:p-(--group-gap) rotate-y-180"
            style={faceStyle}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-body-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {t("flashcards.answer")}
              </span>
              {typeof recallDifficulty === "number" ? (
                <span
                  className="flex items-center gap-1 text-body-xs font-medium text-muted-foreground"
                  title={t("flashcards.recallLevel", { level: recallDifficulty })}
                >
                  <span className="hidden sm:inline">{t("flashcards.recall")}</span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={
                          "size-1.5 rounded-full " +
                          (n <= recallDifficulty ? "bg-status-warning" : "bg-muted")
                        }
                      />
                    ))}
                  </span>
                </span>
              ) : (
                <span className="text-body-xs font-medium text-muted-foreground">{t("flashcards.details")}</span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 items-center">
              <div className="w-full min-w-0 space-y-(--related-gap)">
                <MarkdownRenderer content={activeCard.back} className="text-center text-foreground" />
                {activeCard.explanation && (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="text-body-sm font-semibold text-muted-foreground">{t("flashcards.explanation")}</div>
                    <MarkdownRenderer content={activeCard.explanation} density="compact" className="text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            <Button ref={backFlipButton} type="button" variant="ghost" size="sm" onClick={flipFromButton} className="self-center text-muted-foreground">
              <RotateCw className="size-4" />
              {t("flashcards.flipToQuestion")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={handleSkip} disabled={loading || queue.length - (batchOffset + currentIndex) <= 1} className="rounded-md text-body-sm text-muted-foreground hover:text-foreground">
          {t("flashcards.skip")} <SkipForward className="ml-1.5 size-4" />
        </Button>
      </div>

      {/* Interactive Input Area for Exam Mode */}
      {mode === "exam" && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-body-base sm:text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
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
                onClick={resetCard}
                disabled={loading}
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
