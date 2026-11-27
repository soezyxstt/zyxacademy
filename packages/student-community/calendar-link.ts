export const calendarLinkStart = "/api/auth/native/google-link/start";
export const calendarLinkState = (value: string | null | undefined): value is string =>
  typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export type StudentCalendarPath = "/calendar" | "/dashboard/schedule";
export const studentCalendarPath = (value: string): value is StudentCalendarPath =>
  value === "/calendar" || value === "/dashboard/schedule";

export function calendarBrowserUrl(origin: string, value: unknown): string | null {
  if (!value || typeof value !== "object" || !("nativeBrowser" in value) || value.nativeBrowser !== true ||
    !("url" in value) || typeof value.url !== "string" || !value.url.startsWith(calendarLinkStart + "?")) return null;
  try {
    const url = new URL(value.url, origin);
    const entries = Array.from(url.searchParams.entries());
    return url.protocol === "https:" && url.origin === origin && url.pathname === calendarLinkStart &&
      !url.hash && entries.length === 1 && entries[0][0] === "token" && /^[A-Za-z0-9_-]{43}$/.test(entries[0][1])
      ? url.href : null;
  } catch { return null; }
}
