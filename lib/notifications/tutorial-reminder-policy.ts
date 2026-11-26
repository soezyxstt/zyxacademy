import { addCalendarDays, calendarDateFromInput } from "@/lib/schedule/calendar-date";
import { formatJakartaDateKey, parseJakartaSessionStart } from "./interval-policy";
import { tutorialEmailOffsets, type TutorialEmailSchedule } from "./tutorial-email-schedule";

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

export const TUTORIAL_EMAIL_SWEEP_MS = 5 * 60_000;

/** Discover exact delivery times just ahead of a five-minute sweep, with one
 * recovery window for a newly booked or briefly delayed session. */
export function getTutorialEmailDispatchTimes(date: string, time: string, schedule: TutorialEmailSchedule, tick: Date, now = tick): number[] {
  const starts = parseJakartaSessionStart(date, time);
  if (!starts || starts <= now) return [];
  return tutorialEmailOffsets(schedule).map(offset => starts.getTime() - offset * 60_000)
    .filter(due => due > tick.getTime() - TUTORIAL_EMAIL_SWEEP_MS && due < tick.getTime() + TUTORIAL_EMAIL_SWEEP_MS &&
      due > now.getTime() - TUTORIAL_EMAIL_SWEEP_MS);
}

/** Recheck the current recipient's preference before a delayed task sends. */
export function isTutorialEmailDue(schedule: TutorialEmailSchedule, startsAt: Date, dispatchAt: number, now: Date): boolean {
  return Number.isFinite(dispatchAt) && dispatchAt <= now.getTime() &&
    now.getTime() - dispatchAt < TUTORIAL_EMAIL_SWEEP_MS && now < startsAt &&
    tutorialEmailOffsets(schedule).includes((startsAt.getTime() - dispatchAt) / 60_000);
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
