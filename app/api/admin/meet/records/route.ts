import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { listConferenceRecords, getCompleteMeetingAnalytics } from "@/lib/google-meet";
import { db } from "@/db";
import { googleMeetSessions } from "@/db/schema";
import { isNull } from "drizzle-orm";
import { grantAdminEditorAccessToDriveItems } from "@/lib/google-drive-permissions";

export async function GET(req: Request) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") || undefined;
    const pageToken = searchParams.get("pageToken") || undefined;

    const [data, storedSessions] = await Promise.all([
      listConferenceRecords(filter, 50, pageToken),
      db.select().from(googleMeetSessions).where(isNull(googleMeetSessions.deletedAt)),
    ]);

    const titleMap = new Map<string, string>();
    for (const s of storedSessions) {
      titleMap.set(s.spaceName, s.title);
      titleMap.set(s.meetingCode, s.title);
    }

    const rawRecords = data.conferenceRecords || [];

    // Map records with title & analytics metrics
    const driveItems = new Set<string>();
    const conferenceRecords = await Promise.all(
      rawRecords.map(async (rec) => {
        const confId = rec.name.replace(/^conferenceRecords\//, "");
        const spaceCode = rec.space ? rec.space.replace(/^spaces\//, "") : "";
        const title = titleMap.get(rec.space) || titleMap.get(spaceCode) || `Meeting ${spaceCode || confId.slice(0, 8)}`;

        let participantCount = 0;
        let peakConcurrentParticipants = 0;

        try {
          const analytics = await getCompleteMeetingAnalytics(confId);
          participantCount = analytics.participantCount;
          peakConcurrentParticipants = analytics.peakConcurrentParticipants;
          for (const recording of analytics.recordings) {
            if (recording.driveExportUri) driveItems.add(recording.driveExportUri);
          }
          for (const transcript of analytics.transcripts) {
            if (transcript.docsExportUri) driveItems.add(transcript.docsExportUri);
          }
        } catch {
          // Fallback if detailed analytics call fails
        }

        return {
          ...rec,
          title,
          participantCount,
          peakConcurrentParticipants,
        };
      })
    );

    if (env.FEATURE_DRIVE_EDITOR_SYNC === "1" && driveItems.size > 0) {
      await grantAdminEditorAccessToDriveItems([...driveItems]);
    }

    return NextResponse.json({
      success: true,
      conferenceRecords,
      nextPageToken: data.nextPageToken,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to list conference records" }, { status: 500 });
  }
}
