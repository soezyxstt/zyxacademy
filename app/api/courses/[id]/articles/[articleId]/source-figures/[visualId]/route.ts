import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { artikel, bab } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCourse } from "@/lib/course-utils";
import { resolveCourseAccess, canAccessCourseContent } from "@/lib/student/course-access";
import { sourceFigureVisualSpecSchema } from "@/lib/materials/visual-contract";
import { resolveSourceFigureForCourse } from "@/lib/authoring/source-figures";
import { figureChecksum } from "@/lib/compute/source-figure";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; articleId: string; visualId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Masuk untuk melihat gambar." }, { status: 401 });
  const { id: courseId, articleId, visualId } = await context.params;
  const course = await getCourse(courseId);
  if (!course?.canonicalId || !course.legacyId) return Response.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
  const [article] = await db.select({ content: artikel.contentMarkdown, chapterId: artikel.babId, legacyChapterId: bab.legacyChapterId })
    .from(artikel).leftJoin(bab, eq(artikel.babId, bab.id)).where(and(eq(artikel.id, articleId), eq(artikel.mataKuliahId, course.canonicalId), eq(artikel.status, "published"))).limit(1);
  if (!article) return Response.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
  const access = await resolveCourseAccess({ courseId, userId: session.user.id });
  if (!canAccessCourseContent(access, "article", [article.chapterId, article.legacyChapterId])) return Response.json({ error: "Aktifkan akses kelas untuk melihat gambar." }, { status: 403 });
  try {
    const encoded = article.content.match(/<!--__ZYX_V3_ARTICLE_VISUALS__:([A-Za-z0-9_-]+)-->/)?.[1];
    const visuals: unknown = encoded ? JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) : [];
    const figure = Array.isArray(visuals) ? visuals.map((visual) => sourceFigureVisualSpecSchema.safeParse(visual)).find((parsed) => parsed.success && parsed.data.id === visualId) : undefined;
    if (!figure?.success) return Response.json({ error: "Gambar tidak ditemukan." }, { status: 404 });
    const manifest = await resolveSourceFigureForCourse({ courseId: course.legacyId, materialId: figure.data.materialId, assetId: figure.data.assetId });
    const preview = manifest.variants.find((variant) => variant.name === "preview");
    if (!manifest.publicationAllowed || manifest.sourceChecksum !== figure.data.sourceChecksum || !preview || !storage.download) return Response.json({ error: "Gambar belum tersedia." }, { status: 503 });
    const bytes = await storage.download(preview.key);
    if (figureChecksum(bytes) !== preview.checksum) return Response.json({ error: "Gambar belum tersedia." }, { status: 503 });
    return new Response(bytes as unknown as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ error: "Gambar belum tersedia." }, { status: 503 });
  }
}
