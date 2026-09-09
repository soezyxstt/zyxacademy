/**
 * POST /api/quiz/weekly-generate
 *
 * Cost-aware weekly quiz generation:
 * - If the bank has enough approved questions for the given criteria → create template directly
 * - If not enough → trigger Gemini generation pipeline first, then return job ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '@/db';
import { aiQuestionBank, quizTemplates, chapters, knowledgeObjects } from '@/db/schema';
import { auth } from '@/lib/auth';
import { hasAnyPeran } from '@/lib/auth/authorization';
import { headers } from 'next/headers';
import { and, or, eq, count, sql } from 'drizzle-orm';
import { startGenerationJob } from '@/lib/generation-pipeline';
import { createAssessmentWithLegacyProjection } from '@/lib/asesmen/quiz-canonical-sync';

const Schema = z.object({
 courseId: z.string().min(1),
 title: z.string().min(1).max(255),
 topic: z.string().min(1),
 targetCount: z.number().int().min(1).max(100),
 difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('medium'),
 timeLimitSeconds: z.number().int().min(60).optional(),
 tags: z.array(z.string()).optional(),
});

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
 const parsed = Schema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 }

 const { courseId, title, topic, targetCount, difficulty, timeLimitSeconds, tags } = parsed.data;

 // Uniqueness check for tags per course
 const validationTags = tags || [];
 if (validationTags.length > 0) {
 const existingTemplates = await db
 .select()
 .from(quizTemplates)
 .where(eq(quizTemplates.courseId, courseId));

 const hasDuplicateTags = existingTemplates.some((t) => {
 const tRules = t.selectionRules as Record<string, unknown>;
 const tTags = tRules?.tags as string[] | undefined;
 if (!tTags) return false;
 return validationTags.some((tag) => tTags.includes(tag));
 });

 if (hasDuplicateTags) {
 return NextResponse.json(
 { error: 'Template kuis dengan tag bab ini sudah ada di kelas ini.' },
 { status: 409 },
 );
 }
 }

 // Check how many published questions exist for this course + difficulty + tags
 const diffCondition =
 difficulty !== 'mixed' ? eq(aiQuestionBank.difficulty, difficulty) : undefined;

 const tagConditions = validationTags.map(
 (tag) => sql`exists (select 1 from json_each(${aiQuestionBank.tags}) where json_each.value = ${tag})`
 );
 const tagCondition = validationTags.length > 0 ? or(...tagConditions) : undefined;
 const quizEligibilityCondition = or(
  eq(aiQuestionBank.origin, 'zyx_original'),
  eq(aiQuestionBank.origin, 'itb_example'),
  eq(aiQuestionBank.quizEligible, true),
 );

 const [{ total }] = await db
 .select({ total: count() })
 .from(aiQuestionBank)
 .where(
 and(
 eq(aiQuestionBank.courseId, courseId),
 eq(aiQuestionBank.reviewStatus, 'published'),
 quizEligibilityCondition,
 diffCondition,
 tagCondition,
 ),
 );

 if (total >= targetCount) {
 // Enough questions ; create template directly without vector retrieval or Gemini
 const templateId = randomUUID();
 await createAssessmentWithLegacyProjection({
 id: templateId,
 courseId,
 title,
 category: 'weekly',
 visibility: 'free',
 timeLimitSeconds: timeLimitSeconds ?? null,
 selectionRules: {
 topic,
 tags: validationTags,
 count: targetCount,
 difficulty_proportions:
 difficulty === 'mixed'
 ? {
 easy: Math.round(targetCount * 0.3),
 medium: Math.round(targetCount * 0.5),
 hard: targetCount - Math.round(targetCount * 0.3) - Math.round(targetCount * 0.5),
 }
 : { [difficulty]: targetCount },
 },
 status: 'published',
 creatorId: session.user.id,
 });

 return NextResponse.json({ mode: 'bank_reuse', templateId }, { status: 201 });
 }

 // Find matching chapterId based on KOs with matching tags
 const [matchingKO] = await db
 .select({ chapterId: knowledgeObjects.chapterId })
 .from(knowledgeObjects)
 .where(
 and(
 eq(knowledgeObjects.courseId, courseId),
 eq(knowledgeObjects.status, 'active'),
 validationTags.length > 0
 ? and(...validationTags.map(tag => sql`exists (select 1 from json_each(${knowledgeObjects.tags}) where json_each.value = ${tag})`))
 : undefined
 )
 )
 .limit(1);

 let finalChapterId = matchingKO?.chapterId;
 if (!finalChapterId) {
 const [firstChapter] = await db
 .select({ id: chapters.id })
 .from(chapters)
 .where(eq(chapters.courseId, courseId))
 .orderBy(chapters.orderIndex)
 .limit(1);
 finalChapterId = firstChapter?.id;
 }

 if (!finalChapterId) {
 return NextResponse.json(
 { error: 'Tidak ada bab atau materi aktif untuk kursus ini.' },
 { status: 400 }
 );
 }

 // Count active KOs in chapter
 const activeKOs = await db
 .select({ id: knowledgeObjects.id })
 .from(knowledgeObjects)
 .where(
 and(
 eq(knowledgeObjects.courseId, courseId),
 eq(knowledgeObjects.chapterId, finalChapterId),
 eq(knowledgeObjects.status, 'active')
 )
 );

 // Not enough ; trigger generation pipeline first
 const jobId = await startGenerationJob({
 courseId,
 tutorId: session.user.id,
 chapterId: finalChapterId,
 targetCount: activeKOs.length,
 });

 return NextResponse.json(
 {
 mode: 'generation_triggered',
 jobId,
 message: `Only ${total} approved questions found. Generating ${activeKOs.length} more via Gemini. Poll /api/admin/generation-jobs/${jobId} for status, then create template manually.`,
 },
 { status: 202 },
 );
}
