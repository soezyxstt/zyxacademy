import type { Locale } from "@/lib/i18n/locale";
import { localizedPublicPath } from "@/lib/public-locale-routes";
export type DemoRouteView = "dashboard" | "courses" | "progress" | "history" | "article" | "diktat" | "flashcards" | "quiz" | "tryout" | "zyra";
export function demoRoute(locale: Locale, view: DemoRouteView, courseId: string): string {
  const path = view === "dashboard" ? "/demo" : `/demo/${view}`;
  return `${localizedPublicPath(locale, path) ?? path}?course=${encodeURIComponent(courseId)}`;
}
