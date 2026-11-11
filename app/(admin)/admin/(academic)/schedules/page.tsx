import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { getAdminScheduleData } from "./actions";
import { AcademicSchedulesDashboard } from "@/components/admin/academic-schedules-dashboard";
import { PageHeader } from "@/components/page-header";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("schedules.title")), description: t("schedules.description") };
}

function parseWeekOffset(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : 0;
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-520, Math.min(520, Math.trunc(parsed)));
}

export default async function AdminSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const params = await searchParams;
  const weekOffset = parseWeekOffset(params.week);
  const data = await getAdminScheduleData(weekOffset);

  return (
    <div className="space-y-3">
      <PageHeader
        icon={CalendarDays}
        title={<TranslatedText namespace="adminOps" messageKey="schedules.title" />}
      />
      <AcademicSchedulesDashboard initialData={data} initialWeekOffset={weekOffset} />
    </div>
  );
}
