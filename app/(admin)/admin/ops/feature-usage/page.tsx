import type { Metadata } from "next";
import Link from "next/link";
import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import {
  getFeatureUsageMetrics,
  resolveFeatureUsageRange,
} from "@/lib/feature-usage-metrics";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { FormattedDate } from "@/components/ui/formatted-date";
import { UsageRangeSelect } from "./usage-range-select";
import { FeatureRankChart, FeatureDailyChart } from "./feature-usage-charts";
import {
  Activity,
  Info,
  MousePointerClick,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Penggunaan Fitur"),
};

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function FeatureUsagePage({ searchParams }: Props) {
  await assertTutorOrAdmin();

  const { range } = await searchParams;
  const rangeDays = resolveFeatureUsageRange(range);
  const metrics = await getFeatureUsageMetrics(rangeDays);

  const avgPerUser =
    metrics.totals.activeUsers > 0
      ? metrics.totals.events / metrics.totals.activeUsers
      : 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={MousePointerClick}
        title="Penggunaan Fitur"
        actions={<UsageRangeSelect current={rangeDays} />}
      />

      <p className="max-w-3xl text-body-sm text-muted-foreground">
        Aktivitas murid per fitur dalam {rangeDays} hari terakhir. Gunakan untuk
        menentukan prioritas perbaikan, area audit, dan target permintaan feedback.
      </p>

      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          label="Total aktivitas"
          value={metrics.totals.events.toLocaleString("id-ID")}
          icon={Activity}
          tone="brand"
        />
        <AdminStatStripItem
          label="Murid aktif unik"
          value={metrics.totals.activeUsers.toLocaleString("id-ID")}
          caption="Menyentuh minimal satu fitur"
          icon={Users}
          tone="info"
        />
        <AdminStatStripItem
          label="Rata-rata per murid"
          value={avgPerUser.toLocaleString("id-ID", {
            maximumFractionDigits: 1,
          })}
          caption="Unit aktivitas per murid aktif"
          icon={TrendingUp}
        />
        <AdminStatStripItem
          label="Fitur teratas"
          value={metrics.totals.topFeatureLabel ?? "-"}
          caption={
            metrics.totals.topFeatureSharePercent !== null
              ? `${metrics.totals.topFeatureSharePercent}% dari total aktivitas`
              : "Belum ada aktivitas"
          }
          icon={Trophy}
          tone="warning"
        />
      </AdminStatStrip>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <AdminSectionTitle
            title="Peringkat Fitur"
            description="Total unit aktivitas per fitur pada rentang terpilih."
            icon={Trophy}
            border
            className="mb-4"
          />
          <FeatureRankChart rows={metrics.rows} />
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <AdminSectionTitle
            title="Aktivitas Harian"
            description="Distribusi aktivitas harian per fitur."
            icon={Activity}
            border
            className="mb-4"
          />
          <FeatureDailyChart daily={metrics.daily} />
        </section>
      </div>

      <section className="space-y-3">
        <AdminSectionTitle
          title="Detail per Fitur"
          description="Diurutkan dari yang paling sering digunakan."
          icon={MousePointerClick}
        />
        <AdminTable>
          <table className="w-full text-body-sm">
            <AdminTableHead>
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">#</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">Fitur</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">Aktivitas</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">Murid</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-muted-foreground">Kontribusi</th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-muted-foreground">Terakhir digunakan</th>
              </tr>
            </AdminTableHead>
            <tbody>
              {metrics.rows.map((row, index) => {
                const share =
                  metrics.totals.events > 0
                    ? Math.round((row.events / metrics.totals.events) * 100)
                    : 0;
                return (
                  <tr key={row.key} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{index + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">{row.label}</span>
                      {row.detail && (
                        <span className="block text-body-xs text-muted-foreground">{row.detail}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {row.events.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {row.users.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex min-w-12 justify-end font-medium text-foreground">{share}%</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
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
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-status-info" aria-hidden />
          <div className="space-y-2 text-body-sm">
            <p className="font-heading text-body-base font-bold text-foreground">Cakupan pengukuran</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Kuis pop-up harian tersimpan di perangkat murid (localStorage) dan belum terekam di server.</li>
              <li>Command palette (Cmd+K) belum mencatat event pencarian di server.</li>
              <li>Unduhan diktat hanya tersedia sebagai total kumulatif tanpa waktu unduh.</li>
              <li>
                Kunjungan halaman publik dipantau lewat{" "}
                <Link href="/admin/ops/web-analytics" className="font-medium text-brand-primary hover:underline">
                  Web Analytics
                </Link>
                ; token dan kuota AI lewat{" "}
                <Link href="/admin/ops/analytics" className="font-medium text-brand-primary hover:underline">
                  Analitik Zyra
                </Link>
                .
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
