"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

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

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
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
    <div className="h-2 w-full rounded-full bg-muted">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

async function fetchData(): Promise<KeyDiagnosticsData> {
  const res = await fetch("/api/admin/key-diagnostics");
  if (!res.ok) throw new Error("Failed to load key diagnostics");
  return res.json();
}

export function KeysClient() {
  const { data, isLoading, isFetching, error, refetch } = useQuery<KeyDiagnosticsData>({
    queryKey: ["key-diagnostics"],
    queryFn: fetchData,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl space-y-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-6 rounded-md bg-muted animate-pulse w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-status-error">Failed to load diagnostics: {error.message}</p>
          <button onClick={() => refetch()} className="mt-2 text-body-sm text-brand-primary underline">Retry</button>
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
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <span className="text-body-sm text-muted-foreground">
          Checked {relativeTime(data.checkedAt)} · {data.totalRequestsToday} total requests today
        </span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-body-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {keyHealth.map(({ keyId, healthy, totalToday, entries }) => (
        <div key={keyId} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-3">
            <div className="flex items-center gap-3">
              <span className={`size-2.5 rounded-full ${healthy ? "bg-status-success" : "bg-status-error"}`} />
              <h2 className="font-heading text-h6 font-semibold text-foreground">{keyId}</h2>
              <span className={`text-body-sm ${healthy ? "text-status-success" : "text-status-error"}`}>
                {healthy ? "healthy" : "degraded"}
              </span>
            </div>
            <span className="text-body-sm text-muted-foreground">{totalToday} requests today</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Model</th>
                  <th className="px-3 py-2.5 font-medium">Today / RPD</th>
                  <th className="px-3 py-2.5 font-medium">Util</th>
                  <th className="px-3 py-2.5 font-medium">RPM</th>
                  <th className="px-3 py-2.5 font-medium">Circuit</th>
                  <th className="px-3 py-2.5 font-medium">S/F</th>
                  <th className="px-3 py-2.5 font-medium">Cooldown</th>
                  <th className="px-3 py-2.5 font-medium">Active</th>
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
          <h2 className="font-heading text-h6 font-semibold text-foreground">RPD Limits</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Model</th>
                <th className="px-3 py-2.5 font-medium">RPD Limit</th>
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
