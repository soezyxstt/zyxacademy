import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AiAnalyticsClient } from "./analytics-client";
import { LineChart } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Analytics"),
};

export default async function AiAnalyticsPage() {
  await assertTutorOrAdmin();

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={LineChart}
        title="Analitik AI"
        description="Laporan penggunaan token dan performa model AI."
      />
      <AiAnalyticsClient />
    </div>
  );
}
