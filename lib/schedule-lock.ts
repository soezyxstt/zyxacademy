import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createGoogleMeetSpace } from "@/lib/google-meet";
import { formatIsoDateUtc, normalizeDate } from "@/lib/date-utils";

export const INDONESIAN_DAYS = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
] as const;

export type IndonesianDay = (typeof INDONESIAN_DAYS)[number];

const DAY_MAP_ID: Record<number, IndonesianDay> = {
  0: "Minggu",
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
};

/**
 * Returns current timestamp in milliseconds adjusted for Asia/Jakarta timezone (UTC+7).
 */
export function getJakartaNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
}

/**
 * Parse an ISO date string or Date object to a normalized Date.
 */
export function parseDateInput(input: Date | string): Date {
  if (typeof input === "string") {
    // If it's YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const [y, m, d] = input.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    }
    return new Date(input);
  }
  return normalizeDate(input);
}

/**
 * Given a target session date (or day in a week), returns the Monday of that week.
 */
export function getMondayOfWeek(targetDate: Date | string): Date {
  const d = parseDateInput(targetDate);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Weekly lock cut-off: The Saturday at 23:59:59 WIB directly preceding the Monday of the session week.
 */
export function getWeeklyLockCutoff(targetSessionDate: Date | string): Date {
  const monday = getMondayOfWeek(targetSessionDate);
  // Saturday preceding this Monday is Monday minus 2 days
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() - 2);
  saturday.setHours(23, 59, 59, 999);
  return saturday;
}

/**
 * Checks if a session on targetSessionDate is currently locked.
 * Sessions are locked after Saturday 23:59 WIB before the target week starts.
 */
export function isSessionLocked(targetSessionDate: Date | string, customNow?: Date): boolean {
  const cutoff = getWeeklyLockCutoff(targetSessionDate);
  const now = customNow || getJakartaNow();
  return now.getTime() > cutoff.getTime();
}

/**
 * Generates an array of 7 days (Monday to Sunday) for the week containing anchorDate.
 */
export function getWeekScheduleDays(anchorDate?: Date | string): {
  startOfWeekIso: string;
  endOfWeekIso: string;
  mondayDate: Date;
  days: Array<{
    dateIso: string;
    dayName: IndonesianDay;
    dayOfMonth: number;
    monthName: string;
    isToday: boolean;
    isPast: boolean;
  }>;
} {
  const refDate = anchorDate ? parseDateInput(anchorDate) : getJakartaNow();
  const monday = getMondayOfWeek(refDate);
  const now = getJakartaNow();
  const todayIso = formatIsoDateUtc(now);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateIso = formatIsoDateUtc(d);
    const dayName = DAY_MAP_ID[d.getDay()] || "Senin";
    const isToday = dateIso === todayIso;
    const isPast = dateIso < todayIso;

    days.push({
      dateIso,
      dayName,
      dayOfMonth: d.getDate(),
      monthName: d.toLocaleDateString("id-ID", { month: "short" }),
      isToday,
      isPast,
    });
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startOfWeekIso: formatIsoDateUtc(monday),
    endOfWeekIso: formatIsoDateUtc(sunday),
    mondayDate: monday,
    days,
  };
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
