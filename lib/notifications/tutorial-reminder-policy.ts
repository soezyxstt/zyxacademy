import { addCalendarDays, calendarDateFromInput } from "@/lib/schedule/calendar-date";
import { formatJakartaDateKey, parseJakartaSessionStart } from "./interval-policy";

export function getAvailabilityReminderWeek(now: Date) {
  const dateKey = formatJakartaDateKey(now);
  const day = new Date(dateKey + "T00:00:00Z").getUTCDay();
  const start = addCalendarDays(calendarDateFromInput(dateKey), day === 6 ? 1 : -day);
  return { dateKey, start, end: addCalendarDays(start, 6), saturday: day === 6 };
}

/** A deferred Saturday notification retains its original week, even after midnight. */
export function getDeferredAvailabilityReminderWeek(dedupeKey: string, now: Date) {
  const match = /^tutor_availability:(\d{4}-\d{2}-\d{2})$/.exec(dedupeKey);
  if (!match) return null;
  const dateKey = match[1];
  const original = new Date(dateKey + "T01:00:00Z");
  if (!Number.isFinite(original.getTime()) || formatJakartaDateKey(original) !== dateKey) return null;
  const week = getAvailabilityReminderWeek(original);
  const today = formatJakartaDateKey(now);
  return week.saturday && today >= dateKey && today <= week.end ? week : null;
}

/** Queue the exact H-30 instant; allow one extra sweep for late bookings. */
export function getTutorialEmailDispatchAt(date: string, time: string, tick: Date, now = tick): number | null {
  const starts = parseJakartaSessionStart(date, time);
  if (!starts || starts <= now) return null;
  const minutes = (starts.getTime() - tick.getTime()) / 60_000;
  if (minutes <= 25 || minutes >= 35) return null;
  return starts.getTime() - 30 * 60_000;
}

export function safeReminderLink(value: string, appUrl: string): string | null {
  try {
    const trimmed = value.trim();
    const url = new URL(trimmed, appUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || (!/^https?:\/\//i.test(trimmed) && !/^\/(?!\/)/.test(trimmed))) return null;
    if (!/^https?:\/\//i.test(trimmed) && url.origin !== new URL(appUrl).origin) return null;
    return url.toString();
  } catch {
    return null;
  }
}
