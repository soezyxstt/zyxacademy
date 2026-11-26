/**
 * PUT /api/admin/questions/[id] ; Update a canonical-first question.
 * DELETE /api/admin/questions/[id] ; Delete the canonical row and its compatibility projection.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { headers } from "next/headers";
import { questionAuthoringInputSchema } from "@/lib/question-authoring-contract";
import { QuestionAuthoringError, updateCanonicalQuestion } from "@/lib/question-authoring";
import { deleteAdminQuestionTx } from "@/lib/academic/admin-question-delete";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";

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
  try {
    const result = await db.transaction(tx => deleteAdminQuestionTx(tx, { id, actorId: session.user.id }));
    if (result?.legacyId) await dispatchVectorSync(result.legacyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "HISTORICAL_QUESTION_IMMUTABLE") {
      return NextResponse.json({ error: "Soal referensi tidak dapat dihapus dari authoring manual." }, { status: 400 });
    }
    if (code === "DEPENDENCIES_EXIST") {
      return NextResponse.json({ error: "Soal masih digunakan pada kuis, materi, atau referensi terkait." }, { status: 409 });
    }
    return NextResponse.json({ error: "Gagal menghapus soal." }, { status: 500 });
  }
}
