"use client";

import { Activity, AlertCircle, MousePointerClick, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { FormattedDate } from "@/components/ui/formatted-date";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { FeatureDailyChart } from "./feature-usage-charts";
import type { FeatureUsageMetrics } from "@/lib/feature-usage-metrics";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

function FeatureUsageTrend({ value, format }: { value: number | null; format: Intl.NumberFormat }) {
  const Icon = value === null || value === 0 ? null : value > 0 ? TrendingUp : TrendingDown;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-body-xs tabular-nums text-foreground">
      {Icon && <Icon className={`size-3.5 ${Icon === TrendingUp ? "text-status-success" : "text-status-error"}`} aria-hidden />}
      {value === null ? "-" : format.format(value / 100)}
    </span>
  );
}

export function FeatureUsageOverview({
  metrics: { totals, insights, daily, rows },
}: {
  metrics: Pick<FeatureUsageMetrics, "totals" | "insights" | "daily" | "rows">;
}) {
  const t = useTranslations("adminOps.featureUsageUI");
  const { locale } = useAppLocale();
  const localeTag = locale === "id" ? "id-ID" : "en-US";
  const number = new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(localeTag, { style: "percent" });
  const signedPercent = new Intl.NumberFormat(localeTag, { style: "percent", signDisplay: "exceptZero" });
  const average = totals.activeUsers > 0 ? totals.events / totals.activeUsers : 0;
  const highlights = [
    insights.fastestGrowing && {
      title: t("insightFastestGrowing"),
      feature: insights.fastestGrowing.key,
      value: signedPercent.format(insights.fastestGrowing.trendPercent / 100),
      icon: TrendingUp,
      iconClass: "text-status-success",
    },
    insights.highestAdoption && {
      title: t("insightHighestAdoption"),
      feature: insights.highestAdoption.key,
      value: percent.format(insights.highestAdoption.adoptionPercent / 100),
    },
    insights.needsAttention && {
      title: t("insightNeedsAttention"),
      feature: insights.needsAttention.key,
      value: percent.format(insights.needsAttention.adoptionPercent / 100),
      icon: AlertCircle,
      iconClass: "text-status-warning",
    },
  ].filter((highlight) => highlight !== null);

  return (
    <div className="min-w-0 space-y-8 md:space-y-10">
      <AdminStatStrip>
        <AdminStatStripItem
          label={t("total")}
          value={number.format(totals.events)}
          caption={totals.trendPercent !== null ? t("vsPrevPeriod", { delta: signedPercent.format(totals.trendPercent / 100) }) : undefined}
          icon={Activity}
        />
        <AdminStatStripItem
          label={t("activeUsers")}
          value={number.format(totals.activeUsers)}
          caption={t("touchesFeature")}
          icon={Users}
        />
        <AdminStatStripItem
          label={t("average")}
          value={number.format(average)}
          caption={t("perUser")}
          icon={TrendingUp}
        />
        <AdminStatStripItem
          label={t("topFeature")}
          value={totals.topFeatureKey ? t(`featureLabels.${totals.topFeatureKey}`) : "-"}
          caption={totals.topFeatureSharePercent !== null ? t("topShare", { percent: totals.topFeatureSharePercent }) : t("noActivity")}
          icon={Trophy}
        />
      </AdminStatStrip>

      <div className={highlights.length ? "grid min-w-0 gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:gap-(--section-gap)" : "min-w-0"}>
        <section className="min-w-0 space-y-(--compact-gap)">
          <AdminSectionTitle as="h2" title={t("daily")} icon={Activity} />
          <FeatureDailyChart daily={daily} />
        </section>

        {highlights.length > 0 && (
          <section className="min-w-0 space-y-2">
            <AdminSectionTitle as="h2" title={t("highlights")} />
            <ul className="divide-y divide-border/30">
              {highlights.map(({ title, feature, value, icon: Icon, iconClass }) => (
                <li key={title} className="flex items-center justify-between gap-(--compact-gap) py-2">
                  <div className="min-w-0">
                    <p className="m-0 wrap-anywhere text-body-sm font-semibold text-foreground">{t(`featureLabels.${feature}`)}</p>
                    <p className="m-0 mt-1 text-body-xs text-muted-foreground">{title}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-body-sm font-medium tabular-nums text-foreground">
                    {Icon && <Icon className={`size-3.5 ${iconClass}`} aria-hidden />}
                    {value}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="space-y-3">
        <AdminSectionTitle
          as="h2"
          title={t("details")}
          icon={MousePointerClick}
        />
        <div className="hidden md:block">
          <AdminTable>
            <table className="w-full text-body-sm">
              <AdminTableHead>
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">#</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">{t("feature")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">{t("activity")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">{t("trend")}</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">{t("adoption")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">{t("depth")}</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">{t("lastUsed")}</th>
                </tr>
              </AdminTableHead>
              <tbody className="divide-y divide-border/60">
                {rows.map((row, index) => {
                  return (
                    <tr key={row.key} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground">{t(`featureLabels.${row.key}`)}</span>
                        <span className="block text-body-xs text-muted-foreground">{t(`featureDetails.${row.key}`, { count: row.detailCount ?? 0 })}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                        {number.format(row.events)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <FeatureUsageTrend value={row.trendPercent} format={signedPercent} />
                      </td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted" aria-hidden>
                            <div
                              className="h-full bg-brand-primary"
                              style={{ width: `${Math.min(100, row.adoptionPercent)}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-body-xs tabular-nums font-medium text-foreground">
                            {row.adoptionPercent}%
                          </span>
                        </div>
                        <span className="text-body-2xs tabular-nums text-muted-foreground">
                          {number.format(row.users)} {t("students").toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {number.format(row.eventsPerUser)}x
                      </td>
                      <td className="px-4 py-3 text-body-xs text-muted-foreground whitespace-nowrap">
                        {row.lastUsedAt ? (
                          <FormattedDate date={row.lastUsedAt} options={{ dateStyle: "medium" }} />
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AdminTable>
        </div>

        <ul className="divide-y divide-border/30 md:hidden">
          {rows.map((row, index) => {
            return (
              <li key={row.key} className="space-y-1 py-(--row-padding)">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-body-xs tabular-nums text-muted-foreground">
                        #{index + 1}
                      </span>
                      <span className="text-body-sm font-semibold text-foreground">
                        {t(`featureLabels.${row.key}`)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-body-xs text-muted-foreground">
                      {t(`featureDetails.${row.key}`, { count: row.detailCount ?? 0 })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 tabular-nums">
                    <FeatureUsageTrend value={row.trendPercent} format={signedPercent} />
                    <p className="text-body-sm font-semibold text-foreground">
                      {number.format(row.events)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-body-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {row.adoptionPercent}% ({number.format(row.users)} {t("students").toLowerCase()}) · {number.format(row.eventsPerUser)}x
                  </span>
                  <span>
                    {row.lastUsedAt ? (
                      <FormattedDate date={row.lastUsedAt} options={{ dateStyle: "medium" }} />
                    ) : (
                      "-"
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
