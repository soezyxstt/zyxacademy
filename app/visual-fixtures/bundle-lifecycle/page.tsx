import { notFound } from "next/navigation";
import { BundleLifecycleFixture } from "./fixture-client";
import { NextIntlClientProvider } from "next-intl";
import { loadMessages } from "@/lib/i18n/catalogs";

export default async function BundleLifecycleFixturePage({ searchParams }: { searchParams: Promise<{ mode?: string; language?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { mode, language } = await searchParams;
  const content = <BundleLifecycleFixture mode={mode} />;
  return language === "en" ? <NextIntlClientProvider locale="en" timeZone="UTC" messages={await loadMessages("en")}>{content}</NextIntlClientProvider> : content;
}
