"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { useQuizAnalytics } from "@/hooks/use-quiz-analytics";
import { ApiError } from "@/lib/query/http";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMobilePageActions } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavActionButton } from "@/components/navigation/mobile-top-navbar";
import type { QuizAnalyticsData } from "@/lib/quiz/analytics-client";
export type { QuizAnalyticsData } from "@/lib/quiz/analytics-client";
import {
  Brain,
  CalendarCheck,
  CheckCircle2,
  ListChecks,
  ShieldCheck,
  Target,
  Timer,
  Waypoints,
  type LucideIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  ArrowUpRight,
  Minus,
  TrendingDown,
  TrendingUp,
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
    : <Skeleton className="h-40" aria-busy="true" />}
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
                  {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Icon aria-hidden />}
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
    return <div className="flex flex-wrap items-center gap-2 py-(--related-gap) text-body-sm" role="alert">
      <TriangleAlert className="size-4 shrink-0 text-status-error" aria-hidden />
      <span>{t("attemptReview.loadFailed")}</span>
      <Button variant="ghost" size="sm" onClick={fetchAnalytics}>{t("attemptReview.retry")}</Button>
    </div>;
  }

  if (loading && !data) {
    return (
      <div className="@container space-y-(--major-gap)" role="status" aria-busy="true">
        <span className="sr-only">{t("quizAnalytics.loadingTitle")}</span>
        <div aria-hidden className="grid gap-(--related-gap) @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:gap-x-(--major-gap)">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="divide-y divide-border/30">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center justify-between py-(--table-row-padding)">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
        <div aria-hidden className="space-y-(--compact-gap)">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (!metrics && !diagnosis) {
    return (
      <div className="max-w-xl space-y-(--related-gap) py-(--group-gap)">
        <div className="space-y-1">
          <h2 className="font-heading text-body-base font-bold text-foreground">{t("quizAnalytics.notGeneratedTitle")}</h2>
          <p className="text-body-sm text-muted-foreground leading-relaxed">
            {t("quizAnalytics.notGeneratedDescription")}
          </p>
        </div>
        {handleRecompute && <Button
          onClick={handleRecompute}
          disabled={recomputing}
          className="bg-foreground text-background hover:bg-foreground/85"
        >
          {recomputing && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          {recomputing ? t("quizAnalytics.generating") : t("quizAnalytics.generate")}
        </Button>}
      </div>
    );
  }

  const { study_plan: studyPlan = [], error_patterns: errorPatterns = [], focus_areas: focusAreas = [], strengths = [], time_insights: timeInsights = [] } = diagnosis ?? {};
  const hasConceptDetails = Boolean(metrics?.conceptMastery.length || errorPatterns.length);
  const hasSupportingDetails = Boolean(metrics || strengths.length || focusAreas.length);

  return (
    <div className="@container min-w-0">
      <div className="space-y-(--major-gap)">
        {error && <div className="flex flex-wrap items-center gap-2 text-body-sm" role="alert">
          <TriangleAlert className="size-4 shrink-0 text-status-error" aria-hidden />
          <span>{t("attemptReview.loadFailed")}</span>
          <Button variant="ghost" size="sm" onClick={fetchAnalytics}>{t("attemptReview.retry")}</Button>
        </div>}
        {isProcessing && (
          <div role="status" className="flex items-start gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
            <span>{t("quizAnalytics.analysisInProgress")}</span>
          </div>
        )}

        <div className={cn("min-w-0 space-y-(--related-gap)", metrics && "@3xl:grid @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:items-start @3xl:gap-x-(--major-gap) @3xl:gap-y-(--section-gap) @3xl:space-y-0")}>
          <section className="min-w-0 space-y-2 @3xl:col-start-1 @3xl:row-start-1">
            <div className="flex items-start justify-between gap-(--compact-gap)">
              <div className="min-w-0 space-y-1">
                {metrics && diagnosis?.headline && diagnosis.headline !== metrics.quizTitle && (
                  <p className="m-0 wrap-anywhere text-body-xs text-muted-foreground">{metrics.quizTitle}</p>
                )}
                <h2 className="font-heading text-body-base font-bold text-foreground">
                  <MathText as="span" className="wrap-anywhere">{diagnosis?.headline || metrics?.quizTitle || t("quizAnalytics.detailedTitle")}</MathText>
                </h2>
              </div>
              {!reportActionInNavbar && reportActions}
            </div>
            {diagnosis?.overall_summary && (
              <MathText as="div" className="max-w-prose wrap-anywhere text-body-base text-foreground">{diagnosis.overall_summary}</MathText>
            )}
          </section>
          {metrics && (
            <dl className="divide-y divide-border/30 text-body-sm @3xl:col-start-2 @3xl:row-[1/span_2]" data-quiz-analysis-metrics="">
              <AnalysisMetric label={t("quizAnalytics.totalScore")}>
                {metrics.score}%
                <span className="ml-2 text-body-xs font-normal text-muted-foreground">
                  {t(`quizAnalytics.performance.${diagnosis?.performance_level || (metrics.score >= 75 ? "good" : "developing")}`)}
                </span>
              </AnalysisMetric>
              <AnalysisMetric label={t("quizAnalytics.correctAnswers")}>{metrics.correctCount} / {metrics.totalQuestions}</AnalysisMetric>
              <AnalysisMetric label={t("quizAnalytics.incorrectOrBlank")}>{metrics.incorrectCount + metrics.unansweredCount}</AnalysisMetric>
              <AnalysisMetric label={t("quizAnalytics.timeSpent")}>
                {formatDuration(metrics.durationSeconds, t("quizAnalytics.minuteShort"), t("quizAnalytics.secondShort"))}
              </AnalysisMetric>
              <AnalysisMetric label={t("quizAnalytics.progress")}>
                {t("quizAnalytics.scorePoints", { value: `${metrics.historicalComparison.overallImprovementDelta > 0 ? "+" : ""}${metrics.historicalComparison.overallImprovementDelta}` })}
              </AnalysisMetric>
            </dl>
          )}

          {studyPlan.length > 0 && (
            <div className="@3xl:col-start-1 @3xl:row-start-2">
              <AnalysisSection
                icon={CalendarCheck}
                title={t("quizAnalytics.studyPlan")}
                actions={
                  <Button asChild variant="outline" className="h-auto min-h-9 w-full whitespace-normal sm:w-auto">
                    <Link href={href(`/courses/${courseId}`)}>{t("quizAnalytics.backToCourse")}<ArrowUpRight aria-hidden /></Link>
                  </Button>
                }
              >
                <ol className="divide-y divide-border/30">
                  {studyPlan.map((step, index) => (
                    <li key={index} className="space-y-1.5 py-(--row-padding) first:pt-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-(--compact-gap) gap-y-1">
                        <h4 className="min-w-0 wrap-anywhere font-heading text-body-sm font-bold"><MathText as="span">{step.focus}</MathText></h4>
                        <span className="text-body-xs tabular-nums text-muted-foreground">{t("quizAnalytics.priority", { number: step.priority || index + 1 })}</span>
                      </div>
                      <MathText as="div" className="max-w-prose wrap-anywhere text-body-sm text-muted-foreground">{step.reason}</MathText>
                      <MathText as="div" className="max-w-prose wrap-anywhere text-body-base font-medium">{step.action}</MathText>
                      <div className="flex items-start gap-1.5 text-body-xs">
                        <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-hidden />
                        <div className="min-w-0 wrap-anywhere">{t("quizAnalytics.successCheck")} <MathText as="span">{step.success_check}</MathText></div>
                      </div>
                    </li>
                  ))}
                </ol>
              </AnalysisSection>
            </div>
          )}
        </div>

        {(hasConceptDetails || hasSupportingDetails) && (
          <div className={cn("grid min-w-0 items-start gap-(--major-gap)", hasConceptDetails && hasSupportingDetails && "@5xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
            {hasConceptDetails && (
              <div className="min-w-0 space-y-(--major-gap)">
                {metrics && metrics.conceptMastery.length > 0 && (
                  <AnalysisSection icon={Waypoints} title={t("quizAnalytics.conceptMastery")}>
                    <p className="m-0 text-body-xs text-muted-foreground">{t("quizAnalytics.masteryDescription")}</p>
                    <ConceptMastery concepts={metrics.conceptMastery} />
                  </AnalysisSection>
                )}
                {errorPatterns.length > 0 && (
                  <AnalysisSection icon={ListChecks} title={t("quizAnalytics.errorPatterns")}>
                    <ul className="divide-y divide-border/30">
                      {errorPatterns.map((item, index) => (
                        <li key={index} className="space-y-1.5 py-(--row-padding) first:pt-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <h4 className="min-w-0 wrap-anywhere font-heading text-body-sm font-bold"><MathText as="span">{item.title}</MathText></h4>
                            <span className="text-body-xs text-muted-foreground">{t(`quizAnalytics.errorCategory.${item.category}`)}</span>
                          </div>
                          <MathText as="div" className="wrap-anywhere text-body-base">{item.description}</MathText>
                          <div className="wrap-anywhere text-body-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">{t("quizAnalytics.correctionStrategy")}</span>{" "}
                            <MathText as="span">{item.correction_strategy}</MathText>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </AnalysisSection>
                )}
              </div>
            )}

            {hasSupportingDetails && (
              <div className="min-w-0 space-y-(--major-gap)">
                {focusAreas.length > 0 && (
                  <AnalysisSection icon={Target} title={t("quizAnalytics.focusAreas")}>
                    <ul className="divide-y divide-border/30">
                      {focusAreas.map((item, index) => (
                        <li key={index} className="space-y-1.5 py-(--row-padding) first:pt-0">
                          <h4 className="wrap-anywhere font-heading text-body-sm font-bold"><MathText as="span">{item.title}</MathText></h4>
                          <MathText as="div" className="wrap-anywhere text-body-base">{item.description}</MathText>
                          <MathText as="div" className="wrap-anywhere text-body-sm text-muted-foreground">{item.importance}</MathText>
                        </li>
                      ))}
                    </ul>
                  </AnalysisSection>
                )}

                {strengths.length > 0 && (
                  <AnalysisSection icon={ShieldCheck} title={t("quizAnalytics.strengths")}>
                    <ul className="divide-y divide-border/30">
                      {strengths.map((item, index) => (
                        <li key={index} className="space-y-1.5 py-(--row-padding) first:pt-0">
                          <h4 className="wrap-anywhere font-heading text-body-sm font-bold"><MathText as="span">{item.title}</MathText></h4>
                          <MathText as="div" className="wrap-anywhere text-body-base">{item.description}</MathText>
                          {item.evidence?.[0] && <MathText as="div" className="wrap-anywhere text-body-sm text-muted-foreground">{item.evidence[0].observation}</MathText>}
                        </li>
                      ))}
                    </ul>
                  </AnalysisSection>
                )}

                {metrics && metrics.cognitiveSkills.length > 0 && (
                  <AnalysisSection icon={Brain} title={t("quizAnalytics.cognitiveSkills")}>
                    <ul className="divide-y divide-border/30">
                      {metrics.cognitiveSkills.map((skill, index) => (
                        <li key={index} className="space-y-1.5 py-(--table-row-padding) first:pt-0">
                          <div className="flex flex-wrap justify-between gap-x-(--compact-gap) gap-y-1 text-body-sm">
                            <span className="min-w-0 wrap-anywhere">{skill.skill}</span>
                            <span className="tabular-nums">{skill.correctCount} / {skill.totalQuestions} ({skill.accuracyPercent}%)</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-sm bg-muted" aria-hidden>
                            <div className="h-full bg-foreground/65" style={{ width: `${skill.accuracyPercent}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </AnalysisSection>
                )}

                {metrics && (
                  <AnalysisSection icon={Timer} title={t("quizAnalytics.speedEfficiency")}>
                    <dl className="divide-y divide-border/30 text-body-sm">
                      <AnalysisMetric label={t("quizAnalytics.averageTimePerQuestion")}>{t("quizAnalytics.seconds", { count: metrics.timeAnalysis.avgTimePerQuestionSeconds })}</AnalysisMetric>
                      <AnalysisMetric label={t("quizAnalytics.veryFastAnswers")}>{t("quizAnalytics.questionCount", { count: metrics.timeAnalysis.fastAnswerCount })}</AnalysisMetric>
                    </dl>
                    {metrics.timeAnalysis.fastIncorrectCount > 0 && (
                      <p className="m-0 flex items-start gap-1.5 text-body-sm">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
                        {t("quizAnalytics.fastIncorrectWarning", { count: metrics.timeAnalysis.fastIncorrectCount })}
                      </p>
                    )}
                    {timeInsights[0] && (
                      <div className="wrap-anywhere text-body-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{t("quizAnalytics.timeNotes")}</span>{" "}
                        <MathText as="span">{`${timeInsights[0].observation} ${timeInsights[0].suggestion}`}</MathText>
                      </div>
                    )}
                  </AnalysisSection>
                )}
              </div>
            )}
          </div>
        )}

        {diagnosis?.encouragement && <MathText as="div" className="max-w-prose wrap-anywhere text-body-base text-muted-foreground">{diagnosis.encouragement}</MathText>}
      </div>
    </div>
  );
}

function AnalysisSection({ icon: Icon, title, actions, children }: { icon: LucideIcon; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-(--compact-gap)">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-start gap-2 font-heading text-body-base font-bold text-foreground">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 wrap-anywhere">{title}</span>
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function AnalysisMetric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-(--compact-gap) py-(--table-row-padding)">
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className="max-w-[55%] wrap-anywhere text-right font-semibold tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

type Concepts = NonNullable<QuizAnalyticsData["computedMetrics"]>["conceptMastery"];

const masteryDots = {
  strong: "bg-status-success",
  adequate: "bg-foreground/55",
  developing: "bg-status-warning",
  needs_reinforcement: "bg-status-error",
  insufficient_evidence: "bg-muted-foreground",
} satisfies Record<Concepts[number]["status"], string>;

function ConceptMastery({ concepts }: { concepts: Concepts }) {
  const t = useTranslations("studentCourse");
  const trend = (concept: Concepts[number]) => {
    const { trend, previousAccuracyPercent: percent } = concept;
    if (percent == null) return null;
    if (trend === "improving") return { Icon: TrendingUp, label: t("quizAnalytics.trendImproving", { percent }) };
    if (trend === "declining") return { Icon: TrendingDown, label: t("quizAnalytics.trendDeclining", { percent }) };
    if (trend === "stable") return { Icon: Minus, label: t("quizAnalytics.trendStable", { percent }) };
    return null;
  };
  return (
    <>
      <ul className="divide-y divide-border/30 md:hidden">
        {concepts.map((concept, index) => (
          <li key={index} className="space-y-1 py-(--row-padding)">
            <div className="flex items-start justify-between gap-(--compact-gap) text-body-sm">
              <ConceptTitle concept={concept} />
              <span className="shrink-0 font-semibold tabular-nums">{concept.accuracyPercent}%</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-(--compact-gap) gap-y-1 text-body-xs">
              <span className="tabular-nums text-muted-foreground">{t("quizAnalytics.questions")} {concept.correctCount} / {concept.totalQuestions}</span>
              <MasteryStatus status={concept.status} />
              <ConceptTrend value={trend(concept)} />
            </div>
          </li>
        ))}
      </ul>

      <table className="hidden w-full table-fixed text-left text-body-sm md:table">
        <thead className="border-b border-border/30 text-body-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-2/5 py-2.5 pr-3 font-medium">{t("quizAnalytics.concept")}</th>
            <th scope="col" className="w-[15%] py-2.5 pr-2 font-medium">{t("quizAnalytics.questions")}</th>
            <th scope="col" className="w-[15%] py-2.5 pr-2 font-medium">{t("quizAnalytics.masteryLevel")}</th>
            <th scope="col" className="w-[15%] py-2.5 pr-2 font-medium">{t("quizAnalytics.status")}</th>
            <th scope="col" className="w-[15%] py-2.5 font-medium">{t("quizAnalytics.trend")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {concepts.map((concept, index) => {
            const comparison = trend(concept);
            return (
              <tr key={index} className="align-top">
                <th scope="row" className="py-(--row-padding) pr-3 text-left font-normal"><ConceptTitle concept={concept} /></th>
                <td className="py-(--row-padding) pr-2 tabular-nums">{concept.correctCount} / {concept.totalQuestions}</td>
                <td className="py-(--row-padding) pr-2 font-semibold tabular-nums">{concept.accuracyPercent}%</td>
                <td className="py-(--row-padding) pr-2 text-body-xs"><MasteryStatus status={concept.status} /></td>
                <td className="py-(--row-padding) text-body-xs">{comparison ? <ConceptTrend value={comparison} /> : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function ConceptTitle({ concept }: { concept: Concepts[number] }) {
  const t = useTranslations("studentCourse");
  return (
    <div data-math-scroll className="min-w-0 space-y-1 overflow-x-auto">
      <MathText as="div" className="wrap-anywhere font-semibold text-foreground">{concept.concept}</MathText>
      {concept.subconcepts && concept.subconcepts.length > 0 && (
        <div className="wrap-anywhere text-body-xs text-muted-foreground">
          {t("quizAnalytics.subconcepts")}: <MathText as="span">{concept.subconcepts.join(", ")}</MathText>
        </div>
      )}
    </div>
  );
}

function MasteryStatus({ status }: { status: Concepts[number]["status"] }) {
  const t = useTranslations("studentCourse");
  return (
    <span className="inline-flex items-start gap-1.5 wrap-anywhere text-foreground">
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", masteryDots[status])} aria-hidden />
      {t(`quizAnalytics.mastery.${status}`)}
    </span>
  );
}

function ConceptTrend({ value }: { value: { Icon: typeof TrendingUp; label: string } | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-start gap-1 wrap-anywhere text-muted-foreground">
      <value.Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {value.label}
    </span>
  );
}

function formatDuration(totalSeconds: number, minuteLabel: string, secondLabel: string): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs} ${secondLabel}`;
  return `${mins} ${minuteLabel} ${secs} ${secondLabel}`;
}
