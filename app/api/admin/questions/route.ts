/**
 * GET /api/admin/questions ; List questions with optional filters
 * PUT /api/admin/questions ; Bulk update review_status for a list of IDs
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import {
  aiQuestionBank,
  assessmentSources,
  auditMutasi,
  ide,
  pembahasanSoal,
  soal,
  soalIde,
} from '@/db/schema';
import { auth } from '@/lib/auth';
import { hasAnyPeran } from '@/lib/auth/authorization';
import { headers } from 'next/headers';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { questionAuthoringInputSchema, canonicalQuestionStatus } from '@/lib/question-authoring-contract';
import { createCanonicalQuestion, QuestionAuthoringError } from '@/lib/question-authoring';

/**
 * Handles GET requests to retrieve paginated question bank records with optional filters.
 *
 * @param req - Incoming Next.js request with query parameters (courseId, reviewStatus, difficulty, origin, search, limit, offset).
 * @returns JSON response with questions list, total count, limit, and offset.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthorized =
    session?.user &&
    ((await hasAnyPeran(session.user.id, ['admin', 'tutor'], { allowAdmin: true })) ||
      session.user.role === 'admin' ||
      session.user.role === 'teacher');
  if (!isAuthorized) {
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
  if (origin === 'zyx_original' || origin === 'itb_example' || origin === 'historical_reference') {
    conditions.push(eq(aiQuestionBank.origin, origin));
  }
  if (search) {
    conditions.push(sql`${aiQuestionBank.prompt} LIKE ${`%${search}%`}`);
  }
  if (!reviewStatus) {
    conditions.push(sql`${aiQuestionBank.status} != 'retired'`);
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

/**
 * Handles PUT requests for bulk status updates on question bank records.
 *
 * @param req - Incoming Next.js request with question IDs and target reviewStatus.
 * @returns JSON response confirming update count or validation failure.
 */
export async function PUT(req: NextRequest) {
 const session = await auth.api.getSession({ headers: await headers() });
 const isAuthorized =
  session?.user &&
  ((await hasAnyPeran(session.user.id, ['admin', 'tutor'], { allowAdmin: true })) ||
   session.user.role === 'admin' ||
   session.user.role === 'teacher');
 if (!isAuthorized) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const isAdmin = Boolean(
  session?.user &&
  ((await hasAnyPeran(session.user.id, ['admin'])) || session.user.role === 'admin'),
 );

 const body = await req.json();
 const parsed = BulkUpdateSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 }

  const { ids, reviewStatus } = parsed.data;

  if (reviewStatus === 'published' && !isAdmin) {
    return NextResponse.json(
      { error: 'Hanya admin yang dapat menerbitkan soal.', code: 'ADMIN_PUBLICATION_REQUIRED' },
      { status: 403 },
    );
  }

  const canonicalStatus = canonicalQuestionStatus(reviewStatus);
  const now = new Date();
  const publishedAt = canonicalStatus === 'published' ? now : null;

  const result = await db.transaction(async (tx) => {
    const canonicalRows = await tx
      .select({
        id: soal.id,
        origin: soal.origin,
        version: soal.version,
        status: soal.status,
        courseId: soal.mataKuliahId,
      })
      .from(soal)
      .where(inArray(soal.id, ids));
    const compatibilityRows = await tx
      .select({
        id: aiQuestionBank.id,
        origin: aiQuestionBank.origin,
        reviewStatus: aiQuestionBank.reviewStatus,
        courseId: aiQuestionBank.courseId,
      })
      .from(aiQuestionBank)
      .where(inArray(aiQuestionBank.id, ids));
    const canonicalById = new Map(canonicalRows.map((row) => [row.id, row]));
    const compatibilityById = new Map(compatibilityRows.map((row) => [row.id, row]));

    if (reviewStatus === 'published') {
      const historicalQuestionIds = [
        ...new Set([
          ...canonicalRows
            .filter((row) => row.origin === 'historical_reference')
            .map((row) => row.id),
          ...compatibilityRows
            .filter((row) => row.origin === 'historical_reference')
            .map((row) => row.id),
        ]),
      ];
      const canonicalHistoricalQuestionIds = canonicalRows
        .filter((row) => row.origin === 'historical_reference')
        .map((row) => row.id);

      if (historicalQuestionIds.length > 0) {
        const sourceRows = canonicalHistoricalQuestionIds.length > 0
          ? await tx
              .select({ questionId: soal.id })
              .from(soal)
              .innerJoin(assessmentSources, eq(assessmentSources.id, soal.assessmentSourceId))
              .where(
                and(
                  inArray(soal.id, canonicalHistoricalQuestionIds),
                  eq(soal.origin, 'historical_reference'),
                  isNull(assessmentSources.deletedAt),
                ),
              )
          : [];
        const publishedIdeaRows = canonicalHistoricalQuestionIds.length > 0
          ? await tx
              .select({ questionId: soalIde.soalId })
              .from(soalIde)
              .innerJoin(soal, eq(soal.id, soalIde.soalId))
              .innerJoin(ide, eq(ide.id, soalIde.ideId))
              .where(
                and(
                  inArray(soalIde.soalId, canonicalHistoricalQuestionIds),
                  eq(soal.origin, 'historical_reference'),
                  eq(ide.status, 'published'),
                  eq(soal.mataKuliahId, ide.mataKuliahId),
                ),
              )
          : [];
        const questionsWithSource = new Set(sourceRows.map((row) => row.questionId));
        const questionsWithPublishedIdea = new Set(publishedIdeaRows.map((row) => row.questionId));
        const blockedHistoricalQuestionIds = historicalQuestionIds.filter(
          (id) =>
            !canonicalById.has(id) ||
            !questionsWithSource.has(id) ||
            !questionsWithPublishedIdea.has(id),
        );

        if (blockedHistoricalQuestionIds.length > 0) {
          return { blockedHistoricalQuestionIds };
        }
      }
    }

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
    return { blockedHistoricalQuestionIds: [] as string[] };
  });

  if (result.blockedHistoricalQuestionIds.length > 0) {
    return NextResponse.json(
      {
        error: 'Soal historis harus memiliki assessment source yang valid dan minimal satu Idea published sebelum dipublikasikan.',
        code: 'HISTORICAL_PUBLICATION_REQUIREMENTS_NOT_MET',
        questionIds: result.blockedHistoricalQuestionIds,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ updated: ids.length });
}

/**
 * Handles POST requests to create a single canonical question record.
 *
 * @param req - Incoming Next.js request with question authoring payload.
 * @returns JSON response containing the created question identifiers and review status.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthorized =
    session?.user &&
    ((await hasAnyPeran(session.user.id, ['admin', 'tutor'], { allowAdmin: true })) ||
      session.user.role === 'admin' ||
      session.user.role === 'teacher');
  if (!isAuthorized) {
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
