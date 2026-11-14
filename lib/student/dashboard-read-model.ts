import { db } from "@/db";
import {
  quizTemplates,
  exams,
  aiMaterialInstances,
  websiteMaterials,
  artikel,
  bab,
  chapters as chaptersTable,
  cakupanAsesmen,
  soal,
  submissions,
} from "@/db/schema";
import { eq, and, notLike, sql, inArray, asc, desc } from "drizzle-orm";
import { requireAuthUser } from "@/lib/auth-session";
import {
  getStudentCourseAccess,
  isFreeQuizTemplate,
  parseQuizSelectionRules,
  sortQuizTemplatesByChapter,
  type StudentCourseAccess,
} from "@/lib/course-utils";
import {
  resolveStudentCourse,
  type StudentCourseRecord,
} from "@/lib/student/course-catalog";

const CHUNK = 400;
function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    result.push(items.slice(i, i + CHUNK));
  }
  return result;
}

export interface CatalogCourseSummary {
  id: string;
  title: string;
  category: string;
  description: string;
  materialsCount: number;
  quizzesCount: number;
  tryoutsCount: number;
}

export type DashboardSubmissionSummary = {
  examId: string;
  status: typeof submissions.$inferSelect.status;
};

/**
 * Authorized lightweight submission summary reader for the student dashboard.
 * Projects only examId and status, avoiding full answers_snapshot and questions_snapshot payloads.
 */
export async function getDashboardStudentSubmissionSummaries(): Promise<DashboardSubmissionSummary[]> {
  const user = await requireAuthUser();
  return db
    .select({
      examId: submissions.examId,
      status: submissions.status,
    })
    .from(submissions)
    .where(eq(submissions.userId, user.id));
}

export type DashboardAssessmentExamItem =
  | {
      id: string;
      courseId: string;
      title: string;
      type: "quiz";
      status: "published";
      settings: {
        timeLimitMinutes: number;
        maxAttempts: number;
      };
      questions: never[];
    }
  | {
      id: string;
      courseId: string;
      title: string;
      type: "tryout";
      status: typeof exams.$inferSelect.status;
      settings: unknown;
      questions: never[];
    };

export type DashboardCourseExamsEntry = {
  courseId: string;
  quizzes: Extract<DashboardAssessmentExamItem, { type: "quiz" }>[];
  tryouts: Extract<DashboardAssessmentExamItem, { type: "tryout" }>[];
  exams: DashboardAssessmentExamItem[];
};

/**
 * Batch fetches quiz and tryout metadata and chapter indexes across courses,
 * sorting quizzes via the shared sortQuizTemplatesByChapter helper.
 */
export async function getDashboardCourseExamsBatch(
  courseIds: readonly string[],
  studentId?: string,
  options?: { quizCountOnly?: boolean; preloaded?: ReadonlyMap<string, { course: StudentCourseRecord; access: StudentCourseAccess | null }> },
): Promise<DashboardCourseExamsEntry[]> {
  if (courseIds.length === 0) return [];

  const resolved = await Promise.all(
    courseIds.map(async (courseId) => {
      const preloaded = options?.preloaded?.get(courseId);
      const [course, access] = await Promise.all([
        preloaded ? Promise.resolve(preloaded.course) : resolveStudentCourse(courseId),
        preloaded ? Promise.resolve(preloaded.access) : studentId ? getStudentCourseAccess(studentId, courseId) : Promise.resolve<StudentCourseAccess | null>(null),
      ]);
      return {
        courseId,
        compatibilityCourseId: course?.legacyId ?? courseId,
        canonicalCourseId: course?.canonicalId ?? null,
        access,
      };
    }),
  );

  const allCompatibilityIds = [...new Set(resolved.map((r) => r.compatibilityCourseId))];
  const allCanonicalIds = [
    ...new Set(resolved.flatMap((r) => (r.canonicalCourseId ? [r.canonicalCourseId] : []))),
  ];
  const allChapterCourseIds = [...new Set([...allCompatibilityIds, ...allCanonicalIds])];

  const [quizRows, tryoutRows, canonicalBabs, legacyChapters] = await Promise.all([
    allCompatibilityIds.length > 0
      ? Promise.all(
          chunks(allCompatibilityIds).map((ids) =>
            db
              .select({
                id: quizTemplates.id,
                courseId: quizTemplates.courseId,
                title: quizTemplates.title,
                category: quizTemplates.category,
                visibility: quizTemplates.visibility,
                status: quizTemplates.status,
                timeLimitSeconds: quizTemplates.timeLimitSeconds,
                maxAttempts: quizTemplates.maxAttempts,
                selectionRules: quizTemplates.selectionRules,
                createdAt: quizTemplates.createdAt,
              })
              .from(quizTemplates)
              .where(inArray(quizTemplates.courseId, ids))
              .orderBy(desc(quizTemplates.createdAt)),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    !options?.quizCountOnly && allCompatibilityIds.length > 0
      ? Promise.all(
          chunks(allCompatibilityIds).map((ids) =>
            db
              .select({
                id: exams.id,
                courseId: exams.courseId,
                title: exams.title,
                status: exams.status,
                settings: exams.settings,
              })
              .from(exams)
              .where(
                and(
                  inArray(exams.courseId, ids),
                  eq(exams.type, "tryout"),
                  eq(exams.status, "published"),
                ),
              ),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    !options?.quizCountOnly && allCanonicalIds.length > 0
      ? Promise.all(
          chunks(allCanonicalIds).map((ids) =>
            db
              .select({
                id: bab.id,
                mataKuliahId: bab.mataKuliahId,
                legacyChapterId: bab.legacyChapterId,
                title: bab.title,
                orderIndex: bab.orderIndex,
              })
              .from(bab)
              .where(and(inArray(bab.mataKuliahId, ids), eq(bab.status, "active")))
              .orderBy(asc(bab.orderIndex)),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    !options?.quizCountOnly && allChapterCourseIds.length > 0
      ? Promise.all(
          chunks(allChapterCourseIds).map((ids) =>
            db
              .select({
                id: chaptersTable.id,
                courseId: chaptersTable.courseId,
                title: chaptersTable.title,
                orderIndex: chaptersTable.orderIndex,
              })
              .from(chaptersTable)
              .where(inArray(chaptersTable.courseId, ids))
              .orderBy(asc(chaptersTable.orderIndex)),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
  ]);

  const templateIds = [...new Set(quizRows.map((t) => t.id))];
  const allFixedQuestionIds = new Set<string>();
  for (const t of quizRows) {
    const rules = parseQuizSelectionRules(t.selectionRules);
    const fixedIds = (rules.fixedQuestionIds ?? rules.fixed_question_ids) as unknown;
    if (Array.isArray(fixedIds)) {
      for (const id of fixedIds) {
        if (typeof id === "string" && id.trim()) {
          allFixedQuestionIds.add(id.trim());
        }
      }
    }
  }

  const [cakupanRows, soalRows] = await Promise.all([
    !options?.quizCountOnly && templateIds.length > 0
      ? Promise.all(
          chunks(templateIds).map((ids) =>
            db
              .select({
                asesmenId: cakupanAsesmen.asesmenId,
                babId: cakupanAsesmen.babId,
              })
              .from(cakupanAsesmen)
              .where(inArray(cakupanAsesmen.asesmenId, ids)),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
    !options?.quizCountOnly && allFixedQuestionIds.size > 0
      ? Promise.all(
          chunks([...allFixedQuestionIds]).map((ids) =>
            db
              .select({ id: soal.id, babId: soal.babId })
              .from(soal)
              .where(inArray(soal.id, ids)),
          ),
        ).then((rows) => rows.flat())
      : Promise.resolve([]),
  ]);

  const cakupanMap = new Map<string, string>();
  for (const row of cakupanRows) {
    if (!cakupanMap.has(row.asesmenId)) {
      cakupanMap.set(row.asesmenId, row.babId);
    }
  }

  const soalBabMap = new Map<string, string>();
  for (const s of soalRows) {
    if (s.babId) soalBabMap.set(s.id, s.babId);
  }

  const quizzesByCourseId = new Map<string, typeof quizRows>();
  for (const q of quizRows) {
    const list = quizzesByCourseId.get(q.courseId) ?? [];
    list.push(q);
    quizzesByCourseId.set(q.courseId, list);
  }

  const tryoutsByCourseId = new Map<string, typeof tryoutRows>();
  for (const t of tryoutRows) {
    const list = tryoutsByCourseId.get(t.courseId) ?? [];
    list.push(t);
    tryoutsByCourseId.set(t.courseId, list);
  }

  const babsByCanonicalId = new Map<string, typeof canonicalBabs>();
  for (const b of canonicalBabs) {
    const list = babsByCanonicalId.get(b.mataKuliahId) ?? [];
    list.push(b);
    babsByCanonicalId.set(b.mataKuliahId, list);
  }

  const chaptersByCourseId = new Map<string, typeof legacyChapters>();
  for (const ch of legacyChapters) {
    const list = chaptersByCourseId.get(ch.courseId) ?? [];
    list.push(ch);
    chaptersByCourseId.set(ch.courseId, list);
  }

  return Promise.all(
    resolved.map(async (entry) => {
      const courseTemplates = quizzesByCourseId.get(entry.compatibilityCourseId) ?? [];
      const courseCanonicalBabs = entry.canonicalCourseId
        ? (babsByCanonicalId.get(entry.canonicalCourseId) ?? [])
        : [];
      const courseLegacyChapters = [
        ...(chaptersByCourseId.get(entry.compatibilityCourseId) ?? []),
        ...(entry.canonicalCourseId && entry.canonicalCourseId !== entry.compatibilityCourseId
          ? (chaptersByCourseId.get(entry.canonicalCourseId) ?? [])
          : []),
      ].sort((a, b) => a.orderIndex - b.orderIndex);

      let sortedTemplates = options?.quizCountOnly ? courseTemplates : await sortQuizTemplatesByChapter(
        courseTemplates,
        entry.courseId,
        {
          canonicalBabs: courseCanonicalBabs,
          legacyChapters: courseLegacyChapters,
          cakupanMap,
          soalBabMap,
        },
      );

      let mappedQuizzes: Extract<DashboardAssessmentExamItem, { type: "quiz" }>[] = [];
      if (studentId && !entry.access) {
        mappedQuizzes = [];
      } else {
        if (studentId && entry.access?.tier === "free" && !entry.access.hasFullContentAccess) {
          sortedTemplates = sortedTemplates.filter((template) =>
            isFreeQuizTemplate(template, entry.access!.freeChapterIds),
          );
        }
        mappedQuizzes = sortedTemplates.map((t) => ({
          id: t.id,
          courseId: entry.courseId,
          title: t.title,
          type: "quiz" as const,
          status: "published" as const,
          settings: {
            timeLimitMinutes: t.timeLimitSeconds ? Math.floor(t.timeLimitSeconds / 60) : 15,
            maxAttempts: t.maxAttempts || 3,
          },
          questions: [],
        }));
      }

      const courseTryouts = tryoutsByCourseId.get(entry.compatibilityCourseId) ?? [];
      const mappedTryouts = courseTryouts.map((t) => {
        const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
        return {
          id: t.id,
          courseId: entry.courseId,
          title: t.title,
          type: "tryout" as const,
          status: t.status,
          settings: settings || { timeLimitMinutes: 90, maxAttempts: 2 },
          questions: [] as never[],
        };
      });

      return {
        courseId: entry.courseId,
        quizzes: mappedQuizzes,
        tryouts: mappedTryouts,
        exams: [...mappedQuizzes, ...mappedTryouts],
      };
    }),
  );
}

/**
 * Aggregates article, quiz, and tryout counts in batch SQL GROUP BY queries.
 * Dashboard "bahan belajar" intentionally counts article-like learning content only.
 */
export async function getCatalogCourseSummaries(
  activeCourses: StudentCourseRecord[]
): Promise<CatalogCourseSummary[]> {
  if (activeCourses.length === 0) return [];

  const legacyIds = [...new Set(activeCourses.map((course) => course.legacyId ?? course.id))];
  const canonicalIds = [...new Set(activeCourses.flatMap((course) => course.canonicalId ? [course.canonicalId] : []))];
  const assessmentIds = [...new Set([...legacyIds, ...canonicalIds])];

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
      .where(inArray(quizTemplates.courseId, assessmentIds))
      .groupBy(quizTemplates.courseId),
    db
      .select({
        courseId: exams.courseId,
        count: sql<number>`count(*)`,
      })
      .from(exams)
      .where(and(inArray(exams.courseId, assessmentIds), eq(exams.type, "tryout"), eq(exams.status, "published")))
      .groupBy(exams.courseId),
    db
      .select({
        courseId: aiMaterialInstances.courseId,
        count: sql<number>`count(*)`,
      })
      .from(aiMaterialInstances)
      .where(and(inArray(aiMaterialInstances.courseId, legacyIds), notLike(aiMaterialInstances.title, "[DRAF]%")))
      .groupBy(aiMaterialInstances.courseId),
    db
      .select({
        courseId: websiteMaterials.courseId,
        count: sql<number>`count(*)`,
      })
      .from(websiteMaterials)
      .where(and(inArray(websiteMaterials.courseId, legacyIds), eq(websiteMaterials.status, "published")))
      .groupBy(websiteMaterials.courseId),
    db
      .select({
        courseId: artikel.mataKuliahId,
        count: sql<number>`count(*)`,
      })
      .from(artikel)
      .where(and(inArray(artikel.mataKuliahId, canonicalIds), eq(artikel.status, "published")))
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
