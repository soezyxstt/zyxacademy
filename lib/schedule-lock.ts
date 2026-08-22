import { db } from "@/db";
import { bookings } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { createGoogleMeetSpace } from "@/lib/google-meet";
import {
  INDONESIAN_DAYS,
  type IndonesianDay,
  getJakartaNow,
  parseDateInput,
  getMondayOfWeek,
  getWeeklyLockCutoff,
  isSessionLocked,
  getWeekScheduleDays,
  formatIsoDateUtc,
} from "@/lib/date-utils";

export {
  INDONESIAN_DAYS,
  type IndonesianDay,
  getJakartaNow,
  parseDateInput,
  getMondayOfWeek,
  getWeeklyLockCutoff,
  isSessionLocked,
  getWeekScheduleDays,
};

/**
 * Parses an HH:MM time string into minutes since midnight.
 */
export function timeToMinutes(time: string): number | null {
  const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Validates that a tutor availability slot spans exactly 90 minutes.
 */
export function isNinetyMinuteSlot(startTime: string, endTime: string): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return false;
  return end - start === 90;
}

/**
 * Returns the Monday and Sunday ISO dates of the week containing the given date.
 */
export function getIsoWeekRange(
  dateInput: Date | string
): { startIso: string; endIso: string } {
  const monday = getMondayOfWeek(dateInput);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    startIso: formatIsoDateUtc(monday),
    endIso: formatIsoDateUtc(sunday),
  };
}

/**
 * Counts every booking row of a group inside the week containing sessionDateIso.
 * Rows are counted regardless of status on purpose: pre-lock cancellations delete
 * the row (quota freed), while post-lock approved cancellations keep it as
 * "cancelled" so the weekly quota stays consumed (hangus).
 */
export async function countGroupBookingsInWeek(
  groupId: string,
  sessionDateIso: string
): Promise<number> {
  const { startIso, endIso } = getIsoWeekRange(sessionDateIso);
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.groupId, groupId),
        gte(bookings.sessionDate, startIso),
        lte(bookings.sessionDate, endIso)
      )
    );
  return rows.length;
}

export type WeeklySessionStat = {
  weekStartIso: string;
  weekEndIso: string;
  label: string;
  booked: number;
  attended: number;
  missed: number;
  cancelled: number;
};

/**
 * Derives per-week session traceability for the last N weeks (oldest first):
 * attended = completed sessions; cancelled = forfeited post-lock rows; missed =
 * scheduled rows whose session time has passed without completion.
 */
export function computeWeeklySessionStats(
  bookingRows: Array<{
    sessionDate: string | null;
    startTime?: string | null;
    endTime?: string | null;
    status: string;
  }>,
  weeksCount = 4,
  now: Date = getJakartaNow()
): WeeklySessionStat[] {
  const todayIso = formatIsoDateUtc(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentMonday = getMondayOfWeek(now);

  const monthFormatter = new Intl.DateTimeFormat("id-ID", { month: "short" });
  const stats: WeeklySessionStat[] = [];

  for (let i = weeksCount - 1; i >= 0; i--) {
    const monday = new Date(currentMonday);
    monday.setDate(currentMonday.getDate() - i * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startIso = formatIsoDateUtc(monday);
    const endIso = formatIsoDateUtc(sunday);

    const rows = bookingRows.filter(
      (b) => b.sessionDate && b.sessionDate >= startIso && b.sessionDate <= endIso
    );

    let attended = 0;
    let missed = 0;
    let cancelled = 0;

    for (const row of rows) {
      if (row.status === "completed") {
        attended++;
        continue;
      }
      if (row.status === "cancelled") {
        cancelled++;
        continue;
      }
      const endMin = timeToMinutes(row.endTime || row.startTime || "00:00") ?? 0;
      const isPastDay = Boolean(row.sessionDate && row.sessionDate < todayIso);
      const isTodayPastTime = row.sessionDate === todayIso && endMin < nowMinutes;
      if (isPastDay || isTodayPastTime) {
        missed++;
      }
    }

    const label =
      monday.getDate() === sunday.getDate()
        ? `${sunday.getDate()} ${monthFormatter.format(sunday)}`
        : `${monday.getDate()}-${sunday.getDate()} ${monthFormatter.format(sunday)}`;

    stats.push({
      weekStartIso: startIso,
      weekEndIso: endIso,
      label,
      booked: rows.length,
      attended,
      missed,
      cancelled,
    });
  }

  return stats;
}

/**
 * Ensures a booked online session has an active Google Meet space URL.
 */
export async function ensureGoogleMeetForBooking(bookingId: string): Promise<string | null> {
  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) return null;
    if (booking.mode !== "online") return null;

    if (booking.googleMeetUrl) {
      return booking.googleMeetUrl;
    }

    // Generate Meet space
    const space = await createGoogleMeetSpace({
      moderation: "ON",
      accessType: "OPEN",
    });

    const meetUrl = space.meetingUri;
    const spaceName = space.name;

    await db
      .update(bookings)
      .set({
        googleMeetUrl: meetUrl,
        googleMeetSpaceName: spaceName,
      })
      .where(eq(bookings.id, bookingId));

    return meetUrl;
  } catch (err) {
    console.error("Failed to generate Google Meet for booking:", bookingId, err);
    return null;
  }
}

/**
 * Scrapes metadata (title, description, image) for a given external URL.
 */
export async function fetchLinkPreview(url: string): Promise<{
  title: string | null;
  description: string | null;
  image: string | null;
}> {
  try {
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      return { title: null, description: null, image: null };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ZyxBot/1.0 (LinkPreview)",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { title: null, description: null, image: null };
    }

    const html = await res.text();

    const titleMatch =
      html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
      html.match(/<title>(.*?)<\/title>/i);
    const descMatch =
      html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
      html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);

    return {
      title: titleMatch ? titleMatch[1].trim() : null,
      description: descMatch ? descMatch[1].trim() : null,
      image: imageMatch ? imageMatch[1].trim() : null,
    };
  } catch {
    return { title: null, description: null, image: null };
  }
}
