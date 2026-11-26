import { createTranslator } from "next-intl";
import { loadCatalog } from "@/lib/i18n/catalogs";

export async function getAppLocale() {
  return "id" as const;
}

export async function getTranslations(namespace: string) {
  const root = namespace.split(".")[0];
  const messages = { [root]: await loadCatalog("id", root) };
  return createTranslator({ locale: "id", messages, namespace, timeZone: "UTC" });
}
