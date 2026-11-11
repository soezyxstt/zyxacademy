import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/request-cache";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { Activity, CheckCircle2, AlertTriangle, XCircle, ScrollText } from "lucide-react";
import {
  queryTutorActivityFilterOptions,
  queryTutorActivityLogs,
  queryTutorActivityStats,
} from "./dal";
import { TutorActivityClient } from "./_components/tutor-activity-client";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("tutorActivity.title")), description: t("tutorActivity.description") };
}

export default async function TutorActivityPage() {
  const t = await getTranslations("adminOps");
  const locale = await getAppLocale();
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
        title={<TranslatedText namespace="adminOps" messageKey="tutorActivity.title" />}
      />

      {/* KPI Stats Strip */}
      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          label={t("tutorActivityStats.total")}
          value={stats.total.toLocaleString(locale === "id" ? "id-ID" : "en-US")}
          icon={ScrollText}
          tone="default"
        />
        <AdminStatStripItem
          label={t("tutorActivityStats.success")}
          value={stats.success.toLocaleString(locale === "id" ? "id-ID" : "en-US")}
          caption={stats.total > 0 ? t("tutorActivityStats.ofTotal", { percent: Math.round((stats.success / stats.total) * 100) }) : "0%"}
          icon={CheckCircle2}
          tone="success"
        />
        <AdminStatStripItem
          label={t("tutorActivityStats.rejected")}
          value={stats.rejected.toLocaleString(locale === "id" ? "id-ID" : "en-US")}
          caption={t("tutorActivityStats.rejectedCaption")}
          icon={AlertTriangle}
          tone="warning"
        />
        <AdminStatStripItem
          label={t("tutorActivityStats.failed")}
          value={stats.failed.toLocaleString(locale === "id" ? "id-ID" : "en-US")}
          caption={t("tutorActivityStats.failedCaption")}
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
