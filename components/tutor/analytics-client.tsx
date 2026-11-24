"use client";

import { useCallback, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ScanSearch,
  Target,
  Users,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MathText } from "@/components/course/math-text";
import { useMobilePageActions } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavActionButton } from "@/components/navigation/mobile-top-navbar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Reveal } from "@/components/ui/reveal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DistributionBar } from "@/components/tutor/distribution-bar";
import { ConceptRanking } from "@/components/tutor/concept-ranking";
import { WatchlistTable } from "@/components/tutor/watchlist-table";
import { ConceptDrilldown } from "@/components/tutor/concept-drilldown";
import type { SnapshotPayload, WeakConcept } from "@/lib/cohort-analytics";

function relativeTime(date: Date, locale: string, justNow: string): string {
  const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (hours < 1) return justNow;
  return new Intl.RelativeTimeFormat(locale === "id" ? "id-ID" : "en-US", { numeric: "auto" }).format(-hours, "hour");
}

interface Props {
  courseId: string;
  analytics: SnapshotPayload;
  updatedAt: string | null;
}

const sectionTitle = "flex min-w-0 items-center gap-2 font-heading text-body-base font-bold text-foreground";
const headingIcon = "size-4 shrink-0 text-muted-foreground";
const metadata = "text-body-xs tabular-nums text-muted-foreground";

export function AnalyticsClient({ courseId, analytics, updatedAt }: Props) {
  const router = useRouter();
  const t = useTranslations("tutor.analytics");
  const routeT = useTranslations("tutor.routeTitles");
  const { locale } = useAppLocale();
  const [isPending, startTransition] = useTransition();
  const [drillConcept, setDrillConcept] = useState<WeakConcept | null>(null);
  const conceptLabelPrefix = useId();
  const drillTrigger = useRef<HTMLButtonElement | null>(null);
  const refreshLabel = t("refresh");
  const refreshFailed = t("refreshFailed");

  const handleRefresh = useCallback(() => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/tutor/analytics/refresh?courseId=${encodeURIComponent(courseId)}`, {
          method: "POST",
        });
        if (!response.ok) throw new Error("Refresh failed");
        startTransition(() => { router.refresh(); });
      } catch {
        toast.error(refreshFailed);
      }
    });
  }, [courseId, refreshFailed, router]);

  const refreshAction = useMemo(() => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <MobileTopNavActionButton label={refreshLabel} aria-busy={isPending} disabled={isPending} onClick={handleRefresh}>
            <RefreshCw className={isPending ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden />
          </MobileTopNavActionButton>
        </TooltipTrigger>
        <TooltipContent>{refreshLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ), [handleRefresh, isPending, refreshLabel]);
  const refreshInNavbar = useMobilePageActions(refreshAction);

  const priorityNames = new Set(analytics.weakConcepts.map((concept) => concept.conceptName));
  const otherConcepts = analytics.allConcepts.filter((concept) => !priorityNames.has(concept.conceptName));
  const drillTrends = drillConcept ? (analytics.conceptTrends[drillConcept.conceptName] ?? []) : [];
  const drillMissed = drillConcept ? (analytics.mostMissed[drillConcept.conceptName] ?? []) : [];
  const headlineMetrics = [
    { label: routeT("enrolled"), value: analytics.enrolledCount },
    { label: routeT("activeThisWeek"), value: analytics.activeCount },
    ...(analytics.engagement.quizParticipationPct > 0
      ? [{ label: routeT("quizParticipation"), value: `${analytics.engagement.quizParticipationPct}%` }]
      : []),
  ];

  return (
    <div className="space-y-(--section-gap)">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-(--related-gap) gap-y-2 border-b border-border/40 pb-3">
        <dl className="flex min-w-0 flex-wrap items-baseline gap-x-(--related-gap) gap-y-1">
          {headlineMetrics.map(({ label, value }) => (
            <div key={label} className="flex flex-wrap items-baseline gap-x-1.5">
              <dt className={metadata}>{label}</dt>
              <dd className="text-body-sm font-semibold tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex min-w-0 items-center gap-2">
          <span className={metadata} aria-live="polite">
            {updatedAt ? (
              <time dateTime={updatedAt}>{t("updated", { relative: relativeTime(new Date(updatedAt), locale, t("justNow")) })}</time>
            ) : t("notCalculated")}
          </span>
          {!refreshInNavbar && refreshAction}
        </div>
      </div>

      <Reveal>
        <div className="grid items-start gap-y-8 xl:grid-cols-12 xl:gap-x-10">
          <section className="min-w-0 space-y-3 xl:col-span-7" aria-labelledby="weak-heading">
            <h2 id="weak-heading" className={`${sectionTitle} border-b border-border/40 pb-2`}>
              <Target className={headingIcon} aria-hidden />
              {t("priorityConcepts")}
            </h2>
            {analytics.weakConcepts.length === 0 ? (
              <AdminEmptyState compact icon={BarChart3} title={t("noQuizResults")} />
            ) : (
              <ul className="divide-y divide-border/30">
                {analytics.weakConcepts.map((concept, index) => {
                  const trends = analytics.conceptTrends[concept.conceptName] ?? [];
                  const first = trends[0];
                  const last = trends.at(-1);
                  const change = first && last && trends.length > 1 ? last.avgMastery - first.avgMastery : null;
                  const TrendIcon = change === null ? null : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
                  const labelId = `${conceptLabelPrefix}-${index}`;
                  return (
                    <li key={concept.conceptName} className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_3.5rem_auto] items-center gap-x-2 py-(--row-padding)">
                      <div className="min-w-0">
                        <div id={labelId} className="wrap-anywhere text-body-sm font-medium text-foreground">
                          <MathText>{concept.conceptName}</MathText>
                        </div>
                        <span className={metadata}>{t("students", { count: concept.studentCount })}</span>
                      </div>
                      <div className="space-y-1 tabular-nums text-foreground">
                        <span className="flex items-center justify-end gap-1.5 text-body-sm">
                          <span className="sr-only">{t("averageMastery")}: </span>{concept.avgMastery}
                          {TrendIcon && change !== null && (
                            <>
                              <TrendIcon className={change > 0 ? "size-4 text-status-success" : change < 0 ? "size-4 text-status-warning" : "size-4 text-muted-foreground"} aria-hidden />
                              <span className="sr-only">
                                {change > 0 ? t("trendIncreasing") : change < 0 ? t("trendDecreasing") : t("trendStable")}
                              </span>
                            </>
                          )}
                        </span>
                        <DistributionBar low={concept.bucketLow} mid={concept.bucketMid} high={concept.bucketHigh} total={concept.studentCount} className="w-full" />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-haspopup="dialog"
                        aria-labelledby={`${labelId}-action ${labelId}`}
                        onClick={(event) => {
                          drillTrigger.current = event.currentTarget;
                          setDrillConcept(concept);
                        }}
                      >
                        <span id={`${labelId}-action`} className="sr-only">{t("viewConcept")}</span>
                        <ChevronRight className="text-muted-foreground" aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {otherConcepts.length > 0 && (
              <Collapsible className="border-t border-border/30">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="group h-auto min-h-11 w-full justify-between whitespace-normal px-0 text-left">
                    {t("moreConcepts", { count: otherConcepts.length })}
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-180" aria-hidden />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ConceptRanking concepts={otherConcepts} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </section>

          <div className="min-w-0 space-y-8 xl:col-span-5 xl:border-l xl:border-border/35 xl:pl-10">
            <section className="min-w-0 space-y-3" aria-labelledby="watchlist-heading">
              <h2 id="watchlist-heading" className={`${sectionTitle} border-b border-border/40 pb-2`}>
                <Users className={headingIcon} aria-hidden />
                {t("needsAttention")}
              </h2>
              <WatchlistTable students={analytics.watchlist} />
            </section>

            <section className="min-w-0 space-y-3" aria-labelledby="misconceptions-heading">
              <h2 id="misconceptions-heading" className={`${sectionTitle} border-b border-border/40 pb-2`}>
                <ScanSearch className={headingIcon} aria-hidden />
                {t("commonMisconceptions")}
              </h2>
              {analytics.topMisconceptions.length === 0 ? (
                <AdminEmptyState compact icon={BarChart3} title={t("noMisconceptions")} />
              ) : (
                <ul className="divide-y divide-border/30">
                  {analytics.topMisconceptions.slice(0, 10).map((item) => (
                    <li key={item.misconceptionKoId} className="flex items-start justify-between gap-(--compact-gap) py-(--row-padding)">
                      <div className="min-w-0">
                        <MathText className="block wrap-anywhere text-body-sm font-medium text-foreground" as="span">{item.label}</MathText>
                        <span className={`block wrap-anywhere ${metadata}`}>
                          <MathText as="span">{item.conceptName}</MathText> &middot; {t("attempts", { count: item.sampleSize })}
                        </span>
                      </div>
                      <span className="shrink-0 text-body-sm tabular-nums text-foreground">{item.pctSelected}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="min-w-0 space-y-3" aria-labelledby="interventions-heading">
              <h2 id="interventions-heading" className={`${sectionTitle} border-b border-border/40 pb-2`}>
                <ClipboardCheck className={headingIcon} aria-hidden />
                {t("activeInterventions")}
              </h2>
              {analytics.interventionCounts.length === 0 ? (
                <AdminEmptyState compact icon={RefreshCw} title={t("noInterventions")} />
              ) : (
                <ul className="divide-y divide-border/30">
                  {analytics.interventionCounts.map((item) => (
                    <li key={item.conceptName} className="flex items-start justify-between gap-(--compact-gap) py-(--row-padding)">
                      <MathText className="min-w-0 wrap-anywhere text-body-sm text-foreground" as="span">{item.conceptName}</MathText>
                      <span className="shrink-0 text-body-sm tabular-nums text-foreground">{item.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </Reveal>

      <ConceptDrilldown
        open={drillConcept !== null}
        onClose={() => setDrillConcept(null)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          drillTrigger.current?.focus();
        }}
        concept={drillConcept}
        trends={drillTrends}
        mostMissed={drillMissed}
        courseId={courseId}
      />
    </div>
  );
}
