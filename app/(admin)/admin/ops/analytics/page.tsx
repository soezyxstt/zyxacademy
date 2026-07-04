import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { AiAnalyticsClient } from "./analytics-client";

export const metadata: Metadata = {
  title: pageTitle("Analytics"),
};

export default async function AiAnalyticsPage() {
  await assertTutorOrAdmin();

  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Analitik AI</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Laporan penggunaan token dan performa model AI.
        </p>
      </div>
      <AiAnalyticsClient />
    </div>
  );
}
