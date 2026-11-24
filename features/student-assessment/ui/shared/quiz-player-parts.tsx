"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { AssessmentSubmitDialog } from "./assessment-submit-dialog";
import { ScientificInput } from "@/components/ui/scientific-input";
import { cn } from "@/lib/utils";
import {
  Check,
  FileText,
  Flag,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { InteractiveDocumentAttempt } from "@/components/course/interactive-document-context";
import { quizOptionIndicatorClasses } from "@/components/course/quiz-option-styles";
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
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
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
            <span className="size-3 shrink-0 rounded border-2 border-foreground" />
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
  const writtenAnswerId = useId();
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
  const locked = submitting || isSubmitted;

  return (
    <div className="min-w-0 space-y-(--compact-gap)">
      <div className="space-y-1.5">
        {showFlagRow && (
          <p className="text-body-xs font-semibold text-muted-foreground">
            {t("quiz.questionNumber", { number: index + 1 })}
          </p>
        )}
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

      {q.type === "short_answer" || q.type === "essay" ? (
        <div className="space-y-2">
          <label htmlFor={writtenAnswerId} className="block text-body-sm font-medium">
            {q.type === "short_answer" ? t("quiz.shortAnswerLabel") : t("quiz.essayLabel")}
          </label>
          {q.type === "short_answer" ? (
            <ScientificInput
              id={writtenAnswerId}
              disabled={locked}
              value={answerText}
              onChange={(value) => setAnswerText(q.id, value)}
              placeholder={t("quiz.shortAnswerPlaceholder")}
            />
          ) : (
            <div className="space-y-3">
              <textarea
                id={writtenAnswerId}
                rows={4}
                disabled={locked}
                value={answerText}
                onChange={(event) => setAnswerText(q.id, event.target.value, true)}
                placeholder={t("quiz.essayPlaceholder")}
                className="block w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-sans text-body-base"
              />

              {!transport && (
                <div>
                  {!essayAnswer?.fileName && !uploadingFile[q.id] ? (
                    <label className="relative flex items-center gap-2.5 rounded-md border border-dashed border-border px-3 py-2 has-[:enabled]:hover:bg-muted/40 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        disabled={locked}
                        onChange={(e) => handleFileChange(q.id, e)}
                        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      />
                      <UploadCloud className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-body-sm font-medium">{t("quiz.attachmentLabel")}</span>
                        <span className="block text-body-xs text-muted-foreground">{t("quiz.fileTypes")}</span>
                      </span>
                    </label>
                  ) : null}

                  {uploadingFile[q.id] ? (
                    <div className="space-y-1.5 border-t border-border/60 pt-2" role="status">
                      <div className="flex items-center justify-between gap-2 text-body-xs font-medium text-muted-foreground">
                        <span className="min-w-0 truncate">
                          {t("quiz.uploading", { fileName: uploadingFile[q.id] })}
                        </span>
                        <span className="shrink-0 tabular-nums">{uploadProgress[q.id] ?? 0}%</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-md bg-muted">
                        <div
                          className="h-full rounded-md bg-foreground/75 transition-[width]"
                          style={{ width: `${uploadProgress[q.id] ?? 0}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {essayAnswer?.fileName && (
                    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate text-body-sm font-medium">
                            {essayAnswer.fileName}
                          </p>
                          <p className="m-0 text-body-xs text-muted-foreground">
                            {essayAnswer.fileSize || t("quiz.pdfImage")}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={locked}
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
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 text-body-xs text-muted-foreground">
            <span>{isMultiple ? t("quiz.chooseAllCorrect") : t("quiz.chooseOne")}</span>
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
            className="divide-y divide-border/55 border-y border-border/55"
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
                    className={cn(
                      "group flex min-h-11 items-start gap-2.5 py-2 pr-2 pl-1 transition-colors sm:px-2",
                      selected ? "bg-muted/65" : !locked && "hover:bg-muted/35",
                      !locked && "cursor-pointer"
                    )}
                    onClick={(event) => {
                      if (locked) return;
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
                      disabled={locked}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectOption(q.id, i, isMultiple);
                      }}
                      className="flex min-h-6 shrink-0 items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
                    >
                      <span
                        aria-hidden="true"
                        className={quizOptionIndicatorClasses(
                          isMultiple ? "multiple" : "single",
                          selected ? "selected" : "idle",
                          cn("md:size-4", isMultiple && "rounded-sm")
                        )}
                      >
                        {isMultiple ? (
                          selected ? (
                            <Check className="size-3 stroke-[3] text-primary-foreground" />
                          ) : null
                        ) : selected ? (
                          <span className="size-1.5 rounded-full bg-primary-foreground" />
                        ) : null}
                      </span>

                      <span
                        id={`quiz-letter-${q.id}-${i}`}
                        className={cn("w-4 text-center text-body-xs font-semibold", selected ? "text-foreground" : "text-muted-foreground")}
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
                        <MarkdownRenderer content={opt} density="compact" />
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
        <div className="flex flex-wrap items-center justify-between gap-2">
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
    <AssessmentSubmitDialog
      open={showConfirmModal}
      onOpenChange={setShowConfirmModal}
      submitting={submitting}
      onSubmit={() => { void handleSubmit(false); }}
      title={t("quiz.confirmSubmitTitle")}
      description={t("quiz.cannotEditAfterSubmit")}
      answeredLabel={t("quiz.answered")}
      answeredCount={answeredCount}
      totalQuestions={sorted.length}
      unansweredWarning={unansweredCount > 0 ? t("quiz.unansweredWarning", { count: unansweredCount }) : undefined}
      flaggedWarning={flaggedCount > 0 ? t("quiz.flaggedCount", { count: flaggedCount }) : undefined}
      remainingTime={timeLeft === null ? undefined : { label: t("quiz.remainingTime"), value: formatQuizTime(timeLeft) }}
      reviewLabel={t("quiz.reviewAgain")}
      submitLabel={t("quiz.confirmSubmit")}
    />
  );
}
