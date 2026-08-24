/**
 * POST /api/admin/generation-jobs ; Create a new background generation job
 * GET /api/admin/generation-jobs ; List jobs (filtered by courseId or status)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { aiGenerationJobs, knowledgeObjects } from '@/db/schema';
import { auth } from '@/lib/auth';
import { hasAnyPeran } from '@/lib/auth/authorization';
import { headers } from 'next/headers';
import { startGenerationJob } from '@/lib/generation-pipeline';
import { desc, eq, and, inArray, sql } from 'drizzle-orm';

const CreateJobSchema = z.object({
 courseId: z.string().min(1),
 chapterId: z.string().min(1),
 koId: z.string().optional(),
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
 const parsed = CreateJobSchema.safeParse(body);
 if (!parsed.success) {
 return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 }

 const { courseId, chapterId, koId } = parsed.data;

 // Verify KOs exist and count them
 const conditions = [
 eq(knowledgeObjects.courseId, courseId),
 eq(knowledgeObjects.chapterId, chapterId),
 eq(knowledgeObjects.status, 'active'),
 ];
 if (koId && koId !== 'all') {
 conditions.push(eq(knowledgeObjects.id, koId));
 }

 const activeKOs = await db
 .select({ id: knowledgeObjects.id })
 .from(knowledgeObjects)
 .where(and(...conditions));

 if (activeKOs.length === 0) {
 return NextResponse.json(
 { error: 'Tidak ada Objek Pengetahuan aktif dalam bab/pilihan ini.' },
 { status: 400 }
 );
 }

 const jobId = await startGenerationJob({
 courseId,
 tutorId: session.user.id,
 chapterId,
 koId: koId === 'all' ? undefined : koId,
 targetCount: activeKOs.length,
 });

 return NextResponse.json({ jobId, targetCount: activeKOs.length }, { status: 201 });
}

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

 // Auto-fail jobs that have been stuck in pending/processing for more than 10 minutes
 const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
 await db
 .update(aiGenerationJobs)
 .set({
 status: 'failed',
 errorMessage: 'Job stuck or timed out. Background worker process terminated.',
 updatedAt: new Date(),
 })
 .where(
 and(
 inArray(aiGenerationJobs.status, ['pending', 'processing']),
 sql`${aiGenerationJobs.updatedAt} < ${tenMinutesAgo}`
 )
 );

 const { searchParams } = new URL(req.url);
 const courseId = searchParams.get('courseId');
 const status = searchParams.get('status');

 const jobs = await db
 .select()
 .from(aiGenerationJobs)
 .where(
 courseId
 ? eq(aiGenerationJobs.courseId, courseId)
 : status
 ? eq(aiGenerationJobs.status, status as 'pending' | 'processing' | 'completed' | 'failed')
 : undefined,
 )
 .orderBy(desc(aiGenerationJobs.createdAt))
 .limit(50);

 return NextResponse.json(jobs);
}
