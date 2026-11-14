import { db } from "@/db";
import {
  aiMaterialInstances,
  artikel,
  bab,
  chapters,
  bagianArtikel,
  diktatMateri,
  diktats,
  kemajuanBacaArtikel,
  progress as progressTable,
  studentMaterialProgress,
  websiteMaterials,
} from "@/db/schema";
import { and, asc, eq, inArray, notLike } from "drizzle-orm";
import {
  findCanonicalMataKuliah,
  getCanonicalPublishedArticlesForCourse,
  type CanonicalArticleSummary,
  type SharedCourseArticlesData,
} from "@/lib/articles/structured-repository";
import {
  assembleCourseMaterialRows,
  getStudentCourseAccess,
  isFreeChapterScoped,
  type ChapterOutlineItem,
  type StudentCourseAccess,
} from "@/lib/course-utils";
import { resolveStudentCourse, type StudentCourseRecord } from "@/lib/student/course-catalog";

const CHUNK = 400;
function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    result.push(items.slice(i, i + CHUNK));
  }
  return result;
}

export type DashboardCourseMaterialsEntry = {
  courseId: string;
  materials: ReturnType<typeof assembleCourseMaterialRows>;
  chapterOutline?: ChapterOutlineItem[];
};

export async function getDashboardCourseMaterialsBatch(
  courseIds: readonly string[],
  studentId?: string,
  preloadedCompletedSet?: Set<string>,
  options?: { includeOutline?: boolean; preloaded?: ReadonlyMap<string, { course: StudentCourseRecord; access: StudentCourseAccess | null }> },
): Promise<DashboardCourseMaterialsEntry[]> {
  if (courseIds.length === 0) return [];

  const resolved = await Promise.all(
    courseIds.map(async (courseId) => {
      const normalizedCourseId = courseId?.trim() ?? "";
      const preloaded = options?.preloaded?.get(courseId);
      const [course, matchedCourse, access] = await Promise.all([
        preloaded ? Promise.resolve(preloaded.course) : resolveStudentCourse(courseId),
        preloaded
          ? Promise.resolve(preloaded.course.canonicalId ? { id: preloaded.course.canonicalId, legacyCourseId: preloaded.course.legacyId } : undefined)
          : normalizedCourseId ? findCanonicalMataKuliah(normalizedCourseId) : Promise.resolve(undefined),
        preloaded ? Promise.resolve(preloaded.access) : studentId ? getStudentCourseAccess(studentId, courseId) : Promise.resolve<StudentCourseAccess | null>(null),
      ]);
      const validCourseIds = matchedCourse
        ? [matchedCourse.id, ...(matchedCourse.legacyCourseId ? [matchedCourse.legacyCourseId] : [])]
        : normalizedCourseId
          ? [normalizedCourseId]
          : [];
      return {
        courseId,
        normalizedCourseId,
        legacyCourseId: course?.legacyId ?? courseId,
        canonicalCourseId: course?.canonicalId ?? null,
        validCourseIds,
        access,
      };
    }),
  );

  const accessibleCourses = studentId
    ? resolved.filter((entry) => entry.access !== null)
    : resolved;

  if (accessibleCourses.length === 0) {
    return resolved.map((entry) => ({ courseId: entry.courseId, materials: [], ...(options?.includeOutline ? { chapterOutline: [] } : {}) }));
  }

  const allValidCourseIds = [...new Set(accessibleCourses.flatMap((entry) => entry.validCourseIds))];
  const allLegacyCourseIds = [...new Set(accessibleCourses.map((entry) => entry.legacyCourseId))];
  const allCanonicalCourseIds = [
    ...new Set(accessibleCourses.flatMap((entry) => (entry.canonicalCourseId ? [entry.canonicalCourseId] : []))),
  ];

  const [articles, dbMaterials, webMaterials, courseDiktats, canonicalDiktats] = await Promise.all([
    allValidCourseIds.length > 0
      ? Promise.all(
          chunks(allValidCourseIds).map((ids) =>
            db
              .select({
                id: artikel.id,
                mataKuliahId: artikel.mataKuliahId,
                babId: artikel.babId,
                slug: artikel.slug,
                title: artikel.title,
                version: artikel.version,
                publishedAt: artikel.publishedAt,
                updatedAt: artikel.updatedAt,
              })
              .from(artikel)
              .where(and(inArray(artikel.mataKuliahId, ids), eq(artikel.status, "published"))),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    allLegacyCourseIds.length > 0
      ? Promise.all(
          chunks(allLegacyCourseIds).map((ids) =>
            db
              .select({
                id: aiMaterialInstances.id,
                courseId: aiMaterialInstances.courseId,
                title: aiMaterialInstances.title,
                chapterIds: aiMaterialInstances.chapterIds,
              })
              .from(aiMaterialInstances)
              .where(and(inArray(aiMaterialInstances.courseId, ids), notLike(aiMaterialInstances.title, "[DRAF]%"))),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    allLegacyCourseIds.length > 0
      ? Promise.all(
          chunks(allLegacyCourseIds).map((ids) =>
            db
              .select({
                id: websiteMaterials.id,
                courseId: websiteMaterials.courseId,
                title: websiteMaterials.title,
                chapterId: websiteMaterials.chapterId,
              })
              .from(websiteMaterials)
              .where(and(inArray(websiteMaterials.courseId, ids), eq(websiteMaterials.status, "published"))),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    allLegacyCourseIds.length > 0
      ? Promise.all(
          chunks(allLegacyCourseIds).map((ids) =>
            db
              .select({
                id: diktats.id,
                courseId: diktats.courseId,
                title: diktats.title,
                fileUrl: diktats.fileUrl,
                updatedAt: diktats.updatedAt,
                chapterIds: diktats.chapterIds,
              })
              .from(diktats)
              .where(and(inArray(diktats.courseId, ids), eq(diktats.status, "ready"))),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    allCanonicalCourseIds.length > 0
      ? Promise.all(
          chunks(allCanonicalCourseIds).map((ids) =>
            db
              .select({
                id: diktatMateri.id,
                mataKuliahId: diktatMateri.mataKuliahId,
                title: diktatMateri.title,
                fileKey: diktatMateri.fileKey,
                babId: diktatMateri.babId,
                legacyChapterId: bab.legacyChapterId,
                updatedAt: diktatMateri.updatedAt,
              })
              .from(diktatMateri)
              .innerJoin(bab, eq(diktatMateri.babId, bab.id))
              .where(and(inArray(diktatMateri.mataKuliahId, ids), eq(diktatMateri.status, "published"))),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
  ]);

  const articleIds = [...new Set(articles.map((a) => a.id))];
  const babIds = [...new Set(articles.flatMap((a) => (a.babId ? [a.babId] : [])))];
  const normalizedUserId = studentId?.trim();

  const allMaterialIds = [
    ...new Set([
      ...dbMaterials.map((m) => m.id),
      ...webMaterials.map((m) => m.id),
      ...courseDiktats.map((d) => d.id),
      ...canonicalDiktats.map((d) => d.id),
      ...articles.map((a) => a.id),
    ]),
  ];

  const [babRecords, sections, articleProgressRecords, progressRecords, canonicalChapters, legacyChapters, materialProgress] = await Promise.all([
    babIds.length > 0
      ? Promise.all(
          chunks(babIds).map((ids) =>
            db
              .select({
                id: bab.id,
                legacyChapterId: bab.legacyChapterId,
              })
              .from(bab)
              .where(inArray(bab.id, ids)),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    articleIds.length > 0
      ? Promise.all(
          chunks(articleIds).map((ids) =>
            db
              .select({
                id: bagianArtikel.id,
                artikelId: bagianArtikel.artikelId,
                version: bagianArtikel.version,
                estimatedReadingMinutes: bagianArtikel.estimatedReadingMinutes,
              })
              .from(bagianArtikel)
              .where(and(inArray(bagianArtikel.artikelId, ids), eq(bagianArtikel.status, "published"))),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    normalizedUserId && articleIds.length > 0
      ? Promise.all(
          chunks(articleIds).map((ids) =>
            db
              .select({
                artikelId: kemajuanBacaArtikel.artikelId,
                artikelVersion: kemajuanBacaArtikel.artikelVersion,
                maxReadPercent: kemajuanBacaArtikel.maxReadPercent,
                completedAt: kemajuanBacaArtikel.completedAt,
              })
              .from(kemajuanBacaArtikel)
              .where(
                and(
                  eq(kemajuanBacaArtikel.penggunaId, normalizedUserId),
                  inArray(kemajuanBacaArtikel.artikelId, ids),
                ),
              ),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    !preloadedCompletedSet && studentId && allMaterialIds.length > 0
      ? Promise.all(
          chunks(allMaterialIds).map((ids) =>
            db
              .select({ materialId: progressTable.materialId })
              .from(progressTable)
              .where(
                and(
                  eq(progressTable.userId, studentId),
                  eq(progressTable.status, "completed"),
                  inArray(progressTable.materialId, ids),
                ),
              ),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    options?.includeOutline && allCanonicalCourseIds.length > 0
      ? Promise.all(chunks(allCanonicalCourseIds).map((ids) => db.select({
          id: bab.id, courseId: bab.mataKuliahId, legacyChapterId: bab.legacyChapterId,
          title: bab.title, orderIndex: bab.orderIndex,
        }).from(bab).where(and(inArray(bab.mataKuliahId, ids), eq(bab.status, "active"))).orderBy(asc(bab.orderIndex)))).then((rows) => rows.flat())
      : Promise.resolve([]),
    options?.includeOutline && allLegacyCourseIds.length > 0
      ? Promise.all(chunks(allLegacyCourseIds).map((ids) => db.select({
          id: chapters.id, courseId: chapters.courseId, title: chapters.title, orderIndex: chapters.orderIndex,
        }).from(chapters).where(and(inArray(chapters.courseId, ids), eq(chapters.status, "published"))).orderBy(asc(chapters.orderIndex)))).then((rows) => rows.flat())
      : Promise.resolve([]),
    options?.includeOutline && studentId && webMaterials.length > 0
      ? Promise.all(chunks(webMaterials.map((row) => row.id)).map((ids) => db.select({
          materialId: studentMaterialProgress.materialId, completionPercent: studentMaterialProgress.completionPercent,
        }).from(studentMaterialProgress).where(and(eq(studentMaterialProgress.studentId, studentId), inArray(studentMaterialProgress.materialId, ids))))).then((rows) => rows.flat())
      : Promise.resolve([]),
  ]);

  const babMap = new Map(babRecords.map((b) => [b.id, b as unknown as typeof bab.$inferSelect]));
  const sectionsByArticle = new Map<string, Array<typeof bagianArtikel.$inferSelect>>();
  for (const s of sections) {
    const list = sectionsByArticle.get(s.artikelId) ?? [];
    list.push(s as unknown as typeof bagianArtikel.$inferSelect);
    sectionsByArticle.set(s.artikelId, list);
  }

  const progressByArticle = new Map<string, typeof articleProgressRecords>();
  for (const p of articleProgressRecords) {
    const list = progressByArticle.get(p.artikelId) ?? [];
    list.push(p);
    progressByArticle.set(p.artikelId, list);
  }

  const sharedCompletedSet = preloadedCompletedSet
    ? preloadedCompletedSet
    : new Set(
        progressRecords
          .map((p) => p.materialId)
          .filter((id): id is string => id !== null),
      );
  const percentByMaterial = new Map(materialProgress.map((row) => [row.materialId, row.completionPercent]));

  const dbByLegacyId = new Map<string, typeof dbMaterials>();
  for (const m of dbMaterials) {
    const list = dbByLegacyId.get(m.courseId) ?? [];
    list.push(m);
    dbByLegacyId.set(m.courseId, list);
  }

  const webByLegacyId = new Map<string, typeof webMaterials>();
  for (const m of webMaterials) {
    const list = webByLegacyId.get(m.courseId) ?? [];
    list.push(m);
    webByLegacyId.set(m.courseId, list);
  }

  const diktatsByLegacyId = new Map<string, typeof courseDiktats>();
  for (const d of courseDiktats) {
    const list = diktatsByLegacyId.get(d.courseId) ?? [];
    list.push(d);
    diktatsByLegacyId.set(d.courseId, list);
  }

  const canonicalDiktatsByCanonicalId = new Map<string, typeof canonicalDiktats>();
  for (const d of canonicalDiktats) {
    const list = canonicalDiktatsByCanonicalId.get(d.mataKuliahId) ?? [];
    list.push(d);
    canonicalDiktatsByCanonicalId.set(d.mataKuliahId, list);
  }

  return Promise.all(
    resolved.map(async (entry) => {
      if (studentId && !entry.access) {
        return { courseId: entry.courseId, materials: [], ...(options?.includeOutline ? { chapterOutline: [] } : {}) };
      }

      const validIdSet = new Set(entry.validCourseIds);
      const courseArticles = articles.filter((a) => validIdSet.has(a.mataKuliahId));

      let canonicalArticles: CanonicalArticleSummary[] = [];
      if (courseArticles.length > 0) {
        const baseSummaries = await getCanonicalPublishedArticlesForCourse(
          entry.courseId,
          undefined,
          async (): Promise<SharedCourseArticlesData | null> => ({
            articles: courseArticles as unknown as Array<typeof artikel.$inferSelect>,
            babMap,
            sectionsByArticle,
          }),
        );
        if (normalizedUserId) {
          canonicalArticles = baseSummaries.map((summary) => {
            const artRecord = courseArticles.find((a) => a.id === summary.id);
            const artSections = (sectionsByArticle.get(summary.id) ?? []).filter(
              (s) => s.version === artRecord?.version,
            );
            const userProg = (progressByArticle.get(summary.id) ?? []).filter(
              (p) => p.artikelVersion === artRecord?.version,
            );
            if (userProg.length > 0 && artSections.length > 0) {
              let completedSections = 0;
              let sumPercent = 0;
              for (const p of userProg) {
                if (p.maxReadPercent >= 90 || p.completedAt) {
                  completedSections++;
                }
                sumPercent += p.maxReadPercent;
              }
              const completionPercent = Math.min(100, Math.round(sumPercent / artSections.length));
              const completed = completedSections >= artSections.length || completionPercent >= 90;
              return { ...summary, completed, completionPercent };
            }
            return summary;
          });
        } else {
          canonicalArticles = baseSummaries;
        }
      }

      const materials = assembleCourseMaterialRows({
        courseId: entry.courseId,
        canonicalArticles,
        canonicalDiktats: entry.canonicalCourseId
          ? (canonicalDiktatsByCanonicalId.get(entry.canonicalCourseId) ?? [])
          : [],
        courseDiktats: diktatsByLegacyId.get(entry.legacyCourseId) ?? [],
        dbMaterials: dbByLegacyId.get(entry.legacyCourseId) ?? [],
        webMaterials: webByLegacyId.get(entry.legacyCourseId) ?? [],
        completedSet: sharedCompletedSet,
        studentAccess: entry.access,
      });
      const canonicalRows = canonicalChapters.filter((row) => row.courseId === entry.canonicalCourseId);
      const chapterRows = canonicalRows.length > 0
        ? canonicalRows.map((row) => ({ id: row.legacyChapterId ?? row.id, canonicalId: row.id, legacyChapterId: row.legacyChapterId, title: row.title, orderIndex: row.orderIndex }))
        : legacyChapters.filter((row) => row.courseId === entry.legacyCourseId).map((row) => ({ ...row, canonicalId: null, legacyChapterId: row.id }));
      const canonicalByChapter = new Map<string, CanonicalArticleSummary>();
      for (const article of canonicalArticles) {
        for (const id of [article.babId, article.chapterId, article.legacyChapterId]) {
          if (id && !canonicalByChapter.has(id)) canonicalByChapter.set(id, article);
        }
      }
      const webByChapter = new Map((webByLegacyId.get(entry.legacyCourseId) ?? []).map((row) => [row.chapterId, row.id]));
      const chapterOutline = chapterRows.filter((chapter) => entry.access?.tier !== "free" || entry.access.hasFullContentAccess || isFreeChapterScoped(
        [chapter.id, chapter.canonicalId].filter((id): id is string => Boolean(id)), entry.access.freeChapterIds,
      )).map((chapter) => {
        const article = canonicalByChapter.get(chapter.canonicalId ?? chapter.id)
          ?? (chapter.legacyChapterId ? canonicalByChapter.get(chapter.legacyChapterId) : undefined);
        const materialId = article?.id ?? webByChapter.get(chapter.id) ?? null;
        const percent = materialId ? percentByMaterial.get(materialId) : undefined;
        const completed = Boolean(article?.completed || (materialId && (sharedCompletedSet.has(materialId) || (!article && percent !== undefined && percent >= 90))));
        return {
          id: chapter.id, title: chapter.title, orderIndex: chapter.orderIndex,
          canonicalId: chapter.canonicalId, legacyChapterId: chapter.legacyChapterId,
          materialId, hasMaterial: Boolean(materialId), completed,
          completionPercent: article ? (completed ? 100 : article.completionPercent) : (percent ?? (completed ? 100 : 0)),
        };
      });

      return { courseId: entry.courseId, materials, ...(options?.includeOutline ? { chapterOutline } : {}) };
    }),
  );
}
