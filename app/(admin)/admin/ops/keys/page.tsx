import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KeysClient } from "./keys-client";
import { KeyRound } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("keys.title")), description: t("keys.description") };
}

export default async function KeysPage() {
  const t = await getTranslations("adminOps");
  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={KeyRound}
        title={<TranslatedText namespace="adminOps" messageKey="keys.title" />}
        description={t("keys.description")}
      />
      <KeysClient />
    </div>
  );
}
