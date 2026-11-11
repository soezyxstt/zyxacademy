import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createTranslator } from "next-intl";
import type { getTranslations as nextGetTranslations } from "next-intl/server";
import type { AuthSession } from "@/lib/auth-session";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/shared";
import { DEFAULT_NAMESPACES, loadCatalog } from "@/lib/i18n/catalogs";
import { getUserLocalePreference } from "@/lib/i18n/preferences";
import { normalizeLocale, resolveLocale, type Locale } from "@/lib/i18n/locale";

const resolveRequestLocale = cache(async (): Promise<{ locale: Locale; accountPreference: Locale | null }> => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const explicitUrlLocale = normalizeLocale(requestHeaders.get("x-app-locale"));
  if (explicitUrlLocale) return { locale: explicitUrlLocale, accountPreference: null };

  let accountPreference: Locale | null = null;
  let session: AuthSession = null;
  try {
    const { getAuthSession } = await import("@/lib/auth-session");
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

// The root provider and server translators can request the same catalog in a
// render. React's cache shares it only within that request, keyed by strings.
const getRequestCatalog = cache(loadCatalog);

const getNamespaceTranslator = cache(async (locale: Locale, namespace: string) => {
  const rootNamespace = namespace.split(".")[0];
  const messages = { [rootNamespace]: await getRequestCatalog(locale, rootNamespace) };
  return createTranslator({
    locale,
    messages,
    namespace,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }) as unknown as Awaited<ReturnType<typeof nextGetTranslations>>;
});

export async function getTranslations(namespace: string) {
  return getNamespaceTranslator(await getAppLocale(), namespace);
}

const getRequestMessages = cache(async (locale: Locale) => Object.fromEntries(
  await Promise.all(DEFAULT_NAMESPACES.map(async (namespace) => [
    namespace,
    await getRequestCatalog(locale, namespace),
  ] as const)),
));

export async function getAppMessages(locale: Locale) {
  return getRequestMessages(locale);
}
