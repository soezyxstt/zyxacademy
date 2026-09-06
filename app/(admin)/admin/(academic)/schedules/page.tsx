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

export default async function AdminSchedulesPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const data = await getAdminScheduleData(0);

  return (
    <div className="space-y-3">
      <PageHeader
        icon={CalendarDays}
        title="Jadwal & Kalender Akademik"
      />
      <AcademicSchedulesDashboard initialData={data} />
    </div>
  );
}
