import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { chapters, enrollments } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { summarizeChapterCached } from "@/lib/tutor-rag";

/**
 * Cache-first chapter summary (P3). Profile-free by design; the cache key
 * embeds the material version so edits invalidate naturally.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const chapterId = body?.chapterId as string | undefined;
  if (!chapterId) return NextResponse.json({ error: "chapterId required" }, { status: 400 });

  const [chapter] = await db
    .select({ id: chapters.id, title: chapters.title, courseId: chapters.courseId })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  if (!chapter) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

  // Verify active enrollment in the chapter's course
  if (session.user.role !== "admin") {
    const [enrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, session.user.id),
          eq(enrollments.courseId, chapter.courseId),
          gt(enrollments.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
  }

  try {
    const result = await summarizeChapterCached(session.user.id, chapter.id, chapter.title);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[summarize-chapter] failed:", (err as Error)?.message);
    return NextResponse.json({ error: "Summary generation failed" }, { status: 500 });
  }
}
