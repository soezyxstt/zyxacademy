/**
 * POST /api/live/sessions ; tutor creates a live quiz session
 * GET /api/live/sessions?courseId= ; list active sessions for a course (tutor)
 *
 * live_quiz_sessions, quiz_templates, and ai_question_bank store legacy courses foreign keys.
 * After canonical authorization the verified mapped legacy course id is persisted and matched;
 * audits and the response keep canonical course context. Creation fails closed when no unique
 * active canonical-to-legacy course mapping exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID, createHmac } from "node:crypto";
import { db } from "@/db";
import { liveQuizSessions, mataKuliah, quizTemplates, aiQuestionBank } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { resolveTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveActorRoles, recordTutorMutationAuditSafe } from "@/lib/tutor/assessment-policy";

function featureEnabled() {
  return env.FEATURE_LIVE === "1" || process.env.FEATURE_LIVE === "1";
}

function makeHostToken(
  userId: string,
  name: string,
  sessionId: string,
  secret: string,
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

function publishedQuizQuestionCondition() {
  return and(
    eq(aiQuestionBank.reviewStatus, "published"),
    or(
      eq(aiQuestionBank.origin, "zyx_original"),
      eq(aiQuestionBank.origin, "itb_example"),
      eq(aiQuestionBank.quizEligible, true),
    ),
  );
}

const CreateSchema = z.object({
  courseId: z.string().min(1),
  templateId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!featureEnabled()) return NextResponse.json({ error: "Disabled" }, { status: 404 });

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { isTutor, isAdmin, roles } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin && !isTutor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawBody = await req.json().catch(() => null);
  const body = CreateSchema.safeParse(rawBody);
  if (!body.success) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: "unknown",
      entityType: "live_quiz_session",
      entityId: "invalid",
      entityVersion: 1,
      action: "live_session.create",
      outcome: "rejected",
      reason: "INVALID_BODY",
      before: null,
      after: null,
    });
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { courseId, templateId } = body.data;

  // 1. Verify tutor has course-scoped access
  const access = await resolveTutorCourseAccess({
    penggunaId: session.user.id,
    courseId,
    allowAdmin: isAdmin,
  });

  if (!access.hasAccess) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "live_quiz_session",
      entityId: "unauthorized",
      entityVersion: 1,
      action: "live_session.create",
      outcome: "rejected",
      reason: `TUTOR_ACCESS_DENIED: ${access.reason || "NO_COURSE_ACCESS"}`,
      before: null,
      after: { courseId, templateId },
    });
    return NextResponse.json(
      { error: `Forbidden: ${access.reason || "NO_COURSE_ACCESS"}` },
      { status: 403 },
    );
  }

  const effectiveCourseId = access.courseId ?? courseId;

  // 2. Verify the unique active legacy course mapping. Legacy tables store
  // courses.id, so hosting requires exactly one active canonical course mapped
  // to this verified legacy course id; otherwise fail closed.
  let persistedCourseId: string | null = null;
  if (access.courseId && access.legacyCourseId) {
    const [activeCanonical] = await db
      .select({ id: mataKuliah.id })
      .from(mataKuliah)
      .where(and(eq(mataKuliah.id, access.courseId), eq(mataKuliah.status, "active")))
      .limit(1);
    if (activeCanonical) {
      const mappedRows = await db
        .select({ id: mataKuliah.id })
        .from(mataKuliah)
        .where(
          and(
            eq(mataKuliah.legacyCourseId, access.legacyCourseId),
            eq(mataKuliah.status, "active"),
          ),
        );
      if (mappedRows.length === 1) persistedCourseId = access.legacyCourseId;
    }
  }

  if (!persistedCourseId) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: effectiveCourseId,
      entityType: "live_quiz_session",
      entityId: templateId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "rejected",
      reason: "LEGACY_COURSE_MAPPING_UNAVAILABLE",
      before: null,
      after: { courseId: effectiveCourseId, templateId },
    });
    return NextResponse.json(
      { error: "Live hosting requires a mapped legacy course" },
      { status: 409 },
    );
  }

  // 3. Load and validate template
  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "live_quiz_session",
      entityId: templateId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "rejected",
      reason: "TEMPLATE_NOT_FOUND",
      before: null,
      after: { courseId, templateId },
    });
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Verify template belongs to the verified legacy course (quiz_templates.course_id is a legacy courses FK)
  if (template.courseId !== persistedCourseId) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "live_quiz_session",
      entityId: templateId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "rejected",
      reason: "TEMPLATE_COURSE_MISMATCH",
      before: null,
      after: { courseId, templateCourseId: template.courseId, templateId },
    });
    return NextResponse.json(
      { error: "Forbidden: Template does not belong to this course" },
      { status: 403 },
    );
  }

  // Verify template is published
  if (template.status !== "published") {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "live_quiz_session",
      entityId: templateId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "rejected",
      reason: "TEMPLATE_NOT_PUBLISHED",
      before: null,
      after: { courseId, templateId, status: template.status },
    });
    return NextResponse.json(
      { error: "Kuis belum diterbitkan" },
      { status: 400 },
    );
  }

  // Reject simulation / tryout templates
  let assessmentType: string | undefined;
  if (template.selectionRules && typeof template.selectionRules === "object") {
    assessmentType = (template.selectionRules as Record<string, unknown>).assessmentType as string | undefined;
  } else if (typeof template.selectionRules === "string") {
    try {
      const parsedRules = JSON.parse(template.selectionRules);
      assessmentType = parsedRules?.assessmentType;
    } catch {
      // ignore
    }
  }

  if (template.category === "simulation" || assessmentType === "tryout") {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "live_quiz_session",
      entityId: templateId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "rejected",
      reason: "TRYOUT_OR_SIMULATION_LIVE_FORBIDDEN",
      before: null,
      after: { courseId, templateId, category: template.category, assessmentType },
    });
    return NextResponse.json(
      { error: "Sesi langsung hanya untuk kuis, bukan tryout atau simulasi" },
      { status: 403 },
    );
  }

  let rulesObj: Record<string, unknown> = {};
  if (template.selectionRules && typeof template.selectionRules === "object") {
    rulesObj = template.selectionRules as Record<string, unknown>;
  } else if (typeof template.selectionRules === "string") {
    try {
      rulesObj = JSON.parse(template.selectionRules);
    } catch {
      rulesObj = {};
    }
  }

  const rawQuestionIds = Array.isArray(rulesObj.questionIds)
    ? rulesObj.questionIds
    : Array.isArray(rulesObj.fixedQuestionIds)
      ? rulesObj.fixedQuestionIds
      : [];

  const questionIds: string[] = rawQuestionIds
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);

  let questionsSnapshot: Array<{
    prompt: string;
    options: string[];
    correctIndex: number;
    origin: "zyx_original" | "historical_reference" | "itb_example";
    sourceEventName: string | null;
    sourceReferenceId: string | null;
  }> = [];

  if (questionIds.length > 0) {
    const rows = await db
      .select({
        id: aiQuestionBank.id,
        courseId: aiQuestionBank.courseId,
        prompt: aiQuestionBank.prompt,
        options: aiQuestionBank.options,
        correctIndices: aiQuestionBank.correctIndices,
        origin: aiQuestionBank.origin,
        sourceEventName: aiQuestionBank.sourceEventName,
        sourceReferenceId: aiQuestionBank.sourceReferenceId,
      })
      .from(aiQuestionBank)
      .where(
        and(
          inArray(aiQuestionBank.id, questionIds),
          publishedQuizQuestionCondition(),
        ),
      );

    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const missingIds = questionIds.filter((id) => !rowMap.has(id));

    if (missingIds.length > 0 || rows.length !== questionIds.length) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: effectiveCourseId,
        entityType: "live_quiz_session",
        entityId: templateId,
        entityVersion: 1,
        action: "live_session.create",
        outcome: "rejected",
        reason: `QUESTION_NOT_FOUND: Question IDs not found in bank: ${missingIds.join(", ")}`,
        before: null,
        after: { courseId: effectiveCourseId, templateId, requestedIds: questionIds, missingIds },
      });
      return NextResponse.json(
        { error: "Beberapa soal tidak ditemukan dalam bank soal" },
        { status: 400 },
      );
    }

    const mismatchQuestions = rows.filter((r) => r.courseId !== persistedCourseId);

    if (mismatchQuestions.length > 0) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: effectiveCourseId,
        entityType: "live_quiz_session",
        entityId: templateId,
        entityVersion: 1,
        action: "live_session.create",
        outcome: "rejected",
        reason: `QUESTION_COURSE_MISMATCH: Question IDs not belonging to course: ${mismatchQuestions.map((q) => q.id).join(", ")}`,
        before: null,
        after: {
          courseId: effectiveCourseId,
          templateId,
          mismatchQuestionIds: mismatchQuestions.map((q) => q.id),
        },
      });
      return NextResponse.json(
        { error: "Forbidden: Soal tidak termasuk dalam mata kuliah ini" },
        { status: 403 },
      );
    }

    questionsSnapshot = questionIds.map((qid) => {
      const r = rowMap.get(qid)!;
      let opts: string[] = [];
      if (Array.isArray(r.options)) {
        opts = r.options as string[];
      } else if (typeof r.options === "string") {
        try {
          opts = JSON.parse(r.options);
        } catch {
          opts = [];
        }
      }

      let correct = 0;
      if (Array.isArray(r.correctIndices)) {
        correct = (r.correctIndices as number[])[0] ?? 0;
      } else if (typeof r.correctIndices === "string") {
        try {
          const parsed = JSON.parse(r.correctIndices);
          correct = Array.isArray(parsed) ? parsed[0] ?? 0 : Number(parsed) || 0;
        } catch {
          correct = 0;
        }
      }

      return {
        prompt: r.prompt,
        options: opts,
        correctIndex: correct,
        origin: (r.origin ?? "zyx_original") as
          | "zyx_original"
          | "historical_reference"
          | "itb_example",
        sourceEventName: r.sourceEventName,
        sourceReferenceId: r.sourceReferenceId,
      };
    });
  }

  const sessionId = randomUUID();
  let code = generateCode();

  // Retry on rare code collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db
      .select({ id: liveQuizSessions.id })
      .from(liveQuizSessions)
      .where(eq(liveQuizSessions.code, code))
      .limit(1);
    if (!existing) break;
    code = generateCode();
  }

  const realtimeUrl = env.NEXT_PUBLIC_REALTIME_URL;
  if (!realtimeUrl) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: effectiveCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "failed",
      reason: "REALTIME_WORKER_NOT_CONFIGURED",
      before: null,
      after: { courseId: effectiveCourseId, templateId },
    });
    return NextResponse.json({ error: "Realtime worker not configured" }, { status: 503 });
  }

  const secret = env.LIVE_HMAC_SECRET ?? "";

  // Init the Durable Object room before saving session in database
  let initRes: Response;
  try {
    initRes = await fetch(`${realtimeUrl}/room/${sessionId}/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ sessionId, courseId: persistedCourseId, questions: questionsSnapshot }),
    });
  } catch (err) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: effectiveCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "failed",
      reason: `REALTIME_WORKER_INIT_FAILED: ${err instanceof Error ? err.message : String(err)}`,
      before: null,
      after: { courseId: effectiveCourseId, templateId },
    });
    return NextResponse.json({ error: "Gagal menginisialisasi server realtime" }, { status: 502 });
  }

  if (!initRes.ok) {
    const errText = await initRes.text();
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: effectiveCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "failed",
      reason: `REALTIME_WORKER_INIT_ERROR: ${errText}`,
      before: null,
      after: { courseId: effectiveCourseId, templateId },
    });
    return NextResponse.json(
      { error: errText || "Gagal menginisialisasi ruangan" },
      { status: 502 },
    );
  }

  try {
    await db.insert(liveQuizSessions).values({
      id: sessionId,
      courseId: persistedCourseId,
      tutorId: session.user.id,
      templateId,
      code,
      state: "lobby",
      questionsSnapshot,
      participantCount: 0,
    });
  } catch (insertError) {
    // Compensate: terminate orphan Durable Object session if database persistence fails
    let cleanupSuccess = false;
    let cleanupError: string | null = null;
    const MAX_CLEANUP_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_CLEANUP_ATTEMPTS; attempt++) {
      try {
        const compRes = await fetch(`${realtimeUrl}/room/${sessionId}/control`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ action: "end" }),
        });
        if (compRes.ok) {
          cleanupSuccess = true;
          cleanupError = null;
          break;
        } else {
          const compErrText = await compRes.text().catch(() => "");
          cleanupError = `HTTP ${compRes.status}${compErrText ? `: ${compErrText}` : ""}`;
        }
      } catch (err) {
        cleanupError = err instanceof Error ? err.message : String(err);
      }
    }

    const dbErrorMessage = insertError instanceof Error ? insertError.message : String(insertError);
    const auditReason = cleanupSuccess
      ? `DATABASE_INSERT_FAILED: ${dbErrorMessage}`
      : `DATABASE_INSERT_FAILED: ${dbErrorMessage}; ORPHAN_CLEANUP_FAILED: ${cleanupError ?? "unknown"}`;

    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: effectiveCourseId,
      entityType: "live_quiz_session",
      entityId: sessionId,
      entityVersion: 1,
      action: "live_session.create",
      outcome: "failed",
      reason: auditReason,
      before: null,
      after: {
        courseId: effectiveCourseId,
        templateId,
        cleanupSuccess,
        cleanupError,
      },
    });

    return NextResponse.json(
      { error: "Gagal menyimpan sesi kuis" },
      { status: 500 },
    );
  }

  const hostToken = secret
    ? makeHostToken(session.user.id, session.user.name, sessionId, secret)
    : null;

  // Audit successful live session creation
  await recordTutorMutationAuditSafe({
    actorId: session.user.id,
    actorRoles: roles,
    courseId: effectiveCourseId,
    entityType: "live_quiz_session",
    entityId: sessionId,
    entityVersion: 1,
    action: "live_session.create",
    outcome: "success",
    reason: "Tutor created live quiz session",
    before: null,
    after: {
      sessionId,
      code,
      courseId: effectiveCourseId,
      templateId,
      questionCount: questionsSnapshot.length,
    },
  });

  return NextResponse.json({
    sessionId,
    code,
    courseId: effectiveCourseId,
    questionCount: questionsSnapshot.length,
    wsUrl: `${realtimeUrl}/room/${sessionId}/websocket`,
    hostToken,
  });
}

export async function GET(req: NextRequest) {
  if (!featureEnabled()) return NextResponse.json({ error: "Disabled" }, { status: 404 });

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { isTutor, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin && !isTutor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courseId = req.nextUrl.searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "Missing courseId" }, { status: 400 });

  const access = await resolveTutorCourseAccess({
    penggunaId: session.user.id,
    courseId,
    allowAdmin: isAdmin,
  });

  if (!access.hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courseIdsToCheck = [access.courseId, access.legacyCourseId, courseId].filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );

  const rows = await db
    .select({
      id: liveQuizSessions.id,
      code: liveQuizSessions.code,
      state: liveQuizSessions.state,
      tutorId: liveQuizSessions.tutorId,
      questionsSnapshot: liveQuizSessions.questionsSnapshot,
      participantCount: liveQuizSessions.participantCount,
      createdAt: liveQuizSessions.createdAt,
    })
    .from(liveQuizSessions)
    .where(inArray(liveQuizSessions.courseId, courseIdsToCheck))
    .orderBy(desc(liveQuizSessions.createdAt))
    .limit(20);

  const realtimeUrl = env.NEXT_PUBLIC_REALTIME_URL;
  const secret = env.LIVE_HMAC_SECRET ?? "";

  const payload = rows.map((r) => {
    let questionCount = 0;
    if (Array.isArray(r.questionsSnapshot)) {
      questionCount = r.questionsSnapshot.length;
    } else if (typeof r.questionsSnapshot === "string") {
      try {
        const parsed = JSON.parse(r.questionsSnapshot);
        if (Array.isArray(parsed)) questionCount = parsed.length;
      } catch {
        questionCount = 0;
      }
    }

    const isOwnerOrAdmin = r.tutorId === session.user.id || isAdmin;
    const hostToken = isOwnerOrAdmin && secret
      ? makeHostToken(session.user.id, session.user.name, r.id, secret)
      : null;
    const wsUrl = realtimeUrl ? `${realtimeUrl}/room/${r.id}/websocket` : null;

    return {
      id: r.id,
      code: r.code,
      state: r.state,
      tutorId: r.tutorId,
      participantCount: r.participantCount,
      createdAt: r.createdAt,
      questionCount,
      wsUrl,
      hostToken,
    };
  });

  return NextResponse.json(payload);
}
