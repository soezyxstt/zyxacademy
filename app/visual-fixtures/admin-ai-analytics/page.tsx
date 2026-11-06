import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AiAnalyticsClient } from "@/app/(admin)/admin/ops/analytics/analytics-client";

export default function AnalyticsFixture() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_VISUAL_FIXTURES !== "true") notFound();
  return <main className="mx-auto w-full min-w-0 max-w-6xl space-y-5 p-4 sm:p-6"><AdminPageHeader title="Analitik Zyra" /><AiAnalyticsClient /></main>;
}
