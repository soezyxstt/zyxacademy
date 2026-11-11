import { db } from "@/db";
import { aiMaterialInstances, artikel, bab, bagianArtikel, courseMaterials, diktatMateri, diktats, websiteMaterials } from "@/db/schema";
import { findCanonicalMataKuliah } from "@/lib/course-utils";
import { getMaterial } from "@/lib/student-course-fixtures";
import { and, eq, inArray, notLike, or } from "drizzle-orm";

function sanitizeCanonicalTitle(rawTitle: string) {
  const trimmed = rawTitle.replace(/^\[DRAF\]\s*/i, "").trim();
  if (/^Staging Product Diktat/i.test(trimmed)) return "Diktat: Sistem Bilangan Real dan Pertaksamaan";
  if (/^Staging Product Article/i.test(trimmed)) return "Catatan Kuliah: Sifat Medan dan Bilangan Real";
  if (/^Staging Product/i.test(trimmed)) return trimmed.replace(/^Staging Product\s*/i, "Materi: ");
  return trimmed;
}

// Resolve the same source precedence as the reader without loading content,
// figures, or user progress solely to construct the page title.
export async function getMaterialMetadataTitle(courseId: string, materialId: string, compatibilityCourseId: string) {
  let decodedMaterialId: string | null = null;
  try {
    decodedMaterialId = decodeURIComponent(materialId.trim());
  } catch {
    // Legacy lookups still use the original ID when URL decoding fails.
  }

  const matchedCourse = await findCanonicalMataKuliah(courseId);
  const validCourseIds = matchedCourse
    ? [matchedCourse.id, ...(matchedCourse.legacyCourseId ? [matchedCourse.legacyCourseId] : [])]
    : [courseId.trim()];

  const structuredTitlePromise = (async () => {
    if (!decodedMaterialId) return null;
    try {
      const [article] = await db.select({
        id: artikel.id,
        title: artikel.title,
        babId: artikel.babId,
        structureStatus: artikel.structureStatus,
        version: artikel.version,
      }).from(artikel).where(and(
        inArray(artikel.mataKuliahId, validCourseIds),
        eq(artikel.status, "published"),
        or(eq(artikel.id, decodedMaterialId), eq(artikel.slug, decodedMaterialId)),
      )).limit(1);
      if (!article || article.structureStatus !== "structured") return null;
      const [sections, chapters] = await Promise.all([
        db.select({ id: bagianArtikel.id }).from(bagianArtikel).where(and(
          eq(bagianArtikel.artikelId, article.id),
          eq(bagianArtikel.version, article.version),
          eq(bagianArtikel.status, "published"),
        )).limit(1),
        article.babId
          ? db.select({ title: bab.title }).from(bab).where(eq(bab.id, article.babId)).limit(1)
          : Promise.resolve([]),
      ]);
      return sections[0] ? chapters[0]?.title?.trim() || article.title : null;
    } catch (error) {
      console.error("Error fetching canonical article metadata:", error);
      return null;
    }
  })();

  const structuredTitle = await structuredTitlePromise;
  if (structuredTitle !== null) return structuredTitle;
  const staticMaterial = getMaterial(courseId, materialId);
  if (staticMaterial) return staticMaterial.title;

  const textProductTitlePromise = (async () => {
    const productId = decodedMaterialId?.trim();
    if (!matchedCourse || !productId) return null;
    try {
      const [articleResult, diktatResult] = await Promise.allSettled([
        db.select({ title: artikel.title, structureStatus: artikel.structureStatus }).from(artikel)
          .leftJoin(bab, eq(artikel.babId, bab.id)).where(and(
          eq(artikel.mataKuliahId, matchedCourse.id),
          eq(artikel.status, "published"),
          or(eq(artikel.id, productId), eq(artikel.slug, productId)),
        )).limit(1),
        db.select({ title: diktatMateri.title }).from(diktatMateri).where(and(
          eq(diktatMateri.mataKuliahId, matchedCourse.id),
          eq(diktatMateri.status, "published"),
          eq(diktatMateri.id, productId),
        )).limit(1),
      ]);
      if (articleResult.status === "rejected") throw articleResult.reason;
      const article = articleResult.value[0];
      if (article && article.structureStatus !== "structured") return sanitizeCanonicalTitle(article.title);
      if (diktatResult.status === "rejected") throw diktatResult.reason;
      return diktatResult.value[0] ? sanitizeCanonicalTitle(diktatResult.value[0].title) : null;
    } catch (error) {
      console.error("Error fetching canonical text product metadata:", error);
      return null;
    }
  })();

  // The legacy sources are independent. Results are consumed in reader order.
  const legacyTitlesPromise = Promise.allSettled([
    db.select({ title: diktats.title }).from(diktats).where(and(
      eq(diktats.id, materialId), eq(diktats.courseId, compatibilityCourseId), eq(diktats.status, "ready"),
    )).limit(1),
    db.select({ title: websiteMaterials.title }).from(websiteMaterials).where(and(
      eq(websiteMaterials.id, materialId), eq(websiteMaterials.courseId, compatibilityCourseId), eq(websiteMaterials.status, "published"),
    )).limit(1),
    db.select({ title: courseMaterials.title }).from(courseMaterials).where(and(
      eq(courseMaterials.id, materialId), eq(courseMaterials.courseId, compatibilityCourseId),
    )).limit(1),
    db.select({ title: aiMaterialInstances.title }).from(aiMaterialInstances).where(and(
      eq(aiMaterialInstances.id, materialId), eq(aiMaterialInstances.courseId, compatibilityCourseId), notLike(aiMaterialInstances.title, "[DRAF]%"),
    )).limit(1),
  ]);

  const [textProductTitle, legacyTitles] = await Promise.all([textProductTitlePromise, legacyTitlesPromise]);
  if (textProductTitle !== null) return textProductTitle;
  for (let index = 0; index < legacyTitles.length; index++) {
    const result = legacyTitles[index];
    if (result.status === "fulfilled" && result.value[0]) {
      const title = result.value[0].title;
      return index === 3 ? title.replace(/^\[DRAF\]\s*/, "") : title;
    }
  }
  return null;
}
