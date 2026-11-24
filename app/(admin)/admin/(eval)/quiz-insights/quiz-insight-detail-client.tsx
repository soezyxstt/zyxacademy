"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  BrainCircuit,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Target,
  RefreshCw,
  Lightbulb,
  FileSpreadsheet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BetaBadge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { QuizAttemptsSpreadsheet } from "@/app/(admin)/admin/(eval)/quiz-insights/[id]/_components/quiz-attempts-spreadsheet";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { DifficultyBadge } from "@/components/admin/status-badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useMobilePageActions } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavActionButton } from "@/components/navigation/mobile-top-navbar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface QuizDetailResponse {
  template: {
    id: string;
    title: string;
    category: string;
    courseId: string;
    courseName: string;
    timeLimitSeconds: number | null;
    status: string;
    createdAt: string;
  };
  summary: {
    totalStarted: number;
    totalCompleted: number;
    completionRate: number;
    avgScore: number;
    minScore: number;
    maxScore: number;
    medianScore: number;
    avgDurationSeconds: number;
    scoreRanges: {
      range0_20: number;
      range21_40: number;
      range41_60: number;
      range61_80: number;
      range81_100: number;
    };
  };
  questionAnalysis: Array<{
    questionId: string;
    prompt: string;
    options: string[];
    correctIndices: number[];
    tags: string[];
    difficulty: string;
    explanation?: string;
    distractorMap?: any[];
    totalAnswers: number;
    correctCount: number;
    accuracyRate: number;
    optionCounts: Record<number, number>;
  }>;
  conceptAnalysis: Array<{
    tag: string;
    totalAnswered: number;
    correctCount: number;
    accuracyRate: number;
  }>;
  latestAiInsight: {
    id: string;
    sampleSize: number;
    summary: string;
    insights: {
      summaryOverview: string;
      misconceptions: Array<{
        concept: string;
        description: string;
        frequency: "high" | "medium" | "low";
        targetedQuestions?: string[];
      }>;
      teachingRecommendations: Array<{
        topic: string;
        actionItem: string;
        rationale: string;
      }>;
      hardestQuestionsAnalysis: Array<{
        questionId: string;
        promptSnippet: string;
        accuracyRate: number;
        diagnosis: string;
        distractorTrap: string;
      }>;
      easiestQuestionsAnalysis: Array<{
        questionId: string;
        promptSnippet: string;
        accuracyRate: number;
        reason: string;
      }>;
      actionableNextSteps: string[];
    };
    createdAt: string;
  } | null;
}

export interface QuizInsightDetailClientProps {
  quizId: string;
  lockedCourse?: {
    id: string;
    slug: string;
    title: string;
  };
  backHref?: string;
  backLabel?: string;
}

export function QuizInsightDetailClient({
  quizId,
  lockedCourse,
  backHref = "/admin/quiz-insights",
  backLabel,
}: QuizInsightDetailClientProps) {
  const tx = useTranslations("adminEval.quizInsightDetail");
  const [data, setData] = useState<QuizDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [activeTab, setActiveTab] = useUrlTab("tab", "ai-insights");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/quiz-insights/${encodeURIComponent(quizId)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setErrorMsg(tx("loadFailed"));
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(tx("connectionError"));
    } finally {
      setLoading(false);
    }
  }, [quizId, tx]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleRunAiAnalysis = useCallback(async () => {
    setAnalyzingAi(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/quiz-insights/${encodeURIComponent(quizId)}/analyze`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchDetail();
      } else {
        setErrorMsg(tx("analysisFailed"));
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(tx("analysisError"));
    } finally {
      setAnalyzingAi(false);
    }
  }, [fetchDetail, quizId, tx]);

  const hasData = data?.template.id === quizId;
  const analysisDisabled = analyzingAi || !data?.summary.totalCompleted;
  const analysisLabel = tx(analyzingAi ? "analyzing" : "runPerformanceAnalysis");
  const analysisAction = useMemo(() => hasData ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <MobileTopNavActionButton
            label={analysisLabel}
            onClick={handleRunAiAnalysis}
            disabled={analysisDisabled}
            aria-busy={analyzingAi}
          >
            {analyzingAi ? <RefreshCw className="motion-safe:animate-spin" aria-hidden /> : <BrainCircuit aria-hidden />}
          </MobileTopNavActionButton>
        </TooltipTrigger>
        <TooltipContent>{analysisLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null, [analysisDisabled, analysisLabel, analyzingAi, handleRunAiAnalysis, hasData]);
  const analysisInNavbar = useMobilePageActions(analysisAction);

  if (loading && !hasData) {
    return (
      <div role="status" aria-label={tx("loading")} className="space-y-(--section-gap)">
        <div className="hidden justify-end md:flex"><Skeleton className="size-9" /></div>
        <AdminStatStrip className="lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-16" /></div>)}
        </AdminStatStrip>
        <Skeleton className="h-10 w-80 max-w-full" />
        <div className="grid gap-(--section-gap) md:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-32 w-full" /></div>)}
        </div>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="p-8 border border-status-error/30 bg-status-error/10 rounded-xl space-y-4 text-center">
        <AlertTriangle className="mx-auto size-8 text-status-error" aria-hidden />
        <p className="text-body-base font-semibold text-status-error">{errorMsg}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>{backLabel ?? tx("backLabel")}</Link>
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { template, summary, questionAnalysis, conceptAnalysis, latestAiInsight } = data;

  const formatDuration = (secs: number) => {
    if (!secs) return tx("durationSeconds", { seconds: 0 });
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    if (mins === 0) return tx("durationSeconds", { seconds: remainder });
    return tx("durationMinutesSeconds", { minutes: mins, seconds: remainder });
  };

  const courseDisplayName = lockedCourse?.title || template.courseName || template.courseId;

  return (
    <div className="space-y-(--section-gap)">
      <AdminPageHeader
        icon={BarChart3}
        backHref={backHref}
        backLabel={backLabel ?? tx("backLabel")}
        title={template.title}
        actions={analysisInNavbar ? undefined : analysisAction}
      />

      <div className="space-y-1">
        <p className="wrap-anywhere text-body-sm font-semibold text-foreground">{template.title}</p>
        <p className="wrap-anywhere text-body-xs text-muted-foreground">
          {courseDisplayName} · {tx(`category.${template.category}`)} · {tx("quizMetadata", { id: template.id, limit: template.timeLimitSeconds ? formatDuration(template.timeLimitSeconds) : tx("unlimited") })} · {tx("createdAt")}{" "}
          <FormattedDate date={template.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} />
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="flex items-start gap-2 border-l-2 border-status-error pl-3 text-body-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Overview Stat Strip */}
      <AdminStatStrip className="lg:grid-cols-4">
        <AdminStatStripItem
          label={tx("completedParticipants")}
          value={summary.totalCompleted}
          caption={tx("completionRateCaption", { rate: summary.completionRate, started: summary.totalStarted })}
          icon={Target}
        />
        <AdminStatStripItem
          label={tx("averageScore")}
          value={`${summary.avgScore} / 100`}
          caption={tx("scoreRangeCaption", { median: summary.medianScore, min: summary.minScore, max: summary.maxScore })}
          icon={BarChart3}
        />
        <AdminStatStripItem
          label={tx("averageTime")}
          value={formatDuration(summary.avgDurationSeconds)}
          icon={BookOpen}
        />
        <AdminStatStripItem
          label={tx("aiEvaluationStatus")}
          value={
            latestAiInsight ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-hidden />
                <span>{tx("available")}</span>
              </div>
            ) : (
              <span>{tx("notAnalyzed")}</span>
            )
          }
          caption={latestAiInsight ? tx("basedOnAttempts", { count: latestAiInsight.sampleSize }) : undefined}
          icon={BrainCircuit}
          iconClassName={latestAiInsight ? "text-status-success" : undefined}
        />
      </AdminStatStrip>

      {/* Multi-Tab Analytics Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList flush={false}>
          <TabsTrigger value="ai-insights" className="gap-2">
            <BrainCircuit className="size-4" aria-hidden />
            <span>{tx("aiEvaluation")}</span>
            <BetaBadge />
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-2">
            <Target className="size-4" aria-hidden />
            <span>{tx("questionAnalysis")}</span>
          </TabsTrigger>
          <TabsTrigger value="score-dist" className="gap-2">
            <BarChart3 className="size-4" aria-hidden />
            <span>{tx("scoreDistribution")}</span>
          </TabsTrigger>
          <TabsTrigger value="attempts-sheet" className="gap-2">
            <FileSpreadsheet className="size-4" aria-hidden />
            <span>{tx("studentAttempts")}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: AI evaluation */}
        <TabsContent value="ai-insights">
          {!latestAiInsight ? (
            <AdminEmptyState
              compact
              icon={BrainCircuit}
              title={tx("noAiAnalysis")}
              description={summary.totalCompleted === 0 ? tx("needOneAttempt") : tx("noAiAnalysisDescription")}
            />
          ) : (
            <div className="space-y-8 md:space-y-10">
              {/* Executive Summary */}
              <section className="space-y-2">
                <AdminSectionTitle as="h2" title={tx("evaluationSummary")} icon={Lightbulb} />
                <p className="max-w-prose whitespace-pre-wrap break-words text-body-base text-foreground">
                  {latestAiInsight.insights.summaryOverview || latestAiInsight.summary}
                </p>
              </section>

              {/* Teaching Recommendations & Misconceptions */}
              <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-(--section-gap)">
                {/* Misconceptions */}
                <section className="min-w-0 space-y-2">
                  <AdminSectionTitle as="h2" title={tx("misconceptions")} icon={AlertTriangle} iconClassName="text-status-warning" />
                  {!latestAiInsight.insights.misconceptions?.length ? (
                    <p className="text-body-sm text-muted-foreground">{tx("noCriticalMisconceptions")}</p>
                  ) : (
                    <ul className="divide-y divide-border/30">
                      {latestAiInsight.insights.misconceptions?.map((misc, idx) => (
                        <li key={idx} className="space-y-1 py-(--row-padding)">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <h3 className="min-w-0 wrap-anywhere text-body-sm font-semibold text-foreground">{misc.concept}</h3>
                            <span className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground">
                              {misc.frequency === "high" && <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden />}
                              {tx("frequency", { level: tx(`frequencyLevels.${misc.frequency}`) })}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-body-base text-foreground">{misc.description}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Recommendations */}
                <section className="min-w-0 space-y-2">
                  <AdminSectionTitle as="h2" title={tx("followUps")} icon={Target} />
                  {!latestAiInsight.insights.teachingRecommendations?.length ? (
                    <p className="text-body-sm text-muted-foreground">{tx("noRecommendations")}</p>
                  ) : (
                    <ul className="divide-y divide-border/30">
                      {latestAiInsight.insights.teachingRecommendations?.map((rec, idx) => (
                        <li key={idx} className="space-y-1 py-(--row-padding)">
                          <h3 className="wrap-anywhere text-body-sm font-semibold text-foreground">{rec.topic}</h3>
                          <p className="whitespace-pre-wrap break-words text-body-base text-foreground">{rec.actionItem}</p>
                          <p className="whitespace-pre-wrap break-words text-body-sm text-muted-foreground">{rec.rationale}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Hardest Questions Deep Dive */}
              {latestAiInsight.insights.hardestQuestionsAnalysis?.length > 0 && (
                <section className="min-w-0 space-y-2">
                  <AdminSectionTitle as="h2" title={tx("difficultQuestionsAndDistractors")} icon={AlertTriangle} iconClassName="text-status-warning" />
                  <ul className="divide-y divide-border/30">
                    {latestAiInsight.insights.hardestQuestionsAnalysis.map((item, idx) => (
                      <li key={idx} className="grid gap-(--compact-gap) py-(--row-padding) lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-(--section-gap)">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-body-xs">
                            <span className="min-w-0 wrap-anywhere font-mono text-muted-foreground">ID: {item.questionId}</span>
                            <span className="font-medium tabular-nums text-foreground">{tx("accuracyValue", { value: item.accuracyRate })}</span>
                          </div>
                          <MathText as="div" className="min-w-0 wrap-anywhere text-body-base text-foreground">{item.promptSnippet}</MathText>
                        </div>
                        <div className="min-w-0 space-y-1 wrap-anywhere text-body-sm text-muted-foreground">
                          <p><strong className="text-foreground">{tx("diagnosis")}</strong> {item.diagnosis}</p>
                          <p><strong className="text-foreground">{tx("distractorTrap")}</strong> {item.distractorTrap}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Question Item & Distractor Analysis */}
        <TabsContent value="questions">
          <ol className="divide-y divide-border/40">
            {questionAnalysis.map((q, idx) => (
              <li key={q.questionId} className="space-y-(--compact-gap) py-(--related-gap)">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-body-sm font-semibold tabular-nums text-foreground">{idx + 1}.</span>
                    <span className="min-w-0 wrap-anywhere font-mono text-body-xs text-muted-foreground">ID: {q.questionId}</span>
                    <DifficultyBadge difficulty={q.difficulty} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                    <span className="text-body-xs text-muted-foreground">
                      {tx("studentAnswers")}: <strong className="text-foreground">{q.totalAnswers}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-body-xs font-medium text-foreground">
                      {q.accuracyRate < 70 && <span className="size-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden />}
                      {tx("accuracyValue", { value: q.accuracyRate })}
                    </span>
                  </div>
                </div>

                <div className="min-w-0 text-body-base text-foreground">
                  <MarkdownRenderer content={q.prompt} />
                </div>

                {/* Option Breakdown */}
                <div className="space-y-1">
                  <p className="text-body-xs font-semibold text-muted-foreground">{tx("answerDistribution")}</p>
                  <ul className="divide-y divide-border/30">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = q.correctIndices.includes(optIdx);
                      const chosenCount = q.optionCounts[optIdx] || 0;
                      const percentage = q.totalAnswers > 0 ? Math.round((chosenCount / q.totalAnswers) * 100) : 0;

                      return (
                        <li
                          key={optIdx}
                          className="flex items-baseline justify-between gap-(--compact-gap) py-2 text-foreground"
                        >
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="shrink-0 text-body-xs font-semibold">{String.fromCharCode(65 + optIdx)}.</span>
                            <div className="min-w-0 break-words text-body-sm"><MarkdownRenderer content={opt} density="compact" /></div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 text-right text-body-xs tabular-nums">
                            <span>{chosenCount} ({percentage}%)</span>
                            {isCorrect && (
                              <>
                                <CheckCircle2 className="size-3.5 text-status-success" aria-hidden />
                                <span className="sr-only">{tx("correctOption")}</span>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {q.explanation && (
                  <div className="space-y-1 text-body-base text-foreground">
                    <p className="text-body-sm font-semibold">{tx("solutionExplanation")}</p>
                    <MarkdownRenderer content={q.explanation} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </TabsContent>

        {/* Tab 3: Score Distribution & Concept Mastery */}
        <TabsContent value="score-dist" className="space-y-4">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-(--section-gap)">
            {/* Score Ranges */}
            <section className="min-w-0 space-y-(--compact-gap)">
              <AdminSectionTitle as="h2" title={tx("scoreDistribution")} icon={BarChart3} />
              <ul className="divide-y divide-border/30">
                {[
                  { label: tx("scoreBands.excellent"), count: summary.scoreRanges.range81_100, color: "bg-status-success" },
                  { label: tx("scoreBands.good"), count: summary.scoreRanges.range61_80, color: "bg-brand-primary" },
                  { label: tx("scoreBands.fair"), count: summary.scoreRanges.range41_60, color: "bg-status-warning" },
                  { label: tx("scoreBands.low"), count: summary.scoreRanges.range21_40, color: "bg-amber-600" },
                  { label: tx("scoreBands.veryLow"), count: summary.scoreRanges.range0_20, color: "bg-status-error"},
                ].map((range, idx) => {
                  const pct = summary.totalCompleted > 0 ? Math.round((range.count / summary.totalCompleted) * 100) : 0;
                  return (
                    <li key={idx} className="space-y-1.5 py-2">
                      <div className="flex flex-wrap justify-between gap-x-2 text-body-xs text-muted-foreground">
                        <span>{range.label}</span>
                        <span className="font-semibold tabular-nums text-foreground">{tx("studentsPercent", { count: range.count, percent: pct })}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted" aria-hidden>
                        <div className={`h-full ${range.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Concept Mastery Tags */}
            <section className="min-w-0 space-y-(--compact-gap)">
              <AdminSectionTitle as="h2" title={tx("conceptMastery")} icon={Target} />
              {conceptAnalysis.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">{tx("noQuestionTags")}</p>
              ) : (
                <ul className="divide-y divide-border/30">
                  {conceptAnalysis.map((c, idx) => (
                    <li key={idx} className="space-y-1.5 py-2">
                      <div className="flex flex-wrap justify-between gap-x-2 text-body-sm">
                        <MathText className="min-w-0 wrap-anywhere font-medium text-foreground">{c.tag}</MathText>
                        <span className="shrink-0 text-body-xs tabular-nums text-muted-foreground">
                          <strong className="text-foreground">{tx("accuracyValue", { value: c.accuracyRate })}</strong> ({c.correctCount}/{c.totalAnswered})
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted" aria-hidden>
                        <div
                          className={`h-full ${c.accuracyRate >= 70 ? "bg-status-success" : "bg-status-warning"}`}
                          style={{ width: `${c.accuracyRate}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </TabsContent>

        {/* Tab 4: Student Attempts Spreadsheet */}
        <TabsContent value="attempts-sheet" className="space-y-4">
          <QuizAttemptsSpreadsheet templateId={quizId} quizTitle={template.title} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
