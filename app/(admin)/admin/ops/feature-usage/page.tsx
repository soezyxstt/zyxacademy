import Link from "next/link";
import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards-server";
import {
  getFeatureUsageMetrics,
  resolveFeatureUsageRange,
} from "@/lib/feature-usage-metrics";
import { AdminPageHeader } from "@/components/admin/page-header";
import { UsageRangeSelect } from "./usage-range-select";
import { FeatureUsageOverview } from "./feature-usage-overview";
import { MousePointerClick } from "lucide-react";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("featureUsage.title")) };
}

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function FeatureUsagePage({ searchParams }: Props) {
  const t = await getTranslations("adminOps");
  await assertTutorOrAdmin();

  const { range } = await searchParams;
  const rangeDays = resolveFeatureUsageRange(range);
  const metrics = await getFeatureUsageMetrics(rangeDays);

  return (
    <div className="space-y-8 md:space-y-10">
      <AdminPageHeader
        icon={MousePointerClick}
        title={<TranslatedText namespace="adminOps" messageKey="featureUsage.title" />}
        actions={<UsageRangeSelect current={rangeDays} />}
      />

      <FeatureUsageOverview metrics={metrics} />

      <p className="text-body-xs text-muted-foreground">
        {t("featureUsageUI.publicVisits")}{" "}
        <Link href="/admin/ops/web-analytics" className="font-medium text-brand-primary hover:underline">
          Web Analytics
        </Link>{" "}
        ·{" "}
        <Link href="/admin/ops/analytics" className="font-medium text-brand-primary hover:underline">
          Analitik Zyra
        </Link>
      </p>
    </div>
  );
}
