import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import { getDashboardMetrics } from "@/lib/analytics-dashboard";
import { WebAnalyticsOverview } from "@/components/admin/web-analytics-overview";
import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { hasAdminAuthorization } from "@/lib/auth/admin-guards";
import { getPeranCodes } from "@/lib/auth/request-cache";
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
  const { user } = await assertTutorOrAdmin();
  const [metrics, canManageOfflineData] = await Promise.all([
    getDashboardMetrics(30),
    hasAdminAuthorization(user.id, user.role, getPeranCodes),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Globe}
        title={<TranslatedText namespace="adminOps" messageKey="webAnalytics.title30" />}
        actions={<>
          {canManageOfflineData && (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/ops/offline">
                <TranslatedText namespace="adminOps" messageKey="offlineCache.title" />
              </Link>
            </Button>
          )}
          <RefreshAnalyticsButton />
        </>}
      />

      <WebAnalyticsOverview metrics={metrics} />
    </div>
  );
}
