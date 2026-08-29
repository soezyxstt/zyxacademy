import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import {
  aiMaterialInstances,
  aiMaterialInstanceSections,
  aiMaterialInstanceChunks,
  masterTeachingDocuments,
  knowledgeObjects,
  websiteMaterials,
  concepts,
  conceptLocalizations,
  assessmentSources,
  assessmentSourceChapters,
  vectorSyncQueue,
} from '@/db/schema';
import { auth } from '@/lib/auth';
import { hasAnyPeran } from '@/lib/auth/authorization';
import { headers } from 'next/headers';
import { parseMaterialIntoSections } from '@/lib/ingestion-parser';
import { extractKnowledgeObjectsForChapter } from '@/lib/ko-extractor';
import { validateCanonicalMarkdown } from '@/lib/canonical-validator';
import { storage } from '@/lib/storage';
import { joinKey, slugifySegment, userFileLeaf } from '@/lib/storage/keys';
import { parseFrontmatter } from '@/lib/assessment-extractor';

const BodySchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1).max(255),
  sourceType: z.enum(['markdown', 'json', 'pdf_extraction']),
  rawText: z.string().min(1),
  summary: z.string().min(1),
  learningObjectives: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  chapterIds: z.array(z.string()).default([]),
  type: z.enum(['learning', 'assessment']).default('learning'),
  pdfKey: z.string().optional(), // R2 key of the uploaded source PDF
}).refine(
  (data) => data.type !== 'learning' || data.chapterIds.length === 1,
  {
    message: 'Learning materials must be linked to exactly one chapter.',
    path: ['chapterIds'],
  }
);

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { courseId, title, sourceType, rawText, summary, learningObjectives, keywords, chapterIds, type, pdfKey } =
    parsed.data;

  // Run Pre-Ingestion Canonical Validation
  const validation = validateCanonicalMarkdown(rawText);
  if (!validation.success) {
    return NextResponse.json({
      error: "Canonical Validation Failed",
      details: validation.errors
    }, { status: 400 });
  }

  // Upload pasted/uploaded canonical markdown to R2
  const markdownBuffer = Buffer.from(rawText, 'utf-8');
  const filename = `${slugifySegment(title) || 'canonical'}.md`;
  const storageKey = joinKey("courses", slugifySegment(courseId), "canonical", userFileLeaf(filename));

  const { key: canonicalMarkdownKey } = await storage.upload(
    markdownBuffer,
    filename,
    'text/markdown',
    {
      key: storageKey,
      metadata: {
        uploadedBy: session.user.id,
        title: title,
      },
    }
  );

  const mtdId = randomUUID();

  if (type === 'assessment') {
    const { frontmatter } = parseFrontmatter(rawText);
    const category = frontmatter.category ?? "uts";
    const year = frontmatter.year ?? new Date().getFullYear();
    const semester = frontmatter.semester ?? null;

    const { createHash } = await import("crypto");
    const sourceHash = createHash("sha256").update(rawText).digest("hex");

    const sourceId = randomUUID();

    // Save domain: Assessment Source (Layer 1)
    await db.insert(assessmentSources).values({
      id: sourceId,
      courseId,
      title,
      origin: "uploaded",
      category,
      year,
      semester,
      sourceMarkdown: rawText,
      sourceHash,
      version: 1,
      parserVersion: "1.0.0",
      ingestionStatus: "pending",
      uploadthingKey: pdfKey ?? null,
      originalFilename: pdfKey ? pdfKey.split("/").pop() : null,
      uploadedByUserId: session.user.id,
    });

    // Send ingestion event to Inngest
    const { inngest } = await import('@/lib/inngest');
    await inngest.send({
      name: "assessment.ingest",
      data: { sourceId },
    });

    return NextResponse.json(
      {
        sourceId,
        type: 'assessment',
        message: "Dokumen Assessment Canonical berhasil diunggah. Klasifikasi Objek Assessment berjalan di latar belakang."
      },
      { status: 201 }
    );
  }

  // We do NOT delete chapters, master teaching documents, or material instances for the course.
  // This supports multiple chapters and multiple materials per course.

  const instanceId = randomUUID();
  const chapterId = chapterIds[0] || randomUUID();

  // Parse text into sections → chunks
  const sections = parseMaterialIntoSections(rawText);

  // Save legacy material instance (defaults pineconeSyncStatus to 'pending')
  await db.insert(aiMaterialInstances).values({
    id: instanceId,
    courseId,
    title,
    sourceType,
    summary,
    learningObjectives: learningObjectives as unknown as Record<string, unknown>,
    keywords: keywords as unknown as Record<string, unknown>,
    chapterIds,
    pineconeSyncStatus: 'pending',
    lastSyncError: null,
  });

  // Save new domain: Master Teaching Document (Learning)
  await db.insert(masterTeachingDocuments).values({
    id: mtdId,
    courseId,
    title,
    markdownContent: rawText,
    originalPdfKey: pdfKey ?? null,
    canonicalMarkdownKey: canonicalMarkdownKey,
    version: 1,
    status: 'active',
    type: 'learning',
    createdById: session.user.id,
  });

  // Create website materials for each selected chapter
  for (const cid of chapterIds) {
    const slug = `${title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')}-${cid.slice(0, 4)}`;

    await db.insert(websiteMaterials).values({
      id: randomUUID(),
      courseId,
      chapterId: cid,
      sourceMtdId: mtdId,
      sourceMtdVersion: 1,
      isStale: false,
      generationHash: 'initial-hash',
      title: title,
      slug,
      canonicalMarkdown: rawText,
      structuredContent: [{ type: 'p', content: rawText }],
      status: 'draft',
    });
  }

  // 2. Trigger KO extraction via Gemini once for the entire chapter content (non-parallelized to prevent race condition deletes)
  try {
    await extractKnowledgeObjectsForChapter(
      courseId,
      mtdId,
      chapterId,
      title,
      rawText
    );
  } catch (err) {
    console.error(`Failed to extract KOs for chapter ${title}:`, err);
    // Fallback: Register the concept and insert a single dummy concept_overview KO
    try {
      const fallbackConceptId = randomUUID();
      const fallbackSlug = title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");

      await db.transaction(async (tx) => {
        // Register concept
        await tx.insert(concepts).values({
          id: fallbackConceptId,
          canonicalSlug: `${fallbackSlug}-${fallbackConceptId.slice(0, 8)}`,
          isVerified: false,
        });

        // Register localization
        await tx.insert(conceptLocalizations).values({
          id: randomUUID(),
          conceptId: fallbackConceptId,
          lang: "id",
          displayName: title,
          aliases: [],
          technicalStandardTerm: "id",
          embedding: null,
        });

        // Insert fallback KO
        await tx.insert(knowledgeObjects).values({
          id: randomUUID(),
          courseId,
          mtdId,
          chapterId,
          conceptId: fallbackConceptId,
          learningOrder: 1,
          title: `Konsep Utama: ${title}`,
          conceptName: title,
          content: rawText.slice(0, 1000) || `Ringkasan materi untuk ${title}`,
          type: 'concept_overview',
          difficulty: 'medium',
          bloomLevel: 'understand',
          tags: keywords && keywords.length > 0 ? keywords : ["fallback"],
          importance: 'high',
          status: 'active',
        });
      });
    } catch (fallbackErr) {
      console.error(`Double fault: Fallback insertion also failed for chapter ${title}:`, fallbackErr);
    }
  }

  for (const section of sections) {
    const sectionId = randomUUID();

    // 1. Insert Legacy Section
    await db.insert(aiMaterialInstanceSections).values({
      id: sectionId,
      materialInstanceId: instanceId,
      title: section.title,
      orderIndex: section.orderIndex,
    });

    for (const chunk of section.chunks) {
      const chunkId = randomUUID();
      const vectorId = `chunk_${chunkId}`;

      await db.insert(aiMaterialInstanceChunks).values({
        id: chunkId,
        sectionId,
        chunkText: chunk.chunkText,
        orderIndex: chunk.orderIndex,
        pineconeVectorId: vectorId,
        isSynced: false,
      });

      await db.insert(vectorSyncQueue).values({
        id: `source-chunk-${chunkId}`,
        courseId,
        koId: null,
        action: 'upsert',
        namespace: 'source_materials',
        payload: {
          id: chunkId,
          title: section.title ?? title,
          text: chunk.chunkText,
          metadata: {
            entityId: chunkId,
            chapterId,
            status: 'active',
            accessClass: 'enrolled',
            language: 'id',
          },
        },
        status: 'pending',
        attempts: 0,
      }).onConflictDoNothing();
    }
  }

  return NextResponse.json(
    {
      instanceId,
      sectionsCreated: sections.length,
      chunksCreated: sections.reduce((acc, s) => acc + s.chunks.length, 0),
    },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing ID parameter' }, { status: 400 });
  }

  // First, check if the ID is an assessmentSource
  const [assessmentSource] = await db
    .select()
    .from(assessmentSources)
    .where(eq(assessmentSources.id, id));

  if (assessmentSource) {
    const courseId = assessmentSource.courseId;
    const { assessmentObjects } = await import('@/db/schema');
    await db.delete(assessmentObjects).where(eq(assessmentObjects.sourceId, id));
    await db.delete(assessmentSourceChapters).where(eq(assessmentSourceChapters.assessmentSourceId, id));
    await db.delete(assessmentSources).where(eq(assessmentSources.id, id));
    
    const { updateAssessmentProfile } = await import('@/lib/assessment-extractor');
    await updateAssessmentProfile(courseId);

    return NextResponse.json({ success: true });
  }

  // Second, check if the ID is a websiteMaterial
  const [webMaterial] = await db
    .select()
    .from(websiteMaterials)
    .where(eq(websiteMaterials.id, id));

  if (webMaterial) {
    await db.delete(websiteMaterials).where(eq(websiteMaterials.id, id));
    return NextResponse.json({ success: true });
  }

  const instance = await db.query.aiMaterialInstances.findFirst({
    where: (t, { eq }) => eq(t.id, id),
    with: {
      sections: {
        with: {
          chunks: true,
        },
      },
    },
  });

  if (!instance) {
    return NextResponse.json({ error: 'Material instance not found' }, { status: 404 });
  }

  for (const section of instance.sections) {
    for (const chunk of section.chunks) {
      await db.insert(vectorSyncQueue).values({
        id: `delete-source-chunk-${chunk.id}`,
        courseId: instance.courseId,
        koId: null,
        action: 'delete',
        namespace: 'source_materials',
        payload: { entityId: chunk.id },
        status: 'pending',
        attempts: 0,
      }).onConflictDoNothing();
    }
  }

  await db.delete(aiMaterialInstances).where(eq(aiMaterialInstances.id, id));

  return NextResponse.json({ success: true });
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

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('courseId');

  const instances = await db.query.aiMaterialInstances.findMany({
    where: courseId
      ? (t, { eq }) => eq(t.courseId, courseId)
      : undefined,
    with: { sections: { with: { chunks: true } } },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return NextResponse.json(instances);
}
