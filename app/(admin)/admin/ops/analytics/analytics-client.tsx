"use client";

import { AiAnalyticsSkeleton } from "@/components/admin/content-loading-skeletons";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type { AiRequestLog, AiStats } from "@/lib/ai/analytics";
import { ZyraUsageCharts } from "@/components/admin/zyra-usage-charts";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

type GatewayMode = "gateway" | "direct" | "unknown";

const LOGS_PER_PAGE = 15;

function Badge({ via, label }: { via: boolean; label: string }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-body-xs font-medium ${
        via
          ? "bg-brand-primary/10 text-brand-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-status-success" : "bg-status-error"}`}
    />
  );
}

function formatLatency(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

async function fetchAiAnalytics(): Promise<AiStats> {
  const res = await fetch("/api/admin/ai-analytics");
  if (!res.ok) {
    throw new Error("analytics load failed");
  }
  return res.json();
}

export function AiAnalyticsClient() {
  const t = useTranslations("adminOps");
  const { locale } = useAppLocale();
  const [logPage, setLogPage] = useState(1);

  const {
    data: stats,
    dataUpdatedAt,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<AiStats>({
    queryKey: ["admin-ai-analytics"],
    queryFn: fetchAiAnalytics,
    refetchInterval: 30_000,
    staleTime: 25_000,
    refetchIntervalInBackground: false,
  });

  const gatewayMode: GatewayMode = !stats
    ? "unknown"
    : stats.gatewayRequests > 0
      ? "gateway"
      : "direct";

  if (isLoading) return <AiAnalyticsSkeleton label={t("analyticsUI.loading")} />;

  if (error) {
    return (
      <AdminErrorState
        message={t("analyticsUI.loadError")}
        onRetry={() => refetch()}
      />
    );
  }

  if (!stats || stats.totalRequests === 0) {
    return (
      <div className="space-y-5">
        <AdminEmptyState
          title={t("analyticsUI.emptyTitle")}
          description={t("analyticsUI.emptyDescription")}
        />
        <ZyraUsageCharts />
      </div>
    );
  }

  const totalLogs = stats.recentLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / LOGS_PER_PAGE));
  const safePage = Math.min(logPage, totalPages);
  const startIndex = (safePage - 1) * LOGS_PER_PAGE;
  const endIndex = Math.min(startIndex + LOGS_PER_PAGE, totalLogs);
  const pagedLogs = stats.recentLogs.slice(startIndex, endIndex);

  const refreshedLabel =
    dataUpdatedAt > 0
      ? new Date(dataUpdatedAt).toLocaleTimeString(
          locale === "id" ? "id-ID" : "en-US",
        )
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-body-sm text-muted-foreground">
            {t("analyticsUI.routingMode")}
          </span>
          <span
            className={`rounded-md px-3 py-1 text-body-sm font-semibold ${
              gatewayMode === "gateway"
                ? "bg-brand-primary/10 text-brand-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {gatewayMode === "gateway" ? "Cloudflare AI Gateway" : "Direct API"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {refreshedLabel && (
            <span className="text-body-sm text-muted-foreground">
              {t("analyticsUI.refreshed", { time: refreshedLabel })}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            id="ai-analytics-refresh"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin text-brand-primary" : ""}`} />
            <span>{t("analyticsUI.refresh")}</span>
          </Button>
        </div>
      </div>

      <AdminStatStrip className="lg:grid-cols-3">
        <AdminStatStripItem
          label={t("analyticsUI.totalRequests")}
          value={stats.totalRequests}
          tone="brand"
        />
        <AdminStatStripItem
          label={t("analyticsUI.successful")}
          value={stats.successfulRequests}
          caption={`${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%`}
          tone="success"
        />
        <AdminStatStripItem
          label={t("analyticsUI.failed")}
          value={stats.failedRequests}
          tone={stats.failedRequests > 0 ? "error" : "default"}
        />
        <AdminStatStripItem
          label={t("analyticsUI.avgLatency")}
          value={formatLatency(stats.averageLatencyMs)}
        />
        <AdminStatStripItem
          label="Cloudflare AI Gateway"
          value={stats.gatewayRequests}
          caption={`${t("analyticsUI.successRate")}: ${stats.gatewaySuccessRate}%`}
        />
        <AdminStatStripItem
          label="Direct API"
          value={stats.directRequests}
          caption={`${t("analyticsUI.successRate")}: ${stats.directSuccessRate}%`}
        />
      </AdminStatStrip>

      <div className="space-y-3">
        <h2 className="font-heading text-body-base font-semibold text-foreground">
          {t("analyticsUI.recentRequests")}
        </h2>
        <div className="relative overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-body-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  {t("analyticsUI.time")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  {t("analyticsUI.operation")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  {t("analyticsUI.model")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                  {t("analyticsUI.via")}
                </th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                  {t("analyticsUI.latency")}
                </th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">
                  {t("analyticsUI.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedLogs.map((log: AiRequestLog, index: number) => (
                <tr
                  key={`${log.timestamp}-${log.operation}-${log.model}-${startIndex + index}`}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString(
                      locale === "id" ? "id-ID" : "en-US",
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {log.operation}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {log.model}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      via={log.viaGateway}
                      label={
                        log.viaGateway
                          ? t("analyticsUI.gateway")
                          : t("analyticsUI.direct")
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatLatency(log.latencyMs)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <StatusDot ok={log.success} />
                      <span className="sr-only">
                        {log.success
                          ? t("analyticsUI.successful")
                          : t("analyticsUI.failed")}
                      </span>
                      {!log.success && log.error && (
                        <span
                          className="max-w-[140px] truncate text-body-sm text-status-error"
                          title={t("analyticsUI.failed")}
                        >
                          {t("analyticsUI.failed")}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalLogs > LOGS_PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
            <span>
              {t("analyticsUI.logPageSummary", {
                start: startIndex + 1,
                end: endIndex,
                total: totalLogs,
              })}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setLogPage((prev) => Math.max(1, prev - 1))}
              >
                {t("analyticsUI.previous")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() =>
                  setLogPage((prev) => Math.min(totalPages, prev + 1))
                }
              >
                {t("analyticsUI.next")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ZyraUsageCharts />
    </div>
  );
}
