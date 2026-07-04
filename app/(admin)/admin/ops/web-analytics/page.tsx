import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { getDashboardMetrics } from "@/lib/analytics-dashboard";
import { WebAnalyticsCharts } from "@/components/admin/web-analytics-charts";
import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { Users, MousePointerClick, Eye, AlertCircle } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Web Analytics"),
};

export default async function WebAnalyticsPage() {
  await assertTutorOrAdmin(); // ensures admin role

  const metrics = await getDashboardMetrics(30);

  return (
    <Reveal className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h4 font-bold text-foreground">Web Analytics</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Wawasan lalu lintas pengunjung Zyx Academy 30 hari terakhir.
          </p>
        </div>
        <RefreshAnalyticsButton />
      </div>

      {!metrics ? (
        <div className="rounded-xl border border-status-warning/20 bg-status-warning/10 p-6 flex flex-col items-center justify-center text-center">
          <AlertCircle className="size-8 text-status-warning mb-3" />
          <h2 className="text-body-lg font-semibold text-foreground">Data Tidak Tersedia</h2>
          <p className="mt-1 text-body-sm text-muted-foreground max-w-md">
            Gagal mengambil data dari Google Analytics 4. Pastikan kredensial service account (GA_CLIENT_EMAIL, GA_PRIVATE_KEY) dan GA_PROPERTY_ID telah dikonfigurasi dengan benar di environment variables.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <Eye className="size-5" />
                </div>
                <div>
                  <p className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Page Views
                  </p>
                  <p className="font-heading text-h3 font-bold text-foreground">
                    {metrics.summary.views.toLocaleString("id-ID")}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-tertiary-1/10 text-tertiary-1">
                  <Users className="size-5" />
                </div>
                <div>
                  <p className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Users
                  </p>
                  <p className="font-heading text-h3 font-bold text-foreground">
                    {metrics.summary.activeUsers.toLocaleString("id-ID")}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-secondary">
                  <MousePointerClick className="size-5" />
                </div>
                <div>
                  <p className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total Sessions
                  </p>
                  <p className="font-heading text-h3 font-bold text-foreground">
                    {metrics.summary.sessions.toLocaleString("id-ID")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-6 font-heading text-h5 font-bold text-foreground">
              Tren Pengunjung
            </h2>
            <WebAnalyticsCharts data={metrics.dailyData} />
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-6">
              <h2 className="font-heading text-h5 font-bold text-foreground">
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
    </Reveal>
  );
}
