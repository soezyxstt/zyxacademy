/**
 * PUT /api/admin/questions/[id] ; Update a canonical-first question.
 * DELETE /api/admin/questions/[id] ; Delete the canonical row and its compatibility projection.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { aiQuestionBank, auditMutasi, soal } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { questionAuthoringInputSchema } from "@/lib/question-authoring-contract";
import { QuestionAuthoringError, updateCanonicalQuestion } from "@/lib/question-authoring";

type Context = { params: Promise<{ id: string }> };

function authoringError(error: unknown): NextResponse {
  if (error instanceof QuestionAuthoringError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  console.error("[Question Authoring] Failed to update question:", error);
  return NextResponse.json({ error: "Gagal memperbarui soal canonical." }, { status: 500 });
}

export async function PUT(req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthorized =
    session?.user &&
    ((await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
      session.user.role === "admin" ||
      session.user.role === "teacher");
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = questionAuthoringInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await updateCanonicalQuestion(parsed.data, session.user.id, id);
    return NextResponse.json({
      success: true,
      id: result.id,
      courseId: result.legacyCourseId,
      canonicalCourseId: result.canonicalCourseId,
      chapterId: result.chapterId,
      reviewStatus: result.reviewStatus,
    });
  } catch (error) {
    return authoringError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  const isAuthorized =
    session?.user &&
    ((await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
      session.user.role === "admin" ||
      session.user.role === "teacher");
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await db.transaction(async (tx) => {
    const [canonical] = await tx.select({ id: soal.id, origin: soal.origin, version: soal.version, status: soal.status, courseId: soal.mataKuliahId }).from(soal).where(eq(soal.id, id)).limit(1);
    const [compatibility] = await tx.select({ id: aiQuestionBank.id, origin: aiQuestionBank.origin, reviewStatus: aiQuestionBank.reviewStatus, courseId: aiQuestionBank.courseId }).from(aiQuestionBank).where(eq(aiQuestionBank.id, id)).limit(1);
    if (canonical?.origin === "itb_example" || compatibility?.origin === "itb_example") {
      return { forbidden: true };
    }
    if (canonical || compatibility) {
      await tx.insert(auditMutasi).values({
        id: `audit-question-delete-${id}-${randomUUID()}`,
        actorId: session.user.id,
        entityType: "question",
        entityId: id,
        action: "deleted",
        beforeSnapshot: canonical
          ? { version: canonical.version, status: canonical.status, courseId: canonical.courseId }
          : { reviewStatus: compatibility?.reviewStatus, courseId: compatibility?.courseId },
        afterSnapshot: null,
        correlationId: id,
        createdAt: new Date(),
      });
    }
    await tx.delete(aiQuestionBank).where(eq(aiQuestionBank.id, id));
    await tx.delete(soal).where(eq(soal.id, id));
    return { forbidden: false };
  });

  if (result.forbidden) {
    return NextResponse.json({ error: "Soal contoh ITB tidak dapat dihapus dari authoring manual." }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
