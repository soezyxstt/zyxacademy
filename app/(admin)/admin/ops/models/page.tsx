import { Cpu } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TranslatedText } from "@/components/i18n/translated-text";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { listModelSettingViews } from "@/lib/ai/model-settings-store";
import { getTranslations } from "@/lib/i18n/server";
import { pageTitle } from "@/lib/site";
import { ModelsClient } from "./models-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return {
    title: pageTitle(t("models.title")),
    description: t("models.description"),
  };
}

export default async function AiModelsAdminPage() {
  await assertAdmin();
  const t = await getTranslations("adminOps");
  const initialViews = await listModelSettingViews();

  return (
    <div className="w-full space-y-6">
      <AdminPageHeader
        icon={Cpu}
        title={<TranslatedText namespace="adminOps" messageKey="models.title" />}
        description={t("models.description")}
      />
      <ModelsClient initialViews={initialViews} />
    </div>
  );
}
