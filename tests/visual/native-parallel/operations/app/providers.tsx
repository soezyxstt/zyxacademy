"use client";
import { NextIntlClientProvider } from "next-intl";
import marketing from "@/messages/id/marketing.json";
import ui from "@/messages/id/ui.json";
import learning from "@/messages/id/learning.json";
import adminOps from "@/messages/id/adminOps.json";
import marketingEn from "@/messages/en/marketing.json";
import uiEn from "@/messages/en/ui.json";
import learningEn from "@/messages/en/learning.json";
import adminOpsEn from "@/messages/en/adminOps.json";
export function Providers({ children, locale }: { children: React.ReactNode; locale: "id" | "en" }) {
  const messages = locale === "en" ? { marketing: marketingEn, adminOps: adminOpsEn, ui: uiEn, learning: learningEn } : { marketing, adminOps, ui, learning };
  return <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">{children}</NextIntlClientProvider>;
}
