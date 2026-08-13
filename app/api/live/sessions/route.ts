/**
 * POST /api/live/sessions ; tutor creates a live quiz session
 * GET /api/live/sessions?courseId= ; list active sessions for a course (tutor)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import { db } from "@/db";
import { liveQuizSessions, quizTemplates, tutorCourses } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { and, eq, desc } from "drizzle-orm";

function featureEnabled() {
 return env.FEATURE_LIVE === "1";
}

function makeHostToken(
 userId: string,
 name: string,
 sessionId: string,
 secret: string
): string {
 const payload = { userId, name, sessionId, exp: Date.now() + 86_400_000, isHost: true };
 const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
 const sig = createHmac("sha256", secret).update(b64).digest("hex");
 return `${b64}.${sig}`;
}

function generateCode(): string {
 const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const CreateSchema = z.object({
 courseId: z.string().min(1),
 templateId: z.string().min(1),
});

export async function POST(req: NextRequest) {
 if (!featureEnabled()) return NextResponse.json({ error: "Disabled" }, { status: 404 });

 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (session.user.role !== "teacher" && session.user.role !== "admin") {
 return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 }

 const body = CreateSchema.safeParse(await req.json());
 if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

 const { courseId, templateId } = body.data;

 // Verify tutor has access to this course
 if (session.user.role !== "admin") {
 const [tc] = await db
 .select()
 .from(tutorCourses)
 .where(and(eq(tutorCourses.tutorId, session.user.id), eq(tutorCourses.courseId, courseId)))
 .limit(1);
 if (!tc) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 }

 // Load template
 const [template] = await db
 .select()
 .from(quizTemplates)
 .where(and(eq(quizTemplates.id, templateId), eq(quizTemplates.courseId, courseId)))
 .limit(1);
 if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

 const rules = template.selectionRules as {
 questionIds?: string[];
 difficulty?: string;
 count?: number;
 };

 // Build question snapshot from template selection rules
 // Use stored question IDs if present, otherwise return an empty list for now
 // (full selection logic lives in existing question-generator pipeline)
 const questionIds: string[] = Array.isArray(rules?.questionIds) ? rules.questionIds : [];
 let questionsSnapshot: Array<{
 prompt: string;
 options: string[];
 correctIndex: number;
 origin: "zyx_original" | "itb_example";
 sourceEventName: string | null;
 sourceReferenceId: string | null;
 }> = [];

 if (questionIds.length > 0) {
 const { aiQuestionBank } = await import("@/db/schema");
 const { inArray } = await import("drizzle-orm");
 const rows = await db
 .select()
 .from(aiQuestionBank)
 .where(inArray(aiQuestionBank.id, questionIds));

 questionsSnapshot = rows.map((r) => {
 const opts = r.options as string[];
 const correct = (r.correctIndices as number[])[0] ?? 0;
 return { prompt: r.prompt, options: opts, correctIndex: correct, origin: r.origin, sourceEventName: r.sourceEventName, sourceReferenceId: r.sourceReferenceId };
 });
 }

 const sessionId = randomUUID();
 let code = generateCode();

 // Retry on the (vanishingly rare) code collision
 for (let attempt = 0; attempt < 5; attempt++) {
 const [existing] = await db
 .select({ id: liveQuizSessions.id })
 .from(liveQuizSessions)
 .where(eq(liveQuizSessions.code, code))
 .limit(1);
 if (!existing) break;
 code = generateCode();
 }

 await db.insert(liveQuizSessions).values({
 id: sessionId,
 courseId,
 tutorId: session.user.id,
 templateId,
 code,
 state: "lobby",
 questionsSnapshot,
 participantCount: 0,
 });

 // Init the Durable Object with the question snapshot
 const realtimeUrl = env.NEXT_PUBLIC_REALTIME_URL;
 if (realtimeUrl && questionsSnapshot.length > 0) {
 try {
 await fetch(`${realtimeUrl}/room/${sessionId}/init`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ sessionId, courseId, questions: questionsSnapshot }),
 });
 } catch {
 // Non-fatal: the DO will start empty and the session is still valid
 }
 }

 const secret = env.LIVE_HMAC_SECRET ?? "";
 const hostToken = secret
 ? makeHostToken(session.user.id, session.user.name, sessionId, secret)
 : null;

 return NextResponse.json({
 sessionId,
 code,
 courseId,
 questionCount: questionsSnapshot.length,
 wsUrl: realtimeUrl ? `${realtimeUrl}/room/${sessionId}/websocket` : null,
 hostToken,
 });
}

export async function GET(req: NextRequest) {
 if (!featureEnabled()) return NextResponse.json({ error: "Disabled" }, { status: 404 });

 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (session.user.role !== "teacher" && session.user.role !== "admin") {
 return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 }

 const courseId = req.nextUrl.searchParams.get("courseId");
 if (!courseId) return NextResponse.json({ error: "Missing courseId" }, { status: 400 });

 const rows = await db
 .select({
 id: liveQuizSessions.id,
 code: liveQuizSessions.code,
 state: liveQuizSessions.state,
 participantCount: liveQuizSessions.participantCount,
 createdAt: liveQuizSessions.createdAt,
 })
 .from(liveQuizSessions)
 .where(eq(liveQuizSessions.courseId, courseId))
 .orderBy(desc(liveQuizSessions.createdAt))
 .limit(20);

 return NextResponse.json(rows);
}
