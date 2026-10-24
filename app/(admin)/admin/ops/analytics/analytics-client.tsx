"use client";

import { useEffect, useState, useCallback } from "react";
import type { AiStats, AiRequestLog } from "@/lib/ai/analytics";
import { ZyraUsageCharts } from "@/components/admin/zyra-usage-charts";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type GatewayMode = "gateway" | "direct" | "unknown";

// ────────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────────

function Badge({ via, label }: { via: boolean; label: string }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-body-sm font-medium ${
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

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 10_000; // 10 s

export function AiAnalyticsClient() {
  const t = useTranslations("adminOps");
  const { locale } = useAppLocale();
  const [stats, setStats] = useState<AiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-analytics");
      if (!res.ok) throw new Error("analytics load failed");
      const data: AiStats = await res.json();
      setStats(data);
      setError(null);
      setLastRefreshed(new Date());
    } catch {
      setError("loadError");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchStats]);

  // ── Derived values ──────────────────────────────────────────────────────
  const gatewayMode: GatewayMode =
    !stats
      ? "unknown"
      : stats.gatewayRequests > 0
        ? "gateway"
        : "direct";

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-body-sm">
        {t("analyticsUI.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-status-error/30 bg-status-error/10 p-6 text-status-error text-body-sm">
        {t(`analyticsUI.${error}`)}
      </div>
    );
  }

  if (!stats || stats.totalRequests === 0) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-muted/40 p-10 text-center">
          <p className="text-body-base font-heading font-semibold text-foreground">
            {t("analyticsUI.emptyTitle")}
          </p>
          <p className="mt-2 text-body-sm text-muted-foreground">
            {t("analyticsUI.emptyDescription")}
          </p>
        </div>
        <ZyraUsageCharts />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-body-sm text-muted-foreground">
            {t("analyticsUI.routingMode")}
          </span>
          <span
            className={`rounded-md px-3 py-1 text-body-sm font-semibold ${
              gatewayMode === "gateway"
                ? "bg-brand-primary/10 text-brand-primary"
                : gatewayMode === "direct"
                  ? "bg-muted text-muted-foreground"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {gatewayMode === "gateway"
              ? "Cloudflare AI Gateway"
              : "Direct API"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {lastRefreshed && (
            <span className="text-body-sm text-muted-foreground">
              {t("analyticsUI.refreshed", { time: lastRefreshed.toLocaleTimeString(locale === "id" ? "id-ID" : "en-US") })}
            </span>
          )}
          <button
            id="ai-analytics-refresh"
            onClick={fetchStats}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-body-sm text-foreground hover:bg-muted transition-colors"
          >
            {t("analyticsUI.refresh")}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <AdminStatStrip className="lg:grid-cols-4">
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
      </AdminStatStrip>

      {/* Gateway vs Direct breakdown ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="p-4">
          <p className="text-body-sm font-semibold text-foreground mb-3">
            Cloudflare AI Gateway
          </p>
          <div className="space-y-2 text-body-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("analyticsUI.requests")}</span>
              <span className="font-medium text-foreground">
                {stats.gatewayRequests}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("analyticsUI.successRate")}</span>
              <span className="font-medium text-status-success">
                {stats.gatewaySuccessRate}%
              </span>
            </div>
          </div>
        </div>

        <div className="p-4">
          <p className="text-body-sm font-semibold text-foreground mb-3">
            Direct API
          </p>
          <div className="space-y-2 text-body-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("analyticsUI.requests")}</span>
              <span className="font-medium text-foreground">
                {stats.directRequests}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("analyticsUI.successRate")}</span>
              <span className="font-medium text-status-success">
                {stats.directSuccessRate}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent request log ───────────────────────────────────────────────── */}
      <div>
        <h2 className="font-heading text-body-base font-semibold text-foreground mb-4">
          {t("analyticsUI.recentRequests")}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-body-sm">
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
              {stats.recentLogs.map((log: AiRequestLog, i: number) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {log.operation}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {log.model}
                  </td>
                  <td className="px-4 py-3">
                    <Badge via={log.viaGateway} label={log.viaGateway ? t("analyticsUI.gateway") : t("analyticsUI.direct")} />
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatLatency(log.latencyMs)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <StatusDot ok={log.success} />
                      {!log.success && log.error && (
                        <span
                          className="text-status-error text-body-sm truncate max-w-[120px]"
                          title={log.error}
                        >
                          {log.error.slice(0, 30)}…
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Zyra Usage per User Charts ────────────────────────────────────────── */}
      <ZyraUsageCharts />
    </div>
  );
}
