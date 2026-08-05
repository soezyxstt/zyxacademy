import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { createGoogleMeetSpace } from "@/lib/google-meet";
import { db } from "@/db";
import { googleMeetSessions } from "@/db/schema";

export async function POST(req: Request) {
  try {
    let createdById: string | undefined;
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
      createdById = session.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const accessType = body.accessType || "OPEN";
    const title = (body.title || "").trim() || "Sesi Tutorial Google Meet";

    const space = await createGoogleMeetSpace({ accessType });

    // Save title & metadata to db
    const sessionId = crypto.randomUUID();
    await db.insert(googleMeetSessions).values({
      id: sessionId,
      title,
      spaceName: space.name,
      meetingUri: space.meetingUri,
      meetingCode: space.meetingCode,
      accessType,
      createdById,
    }).onConflictDoNothing();

    return NextResponse.json({ success: true, space: { ...space, title } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create Google Meet space" }, { status: 500 });
  }
}
