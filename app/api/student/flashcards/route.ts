import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDueFlashcards } from "@/lib/flashcard-progress.repository";
import { submitFlashcardReviewTx, skipFlashcardTx } from "@/lib/flashcard-actions";

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
    const dueCards = await getDueFlashcards(session.user.id, parsed.data.courseId);
    return NextResponse.json({ dueCards });
  } catch (error: any) {
    console.error("GET /api/student/flashcards error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch due flashcards" }, { status: 500 });
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
    return NextResponse.json({ error: error.message || "Failed to process flashcard action" }, { status: 500 });
  }
}
