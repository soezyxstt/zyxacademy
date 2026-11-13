import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bab, mataKuliah, solutionCollections } from "@/db/schema";
import { solutionCollectionSchema } from "@/lib/materials/solution-collection";
import { canAccessCourseContent, resolveCourseAccess } from "@/lib/student/course-access";

/** Returns metadata only, scoped to published products the authenticated learner can read. */
export async function listPublishedSolutionCollections(input: { courseId: string; userId: string }) {
  const access = await resolveCourseAccess({ courseId: input.courseId, userId: input.userId });
  if (!access.isAuthenticated || !access.hasCourseAccess || !access.canonicalCourseId) return [];
  const rows = await db.select({ id: solutionCollections.id, productId: solutionCollections.productId, version: solutionCollections.version, title: solutionCollections.title, courseId: solutionCollections.courseId, chapterId: solutionCollections.chapterId, legacyChapterId: bab.legacyChapterId, chapterTitle: bab.title, chapterOrder: bab.orderIndex, publishedAt: solutionCollections.publishedAt })
    .from(solutionCollections).innerJoin(bab, eq(solutionCollections.chapterId, bab.id))
    .innerJoin(mataKuliah, eq(solutionCollections.courseId, mataKuliah.id))
    .where(and(eq(solutionCollections.courseId, access.canonicalCourseId), eq(solutionCollections.status, "published"), eq(bab.status, "active"), eq(mataKuliah.status, "active"), eq(bab.mataKuliahId, access.canonicalCourseId)))
    .orderBy(asc(bab.orderIndex), asc(solutionCollections.title), asc(solutionCollections.id));
  return rows.filter(row => canAccessCourseContent(access, "article", [row.chapterId, row.legacyChapterId].filter((id): id is string => Boolean(id))));
}

/** No question-bank lookup is performed; inaccessible and absent products both return null. */
export async function getPublishedSolutionCollection(input: { courseId: string; collectionId: string; userId: string }) {
  const access = await resolveCourseAccess({ courseId: input.courseId, userId: input.userId });
  if (!access.isAuthenticated || !access.hasCourseAccess || !access.canonicalCourseId) return null;
  const [row] = await db.select({ id: solutionCollections.id, productId: solutionCollections.productId, version: solutionCollections.version, title: solutionCollections.title, content: solutionCollections.content, chapterId: solutionCollections.chapterId, legacyChapterId: bab.legacyChapterId })
    .from(solutionCollections).innerJoin(bab, eq(solutionCollections.chapterId, bab.id))
    .innerJoin(mataKuliah, eq(solutionCollections.courseId, mataKuliah.id))
    .where(and(eq(solutionCollections.id, input.collectionId), eq(solutionCollections.courseId, access.canonicalCourseId), eq(solutionCollections.status, "published"), eq(bab.status, "active"), eq(mataKuliah.status, "active"), eq(bab.mataKuliahId, access.canonicalCourseId))).limit(1);
  if (!row || !canAccessCourseContent(access, "article", [row.chapterId, row.legacyChapterId].filter((id): id is string => Boolean(id)))) return null;
  const parsed = solutionCollectionSchema.safeParse(row.content);
  if (!parsed.success || parsed.data.id !== row.productId || parsed.data.title !== row.title || ![row.chapterId, row.legacyChapterId].includes(parsed.data.chapter.id) || ![access.canonicalCourseId, access.legacyCourseId].includes(parsed.data.course.id) || !parsed.data.items.length || parsed.data.items.some(item => item.visuals.some(visual => visual.kind === "source_figure"))) return null;
  return { id: row.id, version: row.version, collection: parsed.data };
}
