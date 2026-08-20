import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
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
