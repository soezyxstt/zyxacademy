import type { Locale } from "@/lib/i18n/locale";

/** Public pages with complete application-owned translations. */
export const PUBLIC_LOCALE_ROUTES = [
  "/",
  "/about",
  "/plans",
  "/testimonial",
  "/blog",
  "/privacy",
  "/terms",
  "/demo",
  "/demo/article",
  "/demo/diktat",
  "/demo/flashcards",
  "/demo/quiz",
  "/demo/zyra",
] as const;

export type PublicLocaleRoute = (typeof PUBLIC_LOCALE_ROUTES)[number];

export function getPublicLocaleRoute(pathname: string): PublicLocaleRoute | null {
  return PUBLIC_LOCALE_ROUTES.find((route) => route === pathname) ?? null;
}

export function localizedPublicPath(locale: Locale, pathname: string): string | null {
  const route = getPublicLocaleRoute(pathname) ?? (/^\/blog\/[^/]+$/.test(pathname) ? pathname : null);
  if (!route) return null;
  return route === "/" ? `/${locale}` : `/${locale}${route}`;
}

export function stripPublicLocalePrefix(pathname: string): { locale: Locale; path: string } | null {
  const match = pathname.match(/^\/(id|en)(?=\/|$)(.*)$/);
  if (!match) return null;
  const locale = match[1] as Locale;
  const remainder = match[2] || "/";
  const path = remainder.startsWith("/") ? remainder : `/${remainder}`;
  return localizedPublicPath(locale, path) ? { locale, path } : null;
}
