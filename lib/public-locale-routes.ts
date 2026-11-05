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
  "/demo/courses",
  "/demo/progress",
  "/demo/history",
  "/demo/article",
  "/demo/diktat",
  "/demo/flashcards",
  "/demo/quiz",
  "/demo/quiz-review",
  "/demo/quiz-summary",
  "/demo/tryout",
  "/demo/tryout-review",
  "/demo/zyra",
  "/demo/overview",
  "/demo/documents",
  "/demo/quiz-list",
  "/demo/quiz-start",
  "/demo/tryout-list",
  "/demo/schedule",
  "/demo/groups",
  "/demo/leaderboard",
  "/demo/course-leaderboard",
  "/demo/feedback",
  "/demo/profile",
  "/demo/profile-edit",
  "/demo/reflections",
  "/demo/settings",
  "/demo/notifications",
  "/demo/video",
  "/demo/playground",
  "/demo/path",
  "/demo/mastery",
  "/demo/results",
  "/demo/live",
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
