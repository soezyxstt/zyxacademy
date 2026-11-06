import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getTranslations as nextGetTranslations } from "next-intl/server";
import { getAuthSession, type AuthSession } from "@/lib/auth-session";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/shared";
import { loadMessages } from "@/lib/i18n/catalogs";
import { getUserLocalePreference } from "@/lib/i18n/preferences";
import { normalizeLocale, resolveLocale, type Locale } from "@/lib/i18n/locale";

const resolveRequestLocale = cache(async (): Promise<{ locale: Locale; accountPreference: Locale | null }> => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const explicitUrlLocale = normalizeLocale(requestHeaders.get("x-app-locale"));
  if (explicitUrlLocale) return { locale: explicitUrlLocale, accountPreference: null };

  let accountPreference: Locale | null = null;
  let session: AuthSession = null;
  try {
    session = await getAuthSession();
  } catch {
    // An expired or unavailable session falls through to cookie/browser preference.
  }
  if (session?.user?.id) accountPreference = await getUserLocalePreference(session.user.id);

  return {
    locale: resolveLocale({
    accountPreference,
    cookieLocale: cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
    }),
    accountPreference,
  };
});

export async function getAppLocale(): Promise<Locale> {
  return (await resolveRequestLocale()).locale;
}

export async function getAppLocaleResolution() {
  return resolveRequestLocale();
}

export async function getTranslations(namespace: string) {
  const locale = await getAppLocale();
  return nextGetTranslations({ locale, namespace });
}

export async function getAppMessages(locale: Locale) {
  return loadMessages(locale);
}
