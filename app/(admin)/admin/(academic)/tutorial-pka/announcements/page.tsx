import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { getPkaAnnouncementsAction } from "../actions";
import { AnnouncementsTab } from "../_components/announcements-tab";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Pengumuman Tutorial PKA"),
  description: "Kelola pengumuman Tutorial PKA.",
};

export default async function TutorialPkaAnnouncementsPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const announcements = await getPkaAnnouncementsAction();

  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Pengumuman Tutorial PKA</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kirim pengumuman otomatis ke email dan push notification peserta yang berlangganan.
        </p>
      </div>

      <div className="mt-6">
        <AnnouncementsTab history={announcements} />
      </div>
    </div>
  );
}
