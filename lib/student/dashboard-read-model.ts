import { db } from "@/db";
import {
  quizTemplates,
  exams,
  aiMaterialInstances,
  websiteMaterials,
  artikel,
} from "@/db/schema";
import { eq, and, notLike, sql } from "drizzle-orm";
import type { StudentCourseRecord } from "@/lib/student/course-catalog";

export interface CatalogCourseSummary {
  id: string;
  title: string;
  category: string;
  description: string;
  materialsCount: number;
  quizzesCount: number;
  tryoutsCount: number;
}

/**
 * Aggregates article, quiz, and tryout counts in batch SQL GROUP BY queries.
 * Dashboard "bahan belajar" intentionally counts article-like learning content only.
 */
export async function getCatalogCourseSummaries(
  activeCourses: StudentCourseRecord[]
): Promise<CatalogCourseSummary[]> {
  if (activeCourses.length === 0) return [];

  const [
    quizCounts,
    tryoutCounts,
    aiMatCounts,
    webMatCounts,
    artikelCounts,
  ] = await Promise.all([
    db
      .select({
        courseId: quizTemplates.courseId,
        count: sql<number>`count(*)`,
      })
      .from(quizTemplates)
      .groupBy(quizTemplates.courseId),
    db
      .select({
        courseId: exams.courseId,
        count: sql<number>`count(*)`,
      })
      .from(exams)
      .where(and(eq(exams.type, "tryout"), eq(exams.status, "published")))
      .groupBy(exams.courseId),
    db
      .select({
        courseId: aiMaterialInstances.courseId,
        count: sql<number>`count(*)`,
      })
      .from(aiMaterialInstances)
      .where(notLike(aiMaterialInstances.title, "[DRAF]%"))
      .groupBy(aiMaterialInstances.courseId),
    db
      .select({
        courseId: websiteMaterials.courseId,
        count: sql<number>`count(*)`,
      })
      .from(websiteMaterials)
      .where(eq(websiteMaterials.status, "published"))
      .groupBy(websiteMaterials.courseId),
    db
      .select({
        courseId: artikel.mataKuliahId,
        count: sql<number>`count(*)`,
      })
      .from(artikel)
      .where(eq(artikel.status, "published"))
      .groupBy(artikel.mataKuliahId),
  ]);

  const quizMap = new Map(quizCounts.map((r) => [r.courseId, Number(r.count)]));
  const tryoutMap = new Map(tryoutCounts.map((r) => [r.courseId, Number(r.count)]));
  const aiMatMap = new Map(aiMatCounts.map((r) => [r.courseId, Number(r.count)]));
  const webMatMap = new Map(webMatCounts.map((r) => [r.courseId, Number(r.count)]));
  const artikelMap = new Map(artikelCounts.map((r) => [r.courseId, Number(r.count)]));

  return activeCourses.map((c) => {
    const legacyId = c.legacyId ?? c.id;
    const canonicalId = c.canonicalId;

    const quizzes = (quizMap.get(legacyId) ?? 0) + (canonicalId ? (quizMap.get(canonicalId) ?? 0) : 0);
    const tryouts = (tryoutMap.get(legacyId) ?? 0) + (canonicalId ? (tryoutMap.get(canonicalId) ?? 0) : 0);

    const materials =
      (aiMatMap.get(legacyId) ?? 0) +
      (webMatMap.get(legacyId) ?? 0) +
      (canonicalId ? (artikelMap.get(canonicalId) ?? 0) : 0);

    return {
      id: c.id,
      title: c.title,
      category: c.category,
      description: c.description || "",
      materialsCount: materials,
      quizzesCount: quizzes,
      tryoutsCount: tryouts,
    };
  });
}
