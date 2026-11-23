"use client";

import type { ReactNode } from "react";
import { useTranslations } from "@/lib/i18n/client";
import {
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  Loader2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { FormattedDate } from "@/components/ui/formatted-date";
import { QuizQuestionContent } from "@/features/grading/ui/shared/quiz-question-content";
import type {
  AttemptDetails,
  PendingAttemptItem,
  QuizGradeDraftMap,
} from "@/features/grading/model/types";

export interface QuizGradingDesktopProps {
  queueHeader?: ReactNode;
  filteredAttempts: PendingAttemptItem[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeAttempt: AttemptDetails | null;
  loadingAttemptId: string | null;
  isPending: boolean;
  gradeInputs: QuizGradeDraftMap;
  onSelectAttempt: (attemptId: string) => void;
  onCloseAttempt: () => void;
  onScoreChange: (questionId: string, value: string) => void;
  onNotesChange: (questionId: string, value: string) => void;
  onSave: (finalize: boolean) => void;
}

export function QuizGradingDesktop({
  queueHeader,
  filteredAttempts,
  searchQuery,
  onSearchChange,
  activeAttempt,
  loadingAttemptId,
  isPending,
  gradeInputs,
  onSelectAttempt,
  onCloseAttempt,
  onScoreChange,
  onNotesChange,
  onSave,
}: QuizGradingDesktopProps) {
  const tr = useTranslations("tutor.grading");

  if (activeAttempt) {
    return (
      <div className="space-y-(--section-gap) font-sans" data-surface="desktop-quiz-grading-review">
        <div className="flex min-w-0 items-center gap-2 border-b border-border pb-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-lg"
                  variant="ghost"
                  aria-label={tr("backToQueue")}
                  onClick={onCloseAttempt}
                >
                  <ArrowLeft aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tr("backToQueue")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="min-w-0">
            <h1 className="break-words font-heading text-body-base font-bold text-foreground">
              {tr("reviewTitle", { quiz: activeAttempt.quizTitle })}
            </h1>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-xs text-muted-foreground">
              <User className="size-3" aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {activeAttempt.studentName} ({activeAttempt.studentEmail})
              </span>
              <Clock className="size-3" aria-hidden />
              <span>
                {tr("submitted")}{" "}
                <FormattedDate
                  date={activeAttempt.submittedAt}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                />
              </span>
            </p>
          </div>
        </div>

        <div className="divide-y divide-border border-y border-border">
          {activeAttempt.questions.map((q) => {
            const input = gradeInputs[q.id];
            return (
              <div key={q.id} className="space-y-(--compact-gap) py-(--row-padding)">
                <QuizQuestionContent question={q} />

                {q.isFreeResponse && input && (
                  <div className="grid grid-cols-1 gap-(--related-gap) border-t border-border/60 pt-3 md:grid-cols-4">
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
                        onChange={(e) => onScoreChange(q.id, e.target.value)}
                        placeholder={tr("scorePlaceholder")}
                        className="rounded-md text-body-sm"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-3">
                      <label htmlFor={`notes-${q.id}`} className="text-body-sm font-semibold text-foreground">
                        {tr("reviewNotes")}
                      </label>
                      <Textarea
                        id={`notes-${q.id}`}
                        rows={2}
                        value={input.notes}
                        onChange={(e) => onNotesChange(q.id, e.target.value)}
                        placeholder={tr("feedbackPlaceholder")}
                        className="resize-none rounded-md text-body-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 z-10 flex justify-end border-t border-border bg-background py-2">
          <Button
            variant="default"
            size="sm"
            disabled={isPending}
            onClick={() => onSave(true)}
            className="rounded-md text-body-sm font-semibold"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="mr-1.5 size-4" aria-hidden />
            )}
            {tr("finishGrading")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-(--section-gap) font-sans" data-surface="desktop-quiz-grading-queue">
      {queueHeader}
      <div className="flex flex-wrap items-center justify-between gap-2 max-sm:[&:has(>[data-search-expanded=true])>:not([data-search-expanded=true])]:hidden">
        <SearchBar
          collapsible
          size="sm"
          aria-label={tr("searchPlaceholder")}
          placeholder={tr("searchPlaceholder")}
          value={searchQuery}
          onSearch={onSearchChange}
          containerClassName="max-w-md"
        />

        <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
          <span>{tr("showingQueue", { count: filteredAttempts.length })}</span>
        </div>
      </div>

      {filteredAttempts.length === 0 ? (
        <div className="border-t border-border">
          <AdminEmptyState
            icon={CheckSquare}
            title={tr(searchQuery.trim() ? "noMatchingQuizAttempts" : "noPendingQuiz")}
            description={searchQuery.trim() ? undefined : tr("noPendingEssay")}
          />
        </div>
      ) : (
        <div className="border-y border-border">
          <div className="divide-y divide-border">
            {filteredAttempts.map((item) => {
              const isLoadingThis = loadingAttemptId === item.id;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 space-y-1 break-words">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-heading text-body-sm font-bold text-foreground">
                        {item.quizTitle}
                      </h4>
                      <Badge variant="secondary" className="rounded-md text-body-xs font-semibold">
                        {tr("essaysRemaining", { count: item.remainingEssayCount })}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-(--compact-gap) text-body-xs text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <User className="size-3 shrink-0" aria-hidden />
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {item.studentName ?? tr("studentFallback")} ({item.studentEmail})
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" aria-hidden />
                        {tr("submitted")}{" "}
                        <FormattedDate
                          date={item.submittedAt}
                          options={{ dateStyle: "medium", timeStyle: "short" }}
                        />
                      </span>
                      <span>
                        {tr("totalQuestions", { count: item.totalQuestions, essays: item.essayCount })}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isLoadingThis}
                      onClick={() => onSelectAttempt(item.id)}
                      className="h-auto min-h-9 max-w-28 whitespace-normal rounded-md py-1.5 text-body-sm font-semibold sm:max-w-none"
                    >
                      {isLoadingThis ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                      ) : (
                        <FileText className="mr-1.5 size-4" aria-hidden />
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
