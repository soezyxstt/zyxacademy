import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { aiMaterialInstances, vectorSyncQueue } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const instance = await db.query.aiMaterialInstances.findFirst({
    where: (table, { eq: equals }) => equals(table.id, id),
    with: { sections: { with: { chunks: true } } },
  });

  if (!instance) {
    return NextResponse.json({ error: 'Material instance not found' }, { status: 404 });
  }

  const unsyncedChunks = instance.sections.flatMap((section) =>
    section.chunks
      .filter((chunk) => !chunk.isSynced)
      .map((chunk) => ({
        chunk,
        sectionTitle: section.title,
      })),
  );

  if (unsyncedChunks.length === 0) {
    await db
      .update(aiMaterialInstances)
      .set({ pineconeSyncStatus: 'synced', lastSyncError: null })
      .where(eq(aiMaterialInstances.id, id));
    return NextResponse.json({ success: true, message: 'All chunks are already queued.' });
  }

  await db
    .update(aiMaterialInstances)
    .set({ pineconeSyncStatus: 'pending', lastSyncError: null })
    .where(eq(aiMaterialInstances.id, id));

  for (const { chunk, sectionTitle } of unsyncedChunks) {
    await db.insert(vectorSyncQueue).values({
      id: `retry-source-chunk-${chunk.id}`,
      courseId: instance.courseId,
      koId: null,
      action: 'upsert',
      namespace: 'source_materials',
      payload: {
        id: chunk.id,
        title: sectionTitle ?? instance.title,
        text: chunk.chunkText,
        metadata: {
          entityId: chunk.id,
          chapterId: instance.chapterIds?.[0] ?? '',
          status: 'active',
          accessClass: 'enrolled',
          language: 'id',
        },
      },
      status: 'pending',
      attempts: 0,
    }).onConflictDoNothing();
  }

  return NextResponse.json({
    success: true,
    message: `Queued ${unsyncedChunks.length} chunks for canonical indexing.`,
  });
}
