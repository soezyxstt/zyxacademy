import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { getPkaAnnouncementsAction } from "../actions";
import { AnnouncementsTab } from "../_components/announcements-tab";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TabNav } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Pengumuman Tutorial PKA"),
  description: "Kelola pengumuman Tutorial PKA.",
};

export default async function TutorialPkaAnnouncementsPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const announcements = await getPkaAnnouncementsAction();

  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={Megaphone}
        title="Pengumuman Tutorial PKA"
      />
      <TabNav
        tabs={[
          { href: "/admin/tutorial-pka/registrations", label: "Pendaftar" },
          { href: "/admin/tutorial-pka/announcements", label: "Pengumuman" },
          { href: "/admin/tutorial-pka/schedules", label: "Jadwal Live" },
        ]}
      />

      <div>
        <AnnouncementsTab history={announcements} />
      </div>
    </div>
  );
}
