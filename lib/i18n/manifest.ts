import type { Locale } from "@/lib/i18n/locale";
import { localizedPublicPath } from "@/lib/public-locale-routes";

/** Keep one installed app identity while its public start page follows locale. */
export const APP_MANIFEST_ID = "/";
export const APP_MANIFEST_SCOPE = "/";

export function getLocalizedManifestStartUrl(locale: Locale): string {
  if (locale === "id") return "/";
  return localizedPublicPath(locale, "/") ?? "/";
}
