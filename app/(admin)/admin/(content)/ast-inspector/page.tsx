import { assertAdmin } from "@/lib/auth/admin-guards-server";
import { ASTInspectorClient } from "./ast-inspector-client";
import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Activity } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("astInspector.title")), description: t("astInspector.description") };
}

export default async function ASTInspectorPage() {
  await assertAdmin();
  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={Activity}
        title={<TranslatedText namespace="adminOps" messageKey="astInspector.title" />}
      />
      <ASTInspectorClient />
    </div>
  );
}
