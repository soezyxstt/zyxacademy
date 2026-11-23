"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScientificInput } from "@/components/ui/scientific-input";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Check,
  CheckSquare,
  CircleDot,
  FileText,
  Flag,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { InteractiveDocumentAttempt } from "@/components/course/interactive-document-context";
import {
  quizOptionClasses,
  quizOptionIndicatorClasses,
  quizOptionLetterClasses,
} from "@/components/course/quiz-option-styles";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import type { useQuizPlayer } from "@/hooks/use-quiz-player";
import {
  asEssayAnswer,
  isMultipleChoiceQuestion,
  type QuizPlayerProps,
} from "@/lib/quiz/player-state";

export type QuizPlayerController = ReturnType<typeof useQuizPlayer>;

export function formatQuizTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function QuizQuestionMapGrid({
  controller,
  onSelect,
}: {
  controller: QuizPlayerController;
  onSelect?: () => void;
}) {
  const {
    t,
    sorted,
    index,
    setIndex,
    flags,
    canGoBack,
    submitting,
    isSubmitted,
    isQuestionAnswered,
  } = controller;
  const locked = submitting || isSubmitted;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-2 lg:grid-cols-5">
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
              aria-label={
                isAllowed
                  ? `${t("quiz.questionNumber", { number: idx + 1 })}, ${t(
                      isFlagged
                        ? "quiz.flagged"
                        : isAnswered
                          ? "quiz.answered"
                          : "quiz.unanswered"
                    )}`
                  : t("quiz.lockedQuestion", { number: idx + 1 })
              }
              disabled={locked || !isAllowed}
              onClick={() => {
                if (locked || !isAllowed) return;
                setIndex(idx);
                onSelect?.();
              }}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg border font-heading text-body-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                (locked || !isAllowed) && "cursor-not-allowed opacity-40",
                !locked && isAllowed && "cursor-pointer",
                active
                  ? "border-brand-primary ring-2 ring-brand-primary/20"
                  : "border-transparent",
                isFlagged
                  ? "border-brand-secondary/60 bg-brand-secondary/15 text-brand-secondary hover:bg-brand-secondary/25"
                  : isAnswered
                    ? "border-tertiary-1/50 bg-tertiary-1/15 text-tertiary-1 hover:bg-tertiary-1/25"
                    : "border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
              title={
                isAllowed
                  ? t("quiz.questionNumber", { number: idx + 1 })
                  : t("quiz.lockedQuestion", { number: idx + 1 })
              }
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border pt-3 text-body-xs md:pt-4">
        <span className="block font-semibold text-foreground">
          {t("quiz.colorLegend")}:
        </span>
        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded border border-border/50 bg-muted/40" />
            <span>{t("quiz.unanswered")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded border border-tertiary-1/50 bg-tertiary-1/15" />
            <span>{t("quiz.answered")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded border border-brand-secondary/60 bg-brand-secondary/15" />
            <span>{t("quiz.flagged")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded border-2 border-brand-primary" />
            <span>{t("quiz.active")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuizQuestionBody({
  props,
  controller,
  showFlagRow = true,
}: {
  props: QuizPlayerProps;
  controller: QuizPlayerController;
  showFlagRow?: boolean;
}) {
  const { courseId, visualCourseId = courseId, attemptId, transport } = props;
  const {
    t,
    answers,
    flags,
    sorted,
    index,
    submitting,
    isSubmitted,
    uploadingFile,
    uploadProgress,
    setAnswerText,
    selectOption,
    toggleFlag,
    handleFileChange,
    handleRemoveFile,
  } = controller;

  const q = sorted[index];
  if (!q) return null;

  const ans = answers[q.id];
  const essayAnswer = asEssayAnswer(ans);
  const answerText = typeof ans === "string" ? ans : essayAnswer?.text ?? "";
  const isMultiple = Boolean(
    isMultipleChoiceQuestion(q.type) ||
      q.question_type === "multiple_choices" ||
      q.questionType === "multiple_choices" ||
      Boolean(q.multiple)
  );
  const currentFlagged = !!flags[q.id];

  return (
    <div
      className={cn(
        "relative min-w-0",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
        currentFlagged && "border-brand-secondary/40 ring-1 ring-brand-secondary/35"
      )}
    >
      <div className="flex items-start gap-2.5 md:gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-body-xs font-bold text-primary-foreground shadow-xs md:size-8 md:text-body-sm">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 text-foreground">
          <InteractiveDocumentAttempt
            value={
              transport
                ? null
                : { courseId: visualCourseId, attemptId, questionId: q.id, field: "prompt" }
            }
          >
            <MarkdownRenderer content={q.prompt} />
          </InteractiveDocumentAttempt>
        </div>
      </div>

      {q.type === "short_answer" || q.type === "essay" ? (
        <div className="mt-5 space-y-3">
          <label className="block text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {q.type === "short_answer" ? t("quiz.shortAnswerLabel") : t("quiz.essayLabel")}
          </label>
          {q.type === "short_answer" ? (
            <ScientificInput
              disabled={submitting || isSubmitted}
              value={answerText}
              onChange={(value) => setAnswerText(q.id, value)}
              placeholder={t("quiz.shortAnswerPlaceholder")}
            />
          ) : (
            <div className="space-y-(--related-gap)">
              <textarea
                rows={6}
                disabled={submitting || isSubmitted}
                value={answerText}
                onChange={(event) => setAnswerText(q.id, event.target.value, true)}
                placeholder={t("quiz.essayPlaceholder")}
                className="w-full rounded-lg border border-border bg-background p-3 font-sans text-body-base transition-all hover:border-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/30 focus:outline-none"
              />

              {transport && (
                <p className="text-body-xs text-muted-foreground">
                  Lampiran tidak tersedia di demo.
                </p>
              )}
              <div className="space-y-2.5 pt-1">
                <span className="block text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("quiz.attachmentLabel")}
                </span>

                {!essayAnswer?.fileName && !uploadingFile[q.id] ? (
                  <div className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/10 p-(--group-gap) text-center transition-all hover:border-brand-primary/40 hover:bg-muted/20">
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      disabled={submitting || isSubmitted || Boolean(transport)}
                      onChange={(e) => handleFileChange(q.id, e)}
                      className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />
                    <UploadCloud className="mb-2 size-7 text-muted-foreground" />
                    <p className="text-body-xs font-bold text-foreground">
                      {t("quiz.dropFile")}
                    </p>
                    <p className="mt-0.5 text-body-xs text-muted-foreground">
                      {t("quiz.fileTypes")}
                    </p>
                  </div>
                ) : null}

                {uploadingFile[q.id] && (uploadProgress[q.id] ?? 0) < 100 ? (
                  <div className="animate-pulse space-y-2 rounded-xl border border-brand-secondary/35 bg-brand-secondary/5 p-3.5">
                    <div className="flex justify-between text-body-xs font-semibold text-brand-secondary">
                      <span className="max-w-[200px] truncate">
                        {t("quiz.uploading", { fileName: uploadingFile[q.id] })}
                      </span>
                      <span>{uploadProgress[q.id]}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-md bg-muted">
                      <div
                        className="h-full rounded-md bg-brand-secondary transition-all"
                        style={{ width: `${uploadProgress[q.id]}%` }}
                      />
                    </div>
                    <p className="text-body-xs text-muted-foreground">
                      {t("quiz.savingFile")}
                    </p>
                  </div>
                ) : null}

                {essayAnswer?.fileName && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-status-success/35 bg-status-success/5 p-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-status-success/15 text-status-success">
                        <FileText className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">
                          {essayAnswer.fileName}
                        </p>
                        <p className="text-body-2xs text-muted-foreground">
                          {essayAnswer.fileSize || t("quiz.pdfImage")} · Cloudflare R2
                        </p>
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
        <div className="mt-5 space-y-3">
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

          <ul
            role={isMultiple ? "group" : "radiogroup"}
            aria-label={
              isMultiple ? t("quiz.multipleAnswersAria") : t("quiz.singleAnswerAria")
            }
            className="space-y-2"
          >
            {q.options.map((opt, i) => {
              const selected = isMultiple
                ? Array.isArray(ans)
                  ? ans.some((value) => value === i)
                  : ans === i
                : ans === i ||
                  (Array.isArray(ans) && ans.length === 1 && ans[0] === i);

              return (
                <li key={i}>
                  <div
                    data-question-option
                    className={quizOptionClasses(
                      selected ? "selected" : "idle",
                      "min-h-11 items-start py-3 font-normal"
                    )}
                    onClick={(event) => {
                      if (submitting || isSubmitted) return;
                      if (
                        !event.currentTarget.contains(event.target as Node) ||
                        (event.target as Element).closest(
                          "button, input, select, textarea, a, figure, [data-learning-visual]"
                        )
                      ) {
                        return;
                      }
                      selectOption(q.id, i, isMultiple);
                    }}
                  >
                    <button
                      type="button"
                      role={isMultiple ? "checkbox" : "radio"}
                      aria-checked={selected}
                      aria-labelledby={`quiz-letter-${q.id}-${i} quiz-option-${q.id}-${i}`}
                      disabled={submitting || isSubmitted}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectOption(q.id, i, isMultiple);
                      }}
                      className="flex shrink-0 items-center gap-2.5 self-start rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed md:gap-3"
                    >
                      <span
                        aria-hidden="true"
                        className={quizOptionIndicatorClasses(
                          isMultiple ? "multiple" : "single",
                          selected ? "selected" : "idle"
                        )}
                      >
                        {isMultiple ? (
                          selected ? (
                            <Check className="size-3 stroke-[3] text-white md:size-3.5" />
                          ) : null
                        ) : selected ? (
                          <span className="size-1.5 rounded-sm bg-white md:size-2" />
                        ) : null}
                      </span>

                      <span
                        id={`quiz-letter-${q.id}-${i}`}
                        className={quizOptionLetterClasses(
                          selected ? "selected" : "idle",
                          "rounded-md"
                        )}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                    </button>
                    <div
                      id={`quiz-option-${q.id}-${i}`}
                      className="min-w-0 flex-1 wrap-break-word text-foreground"
                    >
                      <InteractiveDocumentAttempt
                        value={
                          transport
                            ? null
                            : {
                                courseId: visualCourseId,
                                attemptId,
                                questionId: q.id,
                                field: "option",
                                option: i,
                              }
                        }
                      >
                        <MarkdownRenderer content={opt} className="space-y-3" />
                      </InteractiveDocumentAttempt>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showFlagRow && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 border-t border-border/80 pt-3">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              disabled={submitting || isSubmitted}
              checked={currentFlagged}
              onChange={() => toggleFlag(q.id)}
              className="size-4 cursor-pointer rounded-sm border-border text-brand-secondary accent-brand-secondary focus:ring-brand-secondary"
            />
            <span
              className={cn(
                "flex items-center gap-1 text-body-xs font-semibold transition-colors",
                currentFlagged
                  ? "text-brand-secondary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Flag
                className={cn(
                  "size-3.5",
                  currentFlagged ? "fill-brand-secondary text-brand-secondary" : ""
                )}
              />
              {t("quiz.markForReview")}
            </span>
          </label>

          <span className="flex items-center gap-1 text-body-xs text-muted-foreground">
            <AlertCircle className="size-3 text-brand-primary" />
            {t("quiz.autoSaved")}
          </span>
        </div>
      )}

      <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
    </div>
  );
}

export function QuizSubmitConfirmDialog({
  controller,
}: {
  controller: QuizPlayerController;
}) {
  const {
    t,
    sorted,
    answeredCount,
    unansweredCount,
    flaggedCount,
    timeLeft,
    submitting,
    showConfirmModal,
    setShowConfirmModal,
    handleSubmit,
  } = controller;

  return (
    <Dialog
      open={showConfirmModal}
      onOpenChange={(open) => {
        if (!submitting) setShowConfirmModal(open);
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border border-border p-(--section-gap) text-left shadow-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold text-foreground">
            {t("quiz.confirmSubmitTitle")}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-body-xs text-muted-foreground">
            {t("quiz.confirmSubmitDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <dl className="grid grid-cols-3 divide-x divide-border border-y border-border text-center">
            <div className="min-w-0 px-2 py-2">
              <dt className="break-words text-body-xs text-muted-foreground">
                {t("quiz.totalQuestions")}
              </dt>
              <dd className="font-heading text-body-base font-bold tabular-nums">
                {sorted.length}
              </dd>
            </div>
            <div className="min-w-0 px-2 py-2">
              <dt className="break-words text-body-xs text-muted-foreground">
                {t("quiz.answered")}
              </dt>
              <dd className="font-heading text-body-base font-bold tabular-nums">
                {answeredCount}
              </dd>
            </div>
            <div className="min-w-0 px-2 py-2">
              <dt className="break-words text-body-xs text-muted-foreground">
                {t("quiz.empty")}
              </dt>
              <dd
                className={cn(
                  "font-heading text-body-base font-bold tabular-nums",
                  unansweredCount > 0 && "text-status-error"
                )}
              >
                {unansweredCount}
              </dd>
            </div>
          </dl>

          {flaggedCount > 0 && (
            <div className="flex items-center gap-2 text-body-xs font-semibold text-brand-secondary">
              <Flag className="size-4 shrink-0 fill-brand-secondary" />
              <span>{t("quiz.flaggedCount", { count: flaggedCount })}</span>
            </div>
          )}

          {unansweredCount > 0 && (
            <div className="flex items-start gap-2 border-l-2 border-status-warning pl-2 text-body-xs text-foreground">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{t("quiz.unansweredWarning", { count: unansweredCount })}</span>
            </div>
          )}

          {timeLeft !== null && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-body-xs text-muted-foreground">
              <span>{t("quiz.remainingTime")}</span>
              <span className="font-mono font-bold text-foreground">
                {formatQuizTime(timeLeft)}
              </span>
            </div>
          )}

          <p className="text-body-xs text-muted-foreground">
            {t("quiz.cannotEditAfterSubmit")}
          </p>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => setShowConfirmModal(false)}
            className="w-full rounded-lg border-border sm:w-auto"
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
            className="w-full rounded-lg bg-brand-primary font-bold text-primary-foreground hover:bg-brand-primary/90 sm:w-auto"
          >
            {t("quiz.confirmSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
