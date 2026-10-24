import type { Locale } from "@/lib/i18n/locale";

/** Carry the visitor's current UI locale into auth without changing their saved preference. */
export function withAuthLocale(href: string, locale: Locale): string {
  const [pathname, suffix = ""] = href.split(/(?=[?#])/, 2);
  if (pathname !== "/sign-in" && pathname !== "/sign-up") return href;
  const params = new URLSearchParams(suffix.startsWith("?") ? suffix.slice(1).split("#")[0] : "");
  params.set("locale", locale);
  const query = params.toString();
  const hash = suffix.includes("#") ? `#${suffix.split("#").slice(1).join("#")}` : "";
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}
