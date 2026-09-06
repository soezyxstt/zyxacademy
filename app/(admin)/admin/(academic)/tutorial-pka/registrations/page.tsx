import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserCheck } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { getPkaRegistrationsAction } from "../actions";
import { RegistrationsTab } from "../_components/registrations-tab";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TabNav } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Pendaftar Tutorial PKA"),
  description: "Kelola pendaftar Tutorial PKA.",
};

export default async function TutorialPkaRegistrationsPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const registrations = await getPkaRegistrationsAction();

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={UserCheck}
        title="Pendaftar Tutorial PKA"
        description="Kelola pendaftar sesi review live Tutorial PKA."
      />
      <TabNav
        tabs={[
          { href: "/admin/tutorial-pka/registrations", label: "Pendaftar" },
          { href: "/admin/tutorial-pka/announcements", label: "Pengumuman" },
          { href: "/admin/tutorial-pka/schedules", label: "Jadwal Live" },
        ]}
      />

      <div>
        <RegistrationsTab registrations={registrations} />
      </div>
    </div>
  );
}
