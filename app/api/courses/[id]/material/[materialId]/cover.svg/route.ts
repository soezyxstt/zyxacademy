import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { artikel, bab, diktatMateri, mataKuliah } from "@/db/schema";
import { createMaterialCoverSvg } from "@/lib/material-cover";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";

function displayTitle(rawTitle: string): string {
  const trimmed = rawTitle.replace(/^\[DRAF\]\s*/i, "").trim();
  if (/^Staging Product Diktat/i.test(trimmed)) return "Diktat: Sistem Bilangan Real dan Pertaksamaan";
  if (/^Staging Product Article/i.test(trimmed)) return "Catatan Kuliah: Sifat Medan dan Bilangan Real";
  if (/^Staging Product/i.test(trimmed)) return trimmed.replace(/^Staging Product\s*/i, "Materi: ");
  return trimmed;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; materialId: string }> },
) {
  const { id: courseId, materialId } = await context.params;
  if (!courseId || !materialId) return new Response("Missing parameters", { status: 400 });

  const identity = await resolveCourseIdentity(courseId);
  if (!identity || identity.status !== "active" || !identity.canonicalId) {
    return new Response("Course not found", { status: 404 });
  }

  const [course] = await db
    .select({ id: mataKuliah.id, code: mataKuliah.code, title: mataKuliah.title })
    .from(mataKuliah)
    .where(and(eq(mataKuliah.id, identity.canonicalId), eq(mataKuliah.status, "active")))
    .limit(1);
  if (!course) return new Response("Course not found", { status: 404 });

  const articleRows = await db
    .select({
      id: artikel.id,
      title: artikel.title,
      babId: artikel.babId,
      generationHash: artikel.generationHash,
      version: artikel.version,
    })
    .from(artikel)
    .where(
      and(
        eq(artikel.mataKuliahId, course.id),
        eq(artikel.status, "published"),
        or(eq(artikel.id, materialId), eq(artikel.slug, materialId)),
      ),
    )
    .limit(2);
  if (articleRows.length > 1) return new Response("Material not found", { status: 404 });
  const article = articleRows[0] ?? null;

  const diktatRows = article
    ? [null]
    : await db
        .select({
          id: diktatMateri.id,
          title: diktatMateri.title,
          babId: diktatMateri.babId,
          generationHash: diktatMateri.generationHash,
          version: diktatMateri.version,
        })
        .from(diktatMateri)
        .where(
          and(
            eq(diktatMateri.mataKuliahId, course.id),
            eq(diktatMateri.status, "published"),
            eq(diktatMateri.id, materialId),
          ),
        )
        .limit(2);
  if (diktatRows.length > 1) return new Response("Material not found", { status: 404 });
  const diktat = diktatRows[0] ?? null;

  const product = article ?? diktat;
  if (!product) return new Response("Material not found", { status: 404 });

  const [chapter] = product.babId
    ? await db
        .select({ title: bab.title })
        .from(bab)
        .where(and(
          eq(bab.id, product.babId),
          eq(bab.mataKuliahId, course.id),
          eq(bab.status, "active"),
        ))
        .limit(1)
    : [null];
  if (product.babId && !chapter) return new Response("Material not found", { status: 404 });

  const etag = `\"${product.generationHash}-${product.version}\"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const svg = createMaterialCoverSvg({
    kind: article ? "article" : "diktat",
    title: displayTitle(product.title),
    courseCode: course.code,
    courseTitle: course.title,
    chapterTitle: chapter?.title ?? null,
  });

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ETag: etag,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
