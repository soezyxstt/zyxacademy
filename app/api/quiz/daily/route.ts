/**
 * GET /api/quiz/daily ; Pull 5 questions from approved bank filtered to student's enrolled courses
 * POST /api/quiz/daily ; Submit daily quiz answers and save attempt with score
 *
 * Zero Gemini/Pinecone cost path ; reads directly from ai_question_bank.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '@/db';
import {
 aiQuestionBank,
 quizTemplates,
 studentQuizAttempts,
 enrollments,
 courses,
} from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, eq, inArray, asc, sql } from 'drizzle-orm';

const DAILY_QUESTION_COUNT = 5;

export async function GET(req: NextRequest) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const studentId = session.user.id;

 // Get the student's active enrolled course IDs
 const now = new Date();
 let courseIds: string[];
 if (session.user.role === 'admin') {
 const all = await db.select({ id: courses.id }).from(courses);
 courseIds = all.map((c) => c.id);
 } else {
 const enrolled = await db
 .select({ courseId: enrollments.courseId })
 .from(enrollments)
 .where(
 and(
 eq(enrollments.userId, studentId),
 sql`${enrollments.expiresAt} > ${now}`,
 ),
 );
 courseIds = enrolled.map((e) => e.courseId);
 }

 if (courseIds.length === 0) {
 return NextResponse.json({ questions: [], templateId: null });
 }

 // Find or create the implicit daily template for this student's courses
 let templateId: string;
 const [existingTemplate] = await db
 .select({ id: quizTemplates.id })
 .from(quizTemplates)
 .where(
 and(
 eq(quizTemplates.category, 'daily'),
 inArray(quizTemplates.courseId, courseIds),
 ),
 )
 .limit(1);

 if (existingTemplate) {
 templateId = existingTemplate.id;
 } else {
 // Use first enrolled course for the template
 templateId = randomUUID();
 await db.insert(quizTemplates).values({
 id: templateId,
 courseId: courseIds[0],
 title: 'Daily Quiz',
 category: 'daily',
 visibility: 'free',
 selectionRules: {
 count: DAILY_QUESTION_COUNT,
 difficulty_proportions: { easy: 2, medium: 2, hard: 1 },
 } as unknown as Record<string, unknown>,
 status: 'published',
 });
 }

 // Select questions ; proportioned by difficulty, sorted by use_count ASC (freshest first)
 const proportions: Record<string, number> = { easy: 2, medium: 2, hard: 1 };
 const questionsByDifficulty = await Promise.all(
 Object.entries(proportions).map(([diff, count]) =>
 db
 .select()
 .from(aiQuestionBank)
 .where(
 and(
 inArray(aiQuestionBank.courseId, courseIds),
 eq(aiQuestionBank.reviewStatus, 'published'),
 eq(aiQuestionBank.difficulty, diff as 'easy' | 'medium' | 'hard'),
 ),
 )
 .orderBy(asc(aiQuestionBank.useCount))
 .limit(count),
 ),
 );

 const questions = questionsByDifficulty.flat();

 // Shuffle
 const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, DAILY_QUESTION_COUNT);

 // Strip correct answers from the client-facing payload
 const clientQuestions = shuffled.map((q) => ({
 id: q.id,
 prompt: q.prompt,
 options: q.options,
 difficulty: q.difficulty,
 tags: q.tags,
 }));

 return NextResponse.json({ questions: clientQuestions, templateId });
}

const SubmitSchema = z.object({
 templateId: z.string().min(1),
 answers: z.record(z.string(), z.array(z.number())),
 durationSeconds: z.number().int().min(0).optional(),
 questionsSnapshot: z.array(
 z.object({
 id: z.string(),
 prompt: z.string(),
 options: z.array(z.string()),
 correct_indices: z.array(z.number()),
 explanation: z.string(),
 }),
 ),
});

export async function POST(req: NextRequest) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = await req.json();
 const parsed = SubmitSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 }

 const { templateId, answers, durationSeconds, questionsSnapshot } = parsed.data;
 const studentId = session.user.id;

 // Calculate score
 let correct = 0;
 for (const q of questionsSnapshot) {
 const submitted = answers[q.id] ?? [];
 const isCorrect =
 submitted.length === q.correct_indices.length &&
 submitted.every((i) => q.correct_indices.includes(i));
 if (isCorrect) correct++;
 }

 const score = Math.round((correct / questionsSnapshot.length) * 100);
 const attemptId = randomUUID();

 await db.insert(studentQuizAttempts).values({
 id: attemptId,
 studentId,
 templateId,
 score,
 durationSeconds: durationSeconds ?? null,
 status: 'completed',
 questionsSnapshot: questionsSnapshot as unknown as Record<string, unknown>,
 answersSnapshot: answers as unknown as Record<string, unknown>,
 submittedAt: new Date(),
 });

 // Increment use_count for all answered questions
 const questionIds = questionsSnapshot.map((q) => q.id);
 await db
 .update(aiQuestionBank)
 .set({ useCount: sql`${aiQuestionBank.useCount} + 1` })
 .where(inArray(aiQuestionBank.id, questionIds));

 return NextResponse.json({ attemptId, score, correct, total: questionsSnapshot.length });
}
