export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "id";

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "id" || normalized.startsWith("id-")) return "id";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return null;
}

function preferredFromAcceptLanguage(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const languages = value.split(",").map((item, index) => {
    const [tag, ...parameters] = item.trim().split(";");
    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
    const parsedQuality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
    const quality = Number.isFinite(parsedQuality) && parsedQuality > 0 && parsedQuality <= 1 ? parsedQuality : 0;
    return { tag, quality, index };
  });

  languages.sort((left, right) => right.quality - left.quality || left.index - right.index);
  for (const language of languages) {
    if (language.quality === 0) continue;
    const locale = normalizeLocale(language.tag);
    if (locale) return locale;
  }
  return null;
}

export function resolveLocale(input: {
  explicitUrlLocale?: unknown;
  accountPreference?: unknown;
  cookieLocale?: unknown;
  acceptLanguage?: string | null;
}): Locale {
  return (
    normalizeLocale(input.explicitUrlLocale) ??
    normalizeLocale(input.accountPreference) ??
    normalizeLocale(input.cookieLocale) ??
    preferredFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}
