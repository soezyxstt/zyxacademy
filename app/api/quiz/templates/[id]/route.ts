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
import { assessmentScopeSchema } from '@/lib/asesmen/contracts';
import { notifyQuizPublishedBestEffort } from '@/lib/notifications/send';

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Context) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { id } = await params;

 await db
 .delete(quizTemplates)
 .where(eq(quizTemplates.id, id));

 return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

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
    return NextResponse.json({ error: errorMsg }, { status: 400 });
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
        return NextResponse.json({ error: 'Assessment scope must match quiz or tryout chapter rules.' }, { status: 400 });
      }
    }
    updateData.selectionRules = parsed.data.selectionRules;
    if (parsed.data.showDiscussion === undefined && parsed.data.selectionRules.explanationRelease !== undefined) {
      updateData.showDiscussion = parsed.data.selectionRules.explanationRelease !== 'never';
    }
  }
  if (parsed.data.showDiscussion !== undefined) {
    updateData.showDiscussion = parsed.data.showDiscussion;
  }
  updateData.updatedAt = new Date();

  // If status is changing, read the current row so we only notify on a
  // transition into "published" (never on every save or re-publish).
  const previous = parsed.data.status
    ? await db
        .select({ status: quizTemplates.status, title: quizTemplates.title, courseId: quizTemplates.courseId })
        .from(quizTemplates)
        .where(eq(quizTemplates.id, id))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  await db
    .update(quizTemplates)
    .set(updateData)
    .where(eq(quizTemplates.id, id));

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
