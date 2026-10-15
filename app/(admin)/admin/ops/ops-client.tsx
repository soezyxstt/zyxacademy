"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import type { OpsMetrics } from "@/lib/ops-metrics";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

type StatusLevel = "healthy" | "degraded" | "down";

const statusClass: Record<StatusLevel, string> = {
  healthy: "text-status-success",
  degraded: "text-status-warning",
  down: "text-status-error",
};

function StatusWord({ level }: { level: StatusLevel }) {
  return (
    <span className={`text-body-sm font-semibold ${statusClass[level]}`}>{level}</span>
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
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-body-base font-semibold text-foreground">{title}</h2>
        <StatusWord level={status} />
      </div>
      <span className="text-body-sm text-muted-foreground">
        checked {relativeTime(checkedAt)}
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
      <AdminErrorState message="Gagal memuat metrik operasional." onRetry={() => refetch()} />
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
          Refresh
        </Button>
      </div>

      <div className="divide-y divide-border">
        {/* 1. AI usage */}
        <div className="py-4 first:pt-0 space-y-3">
          <SectionHead title="AI usage" status={geminiStatus} checkedAt={data.checkedAt} />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat
              label="Model requests today"
              value={data.gemini.reqToday}
              unit="/ 250 free"
            />
            <Stat label="cache hits today" value={data.gemini.cacheHitToday} />
            <Stat label="cache hit rate" value={data.gemini.cacheHitPct} unit="%" />
          </div>
          <p className="text-body-sm text-muted-foreground">
            Budget: tutor {data.budgets.tutorPerDay}/day, feedback{" "}
            {data.budgets.feedbackPerSubmission}/submission, summaries{" "}
            {data.budgets.summariesPerDayPerUser}/day per user.
          </p>
        </div>

        {/* 2. KV Writes */}
        <div className="py-4 space-y-3">
          <SectionHead title="KV Writes" status={kvStatus} checkedAt={data.checkedAt} />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat
              label="writes today"
              value={data.kv.writesToday}
              unit={`/ ${data.kv.limit}`}
            />
            <Stat
              label="headroom"
              value={data.kv.limit - data.kv.writesToday}
              unit="remaining"
            />
          </div>
        </div>

        {/* 3. Usage by Feature */}
        <div className="py-4 space-y-3">
          <SectionHead title="Usage by Feature" status="healthy" checkedAt={data.checkedAt} />
          {data.usageByFeature.length === 0 ? (
            <AdminEmptyState compact title="Belum ada permintaan hari ini" />
          ) : (
            <div className="divide-y divide-border">
              {data.usageByFeature.map((row) => (
                <div
                  key={row.feature}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <span className="text-body-sm font-medium text-foreground">
                    {row.feature}
                  </span>
                  <div className="flex gap-6">
                    <span className="text-body-sm text-muted-foreground">
                      {row.count} req
                    </span>
                    <span className="text-body-sm text-muted-foreground">
                      {row.tokens.toLocaleString()} tokens
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
            title="Job Failures (24 h)"
            status={failureStatus}
            checkedAt={data.checkedAt}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat label="failed generation jobs" value={data.jobFailures24h} />
          </div>
        </div>

        {/* 5. Vector Sync Queue */}
        <div className="py-4 space-y-3">
          <SectionHead
            title="Vector Sync Queue"
            status={queueStatus}
            checkedAt={data.checkedAt}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Stat label="pending items" value={data.syncQueueDepth} />
          </div>
        </div>

        {/* 6. Job Health */}
        <div className="py-4 space-y-3">
          <SectionHead title="Job Health" status="healthy" checkedAt={data.checkedAt} />
          <div className="divide-y divide-border">
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-body-sm text-muted-foreground">Daily recommendations</span>
              <span className="text-body-sm text-foreground">
                {relativeTime(data.jobHealth.recommendationsLastAt)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-body-sm text-muted-foreground">
                Course analytics snapshots
              </span>
              <span className="text-body-sm text-foreground">
                {relativeTime(data.jobHealth.snapshotsLastAt)}
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-body-sm text-muted-foreground">Study paths</span>
              <span className="text-body-sm text-foreground">
                {relativeTime(data.jobHealth.pathsLastAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
