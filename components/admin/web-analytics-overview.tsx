"use client";

import { AlertCircle, Eye, MousePointerClick, Users } from "lucide-react";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { WebAnalyticsCharts } from "@/components/admin/web-analytics-charts";
import type { AnalyticsDashboardData } from "@/lib/analytics-dashboard";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

export function WebAnalyticsOverview({ metrics }: { metrics: AnalyticsDashboardData | null }) {
  const t = useTranslations("adminOps.webAnalytics");
  const { locale } = useAppLocale();
  const number = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US");

  if (!metrics) {
    return <AdminEmptyState compact icon={AlertCircle} title={t("unavailable")} description={t("fetchError")} />;
  }

  return (
    <div className="min-w-0 space-y-8 md:space-y-10">
      <AdminStatStrip className="sm:grid-cols-3">
        <AdminStatStripItem icon={Eye} label={t("views")} value={number.format(metrics.summary.views)} />
        <AdminStatStripItem icon={Users} label={t("activeUsers")} value={number.format(metrics.summary.activeUsers)} />
        <AdminStatStripItem icon={MousePointerClick} label={t("sessions")} value={number.format(metrics.summary.sessions)} />
      </AdminStatStrip>

      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:gap-(--section-gap)">
        <section className="min-w-0 space-y-(--compact-gap)">
          <AdminSectionTitle as="h2" title={t("visitorsTrend")} />
          <WebAnalyticsCharts data={metrics.dailyData} />
        </section>

        <section className="min-w-0 space-y-2">
          <AdminSectionTitle
            as="h2"
            title={t("topPages")}
            right={metrics.topPages.length ? <span aria-hidden className="text-body-xs text-muted-foreground">{t("views")}</span> : undefined}
          />
          {metrics.topPages.length ? (
            <ol className="divide-y divide-border/30">
              {metrics.topPages.map((page, index) => (
                <li key={`${page.path}-${page.title}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-(--compact-gap) py-2">
                  <span className="text-body-xs tabular-nums text-muted-foreground" aria-hidden>{index + 1}</span>
                  <div className="min-w-0">
                    <p className="m-0 wrap-anywhere text-body-sm font-semibold text-foreground">{page.title || page.path}</p>
                    {page.title !== page.path && page.title && (
                      <p className="m-0 mt-1 wrap-anywhere text-body-xs text-muted-foreground">{page.path}</p>
                    )}
                  </div>
                  <span className="text-right text-body-sm font-medium tabular-nums text-foreground">
                    <span className="sr-only">{t("views")} </span>
                    {number.format(page.views)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <AdminEmptyState compact title={t("noTopPages")} />
          )}
        </section>
      </div>
    </div>
  );
}
