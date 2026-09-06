"use client";

import * as React from "react";
import { Activity, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import type { ZyraOpsMetrics } from "@/lib/zyra/ops/contracts";

export function ZyraOpsPanel() {
  const [metrics, setMetrics] = React.useState<ZyraOpsMetrics | null>(null);
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/zyra/ops", { cache: "no-store" });
      if (!response.ok) throw new Error("OPS_UNAVAILABLE");
      setMetrics(await response.json() as ZyraOpsMetrics);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  if (error) {
    return <p className="flex items-center gap-2 text-body-sm text-status-warning"><TriangleAlert className="size-4" /> Zyra ops belum tersedia.</p>;
  }
  if (!metrics) return <p className="text-body-sm text-muted-foreground">Memuat Zyra ops...</p>;

  return (
    <section className="space-y-4 border-y border-border py-6" aria-labelledby="zyra-ops-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="zyra-ops-title" className="flex items-center gap-2 font-heading text-body-base font-semibold">
            <Activity className="size-5 text-brand-primary" aria-hidden="true" /> Zyra operations
          </h2>
          <p className="text-body-sm text-muted-foreground">Usage Zyx, health, cache, image, dan validation. Saldo provider eksternal tetap unknown.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Refresh
        </Button>
      </div>
      <AdminStatStrip className="sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem label="Provider turns" value={metrics.ledger.committedProviderTurns} />
        <AdminStatStripItem label="Active reservations" value={metrics.ledger.activeReservations} />
        <AdminStatStripItem label="Cache saved" value={metrics.ledger.cacheSavedTurns} />
        <AdminStatStripItem label="Image failures" value={metrics.image.failed} tone={metrics.image.failed > 0 ? "error" : "default"} />
      </AdminStatStrip>
      <div className="flex flex-wrap gap-4 text-body-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1 text-status-success"><ShieldCheck className="size-4" /> external usage unknown, not estimated</span>
        <span>{metrics.projectSlotCount} project slots, aliases masked</span>
        <span>{metrics.traces.validationViolations} trace validation events</span>
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-body-sm text-foreground">Internal capacity by model</h3>
        <p className="text-body-xs text-muted-foreground">Remaining values are Zyx safety calculations, not provider account balances.</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body-sm">
            <caption className="sr-only">Internal Zyra capacity by model</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-1.5 font-semibold">Model</th>
                <th className="px-3 py-1.5 font-semibold">Per project</th>
                <th className="px-3 py-1.5 font-semibold">Zyx usable ceiling</th>
                <th className="px-3 py-1.5 font-semibold">Committed</th>
                <th className="px-3 py-1.5 font-semibold">Active</th>
                <th className="px-3 py-1.5 font-semibold">Reserve</th>
                <th className="px-3 py-1.5 font-semibold">Usable remaining</th>
              </tr>
            </thead>
            <tbody>
              {metrics.capacity.modelPools.map((pool) => (
                <tr key={pool.model} className="border-b border-border/60">
                  <td className="px-3 py-1.5 font-mono text-body-xs">{pool.model}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.configuredPerProjectRpd}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.configuredUsableRpd}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.zyxCommittedRequests}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.activeReservations}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.safetyReserveRpd}</td>
                  <td className="px-3 py-1.5 tabular-nums">{pool.usableRemainingRpd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-2" aria-live="polite">
        <h3 className="font-semibold text-body-sm text-foreground">Alerts</h3>
        {metrics.alerts.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">Tidak ada alert aktif.</p>
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
    </section>
  );
}
