"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { AlertCircle, FileText, Flag, Trash2, UploadCloud } from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { InteractiveDocumentTryout } from "@/components/course/interactive-document-context";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import type {
  TryoutFormController,
  TryoutFormProps,
} from "@/features/student-assessment/model/use-tryout-draft";

export function formatTryoutTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h > 0 ? `${h}:` : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function TryoutQuestionMapGrid({
  controller,
  onSelect,
}: {
  controller: TryoutFormController;
  onSelect?: () => void;
}) {
  const { t, sorted, index, setIndex, flags, isQuestionAnswered } = controller;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2 lg:grid-cols-5">
        {sorted.map((question, idx) => {
          const active = index === idx;
          const isDone = isQuestionAnswered(question);
          const isFlagged = !!flags[question.id];

          return (
            <button
              key={question.id}
              type="button"
              aria-current={active ? "step" : undefined}
              aria-label={`${t("tryout.questionNavigation")} ${idx + 1}, ${t(
                isFlagged
                  ? "tryout.unsure"
                  : isDone
                    ? "tryout.answered"
                    : "tryout.unanswered"
              )}`}
              onClick={() => {
                setIndex(idx);
                onSelect?.();
              }}
              className={cn(
                "flex size-10 items-center justify-center rounded-xl border-2 font-heading text-body-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "border-brand-primary ring-2 ring-brand-primary/20"
                  : "border-transparent",
                isFlagged
                  ? "border-brand-secondary/60 bg-brand-secondary/15 text-brand-secondary hover:bg-brand-secondary/25"
                  : isDone
                    ? "border-tertiary-1/50 bg-tertiary-1/15 text-tertiary-1 hover:bg-tertiary-1/25"
                    : "border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted/80"
              )}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border pt-4 text-body-xs">
        <span className="block font-semibold text-foreground">{t("tryout.legend")}</span>
        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded border border-border/50 bg-muted/40" />
            <span>{t("tryout.unanswered")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded border border-tertiary-1/50 bg-tertiary-1/15" />
            <span>{t("tryout.answered")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded border border-brand-secondary/60 bg-brand-secondary/15" />
            <span>{t("tryout.unsure")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded border-2 border-brand-primary" />
            <span>{t("tryout.active")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TryoutQuestionBody({
  props,
  controller,
  showFlagRow = true,
}: {
  props: TryoutFormProps;
  controller: TryoutFormController;
  showFlagRow?: boolean;
}) {
  const { courseId, visualCourseId = courseId, exam, transport } = props;
  const {
    t,
    q,
    index,
    answers,
    flags,
    uploadingFile,
    uploadProgress,
    setAnswerFor,
    toggleFlag,
    handleFileChange,
    handleRemoveFile,
  } = controller;

  if (!q) return null;
  const ans = answers[q.id];
  if (!ans) return null;
  const currentFlagged = !!flags[q.id];

  return (
    <div
      className={cn(
        "relative min-w-0",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
        currentFlagged && "border-brand-secondary/40 ring-1 ring-brand-secondary/35"
      )}
    >
      <div className="flex items-start gap-3 md:gap-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-body-sm font-bold text-primary-foreground shadow-xs md:size-9">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 font-sans text-body-base text-foreground">
          <InteractiveDocumentTryout
            value={
              transport
                ? null
                : { courseId: visualCourseId, examId: exam.id, questionId: q.id, field: "prompt" }
            }
          >
            <MarkdownRenderer content={q.prompt} />
          </InteractiveDocumentTryout>
        </div>
      </div>

      {q.type === "multiple_choice" && ans.type === "multiple_choice" ? (
        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">{t("tryout.chooseOne")}</legend>
          <RadioGroup
            aria-label={t("tryout.chooseOne")}
            value={ans.index === null ? "" : String(ans.index)}
            onValueChange={(value) =>
              setAnswerFor(q.id, { type: "multiple_choice", index: Number(value) })
            }
          >
            {q.options.map((opt, i) => {
              const selected = ans.index === i;
              return (
                <div
                  key={i}
                  onClick={(event) => {
                    if (
                      !event.currentTarget.contains(event.target as Node) ||
                      (event.target as Element).closest(
                        "button, input, select, textarea, a, figure, [data-learning-visual]"
                      )
                    ) {
                      return;
                    }
                    setAnswerFor(q.id, { type: "multiple_choice", index: i });
                  }}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-all duration-200",
                    selected
                      ? "border-brand-primary bg-brand-primary/10 shadow-sm"
                      : "border-border/70 bg-muted/10 hover:border-brand-primary/45"
                  )}
                >
                  <RadioGroupItem
                    value={String(i)}
                    aria-labelledby={`tryout-letter-${q.id}-${i} tryout-option-${q.id}-${i}`}
                    className="mt-1 shrink-0"
                  />
                  <span
                    id={`tryout-letter-${q.id}-${i}`}
                    className="mr-1 text-body-sm font-semibold text-foreground"
                  >
                    {String.fromCharCode(65 + i)}.
                  </span>
                  <div
                    id={`tryout-option-${q.id}-${i}`}
                    className="min-w-0 flex-1 wrap-break-word text-foreground"
                  >
                    <InteractiveDocumentTryout
                      value={
                        transport
                          ? null
                          : {
                              courseId: visualCourseId,
                              examId: exam.id,
                              questionId: q.id,
                              field: "option",
                              option: i,
                            }
                      }
                    >
                      <MarkdownRenderer content={opt} density="compact" />
                    </InteractiveDocumentTryout>
                  </div>
                </div>
              );
            })}
          </RadioGroup>
        </fieldset>
      ) : null}

      {q.type === "multiple_choices" && ans.type === "multiple_choices" ? (
        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">{t("tryout.chooseAll")}</legend>
          {q.options.map((opt, i) => {
            const checked = ans.indices.includes(i);
            return (
              <div
                key={i}
                onClick={(event) => {
                  if (
                    !event.currentTarget.contains(event.target as Node) ||
                    (event.target as Element).closest(
                      "button, input, select, textarea, a, figure, [data-learning-visual]"
                    )
                  ) {
                    return;
                  }
                  const indices = checked
                    ? ans.indices.filter((value) => value !== i)
                    : [...ans.indices, i].sort((a, b) => a - b);
                  setAnswerFor(q.id, { type: "multiple_choices", indices });
                }}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-all duration-200",
                  checked
                    ? "border-tertiary-1 bg-tertiary-1/10 shadow-sm"
                    : "border-border/70 bg-muted/10 hover:border-tertiary-1/45"
                )}
              >
                <Checkbox
                  checked={checked}
                  aria-labelledby={`tryout-letter-${q.id}-${i} tryout-option-${q.id}-${i}`}
                  onCheckedChange={() => {
                    const next = checked
                      ? ans.indices.filter((x) => x !== i)
                      : [...ans.indices, i].sort((a, b) => a - b);
                    setAnswerFor(q.id, { type: "multiple_choices", indices: next });
                  }}
                  className="mt-1 shrink-0"
                />
                <span
                  id={`tryout-letter-${q.id}-${i}`}
                  className="mr-1 text-body-sm font-semibold text-foreground"
                >
                  {String.fromCharCode(65 + i)}.
                </span>
                <div
                  id={`tryout-option-${q.id}-${i}`}
                  className="min-w-0 flex-1 wrap-break-word text-foreground"
                >
                  <InteractiveDocumentTryout
                    value={
                      transport
                        ? null
                        : {
                            courseId: visualCourseId,
                            examId: exam.id,
                            questionId: q.id,
                            field: "option",
                            option: i,
                          }
                    }
                  >
                    <MarkdownRenderer content={opt} density="compact" />
                  </InteractiveDocumentTryout>
                </div>
              </div>
            );
          })}
        </fieldset>
      ) : null}

      {q.type === "short_answer" && ans.type === "short_answer" ? (
        <div className="mt-4">
          <label className="block">
            <span className="mb-2 block text-body-xs font-semibold uppercase text-muted-foreground">
              {t("tryout.shortAnswer")}
            </span>
            <ScientificInput
              value={ans.text}
              onChange={(val) => setAnswerFor(q.id, { ...ans, text: val })}
              placeholder={t("tryout.shortAnswerPlaceholder")}
            />
          </label>
        </div>
      ) : null}

      {q.type === "essay" && ans.type === "essay" ? (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-2 block text-body-xs font-semibold uppercase text-muted-foreground">
              {t("tryout.essayAnswer")}
            </span>
            <Textarea
              value={ans.text}
              onChange={(e) => setAnswerFor(q.id, { ...ans, text: e.target.value })}
              rows={8}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body-sm leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder={t("tryout.essayPlaceholder")}
            />
          </label>

          {q.acceptsFile && (
            <div className="space-y-3">
              <span className="block text-body-xs font-semibold uppercase text-muted-foreground">
                {t("tryout.uploadAttachment")}
              </span>

              {transport && (
                <p className="text-body-xs text-muted-foreground">
                  Lampiran tidak tersedia di demo.
                </p>
              )}
              {!ans.fileName && !uploadingFile[q.id] ? (
                <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/10 p-6 text-center transition-all hover:border-brand-primary/40 hover:bg-muted/20">
                  <input
                    type="file"
                    disabled={Boolean(transport)}
                    accept=".pdf,image/*"
                    onChange={(e) => handleFileChange(q.id, e)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <UploadCloud className="mb-2 size-8 text-muted-foreground" />
                  <p className="text-body-xs font-bold text-foreground">
                    {t("tryout.dropFile")}
                  </p>
                  <p className="mt-1 text-body-xs text-muted-foreground">
                    {t("tryout.fileTypes")}
                  </p>
                </div>
              ) : null}

              {uploadingFile[q.id] && uploadProgress[q.id] < 100 ? (
                <div className="animate-pulse space-y-2 rounded-2xl border border-brand-secondary/35 bg-brand-secondary/5 p-4">
                  <div className="flex justify-between text-body-xs font-semibold text-brand-secondary">
                    <span className="max-w-[200px] truncate">
                      {t("tryout.uploading", { fileName: uploadingFile[q.id] })}
                    </span>
                    <span>{uploadProgress[q.id]}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-brand-secondary transition-all"
                      style={{ width: `${uploadProgress[q.id]}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {ans.fileName && (
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-status-success/35 bg-status-success/5 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-success/15 text-status-success">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">
                        {ans.fileName}
                      </p>
                      <p className="text-body-2xs text-muted-foreground">
                        {ans.fileSize || t("tryout.fileSizeUnavailable")}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFile(q.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={t("tryout.removeAttachment")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {showFlagRow && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <Checkbox checked={currentFlagged} onCheckedChange={() => toggleFlag(q.id)} />
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
              {t("tryout.markUnsure")}
            </span>
          </label>
        </div>
      )}

      <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
    </div>
  );
}

export function TryoutSubmitConfirmDialog({
  controller,
}: {
  controller: TryoutFormController;
}) {
  const {
    t,
    sorted,
    answeredCount,
    unansweredCount,
    flaggedCount,
    timeLeft,
    isSubmitting,
    showConfirmModal,
    setShowConfirmModal,
    handleSubmit,
  } = controller;

  return (
    <Dialog
      open={showConfirmModal}
      onOpenChange={(open) => {
        if (!isSubmitting) setShowConfirmModal(open);
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border border-border p-6 text-left shadow-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold text-foreground">
            {t("tryout.confirmTitle")}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-body-xs text-muted-foreground">
            {t("tryout.confirmDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 space-y-3">
          <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border text-center">
            <div className="p-2.5">
              <span className="block text-body-xs font-semibold uppercase text-muted-foreground">
                {t("tryout.totalQuestions")}
              </span>
              <span className="font-heading text-body-base font-bold text-foreground">
                {sorted.length}
              </span>
            </div>
            <div className="bg-tertiary-1/10 p-2.5">
              <span className="block text-body-xs font-semibold uppercase text-tertiary-1">
                {t("tryout.answered")}
              </span>
              <span className="font-heading text-body-base font-bold text-tertiary-1">
                {answeredCount}
              </span>
            </div>
            <div
              className={cn(
                "p-2.5",
                unansweredCount > 0
                  ? "bg-status-error/10 text-status-error"
                  : "text-muted-foreground"
              )}
            >
              <span className="block text-body-xs font-semibold uppercase">
                {t("tryout.empty")}
              </span>
              <span className="font-heading text-body-base font-bold">
                {unansweredCount}
              </span>
            </div>
          </div>

          {flaggedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-brand-secondary/35 bg-brand-secondary/10 px-3.5 py-2.5 text-body-xs font-semibold text-brand-secondary">
              <Flag className="size-4 shrink-0 fill-brand-secondary" />
              <span>{t("tryout.flaggedWarning", { count: flaggedCount })}</span>
            </div>
          )}

          {unansweredCount > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-status-warning/35 bg-status-warning/10 p-3 text-body-xs text-status-warning">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{t("tryout.unansweredWarning", { count: unansweredCount })}</span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-body-xs text-muted-foreground">
            <span>{t("tryout.timeRemaining")}</span>
            <span className="font-mono font-bold text-foreground">
              {formatTryoutTime(timeLeft)}
            </span>
          </div>
        </div>

        <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => setShowConfirmModal(false)}
            className="w-full rounded-lg border-border sm:w-auto"
          >
            {t("tryout.reviewAgain")}
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            isLoading={isSubmitting}
            onClick={() => {
              void handleSubmit();
            }}
            className="w-full rounded-lg bg-brand-primary font-bold text-primary-foreground hover:bg-brand-primary/90 sm:w-auto"
          >
            {t("tryout.confirmSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
