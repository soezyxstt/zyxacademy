/**
 * GET /api/quiz/daily ; Pull 5 questions from approved bank filtered to student's enrolled courses
 * POST /api/quiz/daily ; Submit daily quiz answers and save attempt with score
 *
 * Zero provider cost path ; reads directly from ai_question_bank.
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
import { and, eq, inArray, asc, or, sql } from 'drizzle-orm';
import { dualWriteQuizAttempt } from '@/lib/migrasi/repository-kompatibilitas';
import { createAssessmentWithLegacyProjection } from '@/lib/asesmen/quiz-canonical-sync';

const DAILY_QUESTION_COUNT = 5;

export async function GET() {
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
 await createAssessmentWithLegacyProjection({
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
  creatorId: studentId,
 });
 }

 // Select questions ; proportioned by difficulty, sorted by use_count ASC (freshest first)
 const proportions: Record<string, number> = { easy: 2, medium: 2, hard: 1 };
 const quizEligibilityCondition = or(
  eq(aiQuestionBank.origin, 'zyx_original'),
  eq(aiQuestionBank.origin, 'itb_example'),
  eq(aiQuestionBank.quizEligible, true),
 );
 const questionsByDifficulty = await Promise.all(
 Object.entries(proportions).map(([diff, count]) =>
 db
 .select()
 .from(aiQuestionBank)
 .where(
 and(
 inArray(aiQuestionBank.courseId, courseIds),
 eq(aiQuestionBank.reviewStatus, 'published'),
 quizEligibilityCondition,
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
 origin: q.origin,
 sourceEventName: q.sourceEventName,
 sourceReferenceId: q.sourceReferenceId,
 prompt: q.prompt,
 options: q.options,
 difficulty: q.difficulty,
 tags: q.tags,
 }));

 return NextResponse.json({ questions: clientQuestions, templateId });
}

const SubmitSchema = z.object({
  templateId: z.string().min(1),
  answers: z.record(
    z.string(),
    z.union([z.array(z.number()), z.string(), z.array(z.string()), z.number()])
  ),
  durationSeconds: z.number().int().min(0).optional(),
  questionsSnapshot: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()),
      correct_indices: z.array(z.number()).optional(),
      explanation: z.string().optional(),
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

  function checkDailyAnswerCorrectness(q: any, submitted: any): boolean {
    const qType = q.question_type || q.questionType;
    if (qType === "short_answer" || (Array.isArray(q.acceptable_answers) && q.acceptable_answers.length > 0)) {
      const acceptable = Array.isArray(q.acceptable_answers) ? q.acceptable_answers : [];
      const text = typeof submitted === "string" ? submitted : Array.isArray(submitted) ? String(submitted[0] ?? "") : "";
      const trimmed = text.trim().toLowerCase();
      return trimmed.length > 0 && acceptable.some((ans: string) => ans.trim().toLowerCase() === trimmed);
    }
    if (qType === "essay") {
      const text = typeof submitted === "string" ? submitted : Array.isArray(submitted) ? String(submitted[0] ?? "") : "";
      return text.trim().length > 0;
    }
    const indices = Array.isArray(submitted) ? submitted : [];
    const correct = Array.isArray(q.correct_indices) ? q.correct_indices : Array.isArray(q.correctIndices) ? q.correctIndices : [];
    if (correct.length === 0) return false;
    if (qType === "multiple_choice" || !qType) {
      const firstIdx = indices[0];
      return firstIdx !== undefined && correct.includes(firstIdx);
    }
    return indices.length === correct.length && indices.every((i: number) => correct.includes(i));
  }

  // Calculate score
  let correct = 0;
  for (const q of questionsSnapshot) {
    const submitted = answers[q.id];
    if (checkDailyAnswerCorrectness(q, submitted)) correct++;
  }

 const score = Math.round((correct / questionsSnapshot.length) * 100);
 const attemptId = randomUUID();
 const submittedAt = new Date();

 await db.transaction(async (tx) => {
   await tx.insert(studentQuizAttempts).values({
     id: attemptId,
     studentId,
     templateId,
     score,
     durationSeconds: durationSeconds ?? null,
     status: 'completed',
     questionsSnapshot: questionsSnapshot as unknown as Record<string, unknown>,
     answersSnapshot: answers as unknown as Record<string, unknown>,
     submittedAt,
     startedAt: submittedAt,
   });
   await dualWriteQuizAttempt(tx, {
     id: attemptId,
     templateId,
     studentId,
     status: 'completed',
     questionsSnapshot,
     answersSnapshot: answers,
     startedAt: submittedAt,
     submittedAt,
   }, studentId);

   // Increment use_count for all answered questions.
   const questionIds = questionsSnapshot.map((q) => q.id);
   await tx
     .update(aiQuestionBank)
     .set({ useCount: sql`${aiQuestionBank.useCount} + 1` })
     .where(inArray(aiQuestionBank.id, questionIds));
 });

 return NextResponse.json({ attemptId, score, correct, total: questionsSnapshot.length });
}
