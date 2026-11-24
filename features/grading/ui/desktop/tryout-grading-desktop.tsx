"use client";

import type { ReactNode } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CheckSquare,
  User,
} from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  TryoutQuestionCard,
  parseTryoutSnapshots,
} from "@/features/grading/ui/shared/tryout-question-card";
import type { SubmissionItem, TryoutGradingTab } from "@/features/grading/model/types";

export interface TryoutGradingDesktopProps {
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

export function TryoutGradingDesktop({
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
}: TryoutGradingDesktopProps) {
  const tr = useTranslations("tutor.grading");
  const { locale } = useAppLocale();
  const dateLocale = locale === "id" ? "id-ID" : "en-US";

  if (activeSub) {
    const { questions, answers } = parseTryoutSnapshots(
      activeSub.questionsSnapshot,
      activeSub.answersSnapshot
    );

    return (
      <div className="space-y-(--related-gap)" data-surface="desktop-tryout-grading-review">
        <div className="flex flex-wrap items-start gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-lg"
                  variant="ghost"
                  className="shrink-0"
                  aria-label={tr("back")}
                  disabled={isPending}
                  onClick={onCloseSub}
                >
                  <ArrowLeft aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tr("back")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="min-w-0 flex-1 basis-40">
            <h1 className="break-words font-heading text-body-base font-bold text-foreground">
              {tr("answerSheet", { exam: activeSub.examTitle })}
            </h1>
            <p className="flex items-center gap-1 break-all text-body-xs text-muted-foreground">
              <User className="size-3" aria-hidden /> {activeSub.studentName} (
              {activeSub.studentEmail})
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-(--related-gap) lg:grid-cols-12">
          <div className="divide-y divide-border/55 border-y border-border/55 lg:col-span-8">
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

          <div className="space-y-(--related-gap) lg:sticky lg:top-6 lg:col-span-4 lg:border-l lg:border-border/35 lg:pl-8">
            <section
              id="tryout-grading-panel"
              tabIndex={-1}
              aria-labelledby="tryout-grading-heading"
              className="scroll-mt-16"
            >
              <header className="mb-(--related-gap) border-b border-border/40 pb-2">
                <h2
                  id="tryout-grading-heading"
                  className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground"
                >
                  <CheckSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{tr("gradingPanel")}</span>
                </h2>
              </header>

              <div className="space-y-(--related-gap) font-sans">
                <div className="grid gap-2">
                  <Label htmlFor="grade-score" className="text-body-sm font-semibold">
                    {tr("finalScore")}
                  </Label>
                  <Input
                    id="grade-score"
                    type="number"
                    min={0}
                    max={100}
                    value={scoreInput}
                    onChange={(e) => onScoreChange(e.target.value)}
                    placeholder={tr("scorePlaceholder")}
                    className="rounded-md text-body-sm font-semibold tabular-nums"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="grade-notes" className="text-body-sm font-semibold">
                    {tr("tutorFeedback")}
                  </Label>
                  <Textarea
                    id="grade-notes"
                    value={notesInput}
                    onChange={(e) => onNotesChange(e.target.value)}
                    rows={6}
                    placeholder={tr("feedbackPlaceholder")}
                    className="rounded-md text-body-sm leading-relaxed"
                  />
                </div>
              </div>

              <div className="mt-(--related-gap) flex justify-end">
                <Button
                  onClick={onSaveGrade}
                  isLoading={isPending}
                  className="rounded-md font-semibold"
                >
                  {tr("savePublish")}
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-(--related-gap)" data-surface="desktop-tryout-grading-queue">
      {queueHeader}
      <Tabs
        value={activeTab}
        onValueChange={(val) => onTabChange(val as TryoutGradingTab)}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="pending">
            <AlertCircle className="mr-2 size-4 text-status-warning" aria-hidden />
            {tr("needsGrading")}
            <Badge variant="secondary" className="px-1.5 py-0 text-body-2xs">
              {pendingList.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="graded">
            <CheckCircle2 className="mr-2 size-4 text-status-success" aria-hidden />
            {tr("graded")}
          </TabsTrigger>
          <TabsTrigger value="all">
            <CheckSquare className="mr-2 size-4 text-muted-foreground" aria-hidden />
            {tr("all")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pendingList.length === 0 ? (
            <AdminEmptyState compact icon={CheckCircle2} title={tr("allGraded")} />
          ) : (
            <div className="divide-y divide-border/40">
              {pendingList.map((s) => (
                <article
                  key={s.id}
                  className="flex flex-col justify-between gap-(--compact-gap) py-(--row-padding) sm:flex-row sm:items-start"
                >
                  <div className="space-y-1">
                    <h3 className="font-heading text-body-base font-semibold text-foreground">
                      {s.examTitle}
                    </h3>
                    <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
                      {tr("student")}{" "}
                      <span className="font-medium text-foreground">{s.studentName}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-body-xs text-muted-foreground">
                      <Calendar className="size-3.5" aria-hidden />
                      {s.submittedAt
                        ? new Date(s.submittedAt).toLocaleString(dateLocale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "-"}
                    </p>
                  </div>
                  <Button
                    onClick={() => onOpenGrade(s)}
                    className="rounded-md text-body-sm font-semibold"
                  >
                    {tr("gradeAnswer")}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="graded">
          {gradedList.length === 0 ? (
            <AdminEmptyState compact icon={AlertCircle} title={tr("noGraded")} />
          ) : (
            <div className="divide-y divide-border/40">
              {gradedList.map((s) => (
                <article
                  key={s.id}
                  className="flex flex-col justify-between gap-(--compact-gap) py-(--row-padding) sm:flex-row sm:items-start"
                >
                  <div className="space-y-1">
                    <h3 className="font-heading text-body-base font-semibold text-foreground">
                      {s.examTitle}
                    </h3>
                    <p className="text-body-sm text-muted-foreground">
                      {tr("student")}{" "}
                      <span className="font-medium text-foreground">{s.studentName}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-body-xs text-muted-foreground">
                      <Calendar className="size-3.5" aria-hidden />
                      {s.submittedAt
                        ? new Date(s.submittedAt).toLocaleString(dateLocale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "-"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-(--related-gap)">
                    <div className="text-right">
                      <p className="text-body-xs text-muted-foreground">
                        {tr("finalScoreLabel")}
                      </p>
                      <p className="font-heading text-body-base font-bold tabular-nums text-foreground">
                        {s.score}%
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => onOpenGrade(s)}
                      className="rounded-md border-border/80 text-muted-foreground hover:text-foreground"
                    >
                      {tr("editScore")}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {initialSubmissions.length === 0 ? (
            <AdminEmptyState icon={CheckSquare} title={tr("noSubmissions")} />
          ) : (
            <div className="divide-y divide-border/55 border-y border-border/55">
              {initialSubmissions.map((s) => (
                <article
                  key={s.id}
                  className="flex flex-col justify-between gap-(--compact-gap) py-(--row-padding) sm:flex-row sm:items-start"
                >
                  <div className="space-y-1">
                    <h3 className="font-heading text-body-base font-semibold text-foreground">
                      {s.examTitle}
                    </h3>
                    <p className="text-body-sm text-muted-foreground">
                      {tr("student")}{" "}
                      <span className="font-medium text-foreground">{s.studentName}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-body-xs text-muted-foreground">
                      <Calendar className="size-3.5" aria-hidden />
                      {tr("status")}{" "}
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
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-(--related-gap)">
                    <div className="text-right">
                      <p className="text-body-xs text-muted-foreground">
                        {tr("score")}
                      </p>
                      <p className="font-heading text-body-base font-bold tabular-nums text-foreground">
                        {s.score != null ? `${s.score}%` : tr("pending")}
                      </p>
                    </div>
                    <Button
                      onClick={() => onOpenGrade(s)}
                      className="rounded-md text-body-sm font-semibold"
                    >
                      {s.status === "graded" ? tr("editScore") : tr("gradeAnswer")}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
