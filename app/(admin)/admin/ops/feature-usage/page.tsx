import Link from "next/link";
import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import {
  getFeatureUsageMetrics,
  resolveFeatureUsageRange,
} from "@/lib/feature-usage-metrics";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { StatusBadge } from "@/components/admin/status-badges";
import { FormattedDate } from "@/components/ui/formatted-date";
import { UsageRangeSelect } from "./usage-range-select";
import { FeatureRankChart, FeatureDailyChart } from "./feature-usage-charts";
import {
  Activity,
  AlertCircle,
  MousePointerClick,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("featureUsage.title")) };
}

type Props = {
  searchParams: Promise<{ range?: string }>;
};

function formatTrend(value: number | null): { label: string; tone: "success" | "error" | "muted" } {
  if (value === null) return { label: "-", tone: "muted" };
  if (value > 0) return { label: `+${value}%`, tone: "success" };
  if (value < 0) return { label: `${value}%`, tone: "error" };
  return { label: "0%", tone: "muted" };
}

export default async function FeatureUsagePage({ searchParams }: Props) {
  const t = await getTranslations("adminOps");
  await assertTutorOrAdmin();

  const { range } = await searchParams;
  const rangeDays = resolveFeatureUsageRange(range);
  const metrics = await getFeatureUsageMetrics(rangeDays);

  const avgPerUser =
    metrics.totals.activeUsers > 0
      ? metrics.totals.events / metrics.totals.activeUsers
      : 0;
  const totalTrend = formatTrend(metrics.totals.trendPercent);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={MousePointerClick}
        title={<TranslatedText namespace="adminOps" messageKey="featureUsage.title" />}
        actions={<UsageRangeSelect current={rangeDays} />}
      />

      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          label={t("featureUsageUI.total")}
          value={metrics.totals.events.toLocaleString("id-ID")}
          caption={
            metrics.totals.trendPercent !== null
              ? t("featureUsageUI.vsPrevPeriod", { delta: totalTrend.label })
              : undefined
          }
          icon={Activity}
        />
        <AdminStatStripItem
          label={t("featureUsageUI.activeUsers")}
          value={metrics.totals.activeUsers.toLocaleString("id-ID")}
          caption={t("featureUsageUI.touchesFeature")}
          icon={Users}
        />
        <AdminStatStripItem
          label={t("featureUsageUI.average")}
          value={avgPerUser.toLocaleString("id-ID", {
            maximumFractionDigits: 1,
          })}
          caption={t("featureUsageUI.perUser")}
          icon={TrendingUp}
        />
        <AdminStatStripItem
          label={t("featureUsageUI.topFeature")}
          value={
            metrics.totals.topFeatureKey
              ? t(`featureUsageUI.featureLabels.${metrics.totals.topFeatureKey}`)
              : "-"
          }
          caption={
            metrics.totals.topFeatureSharePercent !== null
              ? t("featureUsageUI.topShare", { percent: metrics.totals.topFeatureSharePercent })
              : t("featureUsageUI.noActivity")
          }
          icon={Trophy}
        />
      </AdminStatStrip>

      {(metrics.insights.fastestGrowing || metrics.insights.highestAdoption || metrics.insights.needsAttention) && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {metrics.insights.fastestGrowing && (
            <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-xs font-medium text-muted-foreground">
                  {t("featureUsageUI.insightFastestGrowing")}
                </span>
                <StatusBadge tone="success">
                  +{metrics.insights.fastestGrowing.trendPercent}%
                </StatusBadge>
              </div>
              <p className="text-body-sm font-semibold text-foreground">
                {t(`featureUsageUI.featureLabels.${metrics.insights.fastestGrowing.key}`)}
              </p>
            </div>
          )}

          {metrics.insights.highestAdoption && (
            <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body-xs font-medium text-muted-foreground">
                  {t("featureUsageUI.insightHighestAdoption")}
                </span>
                <StatusBadge tone="info">
                  {metrics.insights.highestAdoption.adoptionPercent}%
                </StatusBadge>
              </div>
              <p className="text-body-sm font-semibold text-foreground">
                {t(`featureUsageUI.featureLabels.${metrics.insights.highestAdoption.key}`)}
              </p>
            </div>
          )}

          {metrics.insights.needsAttention && (
            <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-body-xs font-medium text-muted-foreground">
                  <AlertCircle className="size-3.5 text-status-warning" aria-hidden />
                  {t("featureUsageUI.insightNeedsAttention")}
                </span>
                <StatusBadge tone="warning">
                  {metrics.insights.needsAttention.adoptionPercent}%
                </StatusBadge>
              </div>
              <p className="text-body-sm font-semibold text-foreground">
                {t(`featureUsageUI.featureLabels.${metrics.insights.needsAttention.key}`)}
              </p>
            </div>
          )}
        </section>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="border-t border-border pt-3">
          <AdminSectionTitle
            title={t("featureUsageUI.rank")}
            icon={Trophy}
            border
            className="mb-4"
          />
          <FeatureRankChart rows={metrics.rows} />
        </section>

        <section className="border-t border-border pt-3">
          <AdminSectionTitle
            title={t("featureUsageUI.daily")}
            icon={Activity}
            border
            className="mb-4"
          />
          <FeatureDailyChart daily={metrics.daily} />
        </section>
      </div>

      <section className="space-y-3">
        <AdminSectionTitle
          title={t("featureUsageUI.details")}
          icon={MousePointerClick}
        />
        <div className="hidden md:block">
          <AdminTable>
            <table className="w-full text-body-sm">
              <AdminTableHead>
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">#</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">{t("featureUsageUI.feature")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">{t("featureUsageUI.activity")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">{t("featureUsageUI.trend")}</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">{t("featureUsageUI.adoption")}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">{t("featureUsageUI.depth")}</th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">{t("featureUsageUI.lastUsed")}</th>
                </tr>
              </AdminTableHead>
              <tbody className="divide-y divide-border/60">
                {metrics.rows.map((row, index) => {
                  const trend = formatTrend(row.trendPercent);
                  return (
                    <tr key={row.key} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground">{t(`featureUsageUI.featureLabels.${row.key}`)}</span>
                        <span className="block text-body-xs text-muted-foreground">{t(`featureUsageUI.featureDetails.${row.key}`, { count: row.detailCount ?? 0 })}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                        {row.events.toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge tone={trend.tone}>{trend.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-brand-primary"
                              style={{ width: `${Math.min(100, row.adoptionPercent)}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-body-xs tabular-nums font-medium text-foreground">
                            {row.adoptionPercent}%
                          </span>
                        </div>
                        <span className="text-body-2xs tabular-nums text-muted-foreground">
                          {row.users.toLocaleString("id-ID")} {t("featureUsageUI.students").toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {row.eventsPerUser.toLocaleString("id-ID", { maximumFractionDigits: 1 })}x
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

        <ul className="divide-y divide-border/40 border-y border-border md:hidden">
          {metrics.rows.map((row, index) => {
            const trend = formatTrend(row.trendPercent);
            return (
              <li key={row.key} className="py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-body-xs tabular-nums text-muted-foreground">
                        #{index + 1}
                      </span>
                      <span className="text-body-sm font-semibold text-foreground">
                        {t(`featureUsageUI.featureLabels.${row.key}`)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-body-xs text-muted-foreground">
                      {t(`featureUsageUI.featureDetails.${row.key}`, { count: row.detailCount ?? 0 })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 tabular-nums">
                    <StatusBadge tone={trend.tone}>{trend.label}</StatusBadge>
                    <p className="text-body-sm font-semibold text-foreground">
                      {row.events.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-body-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {row.adoptionPercent}% ({row.users.toLocaleString("id-ID")} {t("featureUsageUI.students").toLowerCase()}) · {row.eventsPerUser}x
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

      <p className="text-body-xs text-muted-foreground">
        {t("featureUsageUI.publicVisits")}{" "}
        <Link href="/admin/ops/web-analytics" className="font-medium text-brand-primary hover:underline">
          Web Analytics
        </Link>{" "}
        ·{" "}
        <Link href="/admin/ops/analytics" className="font-medium text-brand-primary hover:underline">
          Analitik Zyra
        </Link>
      </p>
    </div>
  );
}
