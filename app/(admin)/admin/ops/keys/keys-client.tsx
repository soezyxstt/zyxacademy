"use client";

import { AdminIconAction } from "@/components/admin/icon-action";

import { KeysSkeleton } from "@/components/admin/content-loading-skeletons";


import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { adminKeyDiagnosticsQuery } from "@/lib/admin/ops-query";
import { useQueryAccountId } from "@/hooks/use-query-account";

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

export function KeysClient() {
  const t = useTranslations("adminOps");
  const userId = useQueryAccountId();
  const { data, isPending, isFetching, error, refetch } = useQuery(adminKeyDiagnosticsQuery(userId ?? ""));

  if (isPending || !userId) return <KeysSkeleton />;

  if (error) {
    return (
      <div className="border-y border-border py-3">
        <p className="text-status-error">{t("keysUI.failedLoad")}</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2 text-body-sm text-brand-primary underline">{t("keysUI.retry")}</Button>
      </div>
    );
  }

  if (!data) return null;

  const keys = [...new Set(data.geminiKeys.map((d) => d.keyId))].sort();

  const keyHealth = keys.map((keyId) => {
    const entries = data.geminiKeys.filter((d) => d.keyId === keyId);
    const anyOpen = entries.some((d) => d.circuitState === "OPEN");
    const totalToday = entries.reduce((s, d) => s + d.requestsToday, 0);
    return { keyId, healthy: !anyOpen, totalToday, entries };
  }).sort((a, b) => Number(a.healthy) - Number(b.healthy));

  return (
    <div className="space-y-(--section-gap)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-body-sm text-muted-foreground">
          {t("keysUI.checked", { time: relativeTime(data.checkedAt, t), count: data.totalRequestsToday })}
        </span>
        <AdminIconAction variant="outline" label={t("keysUI.refresh")} onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw aria-hidden className={isFetching ? "size-4 animate-spin" : "size-4"} />
          </AdminIconAction>
      </div>

      {data.compatible?.map(profile => (
        <section key={profile.model} className="space-y-2">
          <h2 className="font-heading text-body-base font-bold">{profile.model}</h2>
          <p className="text-body-xs text-muted-foreground">{t("keysUI.sharedPilotQuota")}</p>
          <ul className="divide-y divide-border">
            {profile.keys.map((key, index) => (
              <li key={index} className="flex justify-between gap-2 py-2 text-body-sm">
                <span>{key.label}</span>
                <span>{key.cooldownUntil > Date.parse(data.checkedAt) ? t("keysUI.authRejected") : t("keysUI.readyForDispatch")}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {keyHealth.map(({ keyId, healthy, totalToday, entries }) => (
        <div key={keyId} className="border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-(--row-padding)">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`size-2.5 rounded-full ${healthy ? "bg-status-success" : "bg-status-error"}`} />
              <h2 className="font-heading text-body-base font-semibold text-foreground">{keyId}</h2>
              <span className={`text-body-sm ${healthy ? "text-status-success" : "text-status-error"}`}>
                {healthy ? t("keysUI.healthy") : t("keysUI.degraded")}
              </span>
            </div>
            <span className="text-body-sm text-muted-foreground">{totalToday} {t("keysUI.requestsToday")}</span>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">{t("keysUI.model")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.requestsToday")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.circuit")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.successFailure")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.cooldown")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("keysUI.active")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((d) => (
                  <tr key={`${d.keyId}:${d.modelId}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-2.5 font-medium text-foreground">{d.modelId}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-foreground">{d.requestsToday}</td>
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
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border/60 md:hidden">
            {entries.map((d) => (
              <li key={`${d.keyId}:${d.modelId}`} className="space-y-1.5 py-(--row-padding)">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-all text-body-sm font-medium text-foreground">
                    {d.modelId}
                  </span>
                  <span className={`shrink-0 text-body-xs font-medium ${circuitColor(d.circuitState)}`}>
                    {d.circuitState}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-body-xs tabular-nums text-muted-foreground">
                  <span>
                    {d.requestsToday} {t("keysUI.requestsToday")}
                  </span>
                  <span>
                    {t("keysUI.successFailure")}: {d.successes}/{d.failures}
                  </span>
                  <span>
                    {t("keysUI.active")}: {d.activeRequestsCount}
                  </span>
                  {d.cooldownRemainingMs > 0 && (
                    <span>
                      {t("keysUI.cooldown")}: {(d.cooldownRemainingMs / 1000).toFixed(0)}s
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
