"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, Clock, Cpu, Globe, RefreshCw } from "lucide-react";
import { modelDisplayName } from "@/lib/ai/provider/recent-models";
import { AdminIconAction } from "@/components/admin/icon-action";
import { AiAnalyticsSkeleton } from "@/components/admin/content-loading-skeletons";
import { adminAnalyticsQuery, type AiRequestLog } from "@/lib/admin/ops-query";
import { useQueryAccountId } from "@/hooks/use-query-account";
import { ZyraUsageCharts } from "@/components/admin/zyra-usage-charts";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { StatusBadge } from "@/components/admin/status-badges";
import { Button } from "@/components/ui/button";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

const LOGS_PER_PAGE = 15;

type LogFilter = "all" | "failed" | "gateway";

function formatLatency(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export function AiAnalyticsClient() {
  const t = useTranslations("adminOps");
  const { locale } = useAppLocale();
  const [logPage, setLogPage] = useState(1);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const userId = useQueryAccountId();

  const {
    data: stats,
    dataUpdatedAt,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery(adminAnalyticsQuery(userId ?? ""));

  const recentLogs = stats?.recentLogs;
  const modelBreakdown = useMemo(() => {
    if (!recentLogs?.length) return [];
    const map = new Map<
      string,
      { model: string; count: number; successes: number; totalLatencyMs: number }
    >();
    for (const log of recentLogs) {
      const key = log.model || "unknown";
      const entry = map.get(key) ?? { model: key, count: 0, successes: 0, totalLatencyMs: 0 };
      entry.count += 1;
      if (log.success) entry.successes += 1;
      entry.totalLatencyMs += log.latencyMs;
      map.set(key, entry);
    }
    const total = recentLogs.length;
    return [...map.values()]
      .sort((a, b) => b.count - a.count)
      .map((item) => ({
        ...item,
        sharePct: Math.round((item.count / total) * 100),
        successRatePct: Math.round((item.successes / item.count) * 100),
        avgLatencyMs: item.totalLatencyMs / item.count,
      }));
  }, [recentLogs]);

  const filteredLogs = useMemo(() => {
    if (!recentLogs) return [];
    if (logFilter === "failed") return recentLogs.filter((l) => !l.success);
    if (logFilter === "gateway") return recentLogs.filter((l) => l.viaGateway);
    return recentLogs;
  }, [recentLogs, logFilter]);

  if (isPending || !userId) return <AiAnalyticsSkeleton label={t("analyticsUI.loading")} />;

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
      <div className="space-y-6">
        <AdminEmptyState
          title={t("analyticsUI.emptyTitle")}
          description={t("analyticsUI.emptyDescription")}
        />
        <ZyraUsageCharts />
      </div>
    );
  }

  const successRatePct = ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1);
  const gatewaySharePct = Math.round((stats.gatewayRequests / stats.totalRequests) * 100);

  const totalLogs = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / LOGS_PER_PAGE));
  const safePage = Math.min(logPage, totalPages);
  const startIndex = (safePage - 1) * LOGS_PER_PAGE;
  const endIndex = Math.min(startIndex + LOGS_PER_PAGE, totalLogs);
  const pagedLogs = filteredLogs.slice(startIndex, endIndex);

  const refreshedLabel =
    dataUpdatedAt > 0
      ? new Date(dataUpdatedAt).toLocaleTimeString(
          locale === "id" ? "id-ID" : "en-US",
        )
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-xs text-muted-foreground">{t("analyticsUI.sampleScope")}</p>
        <div className="flex flex-wrap items-center gap-3">
          {refreshedLabel && (
            <span className="text-body-xs text-muted-foreground">
              {t("analyticsUI.refreshed", { time: refreshedLabel })}
            </span>
          )}
          <AdminIconAction
            id="ai-analytics-refresh"
            variant="outline"
            label={t("analyticsUI.refresh")}
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw aria-hidden className={isFetching ? "size-4 animate-spin" : "size-4"} />
          </AdminIconAction>
        </div>
      </div>

      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          label={t("analyticsUI.totalRequests")}
          value={stats.totalRequests.toLocaleString(locale === "id" ? "id-ID" : "en-US")}
          caption={
            stats.failedRequests > 0
              ? `${stats.failedRequests} ${t("analyticsUI.failed").toLowerCase()}`
              : undefined
          }
          icon={Activity}
        />
        <AdminStatStripItem
          label={t("analyticsUI.successRate")}
          value={`${successRatePct}%`}
          caption={`${stats.successfulRequests} / ${stats.totalRequests}`}
          tone={stats.failedRequests > 0 ? "warning" : "default"}
          icon={CheckCircle2}
        />
        <AdminStatStripItem
          label={t("analyticsUI.avgLatency")}
          value={formatLatency(stats.averageLatencyMs)}
          icon={Clock}
        />
        <AdminStatStripItem
          label="AI Gateway"
          value={`${gatewaySharePct}%`}
          caption={`${stats.gatewayRequests} ${t("analyticsUI.gateway").toLowerCase()} / ${stats.directRequests} ${t("analyticsUI.direct").toLowerCase()}`}
          icon={Globe}
        />
      </AdminStatStrip>

      {modelBreakdown.length > 0 && (
        <section className="space-y-3">
          <AdminSectionTitle title={t("analyticsUI.activeModels")} icon={Cpu} border />
          <div className="hidden md:block">
            <AdminTable>
              <table className="w-full text-left text-body-sm">
                <AdminTableHead>
                  <tr>
                    <th className="px-4 py-2.5 font-semibold text-muted-foreground">{t("analyticsUI.model")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">{t("analyticsUI.totalRequests")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">{t("analyticsUI.successRate")}</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">{t("analyticsUI.avgLatency")}</th>
                  </tr>
                </AdminTableHead>
                <tbody className="divide-y divide-border/60">
                  {modelBreakdown.map((item) => (
                    <tr key={item.model} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {modelDisplayName(item.model)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {item.count}{" "}
                        <span className="text-body-xs text-muted-foreground">({item.sharePct}%)</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <StatusBadge tone={item.successRatePct >= 95 ? "success" : item.successRatePct >= 80 ? "warning" : "error"}>
                          {item.successRatePct}%
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatLatency(item.avgLatencyMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTable>
          </div>
          <ul className="divide-y divide-border/40 border-y border-border md:hidden">
            {modelBreakdown.map((item) => (
              <li key={item.model} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-medium text-foreground">
                    {modelDisplayName(item.model)}
                  </p>
                  <p className="text-body-xs tabular-nums text-muted-foreground">
                    {item.count} ({item.sharePct}%) · {formatLatency(item.avgLatencyMs)}
                  </p>
                </div>
                <StatusBadge tone={item.successRatePct >= 95 ? "success" : item.successRatePct >= 80 ? "warning" : "error"}>
                  {item.successRatePct}%
                </StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ZyraUsageCharts />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AdminSectionTitle title={t("analyticsUI.recentRequests")} />
          <div className="flex items-center gap-1">
            {(
              [
                { id: "all", label: t("analyticsUI.filterAll") },
                { id: "gateway", label: t("analyticsUI.gateway") },
                { id: "failed", label: t("analyticsUI.failed") },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.id}
                type="button"
                variant={logFilter === opt.id ? "secondary" : "ghost"}
                size="sm"
                className="min-h-9 px-2.5"
                aria-pressed={logFilter === opt.id}
                onClick={() => {
                  setLogFilter(opt.id);
                  setLogPage(1);
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {pagedLogs.length === 0 ? (
          <AdminEmptyState compact title={t("analyticsUI.emptyTitle")} />
        ) : (
          <>
            <div className="hidden md:block">
              <AdminTable>
                <table className="w-full min-w-[640px] text-body-sm">
                  <AdminTableHead>
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                        {t("analyticsUI.time")}
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                        {t("analyticsUI.operation")}
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                        {t("analyticsUI.model")}
                      </th>
                      <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">
                        {t("analyticsUI.via")}
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                        {t("analyticsUI.latency")}
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">
                        {t("analyticsUI.status")}
                      </th>
                    </tr>
                  </AdminTableHead>
                  <tbody className="divide-y divide-border/60">
                    {pagedLogs.map((log: AiRequestLog, index: number) => (
                      <tr
                        key={`${log.timestamp}-${log.operation}-${log.model}-${startIndex + index}`}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-body-xs tabular-nums text-muted-foreground whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString(
                            locale === "id" ? "id-ID" : "en-US",
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          {log.operation}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                          {modelDisplayName(log.model)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge tone={log.viaGateway ? "info" : "muted"}>
                            {log.viaGateway ? t("analyticsUI.gateway") : t("analyticsUI.direct")}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                          {formatLatency(log.latencyMs)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <StatusBadge tone={log.success ? "success" : "error"}>
                            {log.success ? t("analyticsUI.successful") : t("analyticsUI.failed")}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTable>
            </div>

            <ul className="divide-y divide-border/40 border-y border-border md:hidden">
              {pagedLogs.map((log: AiRequestLog, index: number) => (
                <li
                  key={`${log.timestamp}-${log.operation}-${log.model}-${startIndex + index}`}
                  className="py-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium text-foreground break-words">
                        {log.operation}
                      </p>
                      <p className="text-body-xs text-muted-foreground truncate mt-0.5">
                        {modelDisplayName(log.model)}
                      </p>
                    </div>
                    <StatusBadge tone={log.success ? "success" : "error"}>
                      {log.success ? t("analyticsUI.successful") : t("analyticsUI.failed")}
                    </StatusBadge>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs">
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={log.viaGateway ? "info" : "muted"}>
                        {log.viaGateway ? t("analyticsUI.gateway") : t("analyticsUI.direct")}
                      </StatusBadge>
                      <span className="tabular-nums text-foreground">
                        {formatLatency(log.latencyMs)}
                      </span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                      {new Date(log.timestamp).toLocaleTimeString(
                        locale === "id" ? "id-ID" : "en-US",
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

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
          </>
        )}
      </section>
    </div>
  );
}
