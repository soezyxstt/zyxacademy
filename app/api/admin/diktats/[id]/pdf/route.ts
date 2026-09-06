import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { diktatMateri, mataKuliah } from "@/db/schema";
import { auth } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { joinKey, slugifySegment } from "@/lib/storage/keys";
import { compileCanonicalDiktatHtml, renderProductDiktatPdf } from "@/lib/bundle/product-diktat-pdf";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const [row] = await db
    .select({
      id: diktatMateri.id,
      title: diktatMateri.title,
      fileKey: diktatMateri.fileKey,
    })
    .from(diktatMateri)
    .where(eq(diktatMateri.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "DIKTAT_NOT_FOUND" }, { status: 404 });
  }

  if (!row.fileKey || typeof storage.download !== "function") {
    return NextResponse.json({ error: "DIKTAT_PDF_NOT_READY" }, { status: 404 });
  }

  try {
    const bytes = await storage.download(row.fileKey);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const filename = `${slugifySegment(row.title)}.pdf`;

    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[Admin Diktat PDF GET] Download failed:", err);
    return NextResponse.json({ error: "DIKTAT_PDF_DOWNLOAD_FAILED" }, { status: 502 });
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const [row] = await db
    .select({
      id: diktatMateri.id,
      title: diktatMateri.title,
      contentMarkdown: diktatMateri.contentMarkdown,
      mataKuliahId: diktatMateri.mataKuliahId,
      courseCode: mataKuliah.code,
    })
    .from(diktatMateri)
    .leftJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
    .where(eq(diktatMateri.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "DIKTAT_NOT_FOUND" }, { status: 404 });
  }

  try {
    // 1. Compile self-contained HTML with math pre-rendered
    const html = compileCanonicalDiktatHtml(row.title, row.contentMarkdown);

    // 2. Render via Cloudflare Browser Run Quick Action Worker
    const pdfBytes = await renderProductDiktatPdf(html);

    // 3. Upload to Cloudflare R2
    const courseFolder = slugifySegment(row.courseCode || row.mataKuliahId || "course");
    const filename = `${slugifySegment(row.title)}.pdf`;
    const objectKey = joinKey("courses", courseFolder, "materials", `${slugifySegment(row.id)}-${Date.now()}.pdf`);

    await storage.upload(pdfBytes, filename, "application/pdf", {
      key: objectKey,
      metadata: {
        diktatId: row.id,
        renderedBy: session.user.id,
        renderedAt: new Date().toISOString(),
      },
    });

    // 4. Update fileKey in database
    await db
      .update(diktatMateri)
      .set({
        fileKey: objectKey,
        updatedAt: new Date(),
      })
      .where(eq(diktatMateri.id, id));

    return NextResponse.json({
      ok: true,
      fileKey: objectKey,
      pdfUrl: `/api/admin/diktats/${encodeURIComponent(id)}/pdf`,
    });
  } catch (err) {
    console.error("[Admin Diktat PDF POST] Render failed:", err);
    const message = err instanceof Error ? err.message : "RENDER_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
