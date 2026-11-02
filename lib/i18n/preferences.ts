import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accountLocalePreferences } from "@/db/schema";
import { normalizeLocale, type Locale } from "@/lib/i18n/locale";

/** Reads only the account presentation preference. Safe to use without Next.js or React. */
export async function getUserLocalePreference(userId: string): Promise<Locale | null> {
  const [row] = await db
    .select({ locale: accountLocalePreferences.locale })
    .from(accountLocalePreferences)
    .where(eq(accountLocalePreferences.userId, userId))
    .limit(1);
  return normalizeLocale(row?.locale);
}

export async function saveUserLocalePreference(userId: string, locale: Locale): Promise<void> {
  await db
    .insert(accountLocalePreferences)
    .values({ userId, locale, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: accountLocalePreferences.userId,
      set: { locale, updatedAt: new Date() },
    });
}

/** Sets a locale for a new account only; a pre-existing choice always wins. */
export async function inheritUserLocalePreference(userId: string, locale: Locale): Promise<void> {
  await db
    .insert(accountLocalePreferences)
    .values({ userId, locale, updatedAt: new Date() })
    .onConflictDoNothing({ target: accountLocalePreferences.userId });
}
