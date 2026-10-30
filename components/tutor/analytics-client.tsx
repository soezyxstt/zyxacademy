"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { BarChart3, RefreshCw } from "lucide-react";
import { LineChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Reveal } from "@/components/ui/reveal";
import { DistributionBar } from "@/components/tutor/distribution-bar";
import { ConceptRanking } from "@/components/tutor/concept-ranking";
import { WatchlistTable } from "@/components/tutor/watchlist-table";
import { ConceptDrilldown } from "@/components/tutor/concept-drilldown";
import type { SnapshotPayload, WeakConcept } from "@/lib/cohort-analytics";

function relativeTime(date: Date | null, locale: string, justNow: string): string {
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return justNow;
  return new Intl.RelativeTimeFormat(locale === "id" ? "id-ID" : "en-US", { numeric: "auto" }).format(-diffH, "hour");
}

interface Props {
  courseId: string;
  analytics: SnapshotPayload;
  updatedAt: string | null; // ISO string from server
}

export function AnalyticsClient({ courseId, analytics, updatedAt }: Props) {
  const router = useRouter();
  const t = useTranslations("tutor.analytics");
  const { locale } = useAppLocale();
  const [isPending, startTransition] = useTransition();
  const [drillConcept, setDrillConcept] = useState<WeakConcept | null>(null);

  const updatedDate = updatedAt ? new Date(updatedAt) : null;

  function handleRefresh() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/tutor/analytics/refresh?courseId=${encodeURIComponent(courseId)}`, {
          method: "POST",
        });
        if (!response.ok) throw new Error("Refresh failed");
        startTransition(() => { router.refresh(); });
      } catch {
        toast.error(t("refreshFailed"));
      }
    });
  }

  function openDrill(concept: WeakConcept) {
    setDrillConcept(concept);
  }

  const drillTrends = drillConcept
    ? (analytics.conceptTrends[drillConcept.conceptName] ?? [])
    : [];
  const drillMissed = drillConcept
    ? (analytics.mostMissed[drillConcept.conceptName] ?? [])
    : [];

  return (
    <>
      {/* Header meta row */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-body-sm text-muted-foreground">
          {updatedDate ? t("updated", { relative: relativeTime(updatedDate, locale, t("justNow")) }) : t("notCalculated")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isPending}
          className="gap-1.5 h-7 px-2"
        >
          <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} aria-hidden />
          {t("refresh")}
        </Button>
      </div>

      {/* Section 2: Weakest concepts with sparklines */}
      <Reveal>
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="weak-heading">
          <h2 id="weak-heading" className="font-heading text-body-base font-bold mb-3">
            {t("priorityConcepts")}
          </h2>
          {analytics.weakConcepts.length === 0 ? (
            <AdminEmptyState icon={BarChart3} title={t("noQuizResults")} className="py-6" />
          ) : (
            <div className="divide-y divide-border">
              {analytics.weakConcepts.map((concept, index) => {
                const trendData = analytics.conceptTrends[concept.conceptName] ?? [];
                return (
                  <button
                    key={concept.conceptName}
                    onClick={() => openDrill(concept)}
                    className="w-full py-3 grid grid-cols-[1.5rem_minmax(0,1fr)_auto] sm:grid-cols-[1.5rem_minmax(0,1fr)_auto_5rem_8rem] items-center gap-2 sm:gap-4 text-left hover:bg-muted/40 rounded-md -mx-1 px-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="text-h6 font-heading text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium break-words">{concept.conceptName}</p>
                      <p className="text-body-xs text-muted-foreground">{t("students", { count: concept.studentCount })}</p>
                    </div>
                    <span className="tabular-nums text-body-base">{concept.avgMastery}</span>
                    {/* Sparkline */}
                    <div className="hidden w-20 h-6 shrink-0 sm:block">
                      {trendData.length >= 2 ? (
                        <LineChart width={80} height={24} data={trendData}>
                          <Line
                            type="monotone"
                            dataKey="avgMastery"
                            stroke="var(--color-primary)"
                            strokeWidth={1.5}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      ) : (
                        <span className="text-muted-foreground/40 text-body-sm">--</span>
                      )}
                    </div>
                    <DistributionBar
                      low={concept.bucketLow}
                      mid={concept.bucketMid}
                      high={concept.bucketHigh}
                      total={concept.studentCount}
                      className="col-start-2 col-span-2 w-full sm:col-auto sm:w-32"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </Reveal>

      {/* Section 3: Full mastery distribution */}
      <Reveal>
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="dist-heading">
          <h2 id="dist-heading" className="font-heading text-body-base font-bold mb-3">
            {t("masteryDistribution")}
          </h2>
          {analytics.allConcepts.length === 0 ? (
            <AdminEmptyState icon={BarChart3} title={t("noQuizResults")} className="py-6" />
          ) : (
            <ConceptRanking concepts={analytics.allConcepts} />
          )}
        </section>
      </Reveal>

      {/* Section 4: Active interventions */}
      <Reveal>
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="interventions-heading">
          <h2 id="interventions-heading" className="font-heading text-body-base font-bold mb-3">
            {t("activeInterventions")}
          </h2>
          {analytics.interventionCounts.length === 0 ? (
            <AdminEmptyState icon={RefreshCw} title={t("noInterventions")} />
          ) : (
            <div className="divide-y divide-border">
              {analytics.interventionCounts.map((item) => (
                <div key={item.conceptName} className="py-2.5 flex items-center justify-between">
                  <span className="text-body-base">{item.conceptName}</span>
                  <Badge variant="secondary">{item.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* Section 4b: Top misconceptions (cohort-wide) */}
      <Reveal>
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="misconceptions-heading">
          <h2 id="misconceptions-heading" className="font-heading text-body-base font-bold mb-3">
            {t("commonMisconceptions")}
          </h2>
          {analytics.topMisconceptions.length === 0 ? (
            <AdminEmptyState icon={BarChart3} title={t("noMisconceptions")} className="py-6" />
          ) : (
            <div className="divide-y divide-border">
              {analytics.topMisconceptions.slice(0, 10).map((m) => (
                <div key={m.misconceptionKoId} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium break-words">{m.label}</p>
                    <p className="text-body-sm text-muted-foreground">
                      {m.conceptName} &middot; {t("attempts", { count: m.sampleSize })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{m.pctSelected}%</Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* Section 5: Watchlist */}
      <Reveal>
        <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="watchlist-heading">
          <h2 id="watchlist-heading" className="font-heading text-body-base font-bold mb-3">
            {t("needsAttention")}
          </h2>
          <WatchlistTable students={analytics.watchlist} />
        </section>
      </Reveal>

      {/* Drill-down sheet */}
      <ConceptDrilldown
        open={drillConcept !== null}
        onClose={() => setDrillConcept(null)}
        concept={drillConcept}
        trends={drillTrends}
        mostMissed={drillMissed}
        courseId={courseId}
      />
    </>
  );
}
