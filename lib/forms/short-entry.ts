import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customForms, googleMeetSessions } from "@/db/schema";

/** Exact form slugs, including closed forms, take precedence over meeting links. */
export async function findShortFormMeeting(slug: string): Promise<string | null> {
  const normalized = slug.toLowerCase();
  const [forms, meetings] = await Promise.all([
    db.select({ id: customForms.id }).from(customForms)
      .where(and(eq(customForms.slug, normalized), isNull(customForms.deletedAt))).limit(1),
    db.select({ meetingUri: googleMeetSessions.meetingUri }).from(googleMeetSessions)
      .where(and(eq(googleMeetSessions.slug, normalized), isNull(googleMeetSessions.deletedAt))).limit(1),
  ]);
  return forms.length ? null : meetings[0]?.meetingUri || null;
}
