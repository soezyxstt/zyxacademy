import { headers } from "next/headers";
import { createTranslator } from "next-intl";
import { loadMessages } from "@/lib/i18n/catalogs";

export async function getAppLocale() {
  return (await headers()).get("x-fixture-locale") === "en" ? "en" : "id";
}

export async function getTranslations(namespace: string) {
  const locale = await getAppLocale();
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace, timeZone: "UTC" });
}
