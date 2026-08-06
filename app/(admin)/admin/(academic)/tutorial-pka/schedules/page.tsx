import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { getPkaSchedulesAction } from "../actions";
import { SchedulesTab } from "../_components/schedules-tab";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminTabNav } from "@/components/admin/tab-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Jadwal Live Tutorial PKA"),
  description: "Kelola jadwal live Tutorial PKA.",
};

export default async function TutorialPkaSchedulesPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const schedules = await getPkaSchedulesAction();

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={CalendarDays}
        title="Jadwal Live Tutorial PKA"
        description="Atur jadwal sesi live Tutorial PKA. Jadwal akan dikirim otomatis ke email peserta."
      />
      <AdminTabNav
        tabs={[
          { href: "/admin/tutorial-pka/registrations", label: "Pendaftar" },
          { href: "/admin/tutorial-pka/announcements", label: "Pengumuman" },
          { href: "/admin/tutorial-pka/schedules", label: "Jadwal Live" },
        ]}
      />

      <div>
        <SchedulesTab schedules={schedules} />
      </div>
    </div>
  );
}
