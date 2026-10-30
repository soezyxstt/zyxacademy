"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  User,
  Search,
  CheckSquare,
  Clock,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MathText } from "@/components/course/math-text";
import { FormattedDate } from "@/components/ui/formatted-date";
import { toast } from "@/components/ui/toast";
import {
  gradeQuizAttemptAction,
  getQuizAttemptDetailsAction,
} from "@/app/actions/tutor-quiz-grading";

interface PendingAttemptItem {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  templateId: string;
  quizTitle: string;
  submittedAt: Date;
  totalQuestions: number;
  essayCount: number;
  remainingEssayCount: number;
}

interface QuestionDetail {
  index: number;
  id: string;
  prompt: string;
  questionType: string;
  options?: unknown;
  acceptableAnswers?: string[];
  submittedAnswer: unknown;
  submittedText: string;
  fileName?: string | null;
  fileKey?: string | null;
  fileSize?: string | null;
  isDeterministicCorrect: boolean;
  currentScore: number | null;
  currentStatus: string;
  reviewNotes: string;
  reviewRevision: number;
  reviewerId: string | null;
  isFreeResponse: boolean;
  isEssay: boolean;
  isShortAnswer: boolean;
}

interface AttemptDetails {
  attemptId: string;
  templateId: string;
  quizTitle: string;
  studentName: string | null;
  studentEmail: string | null;
  submittedAt: Date;
  gradingStatus: string;
  score: number | null;
  questions: QuestionDetail[];
}

interface Props {
  courseId: string;
  pendingAttempts: PendingAttemptItem[];
}

/**
 * Interactive client component for tutors to review, inspect attachments, and grade pending student quiz attempts.
 */
export function TutorQuizGradingClient({ courseId, pendingAttempts }: Props) {
  const router = useRouter();
  const tr = useTranslations("tutor.grading");
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeAttempt, setActiveAttempt] = useState<AttemptDetails | null>(null);
  const [loadingAttemptId, setLoadingAttemptId] = useState<string | null>(null);

  // Form state for active attempt reviews: questionId -> { score: string, notes: string, expectedRevision: number }
  const [gradeInputs, setGradeInputs] = useState<
    Record<string, { score: string; notes: string; expectedRevision: number }>
  >({});

  const filteredAttempts = pendingAttempts.filter((a) => {
    const q = searchQuery.toLowerCase();
    const titleMatch = a.quizTitle.toLowerCase().includes(q);
    const nameMatch = a.studentName?.toLowerCase().includes(q) ?? false;
    const emailMatch = a.studentEmail?.toLowerCase().includes(q) ?? false;
    return titleMatch || nameMatch || emailMatch;
  });

  async function handleSelectAttempt(attemptId: string) {
    setLoadingAttemptId(attemptId);
    try {
      const details = await getQuizAttemptDetailsAction(courseId, attemptId);
      if (!details) {
        toast.error(tr("loadAttemptFailed"));
        return;
      }
      setActiveAttempt(details);

      const initialInputs: Record<string, { score: string; notes: string; expectedRevision: number }> = {};
      for (const q of details.questions) {
        if (q.isFreeResponse) {
          initialInputs[q.id] = {
            score: q.currentScore !== null ? String(q.currentScore) : "",
            notes: q.reviewNotes || "",
            expectedRevision: q.reviewRevision,
          };
        }
      }
      setGradeInputs(initialInputs);
    } catch {
      toast.error(tr("loadAttemptError"));
    } finally {
      setLoadingAttemptId(null);
    }
  }

  function handleScoreChange(questionId: string, val: string) {
    setGradeInputs((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        score: val,
      },
    }));
  }

  function handleNotesChange(questionId: string, val: string) {
    setGradeInputs((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        notes: val,
      },
    }));
  }

  async function handleSave(finalize: boolean) {
    if (!activeAttempt) return;

    const freeResponseQuestions = activeAttempt.questions.filter((q) => q.isFreeResponse);
    const essayQuestions = activeAttempt.questions.filter((q) => q.isEssay);

    if (finalize) {
      // Check that all essay questions have a valid score
      for (const eq of essayQuestions) {
        const input = gradeInputs[eq.id];
        const num = input ? parseInt(input.score, 10) : NaN;
        if (isNaN(num) || num < 0 || num > 100) {
          toast.error(tr("essayScoreRequired", { number: eq.index }));
          return;
        }
      }
    }

    // Collect items that have been modified or filled
    const itemsToSubmit: Array<{
      questionId: string;
      score: number;
      reviewNotes?: string | null;
      expectedRevision: number;
    }> = [];

    for (const q of freeResponseQuestions) {
      const input = gradeInputs[q.id];
      if (!input) continue;
      const num = parseInt(input.score, 10);
      if (!isNaN(num) && num >= 0 && num <= 100) {
        itemsToSubmit.push({
          questionId: q.id,
          score: num,
          reviewNotes: input.notes.trim() || null,
          expectedRevision: input.expectedRevision,
        });
      }
    }

    if (itemsToSubmit.length === 0) {
      toast.error(tr("noScore"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await gradeQuizAttemptAction({
          courseId,
          attemptId: activeAttempt.attemptId,
          items: itemsToSubmit,
        });

        if (res.success) {
          if (res.gradingStatus === "graded") {
            toast.success(tr("finalized"));
          } else {
            toast.success(tr("draftSaved"));
          }
          setActiveAttempt(null);
          router.refresh();
        } else {
          toast.error(tr("saveQuizGradeFailed"));
        }
      } catch {
        toast.error(tr("saveQuizGradeFailed"));
      }
    });
  }

  // Active Review Workspace
  if (activeAttempt) {
    return (
      <div className="space-y-6 font-sans">
        <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveAttempt(null)}
              className="rounded-md border-border/80 text-body-sm"
            >
              <ArrowLeft className="mr-1.5 size-4" />
              {tr("backToQueue")}
            </Button>
            <div className="min-w-0">
              <h2 className="font-heading text-body-base font-bold text-foreground">
                {tr("reviewTitle", { quiz: activeAttempt.quizTitle })}
              </h2>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-xs text-muted-foreground">
                <User className="size-3" />
                <span>{activeAttempt.studentName} ({activeAttempt.studentEmail})</span>
                <Clock className="size-3" />
                <span>
                  {tr("submitted")} <FormattedDate date={activeAttempt.submittedAt} options={{ dateStyle: "medium", timeStyle: "short" }} />
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:shrink-0">
            <Button
              variant="default"
              size="sm"
              disabled={isPending}
              onClick={() => handleSave(true)}
              className="rounded-md text-body-sm font-semibold"
            >
              {isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 size-4" />
              )}
              {tr("finishGrading")}
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {activeAttempt.questions.map((q) => {
            const input = gradeInputs[q.id];
            const typeLabel =
              q.questionType === "essay"
                ? tr("essay")
                : q.questionType === "short_answer"
                ? tr("shortAnswer")
                : tr("multipleChoice");

            return (
              <div
                key={q.id}
                className="p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-body-sm font-bold text-foreground">
                      {tr("questionNumber", { number: q.index })}
                    </span>
                    <Badge variant="outline" className="rounded-md text-body-xs font-medium">
                      {typeLabel}
                    </Badge>
                  </div>

                  {!q.isFreeResponse ? (
                    <Badge
                      variant={q.isDeterministicCorrect ? "default" : "outline"}
                      className={q.isDeterministicCorrect
                        ? "rounded-md text-body-xs"
                        : "rounded-md border-destructive/50 text-body-xs text-destructive"}
                    >
                      {q.isDeterministicCorrect ? tr("correctAutomatic") : tr("incorrectAutomatic")}
                    </Badge>
                  ) : q.isShortAnswer ? (
                    <Badge
                      variant="outline"
                      className="rounded-md text-body-xs text-muted-foreground border-border"
                    >
                      {q.isDeterministicCorrect
                        ? tr("keyMatched")
                        : tr("keyNotMatched")}
                    </Badge>
                  ) : (
                    <Badge
                      variant={q.currentScore !== null ? "default" : "secondary"}
                      className="rounded-md text-body-xs"
                    >
                      {q.currentScore !== null ? tr("scored", { score: q.currentScore }) : tr("mustGrade")}
                    </Badge>
                  )}
                </div>

                <div className="text-body-sm text-foreground">
                  <MathText>{q.prompt}</MathText>
                </div>

                {q.acceptableAnswers && q.acceptableAnswers.length > 0 && (
                  <div className="text-body-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{tr("referenceAnswer")} </span>
                    {q.acceptableAnswers.join(", ")}
                  </div>
                )}

                <div className="space-y-1.5">
                  <span className="text-body-xs font-semibold text-muted-foreground">
                    {tr("studentAnswer")}
                  </span>
                  <div className="text-body-sm text-foreground bg-background p-3 rounded-md border border-border min-h-[48px] whitespace-pre-wrap">
                    {q.submittedText ? (
                      <MathText>{q.submittedText}</MathText>
                    ) : (
                      <span className="italic text-muted-foreground">{tr("noAnswer")}</span>
                    )}
                  </div>
                </div>

                {/* R2 uploaded attachment if present */}
                {q.fileName && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">{q.fileName}</p>
                        <p className="text-body-2xs text-muted-foreground">{q.fileSize || tr("pdfImage")} • {tr("cloudStorage")}</p>
                      </div>
                    </div>
                    {q.fileKey ? (
                      <Button
                        variant="outline"
                        size="xs"
                        asChild
                        className="gap-1 rounded-md border-border/80 text-muted-foreground hover:text-foreground"
                      >
                        <a
                          href={`/api/storage/file/${q.fileKey.split("/").map(encodeURIComponent).join("/")}?download=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="size-3.5" />
                          {tr("downloadFile")}
                        </a>
                      </Button>
                    ) : (
                      <span className="shrink-0 text-body-xs italic text-muted-foreground">
                        {tr("fileUnavailable")}
                      </span>
                    )}
                  </div>
                )}

                {q.isFreeResponse && input && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-border/60">
                    <div className="space-y-1.5">
                      <label htmlFor={`score-${q.id}`} className="text-body-sm font-semibold text-foreground">
                        {tr("score")} {q.isEssay ? <span className="text-destructive">*</span> : null}
                      </label>
                      <Input
                        id={`score-${q.id}`}
                        type="number"
                        min={0}
                        max={100}
                        value={input.score}
                        onChange={(e) => handleScoreChange(q.id, e.target.value)}
                        placeholder={tr("scorePlaceholder")}
                        className="rounded-md text-body-sm"
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1.5">
                      <label htmlFor={`notes-${q.id}`} className="text-body-sm font-semibold text-foreground">
                        {tr("reviewNotes")}
                      </label>
                      <Textarea
                        id={`notes-${q.id}`}
                        rows={2}
                        value={input.notes}
                        onChange={(e) => handleNotesChange(q.id, e.target.value)}
                        placeholder={tr("feedbackPlaceholder")}
                        className="rounded-md text-body-sm resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Queue View
  return (
    <div className="space-y-6 font-sans">
      {/* Search and filters toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md min-w-[140px]">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={tr("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-body-sm rounded-md h-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
          <span>{tr("showingQueue", { count: filteredAttempts.length })}</span>
        </div>
      </div>

      {filteredAttempts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <AdminEmptyState
            icon={CheckSquare}
            title={tr("noPendingQuiz")}
            description={tr("noPendingEssay")}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-xs">
          <div className="divide-y divide-border">
            {filteredAttempts.map((item) => {
              const isLoadingThis = loadingAttemptId === item.id;
              return (
                <div
                  key={item.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-heading text-body-sm font-bold text-foreground">
                        {item.quizTitle}
                      </h4>
                      <Badge variant="secondary" className="rounded-md text-body-xs font-semibold">
                        {tr("essaysRemaining", { count: item.remainingEssayCount })}
                      </Badge>
                    </div>
                    <div className="text-body-xs text-muted-foreground flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {item.studentName ?? tr("studentFallback")} ({item.studentEmail})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {tr("submitted")} <FormattedDate date={item.submittedAt} options={{ dateStyle: "medium", timeStyle: "short" }} />
                      </span>
                      <span>{tr("totalQuestions", { count: item.totalQuestions, essays: item.essayCount })}</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isLoadingThis}
                      onClick={() => handleSelectAttempt(item.id)}
                      className="rounded-md text-body-sm font-semibold"
                    >
                      {isLoadingThis ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" />
                      ) : (
                        <FileText className="mr-1.5 size-4" />
                      )}
                      {tr("gradeAnswer")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
