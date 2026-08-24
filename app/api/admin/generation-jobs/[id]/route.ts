/**
 * GET /api/admin/generation-jobs/[id]
 * Returns a single generation job with its logs and error details.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { aiGenerationJobs } from '@/db/schema';
import { auth } from '@/lib/auth';
import { hasAnyPeran } from '@/lib/auth/authorization';
import { headers } from 'next/headers';
import { eq, and, inArray, sql } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthorized =
    session?.user &&
    ((await hasAnyPeran(session.user.id, ['admin', 'tutor'], { allowAdmin: true })) ||
      session.user.role === 'admin' ||
      session.user.role === 'teacher');
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Auto-fail this job if it has been stuck in pending/processing for more than 10 minutes
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
        eq(aiGenerationJobs.id, id),
        inArray(aiGenerationJobs.status, ['pending', 'processing']),
        sql`${aiGenerationJobs.updatedAt} < ${tenMinutesAgo}`
      )
    );

  const [job] = await db
    .select()
    .from(aiGenerationJobs)
    .where(eq(aiGenerationJobs.id, id))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(job);
}
