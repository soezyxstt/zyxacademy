/**
 * GET /api/admin/questions ; List questions with optional filters
 * PUT /api/admin/questions ; Bulk update review_status for a list of IDs
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import { aiQuestionBank, auditMutasi, pembahasanSoal, soal } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { questionAuthoringInputSchema, canonicalQuestionStatus } from '@/lib/question-authoring-contract';
import { createCanonicalQuestion, QuestionAuthoringError } from '@/lib/question-authoring';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('courseId');
  const reviewStatus = searchParams.get('reviewStatus');
  const difficulty = searchParams.get('difficulty');
  const origin = searchParams.get('origin');
  const search = searchParams.get('q') || searchParams.get('search');
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '100'), 1), 500);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);

  const conditions = [];
  if (courseId) conditions.push(eq(aiQuestionBank.courseId, courseId));
  if (reviewStatus) {
    conditions.push(
      eq(
        aiQuestionBank.reviewStatus,
        reviewStatus as 'generated' | 'reviewed' | 'published' | 'flagged' | 'retired',
      ),
    );
  }
  if (difficulty) {
    conditions.push(
      eq(aiQuestionBank.difficulty, difficulty as 'easy' | 'medium' | 'hard'),
    );
  }
  if (origin === 'zyx_original' || origin === 'itb_example') {
    conditions.push(eq(aiQuestionBank.origin, origin));
  }
  if (search) {
    conditions.push(sql`${aiQuestionBank.prompt} LIKE ${`%${search}%`}`);
  }

  const questions = await db
    .select()
    .from(aiQuestionBank)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiQuestionBank.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json(questions);
}

const BulkUpdateSchema = z.object({
 ids: z.array(z.string()).min(1),
 reviewStatus: z.enum(['generated', 'reviewed', 'published', 'flagged', 'retired']),
});

export async function PUT(req: NextRequest) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = await req.json();
 const parsed = BulkUpdateSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 }

 const { ids, reviewStatus } = parsed.data;

  const canonicalStatus = canonicalQuestionStatus(reviewStatus);
  const now = new Date();
  const publishedAt = canonicalStatus === 'published' ? now : null;

  await db.transaction(async (tx) => {
    const canonicalRows = await tx
      .select({ id: soal.id, version: soal.version, status: soal.status, courseId: soal.mataKuliahId })
      .from(soal)
      .where(inArray(soal.id, ids));
    const compatibilityRows = await tx
      .select({ id: aiQuestionBank.id, reviewStatus: aiQuestionBank.reviewStatus, courseId: aiQuestionBank.courseId })
      .from(aiQuestionBank)
      .where(inArray(aiQuestionBank.id, ids));
    await tx
      .update(aiQuestionBank)
      .set({ reviewStatus, status: canonicalStatus === 'retired' ? 'retired' : 'active' })
      .where(inArray(aiQuestionBank.id, ids));
    await tx
      .update(soal)
      .set({ status: canonicalStatus, publishedAt, updatedAt: now })
      .where(inArray(soal.id, ids));
    await tx
      .update(pembahasanSoal)
      .set({ status: canonicalStatus, publishedAt, updatedAt: now })
      .where(inArray(pembahasanSoal.soalId, ids));
    const canonicalById = new Map(canonicalRows.map((row) => [row.id, row]));
    const compatibilityById = new Map(compatibilityRows.map((row) => [row.id, row]));
    await tx.insert(auditMutasi).values(ids.map((id) => ({
      id: `audit-question-status-${id}-${randomUUID()}`,
      actorId: session.user.id,
      entityType: 'question',
      entityId: id,
      action: reviewStatus === 'published' ? 'published' : 'review_status_updated',
      beforeSnapshot: canonicalById.has(id)
        ? { version: canonicalById.get(id)?.version, status: canonicalById.get(id)?.status, courseId: canonicalById.get(id)?.courseId }
        : { reviewStatus: compatibilityById.get(id)?.reviewStatus, courseId: compatibilityById.get(id)?.courseId },
      afterSnapshot: { reviewStatus, canonicalStatus },
      correlationId: id,
      createdAt: now,
    })));
  });

 return NextResponse.json({ updated: ids.length });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = questionAuthoringInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createCanonicalQuestion(parsed.data, session.user.id);
    return NextResponse.json({
      id: result.id,
      courseId: result.legacyCourseId,
      canonicalCourseId: result.canonicalCourseId,
      chapterId: result.chapterId,
      reviewStatus: result.reviewStatus,
      success: true,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof QuestionAuthoringError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    console.error('[Question Authoring] Failed to persist question:', error);
    return NextResponse.json({ error: 'Gagal menyimpan soal canonical.' }, { status: 500 });
  }
}
