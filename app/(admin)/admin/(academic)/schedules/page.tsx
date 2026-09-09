import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { getAdminScheduleData } from "./actions";
import { AcademicSchedulesDashboard } from "@/components/admin/academic-schedules-dashboard";
import { PageHeader } from "@/components/page-header";
import { CalendarDays } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Jadwal & Kalender Akademik"),
  description: "Monitor seluruh sesi tutorial kelompok belajar, jadwal Ujian Resmi ITB, Tryout, Kuis, dan tiket reschedule.",
};

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
        title="Jadwal & Kalender Akademik"
      />
      <AcademicSchedulesDashboard initialData={data} initialWeekOffset={weekOffset} />
    </div>
  );
}
