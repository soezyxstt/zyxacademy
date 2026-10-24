import { getRequestConfig } from "next-intl/server";
import { getAppLocale } from "@/lib/i18n/server";
import { loadMessages } from "@/lib/i18n/catalogs";

export default getRequestConfig(async () => {
  const locale = await getAppLocale();
  return { locale, messages: await loadMessages(locale) };
});
