import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getReviewQueue, submitFlashcardReviewTx, skipFlashcardTx } from "@/lib/flashcard-actions";
import { getStudentCourseAccess } from "@/lib/course-utils";

const GetQuerySchema = z.object({
  courseId: z.string().min(1),
});

const PostBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("review"),
    flashcardId: z.string().min(1),
    grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    responseTimeMs: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal("skip"),
    flashcardId: z.string().min(1),
  }),
]);

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  const parsed = GetQuerySchema.safeParse({ courseId });
  if (!parsed.success) {
    return NextResponse.json({ error: "courseId query param is required" }, { status: 400 });
  }

  try {
    const access = await getStudentCourseAccess(session.user.id, parsed.data.courseId);
    if (!access) {
      return NextResponse.json({ error: "Akses flashcard ini belum tersedia." }, { status: 403 });
    }
    const queue = await getReviewQueue(session.user.id, parsed.data.courseId);
    // Keep the authenticated API payload limited to learning content. Set,
    // KO, chapter aliases, and generation metadata are server routing details,
    // not fields a learner needs to render a card.
    const dueCards = queue.map((item) => ({
      id: item.card.id,
      front: item.card.front,
      back: item.card.back,
      explanation: item.card.explanation ?? null,
      progress: item.progress,
    }));
    return NextResponse.json({ dueCards });
  } catch (error: any) {
    console.error("GET /api/student/flashcards error:", error);
    if (error?.message === "FLASHCARD_ACCESS_DENIED" || error?.message === "FLASHCARD_NOT_AVAILABLE") {
      return NextResponse.json({ error: "Akses flashcard ini memerlukan aktivasi kelas." }, { status: 403 });
    }
    return NextResponse.json({ error: "Flashcard tidak dapat dimuat saat ini." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = PostBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const studentId = session.user.id;

    if (parsed.data.action === "review") {
      const { flashcardId, grade, responseTimeMs } = parsed.data;
      const result = await submitFlashcardReviewTx(studentId, flashcardId, grade, responseTimeMs);
      return NextResponse.json(result);
    } else {
      const { flashcardId } = parsed.data;
      const result = await skipFlashcardTx(studentId, flashcardId);
      return NextResponse.json(result);
    }
  } catch (error: any) {
    console.error("POST /api/student/flashcards error:", error);
    if (error?.message === "FLASHCARD_INPUT_INVALID") {
      return NextResponse.json({ error: "Data review flashcard tidak valid." }, { status: 400 });
    }
    if (error?.message === "FLASHCARD_ACCESS_DENIED" || error?.message === "FLASHCARD_NOT_AVAILABLE") {
      return NextResponse.json({ error: "Akses flashcard ini memerlukan aktivasi kelas." }, { status: 403 });
    }
    return NextResponse.json({ error: "Flashcard tidak dapat diproses saat ini." }, { status: 500 });
  }
}
