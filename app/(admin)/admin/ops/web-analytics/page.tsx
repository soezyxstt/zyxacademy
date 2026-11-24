import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { getDashboardMetrics } from "@/lib/analytics-dashboard";
import { WebAnalyticsOverview } from "@/components/admin/web-analytics-overview";
import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { Globe } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("webAnalytics.title30")) };
}

export default async function WebAnalyticsPage() {
  await assertTutorOrAdmin(); // ensures admin role

  const metrics = await getDashboardMetrics(30);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Globe}
        title={<TranslatedText namespace="adminOps" messageKey="webAnalytics.title30" />}
        actions={<RefreshAnalyticsButton />}
      />

      <WebAnalyticsOverview metrics={metrics} />
    </div>
  );
}
