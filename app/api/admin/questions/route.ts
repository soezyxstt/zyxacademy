/**
 * GET /api/admin/questions ; List questions with optional filters
 * PUT /api/admin/questions ; Bulk update review_status for a list of IDs
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '@/db';
import { aiQuestionBank } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, eq, inArray, desc } from 'drizzle-orm';

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
 const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);
 const offset = Number(searchParams.get('offset') ?? '0');

 const conditions = [];
 if (courseId) conditions.push(eq(aiQuestionBank.courseId, courseId));
 if (reviewStatus)
 conditions.push(
 eq(
 aiQuestionBank.reviewStatus,
 reviewStatus as 'generated' | 'reviewed' | 'published' | 'flagged' | 'retired',
 ),
 );
 if (difficulty)
 conditions.push(
 eq(aiQuestionBank.difficulty, difficulty as 'easy' | 'medium' | 'hard'),
 );
 if (origin === 'zyx_original' || origin === 'itb_example') conditions.push(eq(aiQuestionBank.origin, origin));

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

 await db
 .update(aiQuestionBank)
 .set({ reviewStatus })
 .where(inArray(aiQuestionBank.id, ids));

 return NextResponse.json({ updated: ids.length });
}

const CreateQuestionSchema = z.object({
  courseId: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  questionType: z.enum(['multiple_choice', 'multiple_choices', 'short_answer', 'essay']).default('multiple_choice'),
  tags: z.array(z.string()).default([]),
  prompt: z.string().min(1),
  options: z.array(z.string()).default([]),
  correctIndices: z.array(z.number().int().min(0)).default([]),
  acceptableAnswers: z.array(z.string()).default([]),
  explanation: z.string().default(''),
  reviewStatus: z.enum(['generated', 'reviewed', 'published', 'flagged', 'retired']).default('published'),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = CreateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { courseId, difficulty, questionType, tags, prompt, options, correctIndices, acceptableAnswers, explanation, reviewStatus } = parsed.data;

  const id = randomUUID();

  await db.insert(aiQuestionBank).values({
    id,
    courseId,
    origin: 'zyx_original',
    sourceEventName: null,
    sourceReferenceId: null,
    difficulty,
    questionType,
    tags: tags as unknown as Record<string, unknown>,
    prompt,
    options: options as unknown as Record<string, unknown>,
    correctIndices: correctIndices as unknown as Record<string, unknown>,
    acceptableAnswers: acceptableAnswers || [],
    explanation: explanation ?? null,
    reviewStatus,
  });

  return NextResponse.json({ id, success: true }, { status: 201 });
}
