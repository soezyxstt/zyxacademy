import { createTranslator } from "next-intl";
import { headers } from "next/headers";
import { loadCatalog } from "@/lib/i18n/catalogs";

export async function getAppLocale() {
  return (await headers()).get("x-fixture-locale") === "en" ? "en" : "id";
}

export async function getTranslations(namespace: string) {
  const root = namespace.split(".")[0];
  const locale = await getAppLocale();
  const messages = { [root]: await loadCatalog(locale, root) };
  return createTranslator({ locale, messages, namespace, timeZone: "UTC" });
}
