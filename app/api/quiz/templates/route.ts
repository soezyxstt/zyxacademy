/**
 * POST /api/quiz/templates ; Create a new quiz template (tutor/admin only)
 * GET /api/quiz/templates ; List templates for a course
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '@/db';
import {
  asesmen,
  mataKuliah,
  pengguna,
  quizTemplates,
  user,
} from '@/db/schema';
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, eq, desc, inArray, or } from 'drizzle-orm';
import { resolveCourseAccess, type CourseAccessResult } from '@/lib/student/course-access';
import { canAccessStudentQuizTemplate } from '@/lib/quiz/student-access';
import { assessmentScopeSchema } from '@/lib/asesmen/contracts';
import { getQuizTimingMismatch } from '@/lib/asesmen/quiz-timing';
import { notifyQuizPublishedBestEffort } from '@/lib/notifications/send';
import { createAssessmentWithLegacyProjection } from '@/lib/asesmen/quiz-canonical-sync';
import { listTutorAccessibleCourses, resolveTutorCourseAccess } from '@/lib/auth/tutor-access';
import {
  TUTOR_CAPABILITY_ERRORS,
  parseSelectionRulesInput,
  resolveActorRoles,
  recordTutorMutationAuditSafe,
} from '@/lib/tutor/assessment-policy';
import {
  lockQuizCreateScope, nativeQuizAuditRequestId, nativeQuizTemplateId, nativeQuizWriteKey,
  QuizTemplateWriteError, quizTemplateReceipt, requireNativeQuizWriter, validateNativeQuizSelection, validateNativeQuizValues,
} from "@/lib/asesmen/quiz-template-write";
import { recordTutorMutationAudit } from '@/lib/audit/mutasi';

const CreateTemplateSchema = z.object({
  courseId: z.string().trim().min(1),
  title: z.string().min(1).max(255),
  category: z.enum(['daily', 'weekly', 'chapter', 'premium', 'simulation']),
  visibility: z.enum(['free', 'paid']).default('free'),
  status: z.enum(['draft', 'published']).default('draft'),
  timeLimitSeconds: z.number().int().nullable().optional(),
  maxAttempts: z.number().int().nullable().optional(),
  openAt: z.string().optional().nullable(),
  closeAt: z.string().optional().nullable(),
  manualStatus: z.enum(['open', 'closed', 'scheduled']).default('scheduled'),
  showDiscussion: z.boolean().optional(),
  selectionRules: z.object({
    tags: z.array(z.string()).optional(),
    count: z.number().int().min(1),
    fixedQuestionIds: z.array(z.string()).optional(),
    difficulty_proportions: z
      .object({
        easy: z.number().int().min(0),
        medium: z.number().int().min(0),
        hard: z.number().int().min(0),
      })
      .optional(),
    assessmentType: z.enum(['quiz', 'tryout']).optional(),
    chapterIds: z.array(z.string().min(1)).optional(),
    blueprint: z.record(z.string(), z.unknown()).optional(),
    seed: z.number().int().optional(),
    canGoBack: z.boolean().optional(),
    requireAllAnswered: z.boolean().optional(),
    explanationRelease: z.enum(['immediate', 'after_close', 'never']).optional(),
    perQuestionTimerEnabled: z.boolean().optional(),
    perQuestionTimers: z.record(z.string(), z.number()).optional(),
    defaultQuestionTimerSeconds: z.number().optional(),
    shuffleQuestions: z.boolean().optional(),
    shuffleOptions: z.boolean().optional(),
    showScoreImmediate: z.boolean().optional(),
    passingScore: z.number().nullable().optional(),
  }).passthrough(),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let nativeKey: string | null;
  try {
    nativeKey = nativeQuizWriteKey(req);
  } catch (error) {
    if (error instanceof QuizTemplateWriteError) return NextResponse.json({ error: error.code }, { status: error.status });
    throw error;
  }
  if (nativeKey) await ensureLegacyIdentity(session.user.id);

  const { roles, isTutor, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin && !isTutor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    const errorMsg = "Malformed JSON in request body.";
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: "unknown",
      entityType: "quiz_template",
      entityId: "new",
      entityVersion: 1,
      action: "quiz:create",
      outcome: "rejected",
      reason: errorMsg,
    });
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    const targetCourseId =
      typeof body?.courseId === "string" && body.courseId.trim().length > 0
        ? body.courseId.trim()
        : "unknown";
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: targetCourseId,
      entityType: "quiz_template",
      entityId: "new",
      entityVersion: 1,
      action: "quiz:create",
      outcome: "rejected",
      reason: errorMsg,
    });
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  const {
    courseId,
    title,
    category,
    visibility,
    status,
    timeLimitSeconds,
    maxAttempts,
    selectionRules,
    openAt,
    closeAt,
    manualStatus,
    showDiscussion,
  } = parsed.data;

  const access = await resolveTutorCourseAccess({
    penggunaId: session.user.id,
    courseId,
    allowAdmin: isAdmin,
  });

  if (!access.hasAccess) {
    const targetCourseId =
      typeof courseId === "string" && courseId.trim().length > 0
        ? courseId.trim()
        : (access.courseId ?? "unknown");
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: targetCourseId,
      entityType: "quiz_template",
      entityId: "new",
      entityVersion: 1,
      action: "quiz:create",
      outcome: "rejected",
      reason: access.reason || TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED,
    });
    return NextResponse.json(
      { error: `Forbidden: ${access.reason || "NO_COURSE_ACCESS"}` },
      { status: 403 },
    );
  }

  if (!isAdmin) {
    if (category === 'simulation' || selectionRules.assessmentType === 'tryout') {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: "new",
        entityVersion: 1,
        action: "quiz:create",
        outcome: "rejected",
        reason:
          category === 'simulation'
            ? TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN
            : TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN,
      });
      return NextResponse.json(
        { error: 'Forbidden: Tutors can only create quizzes, not simulations or tryouts.' },
        { status: 403 },
      );
    }
  }

  if (selectionRules.assessmentType) {
    const scope = assessmentScopeSchema.safeParse({
      assessmentType: selectionRules.assessmentType,
      chapterIds: selectionRules.chapterIds ?? [],
    });
    if (!scope.success) {
      const reason = 'Assessment scope must match quiz or tryout chapter rules.';
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: "new",
        entityVersion: 1,
        action: "quiz:create",
        outcome: "rejected",
        reason,
      });
      return NextResponse.json({ error: reason }, { status: 400 });
    }
  }

  const timingMismatch = getQuizTimingMismatch({
    timeLimitSeconds: timeLimitSeconds ?? null,
    count: selectionRules.count,
    fixedQuestionIds: selectionRules.fixedQuestionIds,
    perQuestionTimerEnabled: selectionRules.perQuestionTimerEnabled,
    perQuestionTimers: selectionRules.perQuestionTimers,
    defaultQuestionTimerSeconds: selectionRules.defaultQuestionTimerSeconds,
  });
  if (timingMismatch) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "quiz_template",
      entityId: "new",
      entityVersion: 1,
      action: "quiz:create",
      outcome: "rejected",
      reason: timingMismatch,
    });
    return NextResponse.json({ error: timingMismatch }, { status: 400 });
  }

  const targetCourse = access.courseId ?? courseId;
  const candidateCourseIds = [...new Set([courseId, targetCourse, access.legacyCourseId].filter((id): id is string => Boolean(id)))];
  const tags = selectionRules.tags ?? [];
  const id = nativeKey ? nativeQuizTemplateId(session.user.id, targetCourse, nativeKey) : randomUUID();
  const derivedShowDiscussion = showDiscussion !== undefined
    ? showDiscussion
    : selectionRules.explanationRelease !== 'never';

  const requestId = nativeKey ? nativeQuizAuditRequestId(session.user.id, `POST:/quiz/templates:${targetCourse}`, nativeKey) : `req-${randomUUID()}`;
  const audit = {
    actorId: session.user.id, actorRoles: roles, courseId: targetCourse, entityType: "quiz_template", entityId: id,
    entityVersion: 1, requestId, action: "quiz:create", outcome: "success", reason: "Quiz template created via API",
  } as const;
  let replayed = false;
  try {
    replayed = await db.transaction(async (tx) => {
      await lockQuizCreateScope(tx, targetCourse);
      if (nativeKey) {
        const current = await requireNativeQuizWriter(tx, {
          actorId: session.user.id, sessionId: session.session?.id, courseId, role: isAdmin ? "admin" : "tutor",
        });
        if ((current.courseId ?? courseId) !== targetCourse || current.legacyCourseId !== access.legacyCourseId) {
          throw new QuizTemplateWriteError(409, "QUIZ_COURSE_CHANGED");
        }
      }
      const receipt = nativeKey ? await quizTemplateReceipt(tx, audit, parsed.data) : undefined;
      if (receipt?.replayed) return true;
      if (nativeKey) {
        validateNativeQuizValues(parsed.data);
        await validateNativeQuizSelection(tx, candidateCourseIds, selectionRules);
      }

      if (tags.length) {
        const existing = await tx.select({ rules: quizTemplates.selectionRules })
          .from(quizTemplates).where(inArray(quizTemplates.courseId, candidateCourseIds));
        const duplicate = existing.some(({ rules }) => {
          const existingTags = parseSelectionRulesInput(rules).tags;
          return Array.isArray(existingTags) && tags.some((tag) => existingTags.includes(tag));
        });
        if (duplicate) throw new QuizTemplateWriteError(409, "QUIZ_TAG_CONFLICT");
      }
      await createAssessmentWithLegacyProjection({
        id,
        courseId,
        title,
        category,
        visibility,
        timeLimitSeconds: timeLimitSeconds ?? null,
        maxAttempts: maxAttempts ?? null,
        selectionRules: selectionRules as unknown as Record<string, unknown>,
        openAt: openAt ? new Date(openAt) : null,
        closeAt: closeAt ? new Date(closeAt) : null,
        manualStatus,
        showDiscussion: derivedShowDiscussion,
        status,
        creatorId: session.user.id,
      }, tx);

      await recordTutorMutationAudit({
        ...audit,
        after: { title, category, status, ...(receipt ? { requestDigest: receipt.requestDigest } : {}) },
      }, tx);
      return false;
    });
  } catch (err: any) {
    if (err instanceof QuizTemplateWriteError) {
      const message = err.code === "QUIZ_TAG_CONFLICT" && !nativeKey ? "Kuis dengan tag bab ini sudah ada di kelas ini." : err.code;
      await recordTutorMutationAuditSafe({
        ...audit, requestId: nativeKey ? `req-${randomUUID()}` : requestId, outcome: "rejected", reason: message,
      });
      return NextResponse.json({ error: message }, { status: err.status });
    }
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      requestId: nativeKey ? `req-${randomUUID()}` : requestId,
      action: "quiz:create",
      outcome: "failed",
      reason: err?.message || "Failed to create quiz template via API",
    });
    return NextResponse.json({ error: 'Failed to create quiz template' }, { status: 500 });
  }

  if (status === 'published' && !replayed) {
    await notifyQuizPublishedBestEffort({
      templateId: id,
      quizTitle: title,
      courseId,
      quizUrl: `/courses/${courseId}/quiz`,
    });
  }

  return NextResponse.json({ templateId: id, ...(nativeKey ? { requestId: nativeKey } : {}) }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { isTutor, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('courseId');
  const category = searchParams.get('category');

  const conditions = [];
  let studentAccess: CourseAccessResult | null = null;
  if (courseId) {
    const [canonicalCourse] = await db
      .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
      .from(mataKuliah)
      .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
      .limit(1);

    const candidateCourseIds = [courseId];
    if (canonicalCourse?.id && !candidateCourseIds.includes(canonicalCourse.id)) {
      candidateCourseIds.push(canonicalCourse.id);
    }
    if (canonicalCourse?.legacyCourseId && !candidateCourseIds.includes(canonicalCourse.legacyCourseId)) {
      candidateCourseIds.push(canonicalCourse.legacyCourseId);
    }

    conditions.push(inArray(quizTemplates.courseId, candidateCourseIds));
  }
  if (category)
    conditions.push(
      eq(quizTemplates.category, category as 'daily' | 'weekly' | 'chapter' | 'premium' | 'simulation'),
    );

  if (isAdmin) {
    // Admins may list templates across all courses.
  } else if (isTutor) {
    if (courseId) {
      const access = await resolveTutorCourseAccess({
        penggunaId: session.user.id,
        courseId,
        allowAdmin: false,
      });
      if (!access.hasAccess) {
        return NextResponse.json(
          { error: `Forbidden: ${access.reason || "NO_COURSE_ACCESS"}` },
          { status: 403 },
        );
      }
    } else {
      const accessible = await listTutorAccessibleCourses(session.user.id);
      const accessibleIds = [
        ...new Set(
          accessible.flatMap((c) => [c.courseId, c.legacyCourseId].filter((v): v is string => Boolean(v))),
        ),
      ];
      if (accessibleIds.length === 0) {
        return NextResponse.json([]);
      }
      conditions.push(inArray(quizTemplates.courseId, accessibleIds));
    }
  } else {
    if (!courseId) return NextResponse.json([]);
    studentAccess = await resolveCourseAccess({ courseId, userId: session.user.id });
    if (!studentAccess.hasCourseAccess) return NextResponse.json({ error: 'Akses mata kuliah tidak tersedia.' }, { status: 403 });
    conditions.push(eq(quizTemplates.status, 'published'));
  }

  const rows = await db
    .select({
      id: quizTemplates.id,
      courseId: quizTemplates.courseId,
      title: quizTemplates.title,
      category: quizTemplates.category,
      visibility: quizTemplates.visibility,
      status: quizTemplates.status,
      timeLimitSeconds: quizTemplates.timeLimitSeconds,
      maxAttempts: quizTemplates.maxAttempts,
      selectionRules: quizTemplates.selectionRules,
      openAt: quizTemplates.openAt,
      closeAt: quizTemplates.closeAt,
      manualStatus: quizTemplates.manualStatus,
      showDiscussion: quizTemplates.showDiscussion,
      createdAt: quizTemplates.createdAt,
      updatedAt: quizTemplates.updatedAt,
      creatorId: asesmen.creatorId,
      creatorName: user.name,
      creatorEmail: user.email,
      creatorRole: user.role,
    })
    .from(quizTemplates)
    .leftJoin(asesmen, eq(quizTemplates.id, asesmen.id))
    .leftJoin(pengguna, eq(asesmen.creatorId, pengguna.id))
    .leftJoin(user, eq(pengguna.id, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(quizTemplates.createdAt));

  return NextResponse.json(studentAccess ? rows.filter((row) => canAccessStudentQuizTemplate(studentAccess!, row)) : rows);
}
