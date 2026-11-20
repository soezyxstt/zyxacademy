import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import id from "@/messages/id/discussions.json";
import en from "@/messages/en/discussions.json";

export function DiscussionI18nFixture({ children, locale = "id" }: { children: ReactNode; locale?: "id" | "en" }) {
  return <NextIntlClientProvider locale={locale} messages={{ discussions: locale === "en" ? en : id, ui: { close: locale === "en" ? "Close" : "Tutup" } }} timeZone="UTC">{children}</NextIntlClientProvider>;
}
