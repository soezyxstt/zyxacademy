import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { getPkaAnnouncementsAction } from "../actions";
import { AnnouncementsTab } from "../_components/announcements-tab";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TabNav } from "@/components/ui/tabs";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("pka.announcements")), description: t("pka.description") };
}

export default async function TutorialPkaAnnouncementsPage() {
  const t = await getTranslations("adminOps");
  if (env.FEATURE_PKA !== "1") notFound();

  const announcements = await getPkaAnnouncementsAction();

  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={Megaphone}
        title={<TranslatedText namespace="adminOps" messageKey="pka.announcements" />}
      />
      <TabNav
        tabs={[
          { href: "/admin/tutorial-pka/registrations", label: t("pka.tabRegistrations") },
          { href: "/admin/tutorial-pka/announcements", label: t("pka.tabAnnouncements") },
          { href: "/admin/tutorial-pka/schedules", label: t("pka.tabSchedules") },
        ]}
      />

      <div>
        <AnnouncementsTab history={announcements} />
      </div>
    </div>
  );
}
