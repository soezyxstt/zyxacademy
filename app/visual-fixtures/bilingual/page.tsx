import { BilingualSwitchFixture } from "@/components/i18n/bilingual-switch-fixture";
import { getAppMessages, getAppLocale } from "@/lib/i18n/server";
import { normalizeLocale } from "@/lib/i18n/locale";

export default async function BilingualFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const queryLocale = typeof params.locale === "string" ? normalizeLocale(params.locale) : null;
  const locale = queryLocale ?? await getAppLocale();
  const messages = await getAppMessages(locale);
  return <BilingualSwitchFixture locale={locale} messages={messages} mockPersistence={params.mode !== "cookie"} mode={params.mode} />;
}
