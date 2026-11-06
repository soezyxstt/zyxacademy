import type { ReactNode } from "react";
import { DocumentFixture } from "./document-fixture";
import { MediaLibrary } from "@/components/admin/media-library";
import { StorageBrowser } from "@/components/admin/storage-browser";
import { LinksManager } from "@/components/admin/links-manager";
import { notFound } from "next/navigation";
import { FlagsClient } from "@/app/(admin)/admin/ops/flags/flags-client";
import { AiAnalyticsClient } from "@/app/(admin)/admin/ops/analytics/analytics-client";
import AdminFormsBuilder from "@/components/forms/admin-forms-builder";
import FormDetail from "@/app/(admin)/admin/forms/[id]/page";
import MeetDetail from "@/app/(admin)/admin/meet/[id]/page";
import { ProductCatalogPanel } from "@/components/admin/product-catalog-panel";
import { ZyraOpsPanel } from "@/components/admin/zyra-ops-panel";
import { ZyraUsageCharts } from "@/components/admin/zyra-usage-charts";

export default async function AdminLoadingFlowsFixture({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state } = await searchParams;
  const states: Record<string, ReactNode> = {
    flags: <FlagsClient />,
    analytics: <AiAnalyticsClient />,
    forms: <AdminFormsBuilder presetsEnabled />,
    media: <MediaLibrary />,
    storage: <StorageBrowser />,
    links: <LinksManager />,
    document: <DocumentFixture />,
    "form-detail": <FormDetail params={Promise.resolve({ id: "visual" })} />,
    "meet-detail": <MeetDetail params={Promise.resolve({ id: "visual" })} />,
    catalog: <ProductCatalogPanel />,
    ops: <ZyraOpsPanel />,
    usage: <ZyraUsageCharts />,
  };
  const content = states[state ?? ""];
  if (!content) notFound();
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:pl-72 lg:pr-8">
      {content}
    </main>
  );
}
