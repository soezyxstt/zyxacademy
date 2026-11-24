"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  User,
} from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  useHideMobileBottomNav,
  useMobileTopNav,
} from "@/components/navigation/mobile-chrome-context";
import {
  TryoutQuestionCard,
  parseTryoutSnapshots,
} from "@/features/grading/ui/shared/tryout-question-card";
import type { SubmissionItem, TryoutGradingTab } from "@/features/grading/model/types";

export interface TryoutGradingMobileProps {
  queueHeader?: ReactNode;
  initialSubmissions: SubmissionItem[];
  pendingList: SubmissionItem[];
  gradedList: SubmissionItem[];
  activeTab: TryoutGradingTab;
  onTabChange: (tab: TryoutGradingTab) => void;
  activeSub: SubmissionItem | null;
  scoreInput: string;
  notesInput: string;
  isPending: boolean;
  onOpenGrade: (submission: SubmissionItem) => void;
  onCloseSub: () => void;
  onScoreChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSaveGrade: () => void;
}

export function TryoutGradingMobile({
  queueHeader,
  initialSubmissions,
  pendingList,
  gradedList,
  activeTab,
  onTabChange,
  activeSub,
  scoreInput,
  notesInput,
  isPending,
  onOpenGrade,
  onCloseSub,
  onScoreChange,
  onNotesChange,
  onSaveGrade,
}: TryoutGradingMobileProps) {
  const tr = useTranslations("tutor.grading");
  const { locale } = useAppLocale();
  const dateLocale = locale === "id" ? "id-ID" : "en-US";
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);

  useHideMobileBottomNav(Boolean(activeSub));

  const handleBackFromReview = useCallback(() => {
    if (!isPending) {
      onCloseSub();
    }
  }, [isPending, onCloseSub]);

  const topNavConfig = useMemo(
    () =>
      activeSub
        ? {
            title: activeSub.examTitle,
            subtitle: activeSub.studentName ?? tr("studentFallback"),
            onBack: handleBackFromReview,
            backLabel: tr("back"),
          }
        : null,
    [activeSub, handleBackFromReview, tr]
  );
  useMobileTopNav(topNavConfig);

  if (activeSub) {
    const { questions, answers } = parseTryoutSnapshots(
      activeSub.questionsSnapshot,
      activeSub.answersSnapshot
    );
    const hasNotes = notesInput.trim().length > 0;

    return (
      <div
        className={feedbackExpanded ? "space-y-(--related-gap) pb-72" : "space-y-(--related-gap) pb-28"}
        data-surface="mobile-tryout-grading-review"
      >
        <div className="divide-y divide-border border-b border-border">
          {questions.map((q, idx) => (
            <TryoutQuestionCard
              key={q.id}
              question={q}
              answer={answers[q.id]}
              index={idx}
              submissionId={activeSub.id}
            />
          ))}
        </div>

        {/* Sticky collapsible bottom grading drawer/bar */}
        <section
          aria-label={tr("gradingPanel")}
          data-grading-drawer={feedbackExpanded ? "expanded" : "collapsed"}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)]"
        >
          {feedbackExpanded && (
            <div className="space-y-2 border-b border-border px-4 pt-3 pb-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="mobile-grade-notes" className="text-body-sm font-semibold text-foreground">
                  {tr("tutorFeedback")}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={tr("tutorFeedback")}
                  onClick={() => setFeedbackExpanded(false)}
                >
                  <ChevronDown className="size-4" aria-hidden />
                </Button>
              </div>
              <Textarea
                id="mobile-grade-notes"
                value={notesInput}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={4}
                placeholder={tr("feedbackPlaceholder")}
                className="resize-none rounded-md border-input bg-background text-body-sm leading-relaxed focus-visible:ring-brand-primary"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2">
            <div className="w-22 shrink-0">
              <Input
                id="mobile-grade-score"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={scoreInput}
                onChange={(e) => onScoreChange(e.target.value)}
                placeholder={tr("scorePlaceholder")}
                aria-label={tr("finalScore")}
                className="min-h-11 rounded-md border-input bg-background text-center font-sans text-body-sm font-semibold tabular-nums text-brand-primary focus-visible:ring-brand-primary"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-expanded={feedbackExpanded}
              aria-label={tr("tutorFeedback")}
              onClick={() => setFeedbackExpanded((prev) => !prev)}
              className="relative min-h-11 min-w-11 shrink-0 rounded-md"
            >
              {feedbackExpanded ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <span className="flex items-center gap-0.5">
                  <MessageSquare className="size-4" aria-hidden />
                  <ChevronUp className="size-3" aria-hidden />
                </span>
              )}
              {hasNotes && !feedbackExpanded && (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 size-1.5 rounded-sm bg-brand-primary"
                />
              )}
            </Button>

            <Button
              type="button"
              onClick={onSaveGrade}
              isLoading={isPending}
              className="min-h-11 rounded-md text-body-sm font-semibold"
            >
              {tr("savePublish")}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  function renderMobileQueueList(items: SubmissionItem[], emptyTitle: string, emptyIcon: typeof CheckCircle2) {
    if (items.length === 0) {
      return <AdminEmptyState icon={emptyIcon} title={emptyTitle} />;
    }

    return (
      <div className="divide-y divide-border/55 border-y border-border/55">
        {items.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpenGrade(s)}
            className="flex min-h-11 w-full items-start justify-between gap-3 py-(--row-padding) text-left transition-colors hover:bg-muted/20 active:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="break-words font-heading text-body-sm font-bold text-foreground">
                  {s.examTitle}
                </span>
                <Badge
                  variant="outline"
                  className={`rounded-md text-body-2xs ${
                    s.status === "graded"
                      ? "border-status-success/20 bg-status-success/10 text-status-success"
                      : "border-status-warning/20 bg-status-warning/10 text-status-warning"
                  }`}
                >
                  {s.status === "graded" ? tr("graded") : tr("waitingReview")}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-xs text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <User className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{s.studentName ?? tr("studentFallback")}</span>
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Calendar className="size-3 shrink-0" aria-hidden />
                  {s.submittedAt
                    ? new Date(s.submittedAt).toLocaleString(dateLocale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "-"}
                </span>
              </div>
            </div>

            {s.score != null && (
              <span className="shrink-0 font-heading text-body-sm font-bold tabular-nums text-foreground">
                {s.score}%
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-(--related-gap)" data-surface="mobile-tryout-grading-queue">
      {queueHeader}
      <Tabs
        value={activeTab}
        onValueChange={(val) => onTabChange(val as TryoutGradingTab)}
        className="w-full"
      >
        <TabsList variant="inline">
          <TabsTrigger value="pending">
            <AlertCircle className="mr-1.5 size-4 text-status-warning" aria-hidden />
            {tr("needsGrading")}
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-body-2xs">
              {pendingList.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="graded">
            <CheckCircle2 className="mr-1.5 size-4 text-status-success" aria-hidden />
            {tr("graded")}
          </TabsTrigger>
          <TabsTrigger value="all">
            <CheckSquare className="mr-1.5 size-4 text-muted-foreground" aria-hidden />
            {tr("all")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {renderMobileQueueList(pendingList, tr("allGraded"), CheckCircle2)}
        </TabsContent>

        <TabsContent value="graded">
          {renderMobileQueueList(gradedList, tr("noGraded"), AlertCircle)}
        </TabsContent>

        <TabsContent value="all">
          {renderMobileQueueList(initialSubmissions, tr("noSubmissions"), CheckSquare)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
