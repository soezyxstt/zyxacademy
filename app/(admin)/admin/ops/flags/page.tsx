import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FlagsClient } from "./flags-client";
import { Flag } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("flags.title")), description: t("flags.description") };
}

export default async function FeatureFlagsPage() {
  const t = await getTranslations("adminOps");
  return (
    <div className="w-full space-y-8">
      <AdminPageHeader
        icon={Flag}
        title={<TranslatedText namespace="adminOps" messageKey="flags.title" />}
        description={t("flags.description")}
      />
      <FlagsClient />
    </div>
  );
}
