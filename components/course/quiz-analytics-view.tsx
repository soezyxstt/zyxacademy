"use client";

import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { useQuizAnalytics } from "@/hooks/use-quiz-analytics";
import { ApiError } from "@/lib/query/http";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { QuizAnalyticsData } from "@/lib/quiz/analytics-client";
export type { QuizAnalyticsData } from "@/lib/quiz/analytics-client";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  TriangleAlert,
  Zap,
  ArrowUpRight,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { MathText } from "@/components/course/math-text";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { useTranslations } from "@/lib/i18n/client";

import { useStudentExperience } from "@/components/student-experience-provider";


interface QuizAnalyticsViewProps {
  initialData?: QuizAnalyticsData;
  attemptId: string;
  courseId: string;
}

export function QuizAnalyticsView({ attemptId, courseId, initialData }: QuizAnalyticsViewProps) {
  if (initialData) return <QuizAnalyticsContent courseId={courseId} data={initialData} loading={false} recomputing={false} fetchAnalytics={() => {}} handleRecompute={() => {}} />;
  return <StudentAccountBoundary>{({ data }) => data?.user
    ? <LiveQuizAnalytics key={`${data.user.id}:${attemptId}`} userId={data.user.id} attemptId={attemptId} courseId={courseId} />
    : <div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}
  </StudentAccountBoundary>;
}

function LiveQuizAnalytics({ userId, attemptId, courseId }: { userId: string; attemptId: string; courseId: string }) {
  const { query, recompute } = useQuizAnalytics(userId, attemptId);
  const accessDenied = [query.error, recompute.error].some((error) => error instanceof ApiError && [401, 403, 404, 409].includes(error.status));
  return <QuizAnalyticsContent
    courseId={courseId} data={accessDenied ? undefined : query.data} loading={query.isPending} recomputing={recompute.isPending}
    error={Boolean(query.error || recompute.error)}
    fetchAnalytics={() => {
      void query.refetch().then((result) => { if (result.isSuccess) recompute.reset(); });
    }}
    handleRecompute={() => recompute.mutate()}
  />;
}

function QuizAnalyticsContent({ courseId, data, loading, recomputing, error, fetchAnalytics, handleRecompute }: {
  courseId: string;
  data?: QuizAnalyticsData;
  loading: boolean;
  recomputing: boolean;
  error?: boolean;
  fetchAnalytics: () => void;
  handleRecompute: () => void;
}) {
  const t = useTranslations("studentCourse");
  const experience = useStudentExperience();
  const href = (path: string) => experience.href?.(path) ?? path;

  if (error && !data) {
    return <div className="flex items-center gap-2 py-4 text-body-sm text-status-error" role="alert">
      <TriangleAlert className="size-4" />
      <span>{t("attemptReview.loadFailed")}</span>
      <Button variant="ghost" size="sm" onClick={fetchAnalytics}>{t("attemptReview.retry")}</Button>
    </div>;
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
        <Loader2 className="size-8 animate-spin text-brand-primary" />
        <p className="font-heading text-body-base font-bold text-foreground">{t("quizAnalytics.loadingTitle")}</p>
        <p className="text-body-sm text-muted-foreground max-w-md">
          {t("quizAnalytics.loadingDescription")}
        </p>
      </div>
    );
  }

  const metrics = data?.computedMetrics;
  const diagnosis = data?.aiDiagnosis;
  const isProcessing = data?.status === "processing";

  if (!metrics && !diagnosis) {
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary mx-auto ring-1 ring-brand-primary/20">
          <Brain className="size-7" />
        </div>
        <div className="space-y-2 max-w-lg mx-auto">
          <h3 className="font-heading text-body-base font-bold text-foreground">{t("quizAnalytics.notGeneratedTitle")}</h3>
          <p className="text-body-sm text-muted-foreground leading-relaxed">
            {t("quizAnalytics.notGeneratedDescription")}
          </p>
        </div>
        <Button
          onClick={handleRecompute}
          disabled={recomputing}
          className="rounded-md bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 font-semibold px-6 py-2.5 shadow-sm"
        >
          {recomputing && <Loader2 className="mr-2 size-4 animate-spin" />}
          {recomputing ? t("quizAnalytics.generating") : t("quizAnalytics.generate")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {error && <div className="flex items-center gap-2 text-body-sm text-status-error" role="alert">
        <TriangleAlert className="size-4" />
        <span>{t("attemptReview.loadFailed")}</span>
        <Button variant="ghost" size="sm" onClick={fetchAnalytics}>{t("attemptReview.retry")}</Button>
      </div>}
      {/* Processing Banner if analysis is still running */}
      {isProcessing && (
        <div className="flex items-center justify-between gap-3 border-b border-border py-2 text-brand-primary">
          <div className="flex min-w-0 items-center gap-3">
            <Loader2 className="size-5 animate-spin shrink-0" />
            <div className="text-body-sm">
              <span className="font-bold">{t("quizAnalytics.analysisInProgress")}</span> {t("quizAnalytics.analysisInProgressDescription")}
            </div>
          </div>
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button type="button" onClick={fetchAnalytics} variant="ghost" size="icon-lg" aria-label={t("quizAnalytics.refreshStatus")}>
              <RefreshCw aria-hidden />
            </Button>
          </TooltipTrigger><TooltipContent>{t("quizAnalytics.refreshStatus")}</TooltipContent></Tooltip></TooltipProvider>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
          LAYER 1: RINGKASAN CEPAT (QUICK EXECUTIVE SUMMARY)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Main Headline Banner */}
        <div className="min-w-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                {metrics && (
                  <Badge variant="outline" className="rounded-md border-border bg-card text-muted-foreground text-body-xs">
                    {metrics.quizTitle}
                  </Badge>
                )}
                <Button
                  onClick={handleRecompute}
                  disabled={recomputing}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground md:ml-0"
                >
                  <RefreshCw className={`mr-1 size-3 ${recomputing ? "animate-spin" : ""}`} />
                  {recomputing ? t("quizAnalytics.processing") : t("quizAnalytics.reanalyze")}
                </Button>
              </div>
              <h2 className="font-heading text-body-base font-bold text-foreground">
                <MathText as="span">{diagnosis?.headline || t("quizAnalytics.quizResult", { score: metrics?.score ?? 0, correct: metrics?.correctCount ?? 0, total: metrics?.totalQuestions ?? 0 })}</MathText>
              </h2>
              <p className="text-body-base text-muted-foreground leading-relaxed">
                <MathText as="span">{diagnosis?.overall_summary || t("quizAnalytics.quizCompleted", { count: metrics?.totalQuestions ?? 0 })}</MathText>
              </p>
            </div>

            {/* Score & Performance Badge */}
            {metrics && (
              <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end md:border-l md:border-border/70 md:pl-5">
                <span className="text-body-xs font-semibold text-muted-foreground">{t("quizAnalytics.totalScore")}</span>
                <div className="font-heading text-h5 font-bold text-brand-primary">
                  {metrics.score}<span className="text-body-base text-muted-foreground font-normal">%</span>
                </div>
                <Badge className={`rounded-md ${getPerformanceBadgeClass(diagnosis?.performance_level || (metrics.score >= 75 ? "good" : "developing"))}`}>
                  {t(`quizAnalytics.performance.${diagnosis?.performance_level || (metrics.score >= 75 ? "good" : "developing")}`)}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Quick Facts Strip */}
        {metrics && (
          <AdminStatStrip className="grid-cols-2 sm:grid-cols-4">
            <AdminStatStripItem icon={CheckCircle2} iconClassName="text-status-success" label={t("quizAnalytics.correctAnswers")} value={`${metrics.correctCount} / ${metrics.totalQuestions}`} />
            <AdminStatStripItem icon={TriangleAlert} iconClassName="text-status-error" label={t("quizAnalytics.incorrectOrBlank")} value={metrics.incorrectCount + metrics.unansweredCount} />
            <AdminStatStripItem icon={Clock} iconClassName="text-status-info" label={t("quizAnalytics.timeSpent")} value={formatDuration(metrics.durationSeconds, t("quizAnalytics.minuteShort"), t("quizAnalytics.secondShort"))} />
            <AdminStatStripItem
              icon={TrendingUp}
              label={t("quizAnalytics.progress")}
              value={metrics.historicalComparison.overallImprovementDelta >= 0 ? `+${metrics.historicalComparison.overallImprovementDelta}%` : `${metrics.historicalComparison.overallImprovementDelta}%`}
              iconClassName="text-brand-secondary"
            />
          </AdminStatStrip>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          LAYER 2: DIAGNOSIS TERPERINCI (DETAILED DIAGNOSTICS)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* SECTION A: PENGUASAAN KONSEP (CONCEPT MASTERY TABLE) */}
        {metrics && metrics.conceptMastery.length > 0 && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
                  <Target className="size-4 text-brand-primary" /> {t("quizAnalytics.conceptMastery")}
                </h4>
                <p className="text-body-xs text-muted-foreground">
                  {t("quizAnalytics.masteryDescription")}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold text-body-xs uppercase tracking-wider">
                    <th className="py-2.5 px-3">{t("quizAnalytics.concept")}</th>
                    <th className="py-2.5 px-3 text-center">{t("quizAnalytics.questions")}</th>
                    <th className="py-2.5 px-3">{t("quizAnalytics.masteryLevel")}</th>
                    <th className="py-2.5 px-3">{t("quizAnalytics.status")}</th>
                    <th className="py-2.5 px-3">{t("quizAnalytics.trend")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {metrics.conceptMastery.map((c, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-foreground"><MathText as="span">{c.concept}</MathText></div>
                        {c.subconcepts && c.subconcepts.length > 0 && (
                          <div className="text-body-xs text-muted-foreground mt-0.5">
                            {t("quizAnalytics.subconcepts")}: <MathText as="span">{c.subconcepts.join(", ")}</MathText>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-medium">
                        {c.correctCount} / {c.totalQuestions}
                      </td>
                      <td className="py-3 px-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-full max-w-[100px] rounded-md bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-md transition-all duration-500 ${getAccuracyBarColor(c.accuracyPercent)}`}
                              style={{ width: `${c.accuracyPercent}%` }}
                            />
                          </div>
                          <span className="font-bold text-body-xs text-foreground">{c.accuracyPercent}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className={`rounded-md ${getMasteryBadgeClass(c.status)}`}>
                          {t(`quizAnalytics.mastery.${c.status}`)}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-body-xs text-muted-foreground">
                        {getTrendLabel(c.trend, c.previousAccuracyPercent, {
                          improving: t("quizAnalytics.trendImproving", { percent: c.previousAccuracyPercent ?? 0 }),
                          declining: t("quizAnalytics.trendDeclining", { percent: c.previousAccuracyPercent ?? 0 }),
                          stable: t("quizAnalytics.trendStable", { percent: c.previousAccuracyPercent ?? 0 }),
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION B: KEKUATAN SISWA & AREA FOKUS (STRENGTHS & FOCUS AREAS) */}
        {(Boolean(diagnosis?.strengths?.length) || Boolean(diagnosis?.focus_areas?.length)) && <div className={`grid grid-cols-1 gap-6 ${diagnosis?.strengths?.length && diagnosis?.focus_areas?.length ? "md:grid-cols-2" : ""}`}>
          {/* Strengths Card */}
          {Boolean(diagnosis?.strengths?.length) && <div className="space-y-3 border-t border-border pt-4">
            <h4 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="size-5 text-status-success" /> {t("quizAnalytics.strengths")}
            </h4>
            {diagnosis?.strengths && (
              <div className="space-y-3">
                {diagnosis.strengths.map((item, i) => (
                  <div key={i} className="border-b border-border/60 py-3 space-y-1.5 last:border-0">
                    <div className="font-heading text-body-base font-bold text-foreground"><MathText as="span">{item.title}</MathText></div>
                    <p className="text-body-sm text-muted-foreground leading-snug"><MathText as="span">{item.description}</MathText></p>
                    {item.evidence && item.evidence.length > 0 && (
                      <div className="mt-1 flex items-start gap-1.5 rounded-md bg-brand-primary/5 p-2 text-body-xs font-medium text-foreground">
                        <CheckCircle2 className="size-4 shrink-0 text-brand-primary" aria-hidden="true" /> <MathText as="span">{item.evidence[0].observation}</MathText>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>}

          {/* Focus Areas Card */}
          {Boolean(diagnosis?.focus_areas?.length) && <div className="space-y-3 border-t border-border pt-4">
            <h4 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
              <Target className="size-5 text-status-warning" /> {t("quizAnalytics.focusAreas")}
            </h4>
            {diagnosis?.focus_areas && (
              <div className="space-y-3">
                {diagnosis.focus_areas.map((item, i) => (
                  <div key={i} className="border-b border-border/60 py-3 space-y-1.5 last:border-0">
                    <div className="font-heading text-body-base font-bold text-foreground"><MathText as="span">{item.title}</MathText></div>
                    <p className="text-body-sm text-muted-foreground leading-snug"><MathText as="span">{item.description}</MathText></p>
                    <div className="mt-1 flex items-start gap-1.5 rounded-md bg-status-warning/10 p-2 text-body-xs font-medium text-foreground">
                      <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" /> <MathText as="span">{item.importance}</MathText>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>}
        </div>}

        {/* SECTION C: POLA KESALAHAN (ERROR PATTERNS) */}
        {diagnosis?.error_patterns && diagnosis.error_patterns.length > 0 && (
          <div className="space-y-3 border-t border-border pt-3">
            <h4 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="size-5 text-brand-secondary" /> {t("quizAnalytics.errorPatterns")}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {diagnosis.error_patterns.map((errItem, idx) => (
                <div key={idx} className="border-b border-border/60 py-3 space-y-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-body-base font-bold text-foreground"><MathText as="span">{errItem.title}</MathText></span>
                    <Badge variant="outline" className="rounded-md border-border text-body-xs uppercase font-medium">
                      {t(`quizAnalytics.errorCategory.${errItem.category}`)}
                    </Badge>
                  </div>
                  <p className="text-body-sm text-muted-foreground leading-snug"><MathText as="span">{errItem.description}</MathText></p>
                  <div className="rounded-md bg-muted/50 p-2.5 text-body-xs text-foreground mt-2 border border-border/50">
                    <span className="font-bold text-brand-primary block mb-0.5">{t("quizAnalytics.correctionStrategy")}</span>
                    <MathText as="span">{errItem.correction_strategy}</MathText>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION D: KEMAMPUAN KOGNITIF & KECEPATAN */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cognitive Skills Matrix */}
            {metrics.cognitiveSkills.length > 0 && <div className="space-y-3 border-t border-border pt-3">
              <h4 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
                <BarChart3 className="size-5 text-brand-primary" /> {t("quizAnalytics.cognitiveSkills")}
              </h4>
              <div className="space-y-3">
                {metrics.cognitiveSkills.map((s, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-body-xs font-semibold">
                      <span className="text-foreground">{s.skill}</span>
                      <span className="text-muted-foreground">{s.correctCount}/{s.totalQuestions} ({s.accuracyPercent}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-md bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-md transition-all duration-500 ${getAccuracyBarColor(s.accuracyPercent)}`}
                        style={{ width: `${s.accuracyPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>}

            {/* Time & Speed Insights */}
            <div className="space-y-3 border-t border-border pt-3">
              <h4 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
                <Zap className="size-5 text-tertiary-1" /> {t("quizAnalytics.speedEfficiency")}
              </h4>
              <div className="space-y-3 text-body-sm">
                <div className="flex justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">{t("quizAnalytics.averageTimePerQuestion")}</span>
                  <span className="font-bold text-foreground">{t("quizAnalytics.seconds", { count: metrics.timeAnalysis.avgTimePerQuestionSeconds })}</span>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">{t("quizAnalytics.veryFastAnswers")}</span>
                  <span className="font-bold text-foreground">{t("quizAnalytics.questionCount", { count: metrics.timeAnalysis.fastAnswerCount })}</span>
                </div>
                {metrics.timeAnalysis.fastIncorrectCount > 0 && (
                  <div className="flex items-start gap-1.5 rounded-md bg-status-warning/10 p-2.5 text-body-xs font-medium text-foreground">
                    <TriangleAlert className="size-4 shrink-0 text-status-warning" aria-hidden="true" /> {t("quizAnalytics.fastIncorrectWarning", { count: metrics.timeAnalysis.fastIncorrectCount })}
                  </div>
                )}
                {diagnosis?.time_insights && diagnosis.time_insights.length > 0 && (
                  <div className="text-body-xs text-muted-foreground leading-relaxed pt-1">
                    <span className="font-semibold text-foreground block">{t("quizAnalytics.timeNotes")}</span>
                    <MathText as="span">{`${diagnosis.time_insights[0].observation} ${diagnosis.time_insights[0].suggestion}`}</MathText>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          LAYER 3: RENCANA BELAJAR PERSONAL (3-STEP ACTION PLAN)
          ───────────────────────────────────────────────────────────────────────── */}
      <div className="@container/study-plan space-y-4 pt-4 border-t border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
            <BookOpen className="size-5 text-brand-primary" /> {t("quizAnalytics.studyPlan")}
          </h3>
          {diagnosis?.study_plan?.length ? (
            <Button asChild size="lg">
              <Link href={href(`/courses/${courseId}`)}>
                {t("quizAnalytics.startLearning")}
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>

        {diagnosis?.study_plan && diagnosis.study_plan.length > 0 ? (
          <div className="divide-y divide-border">
            {diagnosis.study_plan.map((step, idx) => (
              <div
                key={idx}
                className="py-3"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="rounded-md border-brand-primary/40 bg-brand-primary/10 text-brand-primary font-bold text-body-xs">
                      {t("quizAnalytics.priority", { number: step.priority || idx + 1 })}
                    </Badge>
                  </div>

                  <h4 className="font-heading text-body-base font-bold text-foreground">
                    <MathText as="span">{step.focus}</MathText>
                  </h4>

                  <p className="text-body-sm text-muted-foreground leading-snug">
                    <MathText as="span">{step.reason}</MathText>
                  </p>

                  <p className="text-body-sm font-medium leading-snug text-foreground"><MathText as="span">{step.action}</MathText></p>

                  <div className="text-body-xs text-foreground font-medium flex items-start gap-1.5">
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-status-success" />
                    <span>{t("quizAnalytics.successCheck")} <MathText as="span">{step.success_check}</MathText></span>
                  </div>
                </div>

              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-body-sm text-muted-foreground">
              {t("quizAnalytics.keepGoing")}
            </p>
            <Button asChild variant="outline" size="sm" className="rounded-md border-border">
              <Link href={href(`/courses/${courseId}`)}>{t("quizAnalytics.backToCourse")}</Link>
            </Button>
          </div>
        )}

        {/* Encouragement Footer */}
        {diagnosis?.encouragement && (
          <div className="border-t border-border py-3">
            <p className="font-heading text-body-base font-semibold text-foreground italic">
              &ldquo;<MathText as="span">{diagnosis.encouragement}</MathText>&rdquo;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function getPerformanceBadgeClass(level: string): string {
  switch (level) {
    case "excellent":
      return "border-status-success/40 bg-status-success/10 text-status-success";
    case "good":
      return "border-brand-primary/40 bg-brand-primary/10 text-brand-primary";
    case "developing":
      return "border-brand-secondary/40 bg-brand-secondary/10 text-brand-secondary";
    default:
      return "border-status-warning/40 bg-status-warning/10 text-status-warning";
  }
}

function getMasteryBadgeClass(status: string): string {
  switch (status) {
    case "strong":
      return "border-status-success/40 bg-status-success/10 text-status-success";
    case "adequate":
      return "border-brand-primary/40 bg-brand-primary/10 text-brand-primary";
    case "developing":
      return "border-brand-secondary/40 bg-brand-secondary/10 text-brand-secondary";
    case "needs_reinforcement":
      return "border-status-error/40 bg-status-error/10 text-status-error";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function getAccuracyBarColor(acc: number): string {
  if (acc >= 85) return "bg-status-success";
  if (acc >= 70) return "bg-brand-primary";
  if (acc >= 50) return "bg-brand-secondary";
  return "bg-status-error";
}

function getTrendLabel(trend: string | undefined, _prevAcc: number | undefined, labels: { improving: string; declining: string; stable: string }): string {
  if (trend === "improving") return `↗ ${labels.improving}`;
  if (trend === "declining") return `↘ ${labels.declining}`;
  if (trend === "stable") return `→ ${labels.stable}`;
  return "-";
}

function formatDuration(totalSeconds: number, minuteLabel: string, secondLabel: string): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs} ${secondLabel}`;
  return `${mins} ${minuteLabel} ${secs} ${secondLabel}`;
}
