/**
 * DELETE /api/quiz/templates/[id] ; Delete a single quiz template
 * PATCH /api/quiz/templates/[id] ; Update quiz template status, manual override, and schedule dates
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { quizTemplates } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { assessmentScopeSchema } from '@/lib/asesmen/contracts';
import { getQuizTimingMismatch } from '@/lib/asesmen/quiz-timing';
import { notifyQuizPublishedBestEffort } from '@/lib/notifications/send';
import {
  deleteAssessmentWithLegacyProjection,
  updateAssessmentWithLegacyProjection,
} from '@/lib/asesmen/quiz-canonical-sync';
import { resolveTutorCourseAccess } from '@/lib/auth/tutor-access';
import {
  TUTOR_CAPABILITY_ERRORS,
  resolveActorRoles,
  resolveEffectiveAssessmentType,
  recordTutorMutationAuditSafe,
} from '@/lib/tutor/assessment-policy';
import { recordTutorMutationAudit } from '@/lib/audit/mutasi';

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { roles, isTutor, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin && !isTutor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const [existingTemplate] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, id))
    .limit(1);

  if (!existingTemplate) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: 'unknown',
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:delete",
      outcome: "rejected",
      reason: "QUIZ_TEMPLATE_NOT_FOUND",
    });
    return NextResponse.json({ error: 'Quiz template not found' }, { status: 404 });
  }

  const access = await resolveTutorCourseAccess({
    penggunaId: session.user.id,
    courseId: existingTemplate.courseId,
    allowAdmin: isAdmin,
  });

  if (!access.hasAccess) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:delete",
      outcome: "rejected",
      reason: access.reason || TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED,
    });
    return NextResponse.json(
      { error: `Forbidden: ${access.reason || "NO_COURSE_ACCESS"}` },
      { status: 403 },
    );
  }

  if (!isAdmin && existingTemplate.category === 'simulation') {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:delete",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN,
    });
    return NextResponse.json(
      { error: 'Forbidden: Tutors cannot delete simulations.' },
      { status: 403 },
    );
  }

  if (
    !isAdmin &&
    resolveEffectiveAssessmentType(existingTemplate.category, existingTemplate.selectionRules) ===
      'tryout'
  ) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:delete",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN,
    });
    return NextResponse.json(
      { error: 'Forbidden: Tutors cannot delete tryout assessments.' },
      { status: 403 },
    );
  }

  const requestId = `req-${randomUUID()}`;
  try {
    await db.transaction(async (tx) => {
      await deleteAssessmentWithLegacyProjection(id, tx);

      await recordTutorMutationAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? existingTemplate.courseId,
        entityType: "quiz_template",
        entityId: id,
        entityVersion: 1,
        requestId,
        action: "quiz:delete",
        outcome: "success",
        reason: "Quiz template deleted via API",
        before: {
          id,
          title: existingTemplate.title,
          category: existingTemplate.category,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      requestId,
      action: "quiz:delete",
      outcome: "failed",
      reason: err?.message || "Failed to delete quiz template via API",
      before: {
        id,
        title: existingTemplate.title,
        category: existingTemplate.category,
      },
    });
    return NextResponse.json({ error: 'Failed to delete quiz template' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { roles, isTutor, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin && !isTutor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const [existingTemplate] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, id))
    .limit(1);

  if (!existingTemplate) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: 'unknown',
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:update",
      outcome: "rejected",
      reason: "QUIZ_TEMPLATE_NOT_FOUND",
    });
    return NextResponse.json({ error: 'Quiz template not found' }, { status: 404 });
  }

  const access = await resolveTutorCourseAccess({
    penggunaId: session.user.id,
    courseId: existingTemplate.courseId,
    allowAdmin: isAdmin,
  });

  if (!access.hasAccess) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:update",
      outcome: "rejected",
      reason: access.reason || TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED,
    });
    return NextResponse.json(
      { error: `Forbidden: ${access.reason || "NO_COURSE_ACCESS"}` },
      { status: 403 },
    );
  }

  if (!isAdmin && existingTemplate.category === 'simulation') {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:update",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN,
    });
    return NextResponse.json(
      { error: 'Forbidden: Tutors cannot edit simulations.' },
      { status: 403 },
    );
  }

  if (
    !isAdmin &&
    resolveEffectiveAssessmentType(existingTemplate.category, existingTemplate.selectionRules) ===
      'tryout'
  ) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:update",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN,
    });
    return NextResponse.json(
      { error: 'Forbidden: Tutors cannot edit tryout assessments.' },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    const errorMsg = "Malformed JSON in request body.";
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:update",
      outcome: "rejected",
      reason: errorMsg,
    });
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  const UpdateSchema = z.object({
    status: z.enum(['draft', 'published']).optional(),
    manualStatus: z.enum(['open', 'closed', 'scheduled']).optional(),
    openAt: z.string().nullable().optional(),
    closeAt: z.string().nullable().optional(),
    title: z.string().min(1).max(255).optional(),
    category: z.enum(['daily', 'weekly', 'chapter', 'premium', 'simulation']).optional(),
    visibility: z.enum(['free', 'paid']).optional(),
    timeLimitSeconds: z.number().int().nullable().optional(),
    maxAttempts: z.number().int().nullable().optional(),
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
    }).passthrough().optional(),
    showDiscussion: z.boolean().optional(),
  });

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      action: "quiz:update",
      outcome: "rejected",
      reason: errorMsg,
    });
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  if (!isAdmin) {
    if (parsed.data.category === 'simulation') {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? existingTemplate.courseId,
        entityType: "quiz_template",
        entityId: id,
        entityVersion: 1,
        action: "quiz:update",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN,
      });
      return NextResponse.json(
        { error: 'Forbidden: Tutors cannot change quiz category to simulation.' },
        { status: 403 },
      );
    }
    if (parsed.data.selectionRules?.assessmentType === 'tryout') {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? existingTemplate.courseId,
        entityType: "quiz_template",
        entityId: id,
        entityVersion: 1,
        action: "quiz:update",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN,
      });
      return NextResponse.json(
        { error: 'Forbidden: Tutors cannot set assessment type to tryout.' },
        { status: 403 },
      );
    }
  }

  const updateData: any = {};
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.manualStatus !== undefined) updateData.manualStatus = parsed.data.manualStatus;
  if (parsed.data.openAt !== undefined) {
    updateData.openAt = parsed.data.openAt ? new Date(parsed.data.openAt) : null;
  }
  if (parsed.data.closeAt !== undefined) {
    updateData.closeAt = parsed.data.closeAt ? new Date(parsed.data.closeAt) : null;
  }
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
  if (parsed.data.visibility !== undefined) updateData.visibility = parsed.data.visibility;
  if (parsed.data.timeLimitSeconds !== undefined) updateData.timeLimitSeconds = parsed.data.timeLimitSeconds;
  if (parsed.data.maxAttempts !== undefined) updateData.maxAttempts = parsed.data.maxAttempts;
  if (parsed.data.selectionRules !== undefined) {
    if (parsed.data.selectionRules.assessmentType) {
      const scope = assessmentScopeSchema.safeParse({
        assessmentType: parsed.data.selectionRules.assessmentType,
        chapterIds: parsed.data.selectionRules.chapterIds ?? [],
      });
      if (!scope.success) {
        const reason = 'Assessment scope must match quiz or tryout chapter rules.';
        await recordTutorMutationAuditSafe({
          actorId: session.user.id,
          actorRoles: roles,
          courseId: access.courseId ?? existingTemplate.courseId,
          entityType: "quiz_template",
          entityId: id,
          entityVersion: 1,
          action: "quiz:update",
          outcome: "rejected",
          reason,
        });
        return NextResponse.json({ error: reason }, { status: 400 });
      }
    }
    const timingMismatch = getQuizTimingMismatch({
      timeLimitSeconds: parsed.data.timeLimitSeconds,
      count: parsed.data.selectionRules.count,
      fixedQuestionIds: parsed.data.selectionRules.fixedQuestionIds,
      perQuestionTimerEnabled: parsed.data.selectionRules.perQuestionTimerEnabled,
      perQuestionTimers: parsed.data.selectionRules.perQuestionTimers,
      defaultQuestionTimerSeconds: parsed.data.selectionRules.defaultQuestionTimerSeconds,
    });
    if (timingMismatch) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? existingTemplate.courseId,
        entityType: "quiz_template",
        entityId: id,
        entityVersion: 1,
        action: "quiz:update",
        outcome: "rejected",
        reason: timingMismatch,
      });
      return NextResponse.json({ error: timingMismatch }, { status: 400 });
    }
    updateData.selectionRules = parsed.data.selectionRules;
    if (parsed.data.showDiscussion === undefined && parsed.data.selectionRules.explanationRelease !== undefined) {
      updateData.showDiscussion = parsed.data.selectionRules.explanationRelease !== 'never';
    }
  }
  if (parsed.data.showDiscussion !== undefined) {
    updateData.showDiscussion = parsed.data.showDiscussion;
  }
  updateData.actorId = session.user.id;

  const previous = parsed.data.status
    ? await db
        .select({ status: quizTemplates.status, title: quizTemplates.title, courseId: quizTemplates.courseId })
        .from(quizTemplates)
        .where(eq(quizTemplates.id, id))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  const requestId = `req-${randomUUID()}`;
  try {
    await db.transaction(async (tx) => {
      await updateAssessmentWithLegacyProjection(id, updateData, tx);

      await recordTutorMutationAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? existingTemplate.courseId,
        entityType: "quiz_template",
        entityId: id,
        entityVersion: 1,
        requestId,
        action: "quiz:update",
        outcome: "success",
        reason: "Quiz template updated via API",
        after: {
          id,
          title: parsed.data.title ?? existingTemplate.title,
          status: parsed.data.status ?? existingTemplate.status,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? existingTemplate.courseId,
      entityType: "quiz_template",
      entityId: id,
      entityVersion: 1,
      requestId,
      action: "quiz:update",
      outcome: "failed",
      reason: err?.message || "Failed to update quiz template via API",
      after: {
        id,
        title: parsed.data.title ?? existingTemplate.title,
        status: parsed.data.status ?? existingTemplate.status,
      },
    });
    return NextResponse.json({ error: 'Failed to update quiz template' }, { status: 500 });
  }

  if (parsed.data.status === 'published' && previous && previous.status !== 'published') {
    const quizTitle = typeof parsed.data.title === 'string' ? parsed.data.title : previous.title;
    await notifyQuizPublishedBestEffort({
      templateId: id,
      quizTitle,
      courseId: previous.courseId,
      quizUrl: `/courses/${previous.courseId}/quiz`,
    });
  }

  return NextResponse.json({ success: true });
}
