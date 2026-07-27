/**
 * POST /api/quiz/templates ; Create a new quiz template (tutor/admin only)
 * GET /api/quiz/templates ; List templates for a course
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '@/db';
import { quizTemplates } from '@/db/schema';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { and, eq, desc } from 'drizzle-orm';

const CreateTemplateSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1).max(255),
  category: z.enum(['daily', 'weekly', 'chapter', 'premium', 'simulation']),
  visibility: z.enum(['free', 'paid']).default('free'),
  timeLimitSeconds: z.number().int().min(60).optional(),
  maxAttempts: z.number().int().min(1).optional(),
  openAt: z.string().optional().nullable(),
  closeAt: z.string().optional().nullable(),
  manualStatus: z.enum(['open', 'closed', 'scheduled']).default('scheduled'),
  selectionRules: z.object({
    tags: z.array(z.string()).optional(),
    count: z.number().int().min(1),
    fixedQuestionIds: z.array(z.string()).optional(),
    difficulty_proportions: z
      .object({
        easy: z.number().int().min(0),
        medium: z.number().int().min(0),
        hard: z.number().int().min(0),
      })
      .optional(),
  }),
});

export async function POST(req: NextRequest) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'teacher')) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const body = await req.json();
 const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

 const id = randomUUID();
  const {
    courseId,
    title,
    category,
    visibility,
    timeLimitSeconds,
    maxAttempts,
    selectionRules,
    openAt,
    closeAt,
    manualStatus,
  } = parsed.data;

  // Uniqueness check for tags per course
  const tags = (selectionRules.tags as string[] | undefined) || [];
  if (tags.length > 0) {
    const existingTemplates = await db
      .select()
      .from(quizTemplates)
      .where(eq(quizTemplates.courseId, courseId));

    const hasDuplicateTags = existingTemplates.some((t) => {
      const tRules = t.selectionRules as Record<string, any>;
      const tTags = tRules?.tags as string[] | undefined;
      if (!tTags) return false;
      return tags.some((tag) => tTags.includes(tag));
    });

    if (hasDuplicateTags) {
      return NextResponse.json(
        { error: 'Template kuis dengan tag bab ini sudah ada di kelas ini.' },
        { status: 409 },
      );
    }
  }

  await db.insert(quizTemplates).values({
    id,
    courseId,
    title,
    category,
    visibility,
    timeLimitSeconds: timeLimitSeconds ?? null,
    maxAttempts: maxAttempts ?? null,
    selectionRules: selectionRules as unknown as Record<string, unknown>,
    openAt: openAt ? new Date(openAt) : null,
    closeAt: closeAt ? new Date(closeAt) : null,
    manualStatus,
    status: "draft",
  });

 return NextResponse.json({ templateId: id }, { status: 201 });
}

export async function GET(req: NextRequest) {
 const session = await auth.api.getSession({ headers: await headers() });
 if (!session?.user) {
 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 }

 const { searchParams } = new URL(req.url);
 const courseId = searchParams.get('courseId');
 const category = searchParams.get('category');

 const conditions = [];
 if (courseId) conditions.push(eq(quizTemplates.courseId, courseId));
  if (category)
    conditions.push(
      eq(quizTemplates.category, category as 'daily' | 'weekly' | 'chapter' | 'premium' | 'simulation'),
    );

 // Students see only free templates; tutors/admins see all
 const isStudent = session.user.role === 'student';
 if (isStudent) conditions.push(eq(quizTemplates.visibility, 'free'));

 const templates = await db
 .select()
 .from(quizTemplates)
 .where(conditions.length > 0 ? and(...conditions) : undefined)
 .orderBy(desc(quizTemplates.createdAt));

 return NextResponse.json(templates);
}
