"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import type { OpsMetrics } from "@/lib/ops-metrics";
import { useTranslations } from "@/lib/i18n/client";

function relativeTime(iso: string | null, t: ReturnType<typeof useTranslations>): string {
  if (!iso) return t("opsUI.never");
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t("opsUI.justNow");
  if (diffMin < 60) return t("opsUI.minutes", { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("opsUI.hours", { count: diffH });
  return t("opsUI.days", { count: Math.floor(diffH / 24) });
}

type StatusLevel = "healthy" | "degraded" | "down";

const statusClass: Record<StatusLevel, string> = {
  healthy: "text-status-success",
  degraded: "text-status-warning",
  down: "text-status-error",
};

function StatusWord({ level }: { level: StatusLevel }) {
  const t = useTranslations("adminOps");
  return (
    <span className={`text-body-sm font-semibold ${statusClass[level]}`}>{t(`opsUI.status.${level}`)}</span>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-heading text-h5 font-bold text-foreground">
        {value}
        {unit && (
          <span className="ml-1 text-body-sm font-normal text-muted-foreground">{unit}</span>
        )}
      </span>
      <span className="text-body-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function SectionHead({
  title,
  status,
  checkedAt,
}: {
  title: string;
  status: StatusLevel;
  checkedAt: string;
}) {
  const t = useTranslations("adminOps");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-body-base font-semibold text-foreground">{title}</h2>
        <StatusWord level={status} />
      </div>
      <span className="text-body-sm text-muted-foreground">
        {t("opsUI.checked", { time: relativeTime(checkedAt, t) })}
      </span>
    </div>
  );
}

async function fetchMetrics(): Promise<OpsMetrics> {
  const res = await fetch("/api/admin/ops");
  if (!res.ok) throw new Error("Failed to load ops metrics");
  return res.json();
}

export function OpsClient() {
  const t = useTranslations("adminOps");
  const { data, isLoading, isFetching, error, refetch } = useQuery<OpsMetrics>({
    queryKey: ["ops-metrics"],
    queryFn: fetchMetrics,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <AdminErrorState message={t("opsUI.loadError")} onRetry={() => refetch()} />
    );
  }

  const geminiStatus: StatusLevel =
    data.gemini.reqToday > 240 ? "down" : data.gemini.reqToday > 200 ? "degraded" : "healthy";
  const kvStatus: StatusLevel =
    data.kv.writesToday > 900 ? "down" : data.kv.writesToday > 700 ? "degraded" : "healthy";
  const failureStatus: StatusLevel = data.jobFailures24h > 0 ? "degraded" : "healthy";
  const queueStatus: StatusLevel = data.syncQueueDepth > 100 ? "degraded" : "healthy";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => refetch()}
          className="flex items-center gap-2 text-body-sm text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("opsUI.refresh")}
        </Button>
      </div>

      <div className="divide-y divide-border">
        {/* 1. AI usage */}
        <div className="py-4 first:pt-0 space-y-3">
          <SectionHead title={t("opsUI.aiUsage")} status={geminiStatus} checkedAt={data.checkedAt} />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat
              label={t("opsUI.modelRequests")}
              value={data.gemini.reqToday}
              unit={t("opsUI.freeLimit")}
            />
            <Stat label={t("opsUI.cacheHits")} value={data.gemini.cacheHitToday} />
            <Stat label={t("opsUI.cacheRate")} value={data.gemini.cacheHitPct} unit="%" />
          </div>
          <p className="text-body-sm text-muted-foreground">
            {t("opsUI.budget", { tutor: data.budgets.tutorPerDay, feedback: data.budgets.feedbackPerSubmission, summaries: data.budgets.summariesPerDayPerUser })}
          </p>
        </div>

        {/* 2. KV Writes */}
        <div className="py-4 space-y-3">
          <SectionHead title={t("opsUI.kvWrites")} status={kvStatus} checkedAt={data.checkedAt} />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat
              label={t("opsUI.writesToday")}
              value={data.kv.writesToday}
              unit={`/ ${data.kv.limit}`}
            />
            <Stat
              label={t("opsUI.headroom")}
              value={data.kv.limit - data.kv.writesToday}
              unit={t("opsUI.remaining")}
            />
          </div>
        </div>

        {/* 3. Usage by Feature */}
        <div className="py-4 space-y-3">
          <SectionHead title={t("opsUI.usageByFeature")} status="healthy" checkedAt={data.checkedAt} />
          {data.usageByFeature.length === 0 ? (
            <AdminEmptyState compact title={t("opsUI.noRequests")} />
          ) : (
            <div className="divide-y divide-border">
              {data.usageByFeature.map((row) => (
                <div
                  key={row.feature}
                  className="py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-body-sm font-medium text-foreground">
                    {row.feature}
                  </span>
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span className="text-body-sm text-muted-foreground">
                      {row.count} {t("opsUI.requests")}
                    </span>
                    <span className="text-body-sm text-muted-foreground">
                      {row.tokens.toLocaleString()} {t("opsUI.tokens")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Job Failures */}
        <div className="py-4 space-y-3">
          <SectionHead
            title={t("opsUI.jobFailures")}
            status={failureStatus}
            checkedAt={data.checkedAt}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat label={t("opsUI.failedJobs")} value={data.jobFailures24h} />
          </div>
        </div>

        {/* 5. Vector Sync Queue */}
        <div className="py-4 space-y-3">
          <SectionHead
            title={t("opsUI.vectorQueue")}
            status={queueStatus}
            checkedAt={data.checkedAt}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat label={t("opsUI.pendingItems")} value={data.syncQueueDepth} />
          </div>
        </div>

        {/* 6. Job Health */}
        <div className="py-4 space-y-3">
          <SectionHead title={t("opsUI.jobHealth")} status="healthy" checkedAt={data.checkedAt} />
          <div className="divide-y divide-border">
            <div className="py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-sm text-muted-foreground">{t("opsUI.dailyRecommendations")}</span>
              <span className="text-body-sm text-foreground">
                {relativeTime(data.jobHealth.recommendationsLastAt, t)}
              </span>
            </div>
            <div className="py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-sm text-muted-foreground">
                {t("opsUI.analyticsSnapshots")}
              </span>
              <span className="text-body-sm text-foreground">
                {relativeTime(data.jobHealth.snapshotsLastAt, t)}
              </span>
            </div>
            <div className="py-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-body-sm text-muted-foreground">{t("opsUI.studyPaths")}</span>
              <span className="text-body-sm text-foreground">
                {relativeTime(data.jobHealth.pathsLastAt, t)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
