import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { Activity, CheckCircle2, AlertTriangle, XCircle, ScrollText } from "lucide-react";
import {
  queryTutorActivityFilterOptions,
  queryTutorActivityLogs,
  queryTutorActivityStats,
} from "./dal";
import { TutorActivityClient } from "./_components/tutor-activity-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Aktivitas Tutor"),
  description: "Log audit mutasi dan riwayat tindakan operasional tutor Zyx Academy.",
};

export default async function TutorActivityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
    redirect("/");
  }

  const [stats, options, initialResult] = await Promise.all([
    queryTutorActivityStats(),
    queryTutorActivityFilterOptions(),
    queryTutorActivityLogs({ limit: 25 }),
  ]);

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      <AdminPageHeader
        icon={Activity}
        title="Aktivitas Tutor"
      />

      {/* KPI Stats Strip */}
      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          label="Total Mutasi"
          value={stats.total.toLocaleString("id-ID")}
          icon={ScrollText}
          tone="default"
        />
        <AdminStatStripItem
          label="Sukses"
          value={stats.success.toLocaleString("id-ID")}
          caption={stats.total > 0 ? `${Math.round((stats.success / stats.total) * 100)}% dari total` : "0%"}
          icon={CheckCircle2}
          tone="success"
        />
        <AdminStatStripItem
          label="Ditolak"
          value={stats.rejected.toLocaleString("id-ID")}
          caption="Perlu revisi atau koreksi"
          icon={AlertTriangle}
          tone="warning"
        />
        <AdminStatStripItem
          label="Gagal"
          value={stats.failed.toLocaleString("id-ID")}
          caption="Mengalami kesalahan sistem"
          icon={XCircle}
          tone="error"
        />
      </AdminStatStrip>

      {/* Main Interactive Log Viewer */}
      <TutorActivityClient
        initialResult={initialResult}
        options={options}
      />
    </div>
  );
}
