"use client";

import { useMemo } from "react";
import { useTranslations } from "@/lib/i18n/client";
import {
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  Loader2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { FormattedDate } from "@/components/ui/formatted-date";
import {
  useHideMobileBottomNav,
  useMobileTopNav,
} from "@/components/navigation/mobile-chrome-context";
import { QuizQuestionContent } from "@/features/grading/ui/shared/quiz-question-content";
import type {
  AttemptDetails,
  PendingAttemptItem,
  QuizGradeDraftMap,
} from "@/features/grading/model/types";

export interface QuizGradingMobileProps {
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

export function QuizGradingMobile({
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
}: QuizGradingMobileProps) {
  const tr = useTranslations("tutor.grading");

  useHideMobileBottomNav(Boolean(activeAttempt));

  const topNavConfig = useMemo(
    () =>
      activeAttempt
        ? {
            title: activeAttempt.quizTitle,
            subtitle: activeAttempt.studentName ?? tr("studentFallback"),
            onBack: onCloseAttempt,
            backLabel: tr("backToQueue"),
          }
        : null,
    [activeAttempt, onCloseAttempt, tr]
  );
  useMobileTopNav(topNavConfig);

  if (activeAttempt) {
    return (
      <div
        className="space-y-(--related-gap) pb-24 font-sans"
        data-surface="mobile-quiz-grading-review"
      >
        <div className="divide-y divide-border border-b border-border">
          {activeAttempt.questions.map((q) => {
            const input = gradeInputs[q.id];
            return (
              <div key={q.id} className="space-y-3 py-(--row-padding)">
                <QuizQuestionContent question={q} compactAttachment />

                {q.isFreeResponse && input && (
                  <div className="space-y-3 border-t border-border/60 pt-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`mobile-score-${q.id}`}
                        className="text-body-sm font-semibold text-foreground"
                      >
                        {tr("score")}{" "}
                        {q.isEssay ? <span className="text-destructive">*</span> : null}
                      </label>
                      <Input
                        id={`mobile-score-${q.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={input.score}
                        onChange={(e) => onScoreChange(q.id, e.target.value)}
                        placeholder={tr("scorePlaceholder")}
                        className="min-h-11 rounded-md text-body-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`mobile-notes-${q.id}`}
                        className="text-body-sm font-semibold text-foreground"
                      >
                        {tr("reviewNotes")}
                      </label>
                      <Textarea
                        id={`mobile-notes-${q.id}`}
                        rows={3}
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

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md">
          <Button
            type="button"
            variant="default"
            disabled={isPending}
            onClick={() => onSave(true)}
            className="min-h-11 w-full rounded-md text-body-sm font-semibold"
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
    <div className="space-y-(--related-gap) font-sans" data-surface="mobile-quiz-grading-queue">
      <div className="flex items-center justify-between gap-2 [&:has(>[data-search-expanded=true])>:not([data-search-expanded=true])]:hidden">
        <SearchBar
          collapsible
          size="sm"
          aria-label={tr("searchPlaceholder")}
          placeholder={tr("searchPlaceholder")}
          value={searchQuery}
          onSearch={onSearchChange}
          containerClassName="w-full"
        />

        <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">
          {tr("showingQueue", { count: filteredAttempts.length })}
        </span>
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
        <div className="divide-y divide-border border-y border-border">
          {filteredAttempts.map((item) => {
            const isLoadingThis = loadingAttemptId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={isLoadingThis}
                onClick={() => onSelectAttempt(item.id)}
                className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="break-words font-heading text-body-sm font-bold text-foreground">
                      {item.quizTitle}
                    </span>
                    <Badge variant="secondary" className="rounded-md text-body-2xs font-semibold">
                      {tr("essaysRemaining", { count: item.remainingEssayCount })}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-xs text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <User className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{item.studentName ?? tr("studentFallback")}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="size-3 shrink-0" aria-hidden />
                      <FormattedDate
                        date={item.submittedAt}
                        options={{ dateStyle: "short", timeStyle: "short" }}
                      />
                    </span>
                  </div>
                </div>

                <span className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
                  {isLoadingThis ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4" aria-hidden />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
