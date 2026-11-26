import { AdminPageHeader } from "@/components/admin/page-header";
import { WebAnalyticsOverview } from "@/components/admin/web-analytics-overview";
import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { FeatureUsageOverview } from "@/app/(admin)/admin/ops/feature-usage/feature-usage-overview";
import { UsageRangeSelect } from "@/app/(admin)/admin/ops/feature-usage/usage-range-select";
import { AdminHomeMobile } from "@/features/admin-home/ui/mobile/admin-home-mobile";
import { AdminHomeDesktop } from "@/features/admin-home/ui/desktop/admin-home-desktop";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { MonitoringRange } from "@/packages/native-parity/operations/monitoring-contract";
import { createMonitoringFixture } from "@/packages/native-parity/operations/monitoring-fixtures";
import { MonitoringProviders } from "./providers";

async function ReferenceContent({ screen, mode, range }: { screen: string; mode: string; range: MonitoringRange }) {
  const variant = mode === "empty" || mode === "unavailable" ? mode : "populated";
  const { reader } = createMonitoringFixture(variant);
  const signal = new AbortController().signal;
  if (screen === "home") {
    const data = await reader.read({ view: "home" }, signal);
    const categories = data.categories.map(category => ({ ...category, items: category.items.map(item => ({ ...item, iconColor: "text-primary" })) }));
    return <>
      <div className="md:hidden"><AdminHomeMobile failedJobs={data.failedJobs} categories={categories} /></div>
      <div className="hidden md:block"><AdminHomeDesktop failedJobs={data.failedJobs} categories={categories} /></div>
    </>;
  }
  if (screen === "web") {
    const metrics = await reader.read({ view: "web" }, signal);
    return <>
      <AdminPageHeader title="Analitik web, 30 hari" actions={<>
        <Button asChild variant="outline" size="sm"><Link href="/admin/ops/offline">Data offline</Link></Button>
        <RefreshAnalyticsButton />
      </>} />
      <WebAnalyticsOverview metrics={metrics} />
    </>;
  }
  if (screen === "features") {
    const data = await reader.read({ view: "features", range }, signal);
    return <>
      <AdminPageHeader title="Penggunaan fitur" actions={<UsageRangeSelect current={range} />} />
      <FeatureUsageOverview metrics={data} />
      <p className="text-body-xs text-muted-foreground">
        Lihat juga: <Link href="/admin/ops/web-analytics" className="font-medium text-brand-primary hover:underline">Web Analytics</Link>
        {" · "}<Link href="/admin/ops/analytics" className="font-medium text-brand-primary hover:underline">Analitik Zyra</Link>
      </p>
    </>;
  }
  return null;
}

export default async function MonitoringPage({ searchParams }: {
  searchParams: Promise<{ screen?: string; mode?: string; range?: string; theme?: string }>;
}) {
  const { screen = "home", mode = "populated", range, theme } = await searchParams;
  const content = await ReferenceContent({ screen, mode, range: range === "7" ? 7 : range === "90" ? 90 : 30 });
  return (
    <MonitoringProviders>
      <main className={`${theme === "dark" ? "dark" : "light"} bg-background text-foreground min-h-screen p-4 space-y-5`} data-monitoring-reference={screen}>
        {content}
      </main>
    </MonitoringProviders>
  );
}
