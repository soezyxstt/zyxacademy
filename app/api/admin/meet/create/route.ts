import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { createGoogleMeetSpace } from "@/lib/google-meet";
import { getAllAdminEmails } from "@/lib/google-drive-permissions";
import { slugifySegment } from "@/lib/storage/keys";
import { db } from "@/db";
import { googleMeetSessions } from "@/db/schema";
import { eq } from "drizzle-orm";

function generateShortSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function normalizeEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim().toLowerCase()).filter(Boolean))];
}

export async function POST(req: Request) {
  try {
    let createdById: string | undefined;
    let hostEmail: string | undefined;
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
      createdById = session.user.id;
      hostEmail = session.user.email || undefined;
    }

    const body = await req.json().catch(() => ({}));
    const accessType = body.accessType || "OPEN";
    const rawTitle = (body.title || "").trim();
    const title = rawTitle || "Sesi Tutorial Google Meet";
    const invitedEmails = normalizeEmails(body.invitedEmails);

    let slug = (body.slug || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!slug) {
      slug = rawTitle ? slugifySegment(rawTitle) : generateShortSlug();
    }

    let candidate = slug;
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db
        .select({ id: googleMeetSessions.id })
        .from(googleMeetSessions)
        .where(eq(googleMeetSessions.slug, candidate))
        .limit(1);
      if (existing.length === 0) break;
      candidate = `${slug}-${generateShortSlug().slice(0, 4)}`;
    }
    slug = candidate;

    let coHostEmails: string[] = [];
    try {
      coHostEmails = await getAllAdminEmails();
    } catch (err) {
      console.warn("Could not load admin co-host emails", err);
    }

    const space = await createGoogleMeetSpace({ accessType });

    const sessionId = crypto.randomUUID();
    await db.insert(googleMeetSessions).values({
      id: sessionId,
      title,
      spaceName: space.name,
      meetingUri: space.meetingUri,
      meetingCode: space.meetingCode,
      accessType,
      createdById,
      slug,
      hostEmail,
      coHostEmails,
      invitedEmails,
    }).onConflictDoNothing();

    return NextResponse.json({
      success: true,
      space: { ...space, title, slug, hostEmail, coHostEmails, invitedEmails },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create Google Meet space" }, { status: 500 });
  }
}
