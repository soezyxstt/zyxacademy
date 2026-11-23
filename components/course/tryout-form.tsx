"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Flag, Timer, BookOpen, AlertCircle, FileText, Trash2, ArrowLeft, ArrowRight, UploadCloud } from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { InteractiveDocumentTryout } from "@/components/course/interactive-document-context";
import type { ExamFixture, QuestionSpec } from "@/lib/student-course-fixtures";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
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
import { closeDialogsThen } from "@/hooks/use-dialog-history";

import { submitTryoutAction } from "@/app/actions/tutor-management";

export type AnswerState =
  | { type: "short_answer"; text: string; fileName: string | null }
  | { type: "multiple_choice"; index: number | null }
  | { type: "multiple_choices"; indices: number[] }
  | { type: "essay"; text: string; fileName: string | null; fileSize?: string; fileKey?: string | null };

type PublicQuestion<T = QuestionSpec> = T extends QuestionSpec ? Omit<T, "correctIndex" | "correctIndices" | "acceptableAnswers"> : never;
export type TryoutPresentationExam = Omit<ExamFixture, "questions"> & { questions: PublicQuestion[] };

function emptyAnswer(q: PublicQuestion): AnswerState {
  if (q.type === "short_answer") return { type: "short_answer", text: "", fileName: null };
  if (q.type === "multiple_choice") return { type: "multiple_choice", index: null };
  if (q.type === "multiple_choices") return { type: "multiple_choices", indices: [] };
  return { type: "essay", text: "", fileName: null, fileSize: "" };
}

function isAnswered(ans: AnswerState | undefined) {
  if (!ans) return false;
  if (ans.type === "multiple_choice") return ans.index !== null;
  if (ans.type === "multiple_choices") return ans.indices.length > 0;
  if (ans.type === "short_answer" || ans.type === "essay") {
    const textDone = ans.text.trim() !== "";
    const fileDone = ans.fileName !== null;
    return textDone || fileDone;
  }
  return false;
}

type TryoutFormProps = {
  courseId: string;
  visualCourseId?: string;
  exam: TryoutPresentationExam;
  transport?: { submit: (answers: Record<string, AnswerState>) => Promise<void>; afterSubmitHref?: string };
};

function Countdown({ deadline, duration }: { deadline: number | null; duration: number }) {
  const [seconds, setSeconds] = useState(duration);
  useEffect(() => {
    if (deadline === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      const remaining = Math.max(0, deadline - Date.now());
      setSeconds(Math.ceil(remaining / 1000));
      if (remaining && !document.hidden) timer = setTimeout(tick, remaining % 1000 || 1000);
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deadline]);
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h}:` : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return formatTime(seconds);
}

export function TryoutForm({ courseId, visualCourseId = courseId, exam, transport }: TryoutFormProps) {
  const t = useTranslations("studentCourse");
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const init: Record<string, AnswerState> = {};
    for (const q of exam.questions) init[q.id] = emptyAnswer(q);
    return init;
  });

  // Flag and Time tracking
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const duration = (exam.settings?.timeLimitMinutes ?? 90) * 60;
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => { setDeadline(Date.now() + duration * 1000); }, [duration]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submissionInFlight = useRef(false);
  const expirationHandled = useRef(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [questionMapOpen, setQuestionMapOpen] = useState(false);

  // Real Cloudflare R2 upload for essay attachments
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFile, setUploadingFile] = useState<Record<string, string>>({});

  const handleSubmit = useCallback(async () => {
    if (submissionInFlight.current || submitted) return;
    submissionInFlight.current = true;
    setIsSubmitting(true);
    try {
      if (transport) {
        await transport.submit(answers);
      } else {
        const result = await submitTryoutAction(courseId, exam.id, answers);
        if (!result.success) {
          toast.error(t("tryout.submitFailed"));
          return;
        }
      }
      setSubmitted(true);
      const href = transport ? transport.afterSubmitHref : `/courses/${courseId}/my-results`;
      if (href) {
        toast.success(t("tryout.submitted"));
        closeDialogsThen(() => {
          setShowConfirmModal(false);
          setQuestionMapOpen(false);
        }, () => router.push(href));
      }
    } catch (err) {
      console.error("Error submitting tryout:", err);
      toast.error(t("tryout.submitFailed"));
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }, [courseId, exam.id, answers, router, submitted, t, transport]);

  const submitExpired = useEffectEvent(() => {
    if (expirationHandled.current || submitted) return;
    expirationHandled.current = true;
    toast.warning(t("tryout.timeExpired"));
    void handleSubmit();
  });
  useEffect(() => {
    if (deadline === null || submitted) return;
    const expire = () => {
      if (Date.now() >= deadline) submitExpired();
    };
    const timer = setTimeout(expire, Math.max(0, deadline - Date.now()));
    document.addEventListener("visibilitychange", expire);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", expire);
    };
  }, [deadline, submitted]);

  const sorted = useMemo(
    () => [...exam.questions].sort((a, b) => a.order - b.order),
    [exam.questions],
  );

  const q = sorted[index];
  const answeredCount = useMemo(() => sorted.filter(question => isAnswered(answers[question.id])).length, [sorted, answers]);
  const unansweredCount = sorted.length - answeredCount;
  const flaggedCount = useMemo(() => sorted.filter(question => flags[question.id]).length, [sorted, flags]);
  const progress = ((index + 1) / sorted.length) * 100;

  function setAnswerFor(id: string, next: AnswerState) {
    setAnswers((prev) => ({ ...prev, [id]: next }));
  }

  function toggleFlag(id: string) {
    setFlags((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Upload the essay attachment to R2 via /api/exams/attachments and track progress.
  function uploadEssayAttachment(questionId: string, file: File) {
    if (transport) {
      toast.error(t("tryout.uploadFailed"));
      return;
    }
    setUploadingFile((prev) => ({ ...prev, [questionId]: file.name }));
    setUploadProgress((prev) => ({ ...prev, [questionId]: 0 }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("examId", exam.id);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/exams/attachments");
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
          setAnswerFor(questionId, {
            ...answers[questionId],
            fileName: data.fileName as string,
            fileSize: data.fileSize as string,
            fileKey: data.key as string,
          } as AnswerState);
          toast.success(t("tryout.fileUploaded", { fileName: file.name }));
        } else {
          toast.error(t("tryout.uploadFailed"));
        }
      } catch {
        toast.error(t("tryout.uploadFailed"));
      }
      setUploadingFile((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
    });
    xhr.addEventListener("error", () => {
      toast.error(t("tryout.uploadFailed"));
      setUploadingFile((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
    });
    xhr.send(formData);
  }

  function handleFileChange(questionId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      uploadEssayAttachment(questionId, f);
      e.target.value = "";
    }
  }

  function handleRemoveFile(questionId: string) {
    setAnswerFor(questionId, {
      ...answers[questionId],
      fileName: null,
      fileSize: undefined,
      fileKey: null,
    } as AnswerState);
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
    toast.info(t("tryout.attachmentRemoved"));
  }

  function goPrev() {
    if (index > 0) setIndex((i) => i - 1);
  }

  function goNext() {
    if (index < sorted.length - 1) setIndex((i) => i + 1);
  }


  const ans = answers[q.id];
  const currentFlagged = !!flags[q.id];

  if (submitted) return null;

  const renderQuestionMap = (onSelect?: () => void) => (
    <div className="space-y-3">
      {/* Grid buttons */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2 lg:grid-cols-5">
        {sorted.map((question, idx) => {
          const active = index === idx;
          const isDone = isAnswered(answers[question.id]);
          const isFlagged = !!flags[question.id];

          return (
            <button
              key={question.id}
              type="button"
              aria-current={active ? "step" : undefined}
              aria-label={`${t("tryout.questionNavigation")} ${idx + 1}, ${t(isFlagged ? "tryout.unsure" : isDone ? "tryout.answered" : "tryout.unanswered")}`}
              onClick={() => {
                setIndex(idx);
                onSelect?.();
              }}
              className={cn(
                "flex size-10 items-center justify-center rounded-xl font-heading font-bold text-body-sm transition-colors border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "border-brand-primary ring-2 ring-brand-primary/20"
                  : "border-transparent",
                isFlagged
                  ? "bg-brand-secondary/15 text-brand-secondary border-brand-secondary/60 hover:bg-brand-secondary/25"
                  : isDone
                  ? "bg-tertiary-1/15 text-tertiary-1 border-tertiary-1/50 hover:bg-tertiary-1/25"
                  : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/80"
              )}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* Indicators Legend */}
      <div className="border-t border-border pt-4 space-y-2 text-body-xs">
        <span className="font-semibold text-foreground block">{t("tryout.legend")}</span>
        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-muted/40 border border-border/50 shrink-0" />
            <span>{t("tryout.unanswered")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-tertiary-1/15 border border-tertiary-1/50 shrink-0" />
            <span>{t("tryout.answered")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-brand-secondary/15 border border-brand-secondary/60 shrink-0" />
            <span>{t("tryout.unsure")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded border-2 border-brand-primary shrink-0" />
            <span>{t("tryout.active")}</span>
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
              <Button type="button" size="icon-lg" variant="outline" className="shrink-0 lg:hidden" aria-label={t("tryout.questionNavigation")}>
                <BookOpen aria-hidden />
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("tryout.questionNavigation")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SheetContent side="bottom" className="max-h-[75dvh] gap-0 rounded-t-xl" aria-describedby={undefined}>
        <SheetHeader className="pr-14">
          <SheetTitle>{t("tryout.questionNavigation")}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 overflow-y-auto px-4 pb-4">
          {renderQuestionMap(() => setQuestionMapOpen(false))}
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start font-sans">
      
      {/* LEFT COLUMN: Ujian Workspace (8 cols) */}
      <div className="lg:col-span-8 space-y-4">
        
        {/* Progress Tracker Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1 basis-36 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-body-xs font-semibold text-muted-foreground">
              <span>{t("tryout.examSimulation")}</span>
              <span>{t("tryout.questionProgress", { current: index + 1, total: sorted.length })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 bg-brand-secondary/10 border border-brand-secondary/35 text-brand-secondary px-3.5 py-1.5 rounded-xl font-mono text-body-sm font-bold">
            <Timer aria-hidden className="size-4" />
            <span className="sr-only">{t("tryout.timeRemaining")} </span>
            <span><Countdown deadline={deadline} duration={duration} /></span>
          </div>
          {mobileQuestionMap}
        </div>

        {/* Card for Active Question */}
        <div
          className={cn(
            "relative min-w-0",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
            currentFlagged && "ring-1 ring-brand-secondary/35 border-brand-secondary/40"
          )}
        >
          {/* Question Prompt */}
          <div className="flex items-start gap-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-body-sm font-bold text-primary-foreground shadow-xs">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 font-sans text-body-base text-foreground">
              <InteractiveDocumentTryout value={transport ? null : { courseId: visualCourseId, examId: exam.id, questionId: q.id, field: "prompt" }}><MarkdownRenderer content={q.prompt} /></InteractiveDocumentTryout>
            </div>
          </div>

          {/* RENDER A: Pilihan Ganda (Single Choice) */}
          {q.type === "multiple_choice" && ans.type === "multiple_choice" ? (
            <fieldset className="mt-5 space-y-2">
              <legend className="sr-only">{t("tryout.chooseOne")}</legend>
              <RadioGroup aria-label={t("tryout.chooseOne")} value={ans.index === null ? "" : String(ans.index)} onValueChange={(value) => setAnswerFor(q.id, { type: "multiple_choice", index: Number(value) })}>
              {q.options.map((opt, i) => {
                const selected = ans.index === i;
                return (
                  <div
                    key={i}
                    onClick={(event) => {
                      if (!event.currentTarget.contains(event.target as Node) || (event.target as Element).closest("button, input, select, textarea, a, figure, [data-learning-visual]")) return;
                      setAnswerFor(q.id, { type: "multiple_choice", index: i });
                    }}
                    className={cn(
                      "flex cursor-pointer min-h-11 items-start gap-3 rounded-lg border px-3 py-3 transition-all duration-200",
                      selected
                        ? "border-brand-primary bg-brand-primary/10 shadow-sm"
                        : "border-border/70 bg-muted/10 hover:border-brand-primary/45"
                    )}
                  >
                    <RadioGroupItem value={String(i)} aria-labelledby={`tryout-letter-${q.id}-${i} tryout-option-${q.id}-${i}`} className="mt-1 shrink-0" />
                    <span id={`tryout-letter-${q.id}-${i}`} className="text-body-sm font-semibold text-foreground mr-1">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <div id={`tryout-option-${q.id}-${i}`} className="min-w-0 flex-1 wrap-break-word text-foreground"><InteractiveDocumentTryout value={transport ? null : { courseId: visualCourseId, examId: exam.id, questionId: q.id, field: "option", option: i }}><MarkdownRenderer content={opt} density="compact" /></InteractiveDocumentTryout></div>
                  </div>
                );
              })}
              </RadioGroup>
            </fieldset>
          ) : null}

          {/* RENDER B: Pilihan Ganda Kompleks (Multi Select) */}
          {q.type === "multiple_choices" && ans.type === "multiple_choices" ? (
            <fieldset className="mt-5 space-y-2">
              <legend className="sr-only">{t("tryout.chooseAll")}</legend>
              {q.options.map((opt, i) => {
                const checked = ans.indices.includes(i);
                return (
                  <div
                    key={i}
                    onClick={(event) => {
                      if (!event.currentTarget.contains(event.target as Node) || (event.target as Element).closest("button, input, select, textarea, a, figure, [data-learning-visual]")) return;
                      const indices = checked ? ans.indices.filter((index) => index !== i) : [...ans.indices, i].sort((a, b) => a - b);
                      setAnswerFor(q.id, { type: "multiple_choices", indices });
                    }}
                    className={cn(
                      "flex cursor-pointer min-h-11 items-start gap-3 rounded-lg border px-3 py-3 transition-all duration-200",
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
                    <span id={`tryout-letter-${q.id}-${i}`} className="text-body-sm font-semibold text-foreground mr-1">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <div id={`tryout-option-${q.id}-${i}`} className="min-w-0 flex-1 wrap-break-word text-foreground"><InteractiveDocumentTryout value={transport ? null : { courseId: visualCourseId, examId: exam.id, questionId: q.id, field: "option", option: i }}><MarkdownRenderer content={opt} density="compact" /></InteractiveDocumentTryout></div>
                  </div>
                );
              })}
            </fieldset>
          ) : null}

          {/* RENDER C: Isian Singkat */}
          {q.type === "short_answer" && ans.type === "short_answer" ? (
            <div className="mt-4">
              <label className="block">
                <span className="mb-2 block text-body-xs font-semibold text-muted-foreground uppercase">
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

          {/* RENDER D: Esai (Text Area + Cloudflare R2 Upload) */}
          {q.type === "essay" && ans.type === "essay" ? (
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-body-xs font-semibold text-muted-foreground uppercase">
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

              {/* Cloudflare R2 file uploader widget */}
              {q.acceptsFile && (
                <div className="space-y-3">
                  <span className="block text-body-xs font-semibold text-muted-foreground uppercase">
                    {t("tryout.uploadAttachment")}
                  </span>

                  {transport && <p className="text-body-xs text-muted-foreground">Lampiran tidak tersedia di demo.</p>}
                  {!ans.fileName && !uploadingFile[q.id] ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/10 p-6 text-center hover:bg-muted/20 hover:border-brand-primary/40 transition-all relative">
                      <input
                        type="file"
                        disabled={Boolean(transport)}
                        accept=".pdf,image/*"
                        onChange={(e) => handleFileChange(q.id, e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <UploadCloud className="size-8 text-muted-foreground mb-2" />
                      <p className="text-body-xs font-bold text-foreground">{t("tryout.dropFile")}</p>
                      <p className="text-body-xs text-muted-foreground mt-1">{t("tryout.fileTypes")}</p>
                    </div>
                  ) : null}

                  {/* Uploading Progress */}
                  {uploadingFile[q.id] && uploadProgress[q.id] < 100 ? (
                    <div className="rounded-2xl border border-brand-secondary/35 bg-brand-secondary/5 p-4 space-y-2 animate-pulse">
                      <div className="flex justify-between text-body-xs font-semibold text-brand-secondary">
                        <span className="truncate max-w-[200px]">{t("tryout.uploading", { fileName: uploadingFile[q.id] })}</span>
                        <span>{uploadProgress[q.id]}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-brand-secondary rounded transition-all"
                          style={{ width: `${uploadProgress[q.id]}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Upload completed display */}
                  {ans.fileName && (
                    <div className="rounded-2xl border border-status-success/35 bg-status-success/5 p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-success/15 text-status-success">
                          <FileText className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-body-xs font-bold text-foreground truncate max-w-[200px] md:max-w-xs">{ans.fileName}</p>
                          <p className="text-[10px] text-muted-foreground">{ans.fileSize || t("tryout.fileSizeUnavailable")}</p>
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

          {/* Ragu-ragu Checkbox */}
          <div className="mt-4 border-t border-border pt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={currentFlagged} onCheckedChange={() => toggleFlag(q.id)} />
              <span className={cn(
                "text-body-xs font-semibold flex items-center gap-1 transition-colors",
                currentFlagged ? "text-brand-secondary" : "text-muted-foreground hover:text-foreground"
              )}>
                <Flag className={cn("size-3.5", currentFlagged ? "fill-brand-secondary text-brand-secondary" : "")} />
                {t("tryout.markUnsure")}
              </span>
            </label>

          </div>
          <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
        </div>

        <TooltipProvider>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tooltip><TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={t("tryout.previous")}
            onClick={goPrev}
            disabled={index === 0}
          >
            <ArrowLeft aria-hidden />
          </Button>
          </TooltipTrigger><TooltipContent>{t("tryout.previous")}</TooltipContent></Tooltip>

          <div className="flex gap-2">
            {index < sorted.length - 1 ? (
              <Tooltip><TooltipTrigger asChild>
                <Button type="button" size="icon-lg" aria-label={t("tryout.next")} onClick={goNext}>
                  <ArrowRight aria-hidden />
                </Button>
              </TooltipTrigger><TooltipContent>{t("tryout.next")}</TooltipContent></Tooltip>
            ) : (
              <Button
                type="button"
                disabled={isSubmitting}
                className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 px-8 font-bold"
                onClick={() => setShowConfirmModal(true)}
              >
                {t("tryout.submitAnswers")}
              </Button>
            )}
          </div>
        </div>
        </TooltipProvider>

      </div>

      {/* RIGHT COLUMN: Sidebar Navigation (4 cols) */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Navigation grid panel */}
        <div className="space-y-4">
          <div className="hidden border-t border-border pt-3 lg:block">
            <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
              <BookOpen className="size-4 text-brand-primary" />
              {t("tryout.questionNavigation")}
            </h3>
          </div>

          <div className="hidden lg:block">{renderQuestionMap()}</div>

          {/* Sidebar Submit shortcut */}
          <div className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setShowConfirmModal(true)}
              className="h-9 w-full rounded-md border-border/80 text-body-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("tryout.submitExam")}
            </Button>
          </div>
        </div>

        {/* Warning panel */}
        <div className="rounded-2xl border border-brand-secondary/20 bg-brand-secondary/5 p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-brand-secondary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-body-xs font-bold text-foreground">{t("tryout.submitOnTime")}</h4>
            <p className="text-body-xs text-muted-foreground leading-relaxed">
              {t("tryout.autoSubmitNotice")}
            </p>
          </div>
        </div>

      </div>

      {/* Confirmation Dialog before submitting */}
      <Dialog
        open={showConfirmModal}
        onOpenChange={(open) => {
          if (!isSubmitting) setShowConfirmModal(open);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {t("tryout.confirmTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-1.5">
              {t("tryout.confirmDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 space-y-3">
            <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border text-center">
              <div className="p-2.5">
                <span className="block text-body-xs font-semibold text-muted-foreground uppercase">{t("tryout.totalQuestions")}</span>
                <span className="font-heading text-body-base font-bold text-foreground">{sorted.length}</span>
              </div>
              <div className="bg-tertiary-1/10 p-2.5">
                <span className="block text-body-xs font-semibold text-tertiary-1 uppercase">{t("tryout.answered")}</span>
                <span className="font-heading text-body-base font-bold text-tertiary-1">{answeredCount}</span>
              </div>
              <div
                className={cn(
                  "p-2.5",
                  unansweredCount > 0
                    ? "bg-status-error/10 text-status-error"
                    : "text-muted-foreground"
                )}
              >
                <span className="block text-body-xs font-semibold uppercase">{t("tryout.empty")}</span>
                <span className="font-heading text-body-base font-bold">{unansweredCount}</span>
              </div>
            </div>

            {flaggedCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-brand-secondary/35 bg-brand-secondary/10 px-3.5 py-2.5 text-body-xs font-semibold text-brand-secondary">
                <Flag className="size-4 shrink-0 fill-brand-secondary" />
                <span>{t("tryout.flaggedWarning", { count: flaggedCount })}</span>
              </div>
            )}

            {unansweredCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-body-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{t("tryout.unansweredWarning", { count: unansweredCount })}</span>
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3.5 py-2 text-body-xs text-muted-foreground">
              <span>{t("tryout.timeRemaining")}</span>
              <span className="font-mono font-bold text-foreground"><Countdown deadline={deadline} duration={duration} /></span>
            </div>

          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setShowConfirmModal(false)}
              className="w-full sm:w-auto rounded-lg border-border"
            >
              {t("tryout.reviewAgain")}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              isLoading={isSubmitting}
              onClick={() => {
                handleSubmit();
              }}
              className="w-full sm:w-auto rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 font-bold"
            >
              {t("tryout.confirmSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
