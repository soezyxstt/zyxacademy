import { notFound } from "next/navigation";
import { UserCheck } from "lucide-react";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { getPkaRegistrationsAction } from "../actions";
import { RegistrationsTab } from "../_components/registrations-tab";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TabNav } from "@/components/ui/tabs";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("pka.registrations")), description: t("pka.description") };
}

export default async function TutorialPkaRegistrationsPage() {
  const t = await getTranslations("adminOps");
  if (env.FEATURE_PKA !== "1") notFound();

  const registrations = await getPkaRegistrationsAction();

  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={UserCheck}
        title={<TranslatedText namespace="adminOps" messageKey="pka.registrations" />}
      />
      <TabNav
        tabs={[
          { href: "/admin/tutorial-pka/registrations", label: t("pka.tabRegistrations") },
          { href: "/admin/tutorial-pka/announcements", label: t("pka.tabAnnouncements") },
          { href: "/admin/tutorial-pka/schedules", label: t("pka.tabSchedules") },
        ]}
      />

      <div>
        <RegistrationsTab registrations={registrations} />
      </div>
    </div>
  );
}
