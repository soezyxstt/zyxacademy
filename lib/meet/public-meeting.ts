import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { googleMeetSessions } from "@/db/schema";
import { publicMeetingPath, publicMeetingUrl } from "@/packages/meet/public-destination";

export async function findPublicMeeting(slug: string) {
  if (!publicMeetingPath(slug)) return null;
  const [meeting] = await db.select({ title: googleMeetSessions.title, meetingUri: googleMeetSessions.meetingUri })
    .from(googleMeetSessions)
    .where(and(eq(googleMeetSessions.slug, slug), isNull(googleMeetSessions.deletedAt)))
    .limit(1);
  const meetingUri = publicMeetingUrl(meeting?.meetingUri);
  return meeting && meetingUri ? { title: meeting.title, meetingUri } : null;
}
