import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { questionIdeaLinkSchema, questionReviewStatusSchema } from "@/lib/question-authoring-contract";
import { createCanonicalQuestionBatch, QuestionAuthoringError } from "@/lib/question-authoring";
import { parseQuestionsMarkdown, validateExtractedQuestion } from "@/lib/question-markdown";

const RequestSchema = z.object({
  courseId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1).nullable().optional(),
  ideaLinks: z.array(questionIdeaLinkSchema).min(1),
  rawMarkdown: z.string().min(1),
  reviewStatus: questionReviewStatusSchema.default("generated"),
});

function errorResponse(error: unknown): NextResponse {
  if (error instanceof QuestionAuthoringError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  console.error("[Question Markdown Authoring] Database transaction failed:", error);
  return NextResponse.json({ error: "Gagal menyimpan soal canonical." }, { status: 500 });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "teacher")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const parsedQuestions = parseQuestionsMarkdown(parsed.data.rawMarkdown);
  if (parsedQuestions.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada soal yang berhasil diurai. Gunakan heading seperti ## Soal 1 untuk setiap soal." },
      { status: 400 },
    );
  }

  for (const question of parsedQuestions) {
    const validationError = validateExtractedQuestion(question, question.sourceIndex);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const results = await createCanonicalQuestionBatch({
      courseId: parsed.data.courseId,
      chapterId: parsed.data.chapterId,
      ideaLinks: parsed.data.ideaLinks,
      questions: parsedQuestions.map(({ sourceIndex: _sourceIndex, ...question }) => question),
      reviewStatus: parsed.data.reviewStatus,
      creatorId: session.user.id,
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      ids: results.map((result) => result.id),
      message: `${results.length} soal berhasil disimpan ke canonical bank dan projection kompatibilitas.`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
