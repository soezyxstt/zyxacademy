"use client";

import { useCallback, useMemo } from "react";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { useQuizAnalytics } from "@/hooks/use-quiz-analytics";
import { ApiError } from "@/lib/query/http";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMobilePageActions } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavActionButton } from "@/components/navigation/mobile-top-navbar";
import type { QuizAnalyticsData } from "@/lib/quiz/analytics-client";
export type { QuizAnalyticsData } from "@/lib/quiz/analytics-client";
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Target,
  TriangleAlert,
  Zap,
  ArrowUpRight,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { MathText } from "@/components/course/math-text";
import { useTranslations } from "@/lib/i18n/client";

import { useStudentExperience } from "@/components/student-experience-provider";


interface QuizAnalyticsViewProps {
  initialData?: QuizAnalyticsData;
  attemptId: string;
  courseId: string;
}

export function QuizAnalyticsView({ attemptId, courseId, initialData }: QuizAnalyticsViewProps) {
  if (initialData) return <QuizAnalyticsContent courseId={courseId} data={initialData} loading={false} recomputing={false} />;
  return <StudentAccountBoundary>{({ data }) => data?.user
    ? <LiveQuizAnalytics key={`${data.user.id}:${attemptId}`} userId={data.user.id} attemptId={attemptId} courseId={courseId} />
    : <div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}
  </StudentAccountBoundary>;
}

function LiveQuizAnalytics({ userId, attemptId, courseId }: { userId: string; attemptId: string; courseId: string }) {
  const { query, recompute } = useQuizAnalytics(userId, attemptId);
  const accessDenied = [query.error, recompute.error].some((error) => error instanceof ApiError && [401, 403, 404, 409].includes(error.status));
  const { refetch } = query;
  const { reset, mutate } = recompute;
  const fetchAnalytics = useCallback(() => {
    void refetch().then((result) => { if (result.isSuccess) reset(); });
  }, [refetch, reset]);
  const handleRecompute = useCallback(() => mutate(), [mutate]);
  return <QuizAnalyticsContent
    courseId={courseId} data={accessDenied ? undefined : query.data} loading={query.isPending} recomputing={recompute.isPending}
    error={Boolean(query.error || recompute.error)}
    fetchAnalytics={fetchAnalytics}
    handleRecompute={handleRecompute}
  />;
}

function QuizAnalyticsContent({ courseId, data, loading, recomputing, error, fetchAnalytics, handleRecompute }: {
  courseId: string;
  data?: QuizAnalyticsData;
  loading: boolean;
  recomputing: boolean;
  error?: boolean;
  fetchAnalytics?: () => void;
  handleRecompute?: () => void;
}) {
  const t = useTranslations("studentCourse");
  const experience = useStudentExperience();
  const href = (path: string) => experience.href?.(path) ?? path;
  const metrics = data?.computedMetrics;
  const diagnosis = data?.aiDiagnosis;
  const isProcessing = data?.status === "processing";
  const refreshLabel = t("quizAnalytics.refreshStatus");
  const recomputeLabel = t("quizAnalytics.reanalyze");
  const reportActions = useMemo(() => {
    if (!metrics && !diagnosis) return null;
    const actions = [
      { key: "refresh", run: isProcessing ? fetchAnalytics : undefined, label: refreshLabel, Icon: RefreshCw, busy: false },
      { key: "reanalyze", run: handleRecompute, label: recomputeLabel, Icon: RotateCcw, busy: recomputing },
    ].filter(({ run }) => run);
    return actions.length ? (
      <TooltipProvider>
        <div className="flex shrink-0 gap-1">
          {actions.map(({ key, run, label, Icon, busy }) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <MobileTopNavActionButton label={label} onClick={run} disabled={busy} aria-busy={busy}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
                </MobileTopNavActionButton>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    ) : null;
  }, [diagnosis, fetchAnalytics, handleRecompute, isProcessing, metrics, recomputeLabel, recomputing, refreshLabel]);
  const reportActionInNavbar = useMobilePageActions(reportActions);

  if (error && !data) {
    return <div className="flex items-center gap-2 py-4 text-body-sm text-status-error" role="alert">
      <TriangleAlert className="size-4" />
      <span>{t("attemptReview.loadFailed")}</span>
      <Button variant="ghost" size="sm" onClick={fetchAnalytics}>{t("attemptReview.retry")}</Button>
    </div>;
  }

  if (loading && !data) {
    return (
      <div className="space-y-6 font-sans" role="status" aria-busy="true">
        <span className="sr-only">{t("quizAnalytics.loadingTitle")}</span>
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2.5 flex-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <div className="h-5 w-28 animate-pulse rounded-md bg-muted" />
                <div className="h-5 w-20 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-6 w-3/4 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="flex items-center gap-3 md:border-l md:border-border/70 md:pl-5">
              <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
              <div className="h-6 w-20 animate-pulse rounded-md bg-muted" />
            </div>
          </div>

          <div className="divide-y divide-border/55 border-y border-border/55">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="flex items-center justify-between py-1.5">
                <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
                <div className="h-4 w-12 animate-pulse rounded-md bg-muted" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="h-5 w-44 animate-pulse rounded-md bg-muted" />
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-11 w-full animate-pulse rounded-lg bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const conceptTrend = (concept: NonNullable<typeof metrics>["conceptMastery"][number]) => {
    const percent = concept.previousAccuracyPercent ?? 0;
    return getTrendLabel(concept.trend, concept.previousAccuracyPercent, {
      improving: t("quizAnalytics.trendImproving", { percent }),
      declining: t("quizAnalytics.trendDeclining", { percent }),
      stable: t("quizAnalytics.trendStable", { percent }),
    });
  };

  if (!metrics && !diagnosis) {
    return (
      <div className="max-w-xl space-y-(--related-gap) border-t border-border/55 py-(--group-gap)">
        <div className="space-y-1">
          <h3 className="font-heading text-body-base font-bold text-foreground">{t("quizAnalytics.notGeneratedTitle")}</h3>
          <p className="text-body-sm text-muted-foreground leading-relaxed">
            {t("quizAnalytics.notGeneratedDescription")}
          </p>
        </div>
        {handleRecompute && <Button
          onClick={handleRecompute}
          disabled={recomputing}
          className="bg-foreground text-background hover:bg-foreground/85"
        >
          {recomputing && <Loader2 className="mr-2 size-4 animate-spin" />}
          {recomputing ? t("quizAnalytics.generating") : t("quizAnalytics.generate")}
        </Button>}
      </div>
    );
  }

  return (
    <div className="space-y-(--group-gap) font-sans">
      {error && <div className="flex items-center gap-2 text-body-sm text-status-error" role="alert">
        <TriangleAlert className="size-4" />
        <span>{t("attemptReview.loadFailed")}</span>
        <Button variant="ghost" size="sm" onClick={fetchAnalytics}>{t("attemptReview.retry")}</Button>
      </div>}
      {isProcessing && (
        <div role="status" className="flex items-start gap-2 border-b border-border/55 pb-2 text-body-sm text-muted-foreground">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
          <p className="m-0">
            <span className="font-semibold text-foreground">{t("quizAnalytics.analysisInProgress")}</span>{" "}
            {t("quizAnalytics.analysisInProgressDescription")}
          </p>
        </div>
      )}

      <section className="min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {metrics && <p className="m-0 wrap-anywhere text-body-xs text-muted-foreground">{metrics.quizTitle}</p>}
            <h2 className="font-heading text-body-base font-bold text-foreground">
              <MathText as="span">{diagnosis?.headline || t("quizAnalytics.quizResult", { score: metrics?.score ?? 0, correct: metrics?.correctCount ?? 0, total: metrics?.totalQuestions ?? 0 })}</MathText>
            </h2>
          </div>
          {!reportActionInNavbar && reportActions}
        </div>
        <p className="m-0 text-body-base text-muted-foreground">
          <MathText as="span">{diagnosis?.overall_summary || t("quizAnalytics.quizCompleted", { count: metrics?.totalQuestions ?? 0 })}</MathText>
        </p>
        {metrics && (
          <dl className="divide-y divide-border/55 border-y border-border/55 text-body-sm" data-quiz-analysis-metrics="">
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">{t("quizAnalytics.totalScore")}</dt>
              <dd className="flex flex-wrap items-baseline justify-end gap-x-2 text-right tabular-nums">
                <span className="font-semibold">{metrics.score}%</span>
                <span className="text-body-xs text-muted-foreground">
                  {t(`quizAnalytics.performance.${diagnosis?.performance_level || (metrics.score >= 75 ? "good" : "developing")}`)}
                </span>
              </dd>
            </div>
            {[
              [t("quizAnalytics.correctAnswers"), `${metrics.correctCount} / ${metrics.totalQuestions}`],
              [t("quizAnalytics.incorrectOrBlank"), metrics.incorrectCount + metrics.unansweredCount],
              [t("quizAnalytics.timeSpent"), formatDuration(metrics.durationSeconds, t("quizAnalytics.minuteShort"), t("quizAnalytics.secondShort"))],
              [t("quizAnalytics.progress"), `${metrics.historicalComparison.overallImprovementDelta >= 0 ? "+" : ""}${metrics.historicalComparison.overallImprovementDelta}%`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <div className="space-y-(--group-gap)">
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

            <ul className="divide-y divide-border/55 border-y border-border/55 md:hidden">
              {metrics.conceptMastery.map((concept, index) => (
                <li key={index} className="space-y-1 py-(--row-padding)">
                  <div className="flex items-start justify-between gap-3 text-body-sm">
                    <p className="min-w-0 wrap-anywhere font-semibold"><MathText as="span">{concept.concept}</MathText></p>
                    <span className="shrink-0 font-semibold tabular-nums">{concept.accuracyPercent}%</span>
                  </div>
                  {Boolean(concept.subconcepts?.length) && (
                    <p className="text-body-xs text-muted-foreground">
                      {t("quizAnalytics.subconcepts")}: <MathText as="span">{concept.subconcepts?.join(", ") ?? ""}</MathText>
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-muted-foreground">
                    <span className="tabular-nums">{t("quizAnalytics.questions")} {concept.correctCount} / {concept.totalQuestions}</span>
                    <span>{t(`quizAnalytics.mastery.${concept.status}`)}</span>
                    <span>{conceptTrend(concept)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border/55 text-body-xs font-semibold text-muted-foreground">
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
                        {conceptTrend(c)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION B: KEKUATAN SISWA & AREA FOKUS (STRENGTHS & FOCUS AREAS) */}
        {(Boolean(diagnosis?.strengths?.length) || Boolean(diagnosis?.focus_areas?.length)) && <div className="space-y-(--group-gap)">
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
                      <div className="flex items-start gap-1.5 text-body-xs text-muted-foreground">
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
                    <div className="flex items-start gap-1.5 text-body-xs text-muted-foreground">
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
            <div className="divide-y divide-border/55">
              {diagnosis.error_patterns.map((errItem, idx) => (
                <div key={idx} className="border-b border-border/60 py-3 space-y-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-body-base font-bold text-foreground"><MathText as="span">{errItem.title}</MathText></span>
                    <Badge variant="outline" className="rounded-md border-border text-body-xs uppercase font-medium">
                      {t(`quizAnalytics.errorCategory.${errItem.category}`)}
                    </Badge>
                  </div>
                  <p className="text-body-sm text-muted-foreground leading-snug"><MathText as="span">{errItem.description}</MathText></p>
                  <div className="border-l-2 border-border/60 pl-2 text-body-xs text-muted-foreground">
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
          <div className="space-y-(--group-gap)">
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
                  <div className="flex items-start gap-1.5 text-body-xs text-muted-foreground">
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
      <div className="space-y-2 border-t border-border/55 pt-(--compact-gap)">
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
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <h4 className="font-heading text-body-base font-bold text-foreground">
                      <MathText as="span">{step.focus}</MathText>
                    </h4>
                    <span className="text-body-xs text-muted-foreground">
                      {t("quizAnalytics.priority", { number: step.priority || idx + 1 })}
                    </span>
                  </div>

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
          <p className="text-body-sm text-muted-foreground">
            {t("quizAnalytics.keepGoing")}
          </p>
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
