import { normalizeDate } from "./normalization";

export type FormattedDateInput = {
  date: Date | string | number;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
};

const defaultOptions: Intl.DateTimeFormatOptions = { dateStyle: "full", timeStyle: "short" };

export function resolveDateDisplay(
  { date, locale, options = defaultOptions }: FormattedDateInput,
  appLocale: "id" | "en",
  serverRender = false,
) {
  const normalized = normalizeDate(date);
  if (Number.isNaN(normalized.getTime())) return null;
  const resolvedLocale = locale ?? (appLocale === "id" ? "id-ID" : "en-US");
  return {
    locale: resolvedLocale,
    text: normalized.toLocaleString(resolvedLocale, serverRender ? { ...options, timeZone: "UTC" } : options),
  };
}
