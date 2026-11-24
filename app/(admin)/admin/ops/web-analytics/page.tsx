import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { getDashboardMetrics } from "@/lib/analytics-dashboard";
import { WebAnalyticsCharts } from "@/components/admin/web-analytics-charts";
import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { Users, MousePointerClick, Eye, AlertCircle, Globe } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getAppLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("webAnalytics.title30")) };
}

export default async function WebAnalyticsPage() {
  const t = await getTranslations("adminOps");
  const locale = await getAppLocale();
  await assertTutorOrAdmin(); // ensures admin role

  const metrics = await getDashboardMetrics(30);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Globe}
        title={<TranslatedText namespace="adminOps" messageKey="webAnalytics.title30" />}
        actions={<RefreshAnalyticsButton />}
      />

      {!metrics ? (
        <div className="flex items-start gap-2 border-y border-border/60 py-(--row-padding)">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
          <div className="min-w-0 space-y-1">
            <h2 className="font-heading text-body-sm font-bold text-foreground">{t("webAnalytics.unavailable")}</h2>
            <p className="text-body-xs text-muted-foreground">{t("webAnalytics.fetchError")}</p>
          </div>
        </div>
      ) : (
        <>
          <AdminStatStrip className="sm:grid-cols-3">
            <AdminStatStripItem icon={Eye} label={t("webAnalytics.views")} value={metrics.summary.views.toLocaleString(locale === "id" ? "id-ID" : "en-US")} />
            <AdminStatStripItem icon={Users} label={t("webAnalytics.activeUsers")} value={metrics.summary.activeUsers.toLocaleString(locale === "id" ? "id-ID" : "en-US")} />
            <AdminStatStripItem icon={MousePointerClick} label={t("webAnalytics.sessions")} value={metrics.summary.sessions.toLocaleString(locale === "id" ? "id-ID" : "en-US")} />
          </AdminStatStrip>

          <div className="space-y-3">
            <h2 className="mb-3 font-heading text-body-base font-bold text-foreground">
              {t("webAnalytics.visitorsTrend")}
            </h2>
            <WebAnalyticsCharts data={metrics.dailyData} />
          </div>

          <div className="space-y-2 border-y border-border">
            <div className="border-b border-border py-3">
              <h2 className="font-heading text-body-base font-bold text-foreground">
                {t("webAnalytics.topPages")}
              </h2>
            </div>
            <div className="divide-y divide-border">
              {metrics.topPages.map((page, i) => (
                <div key={page.path} className="flex items-center justify-between gap-3 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-body-sm font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words font-medium text-foreground">{page.title}</p>
                      <p className="break-all text-body-xs text-muted-foreground">{page.path}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-medium text-foreground">
                    {page.views.toLocaleString(locale === "id" ? "id-ID" : "en-US")} <span className="text-muted-foreground text-body-sm font-normal">{t("webAnalytics.views")}</span>
                  </div>
                </div>
              ))}
              {metrics.topPages.length === 0 && (
                <div className="p-8 text-center text-body-sm text-muted-foreground">
                  Belum ada data halaman populer.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
