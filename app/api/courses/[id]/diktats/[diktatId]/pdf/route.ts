import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bab, diktatMateri, diktats } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCourse } from "@/lib/course-utils";
import { canAccessCourseContent, resolveCourseAccess } from "@/lib/student/course-access";
import { storage } from "@/lib/storage";
import { slugifySegment } from "@/lib/storage/keys";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; diktatId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: courseId, diktatId } = await context.params;
  const course = await getCourse(courseId);
  if (!course) return NextResponse.json({ error: "COURSE_NOT_FOUND" }, { status: 404 });
  const compatibilityCourseId = course?.legacyId ?? courseId;

  // 1. Try finding published canonical diktat in diktatMateri
  const [row] = course.canonicalId
    ? await db
        .select({
          fileKey: diktatMateri.fileKey,
          title: diktatMateri.title,
          chapterId: diktatMateri.babId,
          legacyChapterId: bab.legacyChapterId,
        })
        .from(diktatMateri)
        .leftJoin(bab, eq(diktatMateri.babId, bab.id))
        .where(and(
          eq(diktatMateri.id, diktatId),
          eq(diktatMateri.mataKuliahId, course.canonicalId),
          eq(diktatMateri.status, "published"),
        ))
        .limit(1)
    : [];

  let targetFileKey: string | null = null;
  let targetTitle: string = "diktat";
  let targetChapterIds: string[] = [];

  if (row) {
    targetFileKey = row.fileKey;
    targetTitle = row.title;
    targetChapterIds = [row.chapterId, row.legacyChapterId].filter(
      (chapterId): chapterId is string => Boolean(chapterId),
    );
  } else {
    // 2. Fallback to compiled legacy diktat in diktats table
    const [legacyRow] = await db
      .select({
        fileUrl: diktats.fileUrl,
        title: diktats.title,
        courseId: diktats.courseId,
        chapterIds: diktats.chapterIds,
      })
      .from(diktats)
      .where(and(
        eq(diktats.id, diktatId),
        eq(diktats.status, "ready"),
        eq(diktats.courseId, compatibilityCourseId),
      ))
      .limit(1);

    if (legacyRow) {
      targetFileKey = legacyRow.fileUrl;
      targetTitle = legacyRow.title;
      targetChapterIds = Array.isArray(legacyRow.chapterIds) ? legacyRow.chapterIds : [];
    }
  }

  if (!targetFileKey) {
    return NextResponse.json({ error: "DIKTAT_PDF_NOT_FOUND" }, { status: 404 });
  }

  const access = await resolveCourseAccess({
    courseId,
    userId: session.user.id,
    roleHint: (session.user as { role?: string | null }).role,
  });
  if (!canAccessCourseContent(access, "diktat", targetChapterIds)) {
    return NextResponse.json({ error: "Diktat ini tersedia setelah aktivasi kelas." }, { status: 403 });
  }
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  if (wantsDownload && !access.capabilities.canDownloadDiktat) {
    return NextResponse.json({ error: "Unduhan diktat tersedia setelah aktivasi kelas." }, { status: 403 });
  }
  if (typeof storage.download !== "function") {
    return NextResponse.json({ error: "DIKTAT_PDF_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const bytes = await storage.download(targetFileKey);
    const disposition = wantsDownload ? "attachment" : "inline";
    const filename = `${slugifySegment(targetTitle) || "diktat"}.pdf`;
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[Course Diktat PDF GET] Download failed:", err);
    return NextResponse.json({ error: "DIKTAT_PDF_UNAVAILABLE" }, { status: 503 });
  }
}
