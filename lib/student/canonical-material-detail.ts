import { and, eq, notLike, or } from "drizzle-orm";
import { db } from "@/db";
import { aiMaterialInstances, artikel, courseMaterials, diktatMateri, diktats, websiteMaterials } from "@/db/schema";

export async function findCanonicalDetail(courseId: string, materialId: string) {
  const [articles, handbooks] = await Promise.all([
    db.select({ id: artikel.id, title: artikel.title, chapterId: artikel.babId, version: artikel.version, updatedAt: artikel.updatedAt })
      .from(artikel)
      .where(and(eq(artikel.mataKuliahId, courseId), eq(artikel.status, "published"), or(eq(artikel.id, materialId), eq(artikel.slug, materialId))))
      .limit(2),
    db.select({ id: diktatMateri.id, title: diktatMateri.title, chapterId: diktatMateri.babId, fileKey: diktatMateri.fileKey, version: diktatMateri.version, updatedAt: diktatMateri.updatedAt })
      .from(diktatMateri)
      .where(and(eq(diktatMateri.mataKuliahId, courseId), eq(diktatMateri.status, "published"), eq(diktatMateri.id, materialId)))
      .limit(1),
  ]);
  // Reuse canonical article precedence and reject an ambiguous id or slug.
  if (articles.length > 1) return { ambiguous: true } as const;
  if (articles[0]) return { ...articles[0], group: "materi", policyKind: "article" } as const;
  if (handbooks[0]) return { ...handbooks[0], group: "diktat", policyKind: "diktat" } as const;
  return null;
}

/** Mirror the web viewer's source priority for same-ID compatibility records. */
export async function findLegacyMaterialDetail(legacyCourseId: string, materialId: string) {
  const [[diktat], [webArticle], [manual], [generatedArticle]] = await Promise.all([
    db.select({ title: diktats.title, chapterIds: diktats.chapterIds, fileUrl: diktats.fileUrl, revision: diktats.updatedAt }).from(diktats)
      .where(and(eq(diktats.id, materialId), eq(diktats.courseId, legacyCourseId), eq(diktats.status, "ready"))).limit(1),
    db.select({ title: websiteMaterials.title, chapterId: websiteMaterials.chapterId, version: websiteMaterials.contentVersion, updatedAt: websiteMaterials.updatedAt }).from(websiteMaterials)
      .where(and(eq(websiteMaterials.id, materialId), eq(websiteMaterials.courseId, legacyCourseId), eq(websiteMaterials.status, "published"))).limit(1),
    db.select({ title: courseMaterials.title, chapterIds: courseMaterials.chapterIds, fileUrl: courseMaterials.fileUrl, revision: courseMaterials.updatedAt }).from(courseMaterials)
      .where(and(eq(courseMaterials.id, materialId), eq(courseMaterials.courseId, legacyCourseId))).limit(1),
    db.select({ title: aiMaterialInstances.title, chapterIds: aiMaterialInstances.chapterIds, updatedAt: aiMaterialInstances.updatedAt }).from(aiMaterialInstances)
      .where(and(eq(aiMaterialInstances.id, materialId), eq(aiMaterialInstances.courseId, legacyCourseId), notLike(aiMaterialInstances.title, "[DRAF]%"))).limit(1),
  ]);
  if (diktat) return { ...diktat, source: "legacy-diktat", chapterIds: Array.isArray(diktat.chapterIds) ? diktat.chapterIds as string[] : [] } as const;
  if (webArticle) return { ...webArticle, source: "legacy-article", format: "website", chapterIds: [webArticle.chapterId] } as const;
  if (manual) return { ...manual, source: "manual-pdf", chapterIds: Array.isArray(manual.chapterIds) ? manual.chapterIds : [] } as const;
  if (generatedArticle) return { title: generatedArticle.title.replace(/^\[DRAF\]\s*/u, ""), source: "legacy-article", format: "generated", version: 1, updatedAt: generatedArticle.updatedAt,
    chapterIds: Array.isArray(generatedArticle.chapterIds) ? generatedArticle.chapterIds : [] } as const;
  return null;
}
