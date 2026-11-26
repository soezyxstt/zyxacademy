import { CalendarDays } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { getPkaSchedulesAction } from "../actions";
import { SchedulesTab } from "../_components/schedules-tab";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TabNav } from "@/components/ui/tabs";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("pka.schedules")), description: t("pka.description") };
}

export default async function TutorialPkaSchedulesPage() {
  const t = await getTranslations("adminOps");

  const schedules = await getPkaSchedulesAction();

  return (
    <div className="min-w-0 space-y-(--related-gap)">
      <AdminPageHeader
        icon={CalendarDays}
        title={<TranslatedText namespace="adminOps" messageKey="pka.schedules" />}
        description={<TranslatedText namespace="adminOps" messageKey="pka.scheduleDescription" />}
      />
      <TabNav
        tabs={[
          { href: "/admin/tutorial-pka/registrations", label: t("pka.tabRegistrations") },
          { href: "/admin/tutorial-pka/announcements", label: t("pka.tabAnnouncements") },
          { href: "/admin/tutorial-pka/schedules", label: t("pka.tabSchedules") },
        ]}
      />

      <SchedulesTab schedules={schedules} />
    </div>
  );
}
