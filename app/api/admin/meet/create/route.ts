import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { createGoogleMeetSpace, provisionGoogleMeetSpaceMembers } from "@/lib/google-meet";
import { getAllAdminEmails } from "@/lib/google-drive-permissions";
import { slugifySegment } from "@/lib/storage/keys";
import { db } from "@/db";
import { customForms, googleMeetSessions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

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
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const isAdmin =
      env.FEATURE_PERAN_V2 === "1"
        ? await hasPeran(session.user.id, "admin")
        : session.user.role === "admin";
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }
    const createdById = session.user.id;
    const hostEmail = session.user.email || undefined;

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
      const [existingMeet, existingForm] = await Promise.all([
        db
          .select({ id: googleMeetSessions.id })
          .from(googleMeetSessions)
          .where(and(eq(googleMeetSessions.slug, candidate), isNull(googleMeetSessions.deletedAt)))
          .limit(1),
        db
          .select({ id: customForms.id })
          .from(customForms)
          .where(and(eq(customForms.slug, candidate), isNull(customForms.deletedAt)))
          .limit(1),
      ]);
      if (existingMeet.length === 0 && existingForm.length === 0) break;
      candidate = `${slug}-${generateShortSlug().slice(0, 4)}`;
    }
    slug = candidate;

    let coHostEmails: string[] = [];
    try {
      coHostEmails = await getAllAdminEmails();
    } catch (err) {
      console.warn("Could not load admin co-host emails", err);
    }

    const space = await createGoogleMeetSpace({ accessType, moderation: "ON" });
    const memberCandidates = [
      ...coHostEmails.map((email) => ({ email, role: "COHOST" as const })),
      ...(hostEmail ? [{ email: hostEmail, role: "COHOST" as const }] : []),
      ...invitedEmails.map((email) => ({ email, role: "ROLE_UNSPECIFIED" as const })),
    ];
    const memberProvisioning = await provisionGoogleMeetSpaceMembers(
      space.name,
      memberCandidates
    ).catch((error) =>
      memberCandidates.map((member) => ({
        ...member,
        success: false,
        error: error instanceof Error ? error.message : "Meet member provisioning failed",
      }))
    );
    const provisionedCoHosts = memberProvisioning
      .filter((result) => result.success && result.role === "COHOST")
      .map((result) => result.email);
    const provisionedInvitees = memberProvisioning
      .filter((result) => result.success && result.role === "ROLE_UNSPECIFIED")
      .map((result) => result.email);
    const provisionedHostEmail =
      hostEmail && provisionedCoHosts.includes(hostEmail.toLowerCase()) ? hostEmail.toLowerCase() : undefined;

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
      hostEmail: provisionedHostEmail,
      coHostEmails: provisionedCoHosts,
      invitedEmails: provisionedInvitees,
    }).onConflictDoNothing();

    return NextResponse.json({
      success: true,
      space: {
        ...space,
        title,
        slug,
        hostEmail: provisionedHostEmail,
        coHostEmails: provisionedCoHosts,
        invitedEmails: provisionedInvitees,
      },
      memberProvisioning,
      warnings: memberProvisioning
        .filter((result) => !result.success)
        .map(
          (result) =>
            `${result.email}: hak ${result.role === "COHOST" ? "co-host" : "akses"} belum dapat diberikan`
        ),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create Google Meet space" }, { status: 500 });
  }
}
