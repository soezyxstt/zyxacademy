"use client";

import { Skeleton } from "@/components/ui/skeleton";

import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";

interface KeyModelDiagnostics {
  keyId: string;
  modelId: string;
  requestsMinute: number;
  requestsToday: number;
  rpdLimit: number;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  circuitState: "CLOSED" | "HALF_OPEN" | "OPEN";
  cooldownRemainingMs: number;
  estimatedRpmLimit: number;
  utilizationPercent: number;
  activeRequestsCount: number;
}

interface UsageByModel {
  model: string;
  count: number;
  totalTokens: number;
}

interface KeyDiagnosticsData {
  checkedAt: string;
  rpdLimits: Record<string, number>;
  geminiKeys: KeyModelDiagnostics[];
  usageByModel: UsageByModel[];
  totalRequestsToday: number;
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations<"adminOps">>): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t("keysUI.relativeNow");
  if (diffMin < 60) return t("keysUI.minutes", { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("keysUI.hours", { count: diffH });
  return t("keysUI.days", { count: Math.floor(diffH / 24) });
}

function circuitColor(state: string): string {
  switch (state) {
    case "CLOSED": return "text-status-success";
    case "HALF_OPEN": return "text-status-warning";
    case "OPEN": return "text-status-error";
    default: return "text-muted-foreground";
  }
}

function ProgressBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, max > 0 ? (current / max) * 100 : 0);
  const color =
    pct >= 90 ? "bg-status-error" :
    pct >= 70 ? "bg-status-warning" :
    "bg-status-success";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-md bg-muted">
      <div className={`h-full rounded-md transition-[width] duration-500 ease-out ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

async function fetchData(): Promise<KeyDiagnosticsData> {
  const res = await fetch("/api/admin/key-diagnostics");
  if (!res.ok) throw new Error("Failed to load key diagnostics");
  return res.json();
}

export function KeysClient() {
  const t = useTranslations("adminOps");
  const { data, isLoading, isFetching, error, refetch } = useQuery<KeyDiagnosticsData>({
    queryKey: ["key-diagnostics"],
    queryFn: fetchData,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  if (isLoading) {
    return (
      <div role="status" aria-label="Memuat" className="max-w-5xl space-y-6">
        <div className="flex justify-between gap-3"><Skeleton className="h-4 w-48" /><Skeleton className="h-9 w-24" /></div>
        {[0, 1].map((group) => <div key={group} className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex justify-between border-b border-border bg-muted/50 px-5 py-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-24" /></div><div className="divide-y divide-border">{[0, 1, 2].map((row) => <div key={row} className="flex gap-4 px-5 py-3"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-16" /><Skeleton className="hidden h-4 w-20 sm:block" /></div>)}</div></div>)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-status-error">{t("keysUI.failedLoad")}</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2 text-body-sm text-brand-primary underline">{t("keysUI.retry")}</Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const keys = [...new Set(data.geminiKeys.map((d) => d.keyId))].sort();
  void [...new Set(data.geminiKeys.map((d) => d.modelId))].sort();

  const keyHealth = keys.map((keyId) => {
    const entries = data.geminiKeys.filter((d) => d.keyId === keyId);
    const anyOpen = entries.some((d) => d.circuitState === "OPEN");
    const totalToday = entries.reduce((s, d) => s + d.requestsToday, 0);
    return { keyId, healthy: !anyOpen, totalToday, entries };
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-body-sm text-muted-foreground">
          {t("keysUI.checked", { time: relativeTime(data.checkedAt, t), count: data.totalRequestsToday })}
        </span>
        <Button variant="ghost" size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-body-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("keysUI.refresh")}
        </Button>
      </div>

      {keyHealth.map(({ keyId, healthy, totalToday, entries }) => (
        <div key={keyId} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`size-2.5 rounded-full ${healthy ? "bg-status-success" : "bg-status-error"}`} />
              <h2 className="font-heading text-body-base font-semibold text-foreground">{keyId}</h2>
              <span className={`text-body-sm ${healthy ? "text-status-success" : "text-status-error"}`}>
                {healthy ? t("keysUI.healthy") : t("keysUI.degraded")}
              </span>
            </div>
            <span className="text-body-sm text-muted-foreground">{totalToday} {t("keysUI.requestsToday")}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">{t("keysUI.model")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.todayRpd")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.util")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.rpm")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.circuit")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.successFailure")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.cooldown")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.active")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((d) => {
                  const rpd = data.rpdLimits[d.modelId] ?? 1500;
                  return (
                    <tr key={`${d.keyId}:${d.modelId}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-2.5 font-medium text-foreground">{d.modelId}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums font-semibold text-foreground">{d.requestsToday}</span>
                          <span className="text-muted-foreground">/ {rpd}</span>
                        </div>
                        <ProgressBar current={d.requestsToday} max={rpd} />
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums font-medium ${d.utilizationPercent >= 90 ? "text-status-error" : d.utilizationPercent >= 70 ? "text-status-warning" : ""}`}>
                        {d.utilizationPercent.toFixed(0)}%
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {d.requestsMinute} / {d.estimatedRpmLimit}
                      </td>
                      <td className={`px-3 py-2.5 tabular-nums font-medium ${circuitColor(d.circuitState)}`}>
                        {d.circuitState}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {d.successes}/{d.failures}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {d.cooldownRemainingMs > 0 ? `${(d.cooldownRemainingMs / 1000).toFixed(0)}s` : "-"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                        {d.activeRequestsCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/50 px-5 py-3">
          <h2 className="font-heading text-body-base font-semibold text-foreground">{t("keysUI.rpdLimits")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">{t("keysUI.model")}</th>
                <th className="px-3 py-2.5 font-medium">{t("keysUI.rpdLimit")}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.rpdLimits).map(([model, limit]) => (
                <tr key={model} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-2.5 font-medium text-foreground">{model}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
