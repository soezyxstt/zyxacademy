import { addCalendarDays, calendarDateFromInput } from "@/lib/schedule/calendar-date";
import { formatJakartaDateKey, parseJakartaSessionStart } from "./interval-policy";

export function getAvailabilityReminderWeek(now: Date) {
  const dateKey = formatJakartaDateKey(now);
  const day = new Date(dateKey + "T00:00:00Z").getUTCDay();
  const start = addCalendarDays(calendarDateFromInput(dateKey), day === 6 ? 1 : -day);
  return { dateKey, start, end: addCalendarDays(start, 6), saturday: day === 6 };
}

/** A slot belongs to its first five-minute sweep at or after H-30. */
export function isDueTutorialEmail(date: string, time: string, tick: Date, now = tick) {
  const starts = parseJakartaSessionStart(date, time);
  if (!starts || starts <= now) return false;
  const minutes = (starts.getTime() - tick.getTime()) / 60_000;
  return minutes > 25 && minutes <= 30;
}

export function safeReminderLink(value: string, appUrl: string): string | null {
  try {
    const trimmed = value.trim();
    const url = new URL(trimmed, appUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || (!/^https?:\/\//i.test(trimmed) && !/^\/(?!\/)/.test(trimmed))) return null;
    return url.toString();
  } catch {
    return null;
  }
}
