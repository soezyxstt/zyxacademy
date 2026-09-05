import { headers } from "next/headers";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { diktatMateri, mataKuliah } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isStudentEnrolled } from "@/lib/student/course-catalog";
import { storage } from "@/lib/storage";
import { canDownloadProductDiktat } from "@/lib/bundle/product-diktat-pdf";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; diktatId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: courseId, diktatId } = await context.params;
  const [row] = await db
    .select({ fileKey: diktatMateri.fileKey, title: diktatMateri.title, courseId: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(diktatMateri)
    .innerJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
    .where(and(
      eq(diktatMateri.id, diktatId),
      eq(diktatMateri.status, "published"),
      or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)),
    ))
    .limit(1);
  if (!row?.fileKey) return NextResponse.json({ error: "DIKTAT_PDF_NOT_FOUND" }, { status: 404 });
  const enrolled = session.user.role === "student"
    ? await isStudentEnrolled(session.user.id, row.legacyCourseId ?? row.courseId)
    : false;
  if (!canDownloadProductDiktat({ role: session.user.role, enrolled })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (typeof storage.download !== "function") return NextResponse.json({ error: "DIKTAT_PDF_UNAVAILABLE" }, { status: 503 });
  try {
    const bytes = await storage.download(row.fileKey);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const filename = `${row.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "diktat"}.pdf`;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "DIKTAT_PDF_UNAVAILABLE" }, { status: 503 });
  }
}
