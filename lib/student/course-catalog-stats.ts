import { db } from "@/db";
import {
  aiMaterialInstances,
  artikel,
  bab,
  diktatMateri,
  diktats,
  exams,
  quizTemplates,
  websiteMaterials,
} from "@/db/schema";
import { and, eq, inArray, notLike, sql } from "drizzle-orm";
import { PKA_COURSE_ID } from "@/lib/pka-config";

export interface CourseCatalogStats {
  materialsCount: number;
  quizzesCount: number;
  tryoutsCount: number;
}

export interface CourseCatalogStatsTarget {
  id: string;
  canonicalId?: string | null;
  legacyId?: string | null;
}

const SQLITE_CHUNK_SIZE = 250;

function chunkArray<T>(items: readonly T[], chunkSize: number = SQLITE_CHUNK_SIZE): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function fetchInChunks<TItem, TResult>(
  items: readonly TItem[],
  queryFn: (chunk: TItem[]) => Promise<TResult[]>,
): Promise<TResult[]> {
  const chunks = chunkArray(items);
  if (chunks.length === 0) return [];
  const results = await Promise.all(chunks.map((chunk) => queryFn(chunk)));
  return results.flat();
}

function normalizeChapterIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((chapterId): chapterId is string => typeof chapterId === "string")
    .map((chapterId) => chapterId.trim())
    .filter(Boolean);
}

/**
 * Computes material, quiz, and tryout counts for multiple courses in bounded queries.
 *
 * Replaces the per-course N+1 calls to getCourseMaterials, getCourseQuizzes,
 * and getCourseTryouts on the student catalog surface while preserving exact
 * semantics:
 * - Publication status gates
 * - Canonical & legacy mappings
 * - Chapter-level deduplication of legacy diktats against canonical diktats
 * - Chapter-level deduplication of legacy AI & website materials against canonical articles
 * - PKA campaign course zero-stat gate
 * - Zero-courses safety
 * - SQLite parameter limit safety via batch chunking
 */
export async function getCourseCatalogStatsMap(
  courses: readonly CourseCatalogStatsTarget[],
): Promise<Map<string, CourseCatalogStats>> {
  const statsMap = new Map<string, CourseCatalogStats>();
  if (!courses || courses.length === 0) {
    return statsMap;
  }

  type ResolvedCourse = {
    id: string;
    canonicalCourseId: string | null;
    legacyCourseId: string;
    validCourseIds: string[];
  };

  const resolvedCourses: ResolvedCourse[] = [];

  for (const course of courses) {
    if (!course?.id) continue;

    // Tutorial PKA is a lean campaign course with no standard materials/quizzes/tryouts to count
    if (course.id === PKA_COURSE_ID) {
      statsMap.set(course.id, {
        materialsCount: 0,
        quizzesCount: 0,
        tryoutsCount: 0,
      });
      continue;
    }

    const canonicalCourseId = course.canonicalId ?? null;
    const legacyCourseId = course.legacyId ?? course.id;

    const validCourseIds = Array.from(
      new Set(
        canonicalCourseId
          ? [canonicalCourseId, ...(legacyCourseId ? [legacyCourseId] : [])]
          : [legacyCourseId],
      ),
    );

    resolvedCourses.push({
      id: course.id,
      canonicalCourseId,
      legacyCourseId,
      validCourseIds,
    });
  }

  if (resolvedCourses.length === 0) {
    return statsMap;
  }

  const allLegacyCourseIds = Array.from(
    new Set(resolvedCourses.map((c) => c.legacyCourseId)),
  );
  const allCanonicalCourseIds = Array.from(
    new Set(
      resolvedCourses
        .map((c) => c.canonicalCourseId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const allValidCourseIds = Array.from(
    new Set(resolvedCourses.flatMap((c) => c.validCourseIds)),
  );

  const [
    tryoutCounts,
    quizCounts,
    canonicalArticles,
    canonicalDiktats,
    courseDiktats,
    dbMaterials,
    webMaterials,
  ] = await Promise.all([
    // 1. Tryouts count (published exams of type 'tryout')
    allLegacyCourseIds.length > 0
      ? fetchInChunks(allLegacyCourseIds, (chunk) =>
          db
            .select({
              courseId: exams.courseId,
              count: sql<number>`count(*)`,
            })
            .from(exams)
            .where(
              and(
                inArray(exams.courseId, chunk),
                eq(exams.type, "tryout"),
                eq(exams.status, "published"),
              ),
            )
            .groupBy(exams.courseId),
        )
      : Promise.resolve([]),

    // 2. Quizzes count (quizTemplates for compatibility course ID)
    // Preserves old helper semantics: includes drafts if old helper counts them
    allLegacyCourseIds.length > 0
      ? fetchInChunks(allLegacyCourseIds, (chunk) =>
          db
            .select({
              courseId: quizTemplates.courseId,
              count: sql<number>`count(*)`,
            })
            .from(quizTemplates)
            .where(inArray(quizTemplates.courseId, chunk))
            .groupBy(quizTemplates.courseId),
        )
      : Promise.resolve([]),

    // 3. Canonical articles (published, left joined to bab for legacyChapterId)
    allValidCourseIds.length > 0
      ? fetchInChunks(allValidCourseIds, (chunk) =>
          db
            .select({
              id: artikel.id,
              mataKuliahId: artikel.mataKuliahId,
              babId: artikel.babId,
              legacyChapterId: bab.legacyChapterId,
            })
            .from(artikel)
            .leftJoin(bab, eq(artikel.babId, bab.id))
            .where(
              and(
                inArray(artikel.mataKuliahId, chunk),
                eq(artikel.status, "published"),
              ),
            ),
        )
      : Promise.resolve([]),

    // 4. Canonical diktats (published, inner joined to bab)
    allCanonicalCourseIds.length > 0
      ? fetchInChunks(allCanonicalCourseIds, (chunk) =>
          db
            .select({
              id: diktatMateri.id,
              mataKuliahId: diktatMateri.mataKuliahId,
              babId: diktatMateri.babId,
              legacyChapterId: bab.legacyChapterId,
            })
            .from(diktatMateri)
            .innerJoin(bab, eq(diktatMateri.babId, bab.id))
            .where(
              and(
                inArray(diktatMateri.mataKuliahId, chunk),
                eq(diktatMateri.status, "published"),
              ),
            ),
        )
      : Promise.resolve([]),

    // 5. Legacy ready diktats
    allLegacyCourseIds.length > 0
      ? fetchInChunks(allLegacyCourseIds, (chunk) =>
          db
            .select({
              id: diktats.id,
              courseId: diktats.courseId,
              chapterIds: diktats.chapterIds,
            })
            .from(diktats)
            .where(
              and(
                inArray(diktats.courseId, chunk),
                eq(diktats.status, "ready"),
              ),
            ),
        )
      : Promise.resolve([]),

    // 6. Active AI material instances (non-draft)
    allLegacyCourseIds.length > 0
      ? fetchInChunks(allLegacyCourseIds, (chunk) =>
          db
            .select({
              id: aiMaterialInstances.id,
              courseId: aiMaterialInstances.courseId,
              chapterIds: aiMaterialInstances.chapterIds,
            })
            .from(aiMaterialInstances)
            .where(
              and(
                inArray(aiMaterialInstances.courseId, chunk),
                notLike(aiMaterialInstances.title, "[DRAF]%"),
              ),
            ),
        )
      : Promise.resolve([]),

    // 7. Published website materials
    allLegacyCourseIds.length > 0
      ? fetchInChunks(allLegacyCourseIds, (chunk) =>
          db
            .select({
              id: websiteMaterials.id,
              courseId: websiteMaterials.courseId,
              chapterId: websiteMaterials.chapterId,
            })
            .from(websiteMaterials)
            .where(
              and(
                inArray(websiteMaterials.courseId, chunk),
                eq(websiteMaterials.status, "published"),
              ),
            ),
        )
      : Promise.resolve([]),
  ]);

  const tryoutsByLegacyId = new Map<string, number>();
  for (const row of tryoutCounts) {
    tryoutsByLegacyId.set(row.courseId, Number(row.count) || 0);
  }

  const quizzesByLegacyId = new Map<string, number>();
  for (const row of quizCounts) {
    quizzesByLegacyId.set(row.courseId, Number(row.count) || 0);
  }

  const articlesByMataKuliahId = new Map<string, typeof canonicalArticles>();
  for (const art of canonicalArticles) {
    const list = articlesByMataKuliahId.get(art.mataKuliahId) ?? [];
    list.push(art);
    articlesByMataKuliahId.set(art.mataKuliahId, list);
  }

  const canonicalDiktatsByMataKuliahId = new Map<string, typeof canonicalDiktats>();
  for (const diktat of canonicalDiktats) {
    const list = canonicalDiktatsByMataKuliahId.get(diktat.mataKuliahId) ?? [];
    list.push(diktat);
    canonicalDiktatsByMataKuliahId.set(diktat.mataKuliahId, list);
  }

  const legacyDiktatsByCourseId = new Map<string, typeof courseDiktats>();
  for (const d of courseDiktats) {
    const list = legacyDiktatsByCourseId.get(d.courseId) ?? [];
    list.push(d);
    legacyDiktatsByCourseId.set(d.courseId, list);
  }

  const aiMaterialsByCourseId = new Map<string, typeof dbMaterials>();
  for (const m of dbMaterials) {
    const list = aiMaterialsByCourseId.get(m.courseId) ?? [];
    list.push(m);
    aiMaterialsByCourseId.set(m.courseId, list);
  }

  const webMaterialsByCourseId = new Map<string, typeof webMaterials>();
  for (const w of webMaterials) {
    const list = webMaterialsByCourseId.get(w.courseId) ?? [];
    list.push(w);
    webMaterialsByCourseId.set(w.courseId, list);
  }

  for (const course of resolvedCourses) {
    // 1. Canonical published articles
    const courseArticles: typeof canonicalArticles = [];
    for (const validId of course.validCourseIds) {
      const arts = articlesByMataKuliahId.get(validId);
      if (arts) {
        courseArticles.push(...arts);
      }
    }
    const canonicalArticlesCount = courseArticles.length;

    // Canonical chapter IDs from articles for deduplication
    const canonicalChapterIds = new Set<string>();
    for (const art of courseArticles) {
      if (art.babId) canonicalChapterIds.add(art.babId);
      if (art.legacyChapterId) canonicalChapterIds.add(art.legacyChapterId);
    }

    // 2. Canonical published diktats
    const courseCanonicalDiktats = course.canonicalCourseId
      ? canonicalDiktatsByMataKuliahId.get(course.canonicalCourseId) ?? []
      : [];
    const canonicalDiktatsCount = courseCanonicalDiktats.length;

    // Canonical diktat chapter IDs for deduplication
    const canonicalDiktatChapterIds = new Set<string>();
    for (const diktat of courseCanonicalDiktats) {
      if (diktat.babId) canonicalDiktatChapterIds.add(diktat.babId);
      if (diktat.legacyChapterId) canonicalDiktatChapterIds.add(diktat.legacyChapterId);
    }

    // 3. Mapped legacy ready diktats (deduplicated against canonical diktat chapters)
    const legacyDiktats = legacyDiktatsByCourseId.get(course.legacyCourseId) ?? [];
    const mappedDiktatsCount = legacyDiktats.filter((diktat) => {
      const chapterIds = normalizeChapterIds(diktat.chapterIds);
      return !chapterIds.some((chapterId) => canonicalDiktatChapterIds.has(chapterId));
    }).length;

    // 4. Mapped AI material instances (deduplicated against canonical article chapters)
    const aiMaterials = aiMaterialsByCourseId.get(course.legacyCourseId) ?? [];
    const mappedDbCount = aiMaterials.filter((material) => {
      const chapterIds = normalizeChapterIds(material.chapterIds);
      return !chapterIds.some((chapterId) => canonicalChapterIds.has(chapterId));
    }).length;

    // 5. Mapped website materials (deduplicated against canonical article chapters)
    const webMaterialsList = webMaterialsByCourseId.get(course.legacyCourseId) ?? [];
    const mappedWebCount = webMaterialsList.filter(
      (material) => !canonicalChapterIds.has(material.chapterId),
    ).length;

    const materialsCount =
      canonicalArticlesCount +
      canonicalDiktatsCount +
      mappedDiktatsCount +
      mappedDbCount +
      mappedWebCount;

    const quizzesCount = quizzesByLegacyId.get(course.legacyCourseId) ?? 0;
    const tryoutsCount = tryoutsByLegacyId.get(course.legacyCourseId) ?? 0;

    statsMap.set(course.id, {
      materialsCount,
      quizzesCount,
      tryoutsCount,
    });
  }

  return statsMap;
}

/**
 * Attaches materialsCount, quizzesCount, and tryoutsCount to a list of course items in batch.
 */
export async function attachCourseCatalogStats<T extends CourseCatalogStatsTarget>(
  courses: readonly T[],
): Promise<(T & CourseCatalogStats)[]> {
  const statsMap = await getCourseCatalogStatsMap(courses);
  return courses.map((course) => {
    const stats = statsMap.get(course.id) ?? {
      materialsCount: 0,
      quizzesCount: 0,
      tryoutsCount: 0,
    };
    return {
      ...course,
      ...stats,
    };
  });
}
