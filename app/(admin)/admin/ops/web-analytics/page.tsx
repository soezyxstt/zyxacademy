import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { getDashboardMetrics } from "@/lib/analytics-dashboard";
import { WebAnalyticsCharts } from "@/components/admin/web-analytics-charts";
import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { Users, MousePointerClick, Eye, AlertCircle, Globe } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Web Analytics"),
};

export default async function WebAnalyticsPage() {
  await assertTutorOrAdmin(); // ensures admin role

  const metrics = await getDashboardMetrics(30);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={Globe}
        title="Web Analytics"
        description="Wawasan lalu lintas pengunjung Zyx Academy 30 hari terakhir."
        actions={<RefreshAnalyticsButton />}
      />

      {!metrics ? (
        <div className="rounded-xl border border-status-warning/20 bg-status-warning/10 p-6 flex flex-col items-center justify-center text-center">
          <AlertCircle className="size-8 text-status-warning mb-3" />
          <h2 className="font-heading text-body-base font-semibold text-foreground">Data Tidak Tersedia</h2>
          <p className="mt-1 text-body-sm text-muted-foreground max-w-md">
            Gagal mengambil data dari Google Analytics 4. Pastikan kredensial service account (GA_CLIENT_EMAIL, GA_PRIVATE_KEY) dan GA_PROPERTY_ID telah dikonfigurasi dengan benar di environment variables.
          </p>
        </div>
      ) : (
        <>
          <AdminStatStrip className="sm:grid-cols-3">
            <AdminStatStripItem icon={Eye} label="Page views" value={metrics.summary.views.toLocaleString("id-ID")} tone="brand" />
            <AdminStatStripItem icon={Users} label="Active users" value={metrics.summary.activeUsers.toLocaleString("id-ID")} tone="info" />
            <AdminStatStripItem icon={MousePointerClick} label="Total sessions" value={metrics.summary.sessions.toLocaleString("id-ID")} tone="brand-secondary" />
          </AdminStatStrip>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-6 font-heading text-body-base font-bold text-foreground">
              Tren Pengunjung
            </h2>
            <WebAnalyticsCharts data={metrics.dailyData} />
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-6">
              <h2 className="font-heading text-body-base font-bold text-foreground">
                Halaman Terpopuler
              </h2>
            </div>
            <div className="divide-y divide-border">
              {metrics.topPages.map((page, i) => (
                <div key={page.path} className="flex items-center justify-between p-4 px-6 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-body-sm font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{page.title}</p>
                      <p className="truncate text-body-sm text-muted-foreground">{page.path}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-medium text-foreground">
                    {page.views.toLocaleString("id-ID")} <span className="text-muted-foreground text-body-sm font-normal">views</span>
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
