import "server-only";

import { cache } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { artikel, bab, chapters as legacyChapters, courses } from "@/db/schema";
import { db } from "@/lib/db";
import { hasChapterScopeWithin, selectFreeChapters } from "@/lib/student/course-access";
import { getPublicDemoSnapshots, type DemoAllowedCourseWithContext } from "./snapshot-repository";

export type DemoChapter = Pick<typeof bab.$inferSelect, "id" | "mataKuliahId" | "title" | "orderIndex" | "legacyChapterId">;
export type DemoCourseContext = {
  row: DemoAllowedCourseWithContext;
  first: DemoChapter;
  chapters: DemoChapter[];
  metadata: { category: string; description: string | null };
};

/** Resolve all opted-in courses together. Null means the opted-in scope failed closed. */
export const getPublicDemoContexts = cache(async (): Promise<Map<string, DemoCourseContext | null>> => {
  const rows = await getPublicDemoSnapshots();
  const contexts = new Map<string, DemoCourseContext | null>(rows.map((row) => [row.course.id, null]));
  if (!rows.length) return contexts;
  const courseIds = rows.map((row) => row.course.id);
  const legacyIds = [...new Set(rows.map(({ course }) => course.legacyCourseId ?? course.id))];
  const [legacyCourses, chapters] = await Promise.all([
    db.select({ id: courses.id, category: courses.category, description: courses.description }).from(courses).where(inArray(courses.id, legacyIds)),
    db.select({ id: bab.id, mataKuliahId: bab.mataKuliahId, title: bab.title, orderIndex: bab.orderIndex, legacyChapterId: bab.legacyChapterId })
      .from(bab).where(and(inArray(bab.mataKuliahId, courseIds), eq(bab.status, "active"))).orderBy(asc(bab.orderIndex), asc(bab.id)),
  ]);
  const candidates = rows.flatMap((row) => {
    const { course } = row;
    if (row.activeAliasCollision || course.id !== course.id.trim().toLowerCase()) return [];
    const legacy = legacyCourses.find((item) => item.id === (course.legacyCourseId ?? course.id));
    if (course.legacyCourseId && !legacy) return [];
    const courseChapters = chapters.filter((item) => item.mataKuliahId === course.id);
    const free = selectFreeChapters(courseChapters.map((chapter) => ({ id: chapter.id, title: chapter.title, orderIndex: chapter.orderIndex, canonicalId: chapter.id, legacyId: chapter.legacyChapterId, source: "canonical" as const })));
    const first = courseChapters.find((chapter) => chapter.id === free[0]?.canonicalId);
    if (!first || !hasChapterScopeWithin([first.id], free.flatMap((chapter) => [chapter.id, chapter.canonicalId, chapter.legacyId].filter((id): id is string => Boolean(id))))) return [];
    return [{ row, first, chapters: courseChapters, metadata: { category: legacy?.category ?? "Umum", description: legacy?.description ?? null } }];
  });
  if (!candidates.length) return contexts;
  const aliases = [...new Set(candidates.flatMap(({ first }) => first.legacyChapterId ? [first.legacyChapterId] : []))];
  const [mappings, legacyRows] = await Promise.all([
    aliases.length ? db.select({ id: bab.id, legacyId: bab.legacyChapterId }).from(bab).where(inArray(bab.legacyChapterId, aliases)) : Promise.resolve([]),
    aliases.length ? db.select({ id: legacyChapters.id, courseId: legacyChapters.courseId }).from(legacyChapters).where(inArray(legacyChapters.id, aliases)) : Promise.resolve([]),
  ]);
  for (const candidate of candidates) {
    const { first, row } = candidate;
    if (first.legacyChapterId) {
      const mapped = mappings.filter((item) => item.legacyId === first.legacyChapterId);
      const legacy = legacyRows.filter((item) => item.id === first.legacyChapterId);
      if (mapped.length !== 1 || mapped[0].id !== first.id || legacy.length !== 1 || legacy[0].courseId !== row.course.legacyCourseId) continue;
    }
    contexts.set(row.course.id, candidate);
  }
  return contexts;
});

export async function getPublicDemoContext(courseId: string) {
  return (await getPublicDemoContexts()).get(courseId);
}

/** Read the first Article title only for callers that render summary metadata. */
const loadPublicDemoInitialArticles = cache(async (scope: string) => {
  const contexts: Array<[string, string]> = JSON.parse(scope);
  const articles = new Map<string, { id: string; title: string }>();
  if (!contexts.length) return articles;
  const rows = await db.selectDistinctOn([artikel.babId], { id: artikel.id, title: artikel.title, courseId: artikel.mataKuliahId })
    .from(artikel).innerJoin(bab, and(eq(artikel.babId, bab.id), eq(artikel.mataKuliahId, bab.mataKuliahId)))
    .where(and(inArray(artikel.babId, contexts.map(([, chapterId]) => chapterId)), inArray(artikel.mataKuliahId, contexts.map(([courseId]) => courseId)), eq(artikel.structureStatus, "structured"), eq(artikel.status, "published")))
    .orderBy(asc(artikel.babId), asc(artikel.id));
  for (const row of rows) articles.set(row.courseId, { id: row.id, title: row.title });
  return articles;
});

export function getPublicDemoInitialArticles(contexts: Iterable<DemoCourseContext | null>) {
  const scope = [...contexts].flatMap((context) => context ? [[context.row.course.id, context.first.id]] : []);
  return loadPublicDemoInitialArticles(JSON.stringify(scope));
}
