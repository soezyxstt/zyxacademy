import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AiAnalyticsClient } from "./analytics-client";
import { LineChart } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("analytics.title")) };
}

export default async function AiAnalyticsPage() {
  await assertTutorOrAdmin();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={LineChart}
        title={<TranslatedText namespace="adminOps" messageKey="analytics.title" />}
      />
      <AiAnalyticsClient />
    </div>
  );
}
