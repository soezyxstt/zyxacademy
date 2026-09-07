import { headers } from "next/headers";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { diktatMateri, diktats, mataKuliah } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isStudentEnrolled } from "@/lib/student/course-catalog";
import { storage } from "@/lib/storage";
import { canDownloadProductDiktat } from "@/lib/bundle/product-diktat-pdf";
import { slugifySegment } from "@/lib/storage/keys";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; diktatId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: courseId, diktatId } = await context.params;

  // 1. Try finding published canonical diktat in diktatMateri
  const [row] = await db
    .select({
      fileKey: diktatMateri.fileKey,
      title: diktatMateri.title,
      courseId: mataKuliah.id,
      legacyCourseId: mataKuliah.legacyCourseId,
    })
    .from(diktatMateri)
    .innerJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
    .where(and(
      eq(diktatMateri.id, diktatId),
      eq(diktatMateri.status, "published"),
      or(
        eq(mataKuliah.id, courseId),
        eq(mataKuliah.legacyCourseId, courseId),
        eq(mataKuliah.code, courseId),
        eq(mataKuliah.code, courseId.toUpperCase()),
      ),
    ))
    .limit(1);

  let targetFileKey: string | null = null;
  let targetTitle: string = "diktat";
  let targetCourseId: string = courseId;

  if (row) {
    targetFileKey = row.fileKey;
    targetTitle = row.title;
    targetCourseId = row.legacyCourseId ?? row.courseId;
  } else {
    // 2. Fallback to compiled legacy diktat in diktats table
    const [legacyRow] = await db
      .select({
        fileUrl: diktats.fileUrl,
        title: diktats.title,
        courseId: diktats.courseId,
      })
      .from(diktats)
      .where(and(
        eq(diktats.id, diktatId),
        eq(diktats.status, "ready"),
      ))
      .limit(1);

    if (legacyRow) {
      targetFileKey = legacyRow.fileUrl;
      targetTitle = legacyRow.title;
      targetCourseId = legacyRow.courseId;
    }
  }

  if (!targetFileKey) {
    return NextResponse.json({ error: "DIKTAT_PDF_NOT_FOUND" }, { status: 404 });
  }

  const enrolled = session.user.role === "student"
    ? await isStudentEnrolled(session.user.id, targetCourseId)
    : false;
  if (!canDownloadProductDiktat({ role: session.user.role, enrolled })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (typeof storage.download !== "function") {
    return NextResponse.json({ error: "DIKTAT_PDF_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const bytes = await storage.download(targetFileKey);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
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
