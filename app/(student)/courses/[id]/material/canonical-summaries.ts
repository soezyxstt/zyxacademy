import { db } from "@/db";
import { artikel, bab, bagianArtikel, kemajuanBacaArtikel } from "@/db/schema";
import { findCanonicalMataKuliah } from "@/lib/course-utils";
import { and, eq, inArray } from "drizzle-orm";

// The catalogue needs identifiers and reading estimates, not article bodies or blocks.
export async function getMaterialArticleSummaries(courseId: string, userId: string) {
  try {
    const normalizedCourseId = courseId.trim();
    if (!normalizedCourseId) return [];
    const matchedCourse = await findCanonicalMataKuliah(normalizedCourseId);
    const validCourseIds = matchedCourse
      ? [matchedCourse.id, ...(matchedCourse.legacyCourseId ? [matchedCourse.legacyCourseId] : [])]
      : [normalizedCourseId];
    const articles = await db.select({
      id: artikel.id,
      title: artikel.title,
      babId: artikel.babId,
      version: artikel.version,
    }).from(artikel).where(and(
      inArray(artikel.mataKuliahId, validCourseIds),
      eq(artikel.status, "published"),
    ));
    if (articles.length === 0) return [];

    const articleIds = articles.map((article) => article.id);
    const babIds = articles.map((article) => article.babId).filter((id): id is string => Boolean(id));
    const normalizedUserId = userId.trim();
    const [chapters, sections, readingProgress] = await Promise.all([
      babIds.length > 0
        ? db.select({ id: bab.id, legacyChapterId: bab.legacyChapterId }).from(bab).where(inArray(bab.id, babIds))
        : Promise.resolve([]),
      db.select({
        artikelId: bagianArtikel.artikelId,
        version: bagianArtikel.version,
        estimatedReadingMinutes: bagianArtikel.estimatedReadingMinutes,
      }).from(bagianArtikel).where(and(
        inArray(bagianArtikel.artikelId, articleIds),
        eq(bagianArtikel.status, "published"),
      )),
      normalizedUserId
        ? db.select({
            artikelId: kemajuanBacaArtikel.artikelId,
            artikelVersion: kemajuanBacaArtikel.artikelVersion,
            maxReadPercent: kemajuanBacaArtikel.maxReadPercent,
            completedAt: kemajuanBacaArtikel.completedAt,
          }).from(kemajuanBacaArtikel).where(and(
            eq(kemajuanBacaArtikel.penggunaId, normalizedUserId),
            inArray(kemajuanBacaArtikel.artikelId, articleIds),
          ))
        : Promise.resolve([]),
    ]);

    const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter.legacyChapterId]));
    const sectionsByArticle = new Map<string, typeof sections>();
    for (const section of sections) {
      const entries = sectionsByArticle.get(section.artikelId) ?? [];
      entries.push(section);
      sectionsByArticle.set(section.artikelId, entries);
    }
    const progressByArticle = new Map<string, typeof readingProgress>();
    for (const entry of readingProgress) {
      const entries = progressByArticle.get(entry.artikelId) ?? [];
      entries.push(entry);
      progressByArticle.set(entry.artikelId, entries);
    }
    return articles.map((article) => {
      const articleSections = (sectionsByArticle.get(article.id) ?? []).filter((section) => section.version === article.version);
      const articleProgress = (progressByArticle.get(article.id) ?? []).filter((entry) => entry.artikelVersion === article.version);
      const completionPercent = articleSections.length > 0
        ? Math.min(100, Math.round(articleProgress.reduce((total, entry) => total + entry.maxReadPercent, 0) / articleSections.length))
        : 0;
      const completedSections = articleProgress.filter((entry) => entry.maxReadPercent >= 90 || entry.completedAt).length;
      const legacyChapterId = article.babId ? chapterMap.get(article.babId) ?? null : null;
      return {
        id: article.id,
        title: article.title,
        babId: article.babId,
        chapterId: legacyChapterId ?? article.babId ?? null,
        legacyChapterId,
        totalEstimatedReadingMinutes: Math.max(1, articleSections.reduce((total, section) => total + (section.estimatedReadingMinutes || 3), 0)),
        completed: articleProgress.length > 0 && articleSections.length > 0 && (completedSections >= articleSections.length || completionPercent >= 90),
      };
    });
  } catch (error) {
    console.error("Error getting canonical published articles for course:", error);
    return [];
  }
}
