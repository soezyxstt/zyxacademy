import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { deleteConferenceRecord, getConferenceRecord } from "@/lib/google-meet";
import { db } from "@/db";
import { googleMeetSessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Conference record ID is required" }, { status: 400 });
    }

    let spaceName: string | undefined;
    try {
      const rec = await getConferenceRecord(id);
      spaceName = rec.space;
    } catch {
      // Ignore if rec fetching fails
    }

    // Try deleting from Google Meet API
    try {
      await deleteConferenceRecord(id);
    } catch {
      // Ignore if already deleted from API
    }

    // Mark soft deleted in database if spaceName exists
    if (spaceName) {
      await db
        .update(googleMeetSessions)
        .set({ deletedAt: new Date() })
        .where(eq(googleMeetSessions.spaceName, spaceName));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete conference record" }, { status: 500 });
  }
}
