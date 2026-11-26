"use client";
import { NextIntlClientProvider } from "next-intl";
import marketing from "@/messages/id/marketing.json";
import ui from "@/messages/id/ui.json";
import learning from "@/messages/id/learning.json";
import adminOps from "@/messages/id/adminOps.json";
export function Providers({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider locale="id" messages={{ marketing, adminOps, ui, learning }} timeZone="UTC">{children}</NextIntlClientProvider>;
}
