"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { AssessmentSubmitDialog } from "./assessment-submit-dialog";
import { ScientificInput } from "@/components/ui/scientific-input";
import { cn } from "@/lib/utils";
import { FileText, Flag, Trash2, UploadCloud } from "lucide-react";
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
                "flex size-10 items-center justify-center rounded-lg border font-heading text-body-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-background",
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
            <span className="size-3 shrink-0 rounded border-2 border-foreground/70" />
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
    answers,
    flags,
    uploadingFile,
    uploadProgress,
    isSubmitting,
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
    <div className="min-w-0 space-y-(--compact-gap)">
      <div className="min-w-0 text-foreground">
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

      {q.type === "multiple_choice" && ans.type === "multiple_choice" ? (
        <fieldset className="min-w-0">
          <legend className="pb-1.5 text-body-xs text-muted-foreground">{t("tryout.chooseOne")}</legend>
          <RadioGroup
            className="block divide-y divide-border/55 border-y border-border/55"
            aria-label={t("tryout.chooseOne")}
            disabled={isSubmitting}
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
                    if (isSubmitting) return;
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
                    "flex min-h-11 cursor-pointer items-start gap-2.5 py-2 pr-2 pl-1 transition-colors sm:px-2",
                    selected ? "bg-muted/65" : "hover:bg-muted/35"
                  )}
                >
                  <RadioGroupItem
                    value={String(i)}
                    aria-labelledby={`tryout-letter-${q.id}-${i} tryout-option-${q.id}-${i}`}
                    className="mt-1 shrink-0"
                  />
                  <span
                    id={`tryout-letter-${q.id}-${i}`}
                    className="mt-1 w-4 shrink-0 text-center text-body-xs font-semibold text-muted-foreground"
                  >
                    {String.fromCharCode(65 + i)}
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
        <fieldset className="min-w-0">
          <legend className="pb-1.5 text-body-xs text-muted-foreground">{t("tryout.chooseAll")}</legend>
          <div className="divide-y divide-border/55 border-y border-border/55">
            {q.options.map((opt, i) => {
              const checked = ans.indices.includes(i);
              return (
                <div
                  key={i}
                  onClick={(event) => {
                    if (isSubmitting) return;
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
                    "flex min-h-11 cursor-pointer items-start gap-2.5 py-2 pr-2 pl-1 transition-colors sm:px-2",
                    checked ? "bg-muted/65" : "hover:bg-muted/35"
                  )}
                >
                  <Checkbox
                    disabled={isSubmitting}
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
                    className="mt-1 w-4 shrink-0 text-center text-body-xs font-semibold text-muted-foreground"
                  >
                    {String.fromCharCode(65 + i)}
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
          </div>
        </fieldset>
      ) : null}

      {q.type === "short_answer" && ans.type === "short_answer" ? (
        <div>
          <label className="block">
            <span className="mb-2 block text-body-sm font-medium">
              {t("tryout.shortAnswer")}
            </span>
            <ScientificInput
              disabled={isSubmitting}
              value={ans.text}
              onChange={(val) => setAnswerFor(q.id, { ...ans, text: val })}
              placeholder={t("tryout.shortAnswerPlaceholder")}
            />
          </label>
        </div>
      ) : null}

      {q.type === "essay" && ans.type === "essay" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-2 block text-body-sm font-medium">
              {t("tryout.essayAnswer")}
            </span>
            <Textarea
              disabled={isSubmitting}
              value={ans.text}
              onChange={(e) => setAnswerFor(q.id, { ...ans, text: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-body-base text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder={t("tryout.essayPlaceholder")}
            />
          </label>

          {q.acceptsFile && !transport && (
            <div className="space-y-2">
              {!ans.fileName && !uploadingFile[q.id] ? (
                <label className="relative flex items-center gap-2.5 rounded-md border border-dashed border-border px-3 py-2 hover:bg-muted/40 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
                  <input
                    type="file"
                    disabled={isSubmitting}
                    accept=".pdf,image/*"
                    onChange={(e) => handleFileChange(q.id, e)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <UploadCloud className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-body-sm font-medium">{t("tryout.uploadAttachment")}</span>
                    <span className="block text-body-xs text-muted-foreground">{t("tryout.fileTypes")}</span>
                  </span>
                </label>
              ) : null}

              {uploadingFile[q.id] && uploadProgress[q.id] < 100 ? (
                <div className="space-y-1.5 border-t border-border/60 pt-2">
                  <div className="flex items-center justify-between gap-2 text-body-xs text-muted-foreground">
                    <span className="min-w-0 truncate">
                      {t("tryout.uploading", { fileName: uploadingFile[q.id] })}
                    </span>
                    <span>{uploadProgress[q.id]}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-foreground/75 transition-[width]"
                      style={{ width: `${uploadProgress[q.id]}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {ans.fileName && (
                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
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
                    disabled={isSubmitting}
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
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <Checkbox disabled={isSubmitting} checked={currentFlagged} onCheckedChange={() => toggleFlag(q.id)} />
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
    <AssessmentSubmitDialog
      open={showConfirmModal}
      onOpenChange={setShowConfirmModal}
      submitting={isSubmitting}
      onSubmit={() => { void handleSubmit(); }}
      title={t("tryout.confirmTitle")}
      description={t("tryout.confirmDescription")}
      answeredLabel={t("tryout.answered")}
      answeredCount={answeredCount}
      totalQuestions={sorted.length}
      unansweredWarning={unansweredCount > 0 ? t("tryout.unansweredWarning", { count: unansweredCount }) : undefined}
      flaggedWarning={flaggedCount > 0 ? t("tryout.flaggedWarning", { count: flaggedCount }) : undefined}
      remainingTime={{ label: t("tryout.timeRemaining"), value: formatTryoutTime(timeLeft) }}
      reviewLabel={t("tryout.reviewAgain")}
      submitLabel={t("tryout.confirmSubmit")}
    />
  );
}
