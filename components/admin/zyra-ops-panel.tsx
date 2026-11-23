"use client";

import { modelDisplayName } from "@/lib/ai/provider/recent-models";

import { AdminIconAction } from "@/components/admin/icon-action";

import { ZyraOpsSkeleton } from "@/components/admin/content-loading-skeletons";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@/lib/i18n/client";
import { Activity, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { useQueryAccountId } from "@/hooks/use-query-account";
import { zyraOpsQuery } from "@/lib/zyra/ops-query";

export function ZyraOpsPanel() {
  const t = useTranslations("adminOps");
  const userId = useQueryAccountId();
  const { data: metrics, error, isFetching: loading, refetch } = useQuery(zyraOpsQuery(userId ?? ""));

  if (error) {
    return <p className="flex items-center gap-2 text-body-sm text-status-warning"><TriangleAlert className="size-4" /> {t("zyraOps.unavailable")}</p>;
  }
  if (!metrics) return <ZyraOpsSkeleton />;

  return (
    <section className="space-y-4 border-y border-border py-6" aria-labelledby="zyra-ops-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="zyra-ops-title" className="flex items-center gap-2 font-heading text-body-base font-semibold">
            <Activity className="size-5 text-brand-primary" aria-hidden="true" /> {t("zyraOps.title")}
          </h2>
        </div>
        <AdminIconAction variant="outline" label={t("analyticsUI.refresh")} onClick={() => void refetch()} disabled={loading}>
            <RefreshCw aria-hidden className={loading ? "size-4 animate-spin" : "size-4"} />
          </AdminIconAction>
      </div>
      <div className="space-y-2" aria-live="polite">
        <h3 className="font-semibold text-body-sm text-foreground">{t("zyraOps.alerts")}</h3>
        {metrics.alerts.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{t("zyraOps.none")}</p>
        ) : (
          <ul className="space-y-2">
            {metrics.alerts.map((alert) => (
              <li key={alert.dedupKey} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-l-2 border-status-warning pl-3 text-body-sm">
                <span className={alert.severity === "critical" ? "font-semibold text-status-error" : "font-semibold text-status-warning"}>{alert.code}</span>
                <span className="text-muted-foreground">rollback: {alert.rollbackFlag}</span>
                <span className="text-body-xs text-muted-foreground">runbook: {alert.runbook}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {Boolean(metrics.stageOutcomes?.length) && (
        <section className="space-y-2">
          <h3 className="font-heading text-body-base font-bold">{t("analyticsUI.stageResults")}</h3>
          <ul className="divide-y divide-border">
            {metrics.stageOutcomes?.map(row => (
              <li key={JSON.stringify([row.stage, row.model])} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-sm">
                <span>{row.stage} · {modelDisplayName(row.model)}</span>
                <span>{t("analyticsUI.stageMetrics", { failed: row.failed, total: row.total, ms: row.p95Ms })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AdminStatStrip className="sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem label={t("analyticsUI.fallbackRecovered")} value={metrics.events.find(event => event.eventType === "provider_attempt" && event.resultCode === "PROVIDER_FALLBACK_SUCCESS")?.count ?? 0} />
        <AdminStatStripItem label={t("zyraOps.provider")} value={metrics.ledger.committedProviderTurns} />
        <AdminStatStripItem label={t("zyraOps.reservations")} value={metrics.ledger.activeReservations} />
        <AdminStatStripItem label={t("zyraOps.saved")} value={metrics.ledger.cacheSavedTurns} />
        <AdminStatStripItem label={t("zyraOps.failures")} value={metrics.image.failed} tone={metrics.image.failed > 0 ? "error" : "default"} />
      </AdminStatStrip>
      <div className="flex flex-wrap gap-4 text-body-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1 text-status-success"><ShieldCheck className="size-4" /> {t("zyraOps.external")}</span>
        <span>{t("zyraOps.slots", { count: metrics.projectSlotCount })}</span>
        <span>{t("zyraOps.violations", { count: metrics.traces.validationViolations })}</span>
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-body-sm text-foreground">{t("zyraOps.capacity")}</h3>
        <p className="text-body-xs text-muted-foreground">{t("zyraOps.description")}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body-sm">
            <caption className="sr-only">{t("zyraOps.table")}</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-1.5 font-semibold">Model</th>
                <th className="px-3 py-1.5 font-semibold">{t("zyraOps.perProject")}</th>
                <th className="px-3 py-1.5 font-semibold">{t("zyraOps.ceiling")}</th>
                <th className="px-3 py-1.5 font-semibold">{t("zyraOps.committed")}</th>
                <th className="px-3 py-1.5 font-semibold">{t("zyraOps.active")}</th>
                <th className="px-3 py-1.5 font-semibold">{t("zyraOps.reserve")}</th>
                <th className="px-3 py-1.5 font-semibold">{t("zyraOps.remaining")}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.capacity.modelPools.length === 0 && <tr><td colSpan={7} className="px-3 py-2 text-body-xs">{t("analyticsUI.capacityUnavailable")}</td></tr>}
              {metrics.capacity.modelPools.map((pool) => (
                <tr key={pool.model} className="border-b border-border/60">
                  <td className="px-3 py-1.5 font-mono text-body-xs">{pool.model}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.configuredPerProjectRpd ?? "N/A"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.configuredUsableRpd ?? "N/A"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.zyxCommittedRequests}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.activeReservations}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.safetyReserveRpd ?? "N/A"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.usableRemainingRpd ?? "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
