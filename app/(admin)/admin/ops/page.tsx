import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { OpsClient } from "./ops-client";
import { Activity } from "lucide-react";
import { ZyraOpsPanel } from "@/components/admin/zyra-ops-panel";
import { ZyraProposalPanel } from "@/components/zyra/zyra-proposal-panel";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("ops.title")), description: t("ops.description") };
}

export default async function OpsPage() {
  const t = await getTranslations("adminOps");
  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Activity}
        title={<TranslatedText namespace="adminOps" messageKey="ops.title" />}
        description={t("ops.description")}
      />
      <OpsClient />
      <ZyraOpsPanel />
      <ZyraProposalPanel role="admin" />
    </div>
  );
}
