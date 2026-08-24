/**
 * POST /api/live/[sessionId]/control
 * Host-only proxy to the Durable Object control endpoint.
 * Hardened with canonical tutor authorization, session ownership check, and mutation audit logs.
 * Authorization (course access and host ownership) runs immediately after session lookup,
 * before the ended state is revealed or the action is validated, so outsiders always get a
 * uniform forbidden response with a single structured rejected-access audit entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { liveQuizSessions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { resolveTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveActorRoles, recordTutorMutationAuditSafe } from "@/lib/tutor/assessment-policy";

type Context = { params: Promise<{ sessionId: string }> };

const ControlSchema = z.object({
  action: z.enum(["start", "next", "reveal", "end"]),
});

export async function POST(req: NextRequest, { params }: Context) {
  if (env.FEATURE_LIVE !== "1" && process.env.FEATURE_LIVE !== "1") return NextResponse.json({ error: "Disabled" }, { status: 404 });

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { isTutor, isAdmin, roles } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin && !isTutor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sessionId } = await params;

  // 1. Session lookup
  const [liveSession] = await db
    .select()
    .from(liveQuizSessions)
    .where(eq(liveQuizSessions.id, sessionId))
    .limit(1);

  if (!liveSession) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: "unknown",
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.control",
      outcome: "rejected",
      reason: "LIVE_SESSION_NOT_FOUND",
      before: null,
      after: { sessionId },
    });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 2. Authorize course-scoped access immediately after lookup, before revealing
  // session state or validating the requested action. live_quiz_sessions.course_id
  // is a legacy courses foreign key, so the stored id resolves through the canonical mapping.
  const access = await resolveTutorCourseAccess({
    penggunaId: session.user.id,
    courseId: liveSession.courseId,
    allowAdmin: isAdmin,
  });
  const auditCourseId = access.courseId ?? liveSession.courseId;

  if (!access.hasAccess) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: auditCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.control",
      outcome: "rejected",
      reason: `TUTOR_ACCESS_DENIED: ${access.reason || "NO_COURSE_ACCESS"}`,
      before: null,
      after: { sessionId },
    });
    return NextResponse.json({ error: "Forbidden: No course access" }, { status: 403 });
  }

  // 3. Enforce current tutor session ownership unless canonical admin override
  const isOwner = liveSession.tutorId === session.user.id;
  if (!isOwner && !isAdmin) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: auditCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.control",
      outcome: "rejected",
      reason: "TUTOR_SESSION_NOT_OWNED",
      before: { ownerId: liveSession.tutorId },
      after: { callerId: session.user.id },
    });
    return NextResponse.json(
      { error: "Forbidden: Only the session host or admin can control this session" },
      { status: 403 },
    );
  }

  // 4. Reveal ended state only after authorization succeeds
  if (liveSession.state === "ended") {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: auditCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.control",
      outcome: "rejected",
      reason: "LIVE_SESSION_ALREADY_ENDED",
      before: { state: "ended" },
      after: { sessionId, state: "ended" },
    });
    return NextResponse.json({ error: "Session has ended" }, { status: 410 });
  }

  const rawBody = await req.json().catch(() => null);
  const body = ControlSchema.safeParse(rawBody);
  if (!body.success) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: auditCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.control",
      outcome: "rejected",
      reason: "INVALID_CONTROL_ACTION",
      before: { state: liveSession.state },
      after: {
        sessionId,
        invalidInput: typeof rawBody === "object" && rawBody !== null ? rawBody : String(rawBody),
      },
    });
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { action } = body.data;

  const realtimeUrl = env.NEXT_PUBLIC_REALTIME_URL;
  if (!realtimeUrl) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: auditCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.control",
      outcome: "failed",
      reason: "REALTIME_WORKER_NOT_CONFIGURED",
      before: { state: liveSession.state },
      after: { action },
    });
    return NextResponse.json({ error: "Realtime worker not configured" }, { status: 503 });
  }
  const secret = env.LIVE_HMAC_SECRET ?? "";

  let workerRes: Response;
  try {
    workerRes = await fetch(`${realtimeUrl}/room/${sessionId}/control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ action }),
    });
  } catch (err) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: auditCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.control",
      outcome: "failed",
      reason: `REALTIME_WORKER_FETCH_FAILED: ${err instanceof Error ? err.message : String(err)}`,
      before: { state: liveSession.state },
      after: { action },
    });
    return NextResponse.json({ error: "Gagal menghubungi server realtime" }, { status: 502 });
  }

  if (!workerRes.ok) {
    const errText = await workerRes.text();
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: auditCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.control",
      outcome: "failed",
      reason: `REALTIME_WORKER_ERROR: ${errText}`,
      before: { state: liveSession.state },
      after: { action },
    });
    return NextResponse.json({ error: errText }, { status: workerRes.status });
  }

  // 4. Sync state into Turso when session ends
  if (action === "end") {
    await db
      .update(liveQuizSessions)
      .set({ state: "ended", endedAt: new Date() })
      .where(eq(liveQuizSessions.id, sessionId));
  }

  // 5. Record successful mutation audit
  await recordTutorMutationAuditSafe({
    actorId: session.user.id,
    actorRoles: roles,
    courseId: auditCourseId,
    entityType: "live_quiz_session",
    entityId: sessionId,
    entityVersion: 1,
    action: "live_session.control",
    outcome: "success",
    reason: `Tutor executed live control action: ${action}${isAdmin && !isOwner ? " (admin override)" : ""}`,
    before: { state: liveSession.state },
    after: {
      action,
      state: action === "end" ? "ended" : liveSession.state,
    },
  });

  return NextResponse.json({ ok: true });
}
