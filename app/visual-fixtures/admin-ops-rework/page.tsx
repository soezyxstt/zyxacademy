"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Activity, AlertCircle, MousePointerClick, TrendingUp, Trophy, Users } from "lucide-react";
import { CommandMenuProvider } from "@/components/command-menu";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";
import { ApplicationShell } from "@/components/application-shell";
import { ApplicationPage } from "@/components/application-page";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminMobileBottomNav, AdminMobileSubTabNav, AdminMobileTopNav } from "@/components/navigation/admin";
import { OpsClient } from "@/app/(admin)/admin/ops/ops-client";
import { AiAnalyticsClient } from "@/app/(admin)/admin/ops/analytics/analytics-client";
import { KeysClient } from "@/app/(admin)/admin/ops/keys/keys-client";
import { ActivityTable } from "@/app/(admin)/admin/ops/tutor-activity/_components/activity-table";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { StatusBadge } from "@/components/admin/status-badges";
import { FormattedDate } from "@/components/ui/formatted-date";
import { FeatureRankChart, FeatureDailyChart } from "@/app/(admin)/admin/ops/feature-usage/feature-usage-charts";
import type { TutorActivityItem } from "@/app/(admin)/admin/ops/tutor-activity/dal";
import type { FeatureUsageDailyPoint, FeatureUsageRow } from "@/lib/feature-usage-metrics";

const MOCK_TUTOR_ACTIVITIES: TutorActivityItem[] = [
  {
    id: "act-1",
    createdAt: new Date("2026-10-28T14:36:00Z"),
    actorId: "u-1",
    actorName: "Adi Haditya Nursyam",
    actorEmail: "soezyxst@gmail.com",
    courseId: null,
    courseTitle: null,
    courseCode: null,
    entityType: "bab",
    entityId: "89e0a83d-0ce2-4ea1-8891-1234567890ab",
    action: "canonical_create_with_legacy",
    outcome: "unclassified",
    reason: null,
    correlationId: "corr-1",
    beforeJson: null,
    afterJson: null,
  },
  {
    id: "act-2",
    createdAt: new Date("2026-10-28T14:28:00Z"),
    actorId: "u-1",
    actorName: "Adi Haditya Nursyam",
    actorEmail: "soezyxst@gmail.com",
    courseId: null,
    courseTitle: null,
    courseCode: null,
    entityType: "mata_kuliah",
    entityId: "berkom",
    action: "canonical_create_with_legacy",
    outcome: "unclassified",
    reason: null,
    correlationId: "corr-2",
    beforeJson: null,
    afterJson: null,
  },
  {
    id: "act-3",
    createdAt: new Date("2026-10-23T10:24:00Z"),
    actorId: "u-1",
    actorName: "Adi Haditya Nursyam",
    actorEmail: "soezyxst@gmail.com",
    courseId: "ma1101",
    courseTitle: "Matematika I",
    courseCode: "MA1101",
    entityType: "product_bundle",
    entityId: "impor-product-027",
    action: "draft_created",
    outcome: "unclassified",
    reason: null,
    correlationId: "corr-3",
    beforeJson: null,
    afterJson: null,
  },
  {
    id: "act-4",
    createdAt: new Date("2026-10-03T08:48:00Z"),
    actorId: "u-2",
    actorName: "Raka Pratama",
    actorEmail: "raka.tutor@zyxacademy.id",
    courseId: "global",
    courseTitle: null,
    courseCode: null,
    entityType: "tutor_slot",
    entityId: "9f0f7e02-df15-44e0-a211-abc",
    action: "tutor.slot.copy_previous_week",
    outcome: "success",
    reason: null,
    correlationId: "corr-4",
    beforeJson: null,
    afterJson: null,
  },
  {
    id: "act-5",
    createdAt: new Date("2026-10-03T05:44:00Z"),
    actorId: "u-1",
    actorName: "Adi Haditya Nursyam",
    actorEmail: "soezyxst@gmail.com",
    courseId: "fi1101",
    courseTitle: "Fisika Dasar I",
    courseCode: "FI1101",
    entityType: "tutor_assignment",
    entityId: "73be09ac-d883-45f1-def",
    action: "dual_write",
    outcome: "unclassified",
    reason: null,
    correlationId: "corr-5",
    beforeJson: null,
    afterJson: null,
  },
];

const MOCK_FEATURE_ROWS: FeatureUsageRow[] = [
  {
    key: "materi",
    label: "Materi",
    events: 482,
    previousEvents: 390,
    trendPercent: 24,
    users: 84,
    adoptionPercent: 88,
    eventsPerUser: 5.7,
    lastUsedAt: "2026-11-23T12:00:00Z",
  },
  {
    key: "zyra",
    label: "Zyra Chat",
    events: 318,
    previousEvents: 215,
    trendPercent: 48,
    users: 68,
    adoptionPercent: 72,
    eventsPerUser: 4.7,
    lastUsedAt: "2026-11-23T13:10:00Z",
    detailCount: 94,
  },
  {
    key: "kuis",
    label: "Kuis mandiri",
    events: 214,
    previousEvents: 230,
    trendPercent: -7,
    users: 59,
    adoptionPercent: 62,
    eventsPerUser: 3.6,
    lastUsedAt: "2026-11-23T11:30:00Z",
    detailCount: 186,
  },
  {
    key: "flashcard",
    label: "Flashcard",
    events: 145,
    previousEvents: 112,
    trendPercent: 29,
    users: 41,
    adoptionPercent: 43,
    eventsPerUser: 3.5,
    lastUsedAt: "2026-11-22T18:20:00Z",
  },
  {
    key: "kuisLive",
    label: "Kuis live",
    events: 34,
    previousEvents: 40,
    trendPercent: -15,
    users: 18,
    adoptionPercent: 19,
    eventsPerUser: 1.9,
    lastUsedAt: "2026-11-20T15:00:00Z",
  },
];

const MOCK_FEATURE_DAILY: FeatureUsageDailyPoint[] = [
  { date: "2026-11-17", materi: 52, flashcard: 18, kuis: 25, kuisLive: 0, zyra: 34 },
  { date: "2026-11-18", materi: 64, flashcard: 22, kuis: 31, kuisLive: 12, zyra: 41 },
  { date: "2026-11-19", materi: 71, flashcard: 19, kuis: 28, kuisLive: 0, zyra: 48 },
  { date: "2026-11-20", materi: 68, flashcard: 24, kuis: 34, kuisLive: 22, zyra: 52 },
  { date: "2026-11-21", materi: 76, flashcard: 21, kuis: 30, kuisLive: 0, zyra: 45 },
  { date: "2026-11-22", materi: 82, flashcard: 23, kuis: 36, kuisLive: 0, zyra: 51 },
  { date: "2026-11-23", materi: 69, flashcard: 18, kuis: 30, kuisLive: 0, zyra: 47 },
];

function FeatureUsagePreview() {
  return (
    <div className="space-y-6">
      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem label="Total aktivitas" value="1.193" caption="+21% vs periode lalu" icon={Activity} />
        <AdminStatStripItem label="Murid aktif unik" value="95" caption="Menggunakan setidaknya satu fitur" icon={Users} />
        <AdminStatStripItem label="Rata-rata per murid" value="12,6" caption="Unit aktivitas per murid aktif" icon={TrendingUp} />
        <AdminStatStripItem label="Fitur teratas" value="Materi" caption="40% dari total aktivitas" icon={Trophy} />
      </AdminStatStrip>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-xs font-medium text-muted-foreground">Pertumbuhan tercepat</span>
            <StatusBadge tone="success">+48%</StatusBadge>
          </div>
          <p className="text-body-sm font-semibold text-foreground">Zyra Chat</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-xs font-medium text-muted-foreground">Adopsi tertinggi</span>
            <StatusBadge tone="info">88%</StatusBadge>
          </div>
          <p className="text-body-sm font-semibold text-foreground">Materi</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-body-xs font-medium text-muted-foreground">
              <AlertCircle className="size-3.5 text-status-warning" aria-hidden />
              Adopsi terendah
            </span>
            <StatusBadge tone="warning">19%</StatusBadge>
          </div>
          <p className="text-body-sm font-semibold text-foreground">Kuis live</p>
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="border-t border-border pt-3">
          <AdminSectionTitle title="Peringkat fitur" icon={Trophy} border className="mb-4" />
          <FeatureRankChart rows={MOCK_FEATURE_ROWS} />
        </section>
        <section className="border-t border-border pt-3">
          <AdminSectionTitle title="Aktivitas harian" icon={Activity} border className="mb-4" />
          <FeatureDailyChart daily={MOCK_FEATURE_DAILY} />
        </section>
      </div>

      <section className="space-y-3">
        <AdminSectionTitle title="Rincian fitur" icon={MousePointerClick} />
        <AdminTable>
          <table className="w-full text-body-sm">
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Fitur</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Aktivitas</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Tren</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Adopsi</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Kedalaman</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Terakhir digunakan</th>
              </tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border/60">
              {MOCK_FEATURE_ROWS.map((row, index) => (
                <tr key={row.key} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{row.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {row.events.toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusBadge tone={(row.trendPercent ?? 0) >= 0 ? "success" : "error"}>
                      {(row.trendPercent ?? 0) > 0 ? `+${row.trendPercent}%` : `${row.trendPercent}%`}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-brand-primary" style={{ width: `${row.adoptionPercent}%` }} />
                      </div>
                      <span className="w-9 text-right text-body-xs tabular-nums font-medium text-foreground">
                        {row.adoptionPercent}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.eventsPerUser}x</td>
                  <td className="px-4 py-3 text-body-xs text-muted-foreground">
                    {row.lastUsedAt ? <FormattedDate date={row.lastUsedAt} options={{ dateStyle: "medium" }} /> : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTable>
      </section>
    </div>
  );
}

type ViewKey = "ops" | "tutor-activity" | "analytics" | "feature-usage" | "keys" | "mobile-ops";

function AdminOpsReworkContent() {
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as ViewKey) || "ops";

  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);

  const experience = useMemo<StudentExperienceAdapter>(
    () => ({
      mode: "demo",
      pathname: "/admin/ops",
      href: (path: string) => path,
      account: { name: "Adi Haditya Nursyam", email: "soezyxst@gmail.com" },
      courseHref: (id) => `/courses/${id}`,
      route: (v) => `/${v}`,
      baseline: [],
      selectedCourseId: null,
      overlay: null,
      ready: true,
    }),
    []
  );

  const sidebarPathMap: Record<ViewKey, string> = {
    ops: "/admin/ops",
    "tutor-activity": "/admin/ops/tutor-activity",
    analytics: "/admin/ops/analytics",
    "feature-usage": "/admin/ops/feature-usage",
    keys: "/admin/ops/keys",
    "mobile-ops": "/admin/ops/web-analytics",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <CommandMenuProvider>
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            showOrnaments={false}
            desktopSidebar={<AdminSidebar pathnameOverride={sidebarPathMap[view]} />}
            mobileTopNav={view === "mobile-ops" ? <AdminMobileTopNav /> : undefined}
            mobileBottomNav={view === "mobile-ops" ? <AdminMobileBottomNav /> : undefined}
          >
            {view === "mobile-ops" && <AdminMobileSubTabNav />}
            <ApplicationPage maxWidth="7xl" className="pb-10">
              {view === "ops" && <OpsClient />}
              {view === "tutor-activity" && (
                <ActivityTable
                  items={MOCK_TUTOR_ACTIVITIES}
                  hasNextPage={true}
                  hasPrevPage={false}
                  onNextPage={() => {}}
                  onPrevPage={() => {}}
                  limit={20}
                />
              )}
              {view === "analytics" && <AiAnalyticsClient />}
              {view === "feature-usage" && <FeatureUsagePreview />}
              {view === "keys" && <KeysClient />}
              {view === "mobile-ops" && <OpsClient />}
            </ApplicationPage>
          </ApplicationShell>
        </StudentExperienceProvider>
      </CommandMenuProvider>
    </QueryClientProvider>
  );
}

export default function AdminOpsReworkFixturePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AdminOpsReworkContent />
    </Suspense>
  );
}
