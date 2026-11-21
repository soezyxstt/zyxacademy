"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Flag, Timer, Clock, BookOpen, AlertCircle, ChevronLeft, ChevronRight, Loader2, UploadCloud, FileText, Trash2, Check, CheckSquare, CircleDot } from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { InteractiveDocumentAttempt } from "@/components/course/interactive-document-context";
import { quizOptionClasses, quizOptionLetterClasses, quizOptionIndicatorClasses } from "@/components/course/quiz-option-styles";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScientificInput } from "@/components/ui/scientific-input";
import { useQuizPlayer } from "@/hooks/use-quiz-player";
import { useQuizSubmission } from "@/hooks/use-quiz-submission";
import { asEssayAnswer, isMultipleChoiceQuestion, type QuizPlayerProps, type QuizSubmission } from "@/lib/quiz/player-state";

export type { QuizPlayerProps } from "@/lib/quiz/player-state";

/** The demo adapter never mounts an authenticated query or mutation. */
export function QuizPlayer(props: QuizPlayerProps) {
  if (props.transport) {
    const transport = props.transport;
    return <QuizPlayerContent key={props.attemptId} {...props} submit={({ answers, durationSeconds }) => transport.submit(answers, durationSeconds)} />;
  }
  return <StudentAccountBoundary>{({ data }) => data?.user && (!props.expectedUserId || data.user.id === props.expectedUserId)
    ? <LiveQuizPlayer key={`${data.user.id}:${props.attemptId}`} {...props} userId={data.user.id} />
    : <div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}
  </StudentAccountBoundary>;
}

function LiveQuizPlayer(props: QuizPlayerProps & { userId: string }) {
  const mutation = useQuizSubmission(props.userId, props.attemptId, props.courseId);
  return <QuizPlayerContent {...props} submit={mutation.mutateAsync} />;
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/** UI only. The controller owns answers, recovery, uploads, clocks and submission. */
function QuizPlayerContent(props: QuizPlayerProps & { submit: (payload: QuizSubmission) => Promise<unknown> }) {
  const { courseId, visualCourseId = courseId, attemptId, transport } = props;
  const [questionMapOpen, setQuestionMapOpen] = useState(false);
  const {
    t, answers, flags, sorted, index, setIndex, timeLeft, questionTimeLeft,
    submitting, isSubmitted, canGoBack, perQuestionTimerEnabled,
    showConfirmModal, setShowConfirmModal, uploadingFile, uploadProgress,
    answeredCount, unansweredCount, flaggedCount, progress, isQuestionAnswered,
    setAnswerText, selectOption, toggleFlag, handleFileChange, handleRemoveFile,
    handleRequestSubmit, handleSubmit, goNext, goPrev,
  } = useQuizPlayer(props, props.submit);
  const locked = submitting || isSubmitted;
  const q = sorted[index];

  if (!q) {
    return (
      <div className="py-4 text-center">
        <p className="text-body-sm text-muted-foreground">{t("quiz.noQuestions")}</p>
      </div>
    );
  }

  const ans = answers[q.id];
  const essayAnswer = asEssayAnswer(ans);
  const answerText = typeof ans === "string" ? ans : essayAnswer?.text ?? "";
  const isMultiple = Boolean(
    q && (
      isMultipleChoiceQuestion(q.type) ||
      q.question_type === "multiple_choices" ||
      q.questionType === "multiple_choices" ||
      Boolean(q.multiple)
    )
  );
  const currentFlagged = !!flags[q.id];

  const renderQuestionMap = (onSelect?: () => void) => (
    <div className="space-y-3">
      {/* Grid buttons list */}
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
              aria-label={isAllowed ? `${t("quiz.questionNumber", { number: idx + 1 })}, ${t(isFlagged ? "quiz.flagged" : isAnswered ? "quiz.answered" : "quiz.unanswered")}` : t("quiz.lockedQuestion", { number: idx + 1 })}
              disabled={locked || !isAllowed}
              onClick={() => {
                if (locked || !isAllowed) return;
                setIndex(idx);
                onSelect?.();
              }}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg border font-heading text-body-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                (locked || !isAllowed) && "opacity-40 cursor-not-allowed",
                !locked && isAllowed && "cursor-pointer",
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
    </div>
  );

  const mobileQuestionMap = (
    <Sheet open={questionMapOpen} onOpenChange={setQuestionMapOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button type="button" size="icon-lg" variant="outline" className="shrink-0 lg:hidden" aria-label={t("quiz.questionNavigation")} disabled={locked}>
                <BookOpen aria-hidden />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("quiz.questionNavigation")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SheetContent side="bottom" className="max-h-[75dvh] gap-0 rounded-t-xl" aria-describedby={undefined}>
        <SheetHeader className="pr-14">
          <SheetTitle>{t("quiz.questionNavigation")}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 overflow-y-auto px-4 pb-4">
          {!canGoBack && <p className="mb-3 text-body-xs text-muted-foreground">{t("quiz.nextQuestionOnly")}</p>}
          {renderQuestionMap(() => setQuestionMapOpen(false))}
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-(--related-gap) font-sans md:gap-(--section-gap) lg:grid-cols-12">
      
      {/* LEFT COLUMN: Main player and Question details (8 cols on lg) */}
      <div className="space-y-(--related-gap) md:space-y-(--group-gap) lg:col-span-8">
        
        {/* Progress Bar & Header */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-2 md:pb-3">
          <div className="min-w-0 flex-1 basis-40 space-y-1.5">
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

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {perQuestionTimerEnabled && (
              <div className="flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-primary/35 bg-brand-primary/10 px-2.5 py-1 font-mono text-body-sm font-bold text-brand-primary sm:px-3 sm:py-1.5" role="timer" aria-label={t("quiz.questionTimeLimit")} title={t("quiz.questionTimeLimit")}>
                <Timer aria-hidden className="size-3.5 sm:size-4" />
                <span>{formatTime(questionTimeLeft)}</span>
              </div>
            )}
            {timeLeft !== null && (
              <div className="flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-brand-secondary/35 bg-brand-secondary/10 px-2.5 py-1 font-mono text-body-sm font-bold text-brand-secondary sm:px-3 sm:py-1.5" role="timer" aria-label={t("quiz.totalTimeRemaining")} title={t("quiz.totalTimeRemaining")}>
                <Clock aria-hidden className="size-3.5 sm:size-4" />
                <span>{formatTime(timeLeft)}</span>
              </div>
            )}
            {mobileQuestionMap}
          </div>
        </div>

        {/* Question Area Box */}
        <div
          className={cn(
            "relative min-w-0",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
            currentFlagged && "ring-1 ring-brand-secondary/35 border-brand-secondary/40"
          )}
        >
          {/* Heading */}
          <div className="flex items-start gap-2.5 md:gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-body-xs font-bold text-primary-foreground shadow-xs md:size-8 md:text-body-sm">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 text-foreground">
              <InteractiveDocumentAttempt value={transport ? null : { courseId: visualCourseId, attemptId, questionId: q.id, field: "prompt" }}><MarkdownRenderer content={q.prompt} /></InteractiveDocumentAttempt>
            </div>
          </div>

          {/* Options Display / Short Answer / Essay Input */}
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

                  {/* Cloudflare R2 file uploader widget for Essay */}
                  {transport && <p className="text-body-xs text-muted-foreground">Lampiran tidak tersedia di demo.</p>}
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
                    {essayAnswer?.fileName && (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-status-success/35 bg-status-success/5 p-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-status-success/15 text-status-success">
                            <FileText className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">{essayAnswer.fileName}</p>
                            <p className="text-body-2xs text-muted-foreground">{essayAnswer.fileSize || t("quiz.pdfImage")} • Cloudflare R2</p>
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
                className="space-y-2"
              >
                {q.options.map((opt, i) => {
                  const selected = isMultiple
                    ? Array.isArray(ans)
                      ? ans.some((value) => value === i)
                      : ans === i
                    : ans === i || (Array.isArray(ans) && ans.length === 1 && ans[0] === i);

                  return (
                    <li key={i}>
                      <div
                        data-question-option
                        className={quizOptionClasses(selected ? "selected" : "idle", "min-h-11 items-start py-3 font-normal")}
                        onClick={(event) => {
                          if (submitting || isSubmitted) return;
                          // Visual controls and plot gestures must not select an answer.
                          if (!event.currentTarget.contains(event.target as Node) || (event.target as Element).closest("button, input, select, textarea, a, figure, [data-learning-visual]")) return;
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
                          id={`quiz-letter-${q.id}-${i}`}
                          className={quizOptionLetterClasses(
                            selected ? "selected" : "idle",
                            isMultiple ? "rounded-md" : "rounded-full",
                          )}
                        >
                          {String.fromCharCode(65 + i)}
                        </span>

                        </button>
                        <div id={`quiz-option-${q.id}-${i}`} className="min-w-0 flex-1 wrap-break-word text-foreground">
                          <InteractiveDocumentAttempt value={transport ? null : { courseId: visualCourseId, attemptId, questionId: q.id, field: "option", option: i }}><MarkdownRenderer content={opt} className="space-y-3" /></InteractiveDocumentAttempt>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Flagging Option Widget inside Card */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2.5 border-t border-border/80 pt-3">
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

        <TooltipProvider>
        <div className="flex items-center justify-between gap-2">
          {canGoBack ? (
            <Tooltip><TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={t("quiz.previous")}
              onClick={() => { if (!locked) goPrev(); }}
              disabled={locked || index === 0}
            >
              <ChevronLeft aria-hidden />
            </Button>
            </TooltipTrigger><TooltipContent>{t("quiz.previous")}</TooltipContent></Tooltip>
          ) : (
            <span className="text-body-xs font-medium text-muted-foreground italic">
              {t("quiz.linearMode")}
            </span>
          )}

          <div className="flex gap-2">
            {index < sorted.length - 1 ? (
              <Tooltip><TooltipTrigger asChild>
                <Button type="button" size="icon-lg" aria-label={t("quiz.next")} disabled={locked} onClick={() => { if (!locked) goNext(); }}>
                  <ChevronRight aria-hidden />
                </Button>
              </TooltipTrigger><TooltipContent>{t("quiz.next")}</TooltipContent></Tooltip>
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
        </TooltipProvider>

      </div>

      {/* RIGHT COLUMN: Sidebar Question Grid & Info (4 cols on lg) */}
      <div className="space-y-(--related-gap) lg:col-span-4 lg:space-y-(--group-gap) lg:border-l lg:border-border lg:pl-(--section-gap)">
        
        {/* Navigation Grid panel */}
        <div className="space-y-(--compact-gap) md:space-y-(--group-gap)">
          <div className="hidden lg:block">
            <h3 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
              <BookOpen className="size-4 text-brand-primary" />
              {t("quiz.questionNavigation")}
            </h3>
            {!canGoBack && <p className="mt-1 text-body-xs text-muted-foreground">{t("quiz.nextQuestionOnly")}</p>}
          </div>

          <div className="hidden lg:block">{renderQuestionMap()}</div>

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
        <DialogContent className="max-w-md rounded-2xl border border-border p-(--section-gap) shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {t("quiz.confirmSubmitTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-1.5">
              {t("quiz.confirmSubmitDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <dl className="grid grid-cols-3 divide-x divide-border border-y border-border text-center">
              <div className="min-w-0 px-2 py-2">
                <dt className="break-words text-body-xs text-muted-foreground">{t("quiz.totalQuestions")}</dt>
                <dd className="font-heading text-body-base font-bold tabular-nums">{sorted.length}</dd>
              </div>
              <div className="min-w-0 px-2 py-2">
                <dt className="break-words text-body-xs text-muted-foreground">{t("quiz.answered")}</dt>
                <dd className="font-heading text-body-base font-bold tabular-nums">{answeredCount}</dd>
              </div>
              <div className="min-w-0 px-2 py-2">
                <dt className="break-words text-body-xs text-muted-foreground">{t("quiz.empty")}</dt>
                <dd className={cn("font-heading text-body-base font-bold tabular-nums", unansweredCount > 0 && "text-status-error")}>{unansweredCount}</dd>
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
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{t("quiz.unansweredWarning", { count: unansweredCount })}</span>
              </div>
            )}

            {timeLeft !== null && (
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-body-xs text-muted-foreground">
                <span>{t("quiz.remainingTime")}</span>
                <span className="font-mono font-bold text-foreground">{formatTime(timeLeft)}</span>
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
