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
import { env } from '@/lib/env';
import { assessmentScopeSchema } from '@/lib/asesmen/contracts';

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
    }).optional(),
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
    if (env.FEATURE_ASESMEN_IDE_V1 === '1' && parsed.data.selectionRules.assessmentType) {
      const scope = assessmentScopeSchema.safeParse({
        assessmentType: parsed.data.selectionRules.assessmentType,
        chapterIds: parsed.data.selectionRules.chapterIds ?? [],
      });
      if (!scope.success) {
        return NextResponse.json({ error: 'Assessment scope must match quiz or tryout chapter rules.' }, { status: 400 });
      }
    }
    updateData.selectionRules = parsed.data.selectionRules;
  }
  if (parsed.data.showDiscussion !== undefined) {
    updateData.showDiscussion = parsed.data.showDiscussion;
  }
  updateData.updatedAt = new Date();

  await db
    .update(quizTemplates)
    .set(updateData)
    .where(eq(quizTemplates.id, id));

  return NextResponse.json({ success: true });
}
