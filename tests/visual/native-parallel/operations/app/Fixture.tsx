"use client";
import { useState } from "react";
import { monitoringFixtureData, emptyWebAnalytics } from "@/packages/native-parity/operations/monitoring-fixtures";
import { NextIntlClientProvider } from "next-intl";
import { WebAnalyticsOverview } from "@/components/admin/web-analytics-overview";
import { BlogThumbnail } from "@/components/blog/blog-thumbnail";
import adminOps from "@/messages/id/adminOps.json";

const populated = monitoringFixtureData.web;
const empty = emptyWebAnalytics;
const valid = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23007e78'/%3E%3C/svg%3E";
export default function Fixture({ params }: { params: { case?: string; theme?: string } }) {
  const id = params.case ?? "analytics-data";
  const [broken, setBroken] = useState(false);
  const theme = params.theme === "dark" ? "dark" : "light";
  return <NextIntlClientProvider locale="id" messages={{ adminOps }} timeZone="UTC"><main className={`${theme} bg-background text-foreground min-h-screen p-4`} data-case={id}>
    {id.startsWith("analytics-") ? <WebAnalyticsOverview metrics={id === "analytics-data" ? populated : id === "analytics-empty" ? empty : null} /> : <><BlogThumbnail src={broken ? "data:image/png;base64,AAAA" : valid} sizes="348px" className="h-48 w-full rounded-md" />{id === "blog-failed" && <button onClick={() => setBroken(true)}>Simulasikan gambar gagal</button>}</>}
  </main></NextIntlClientProvider>;
}
