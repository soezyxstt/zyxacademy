/**
 * POST /api/live/join ; validates session code + enrollment, returns 60s HMAC token
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHmac } from "node:crypto";
import { db } from "@/db";
import { liveQuizSessions, enrollments } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";

const JoinSchema = z.object({
 code: z.string().length(6),
 courseId: z.string().min(1),
});

function makeStudentToken(
 userId: string,
 name: string,
 sessionId: string,
 secret: string
): string {
 const payload = { userId, name, sessionId, exp: Date.now() + 60_000 };
 const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
 const sig = createHmac("sha256", secret).update(b64).digest("hex");
 return `${b64}.${sig}`;
}

export async function POST(req: NextRequest) {
 if (env.FEATURE_LIVE !== "1") return NextResponse.json({ error: "Disabled" }, { status: 404 });

 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = JoinSchema.safeParse(await req.json());
 if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

 const { code, courseId } = body.data;

 // Validate enrollment
 const now = new Date();
 if (session.user.role !== "admin") {
 const [enrollment] = await db
 .select({ id: enrollments.id })
 .from(enrollments)
 .where(
 and(
 eq(enrollments.userId, session.user.id),
 eq(enrollments.courseId, courseId),
 gt(enrollments.expiresAt, now)
 )
 )
 .limit(1);
 if (!enrollment) {
 return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 });
 }
 }

 // Find active session by code
 const [liveSession] = await db
 .select({
 id: liveQuizSessions.id,
 courseId: liveQuizSessions.courseId,
 state: liveQuizSessions.state,
 })
 .from(liveQuizSessions)
 .where(
 and(
 eq(liveQuizSessions.code, code.toUpperCase()),
 eq(liveQuizSessions.courseId, courseId)
 )
 )
 .limit(1);

 if (!liveSession) {
 return NextResponse.json({ error: "Session not found" }, { status: 404 });
 }
 if (liveSession.state === "ended") {
 return NextResponse.json({ error: "Session has ended" }, { status: 410 });
 }

 const secret = env.LIVE_HMAC_SECRET ?? "";
 if (!secret) {
 return NextResponse.json({ error: "Server not configured for live quiz" }, { status: 503 });
 }

 const token = makeStudentToken(session.user.id, session.user.name, liveSession.id, secret);
 const realtimeUrl = env.NEXT_PUBLIC_REALTIME_URL ?? "";

 return NextResponse.json({
 sessionId: liveSession.id,
 token,
 wsUrl: realtimeUrl ? `${realtimeUrl}/room/${liveSession.id}/websocket` : null,
 sessionState: liveSession.state,
 });
}
