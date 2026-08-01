/**
 * PUT /api/admin/questions/[id] ; Update a single question details
 * DELETE /api/admin/questions/[id] ; Delete a single question
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { aiQuestionBank } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';

const UpdateQuestionSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  questionType: z.enum(['multiple_choice', 'multiple_choices', 'short_answer', 'essay']).optional(),
  tags: z.array(z.string()).optional(),
  prompt: z.string().min(1).optional(),
  options: z.array(z.string()).optional(),
  correctIndices: z.array(z.number().int().min(0)).optional(),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  reviewStatus: z.enum(['generated', 'reviewed', 'published', 'flagged', 'retired']).optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const updateData: Record<string, any> = {};

  if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
  if (data.questionType !== undefined) updateData.questionType = data.questionType;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.prompt !== undefined) updateData.prompt = data.prompt;
  if (data.options !== undefined) updateData.options = data.options;
  if (data.correctIndices !== undefined) updateData.correctIndices = data.correctIndices;
  if (data.acceptableAnswers !== undefined) updateData.acceptableAnswers = data.acceptableAnswers;
  if (data.explanation !== undefined) updateData.explanation = data.explanation;
  if (data.reviewStatus !== undefined) updateData.reviewStatus = data.reviewStatus;

 await db
 .update(aiQuestionBank)
 .set(updateData)
 .where(eq(aiQuestionBank.id, id));

 return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: Context) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { id } = await params;

 await db
 .delete(aiQuestionBank)
 .where(eq(aiQuestionBank.id, id));

 return NextResponse.json({ success: true });
}
