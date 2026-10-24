"use server";

import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME } from "@/lib/i18n/shared";
import { getUserLocalePreference, inheritUserLocalePreference, saveUserLocalePreference } from "@/lib/i18n/preferences";
import { normalizeLocale, resolveLocale, type Locale } from "@/lib/i18n/locale";

export async function saveLocaleSelection(value: unknown): Promise<{ success: boolean }> {
  const locale = normalizeLocale(value);
  if (!locale) return { success: false };

  const requestHeaders = await headers();
  let session;
  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch {
    // Do not silently downgrade a request whose account status could not be checked.
    return { success: false };
  }

  try {
    if (session?.user?.id) await saveUserLocalePreference(session.user.id, locale as Locale);
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE_NAME, locale, {
      // Locale is a non-sensitive presentation preference, also read by provider-free errors.
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/** Called after a normal sign-in to mirror the effective account choice to this browser. */
export async function mirrorLocalePreferenceCookie(): Promise<{ success: boolean; locale?: Locale }> {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user?.id) return { success: false };
    const [cookieStore, accountPreference] = await Promise.all([
      cookies(),
      getUserLocalePreference(session.user.id),
    ]);
    const locale = resolveLocale({
      accountPreference,
      cookieLocale: cookieStore.get(LOCALE_COOKIE_NAME)?.value,
      acceptLanguage: requestHeaders.get("accept-language"),
    });
    writeLocaleCookie(cookieStore, locale);
    return { success: true, locale };
  } catch {
    return { success: false };
  }
}

/** Called only after signup. Copies an explicit browser choice to a new account. */
export async function inheritLocalePreferenceForNewAccount(): Promise<{ success: boolean; locale?: Locale }> {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user?.id) return { success: false };
    const cookieStore = await cookies();
    const currentPreference = await getUserLocalePreference(session.user.id);
    const explicitCookie = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
    if (!currentPreference && explicitCookie) {
      await inheritUserLocalePreference(session.user.id, explicitCookie);
    }
    const afterInherit = await getUserLocalePreference(session.user.id);
    const locale = resolveLocale({
      accountPreference: afterInherit,
      cookieLocale: explicitCookie,
      acceptLanguage: requestHeaders.get("accept-language"),
    });
    writeLocaleCookie(cookieStore, locale);
    return { success: true, locale };
  } catch {
    return { success: false };
  }
}

/** Mirrors a server-resolved account choice without another account or session read. */
export async function mirrorResolvedAccountLocaleCookie(value: unknown): Promise<{ success: boolean }> {
  const locale = normalizeLocale(value);
  if (!locale) return { success: false };
  try {
    const cookieStore = await cookies();
    writeLocaleCookie(cookieStore, locale);
    return { success: true };
  } catch {
    return { success: false };
  }
}

function writeLocaleCookie(cookieStore: Awaited<ReturnType<typeof cookies>>, locale: Locale) {
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
}
