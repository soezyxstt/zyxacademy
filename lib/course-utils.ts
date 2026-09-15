import { db } from "@/db";
import {
  aiMaterialInstances,
  websiteMaterials,
  diktats,
  progress as progressTable,
  quizTemplates,
  exams,
  studentQuizAttempts,
  submissions,
  user,
  chapters as chaptersTable,
  studentMaterialProgress,
  bab,
  diktatMateri,
  artikel,
  courseMaterials,
} from "@/db/schema";
import { eq, and, desc, notLike, inArray, ne } from "drizzle-orm";
// Fixture imports removed
import { getCanonicalPublishedArticlesForCourse } from "@/lib/articles/structured-repository";
import { isStudentEnrolled, resolveStudentCourse } from "@/lib/student/course-catalog";
import {
  hasChapterScopeWithin,
  resolveCourseAccess,
  type CourseAccessResult,
} from "@/lib/student/course-access";

/**
 * True when the user holds an active enrollment for the course. Access control
 * source of truth for course-scoped features (e.g. the Zyra tutor). Validates
 * that the enrollment is active and not expired via `isStudentEnrolled`.
 */
export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  return isStudentEnrolled(userId, courseId);
}

export type StudentCourseAccessTier = "free" | "standard";

export type StudentCourseAccess = {
  courseId: string;
  canonicalCourseId: string | null;
  legacyCourseId: string | null;
  tier: StudentCourseAccessTier;
  isEnrolled: boolean;
  /** IDs of the first two published chapters, including canonical and legacy aliases. */
  freeChapterIds: string[];
  /** Full server-resolved policy, retained for callers that need capabilities. */
  policy: CourseAccessResult;
};

/**
 * Resolves the student content lane and the immutable Free chapter scope.
 *
 * This is intentionally server-side and delegates course identity, enrollment,
 * demo selection, and chapter scope to the central resolver. The compatibility
 * shape is kept for existing student read models while the migration settles.
 */
export async function getStudentCourseAccess(
  userId: string,
  courseId: string,
): Promise<StudentCourseAccess | null> {
  const policy = await resolveCourseAccess({ courseId, userId, roleHint: "murid" });
  if (!policy.isAuthenticated || !policy.hasCourseAccess || policy.tier === "anonymous") return null;

  return {
    courseId: policy.courseId ?? courseId,
    canonicalCourseId: policy.canonicalCourseId,
    legacyCourseId: policy.legacyCourseId,
    tier: policy.tier === "free" ? "free" : "standard",
    isEnrolled: policy.isEnrolled,
    freeChapterIds: policy.freeChapterIds,
    policy,
  };
}

export function isFreeChapterScoped(
  chapterIds: readonly (string | null | undefined)[] | null | undefined,
  freeChapterIds: ReadonlySet<string> | readonly string[],
): boolean {
  return hasChapterScopeWithin(chapterIds, freeChapterIds instanceof Set ? [...freeChapterIds] : freeChapterIds);
}

export const FREE_QUIZ_CATEGORIES: ReadonlySet<string> = new Set([
  "daily",
  "weekly",
  "chapter",
]);

function parseQuizSelectionRules(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

/** Reads the one explicit chapter-scope shape accepted by Free quizzes. */
export function extractFreeQuizChapterScope(raw: unknown): string[] | null {
  const rules = parseQuizSelectionRules(raw);
  const keys = ["chapterId", "chapterIds", "chapters", "chapter_ids"];
  const values = keys
    .filter((key) => Object.prototype.hasOwnProperty.call(rules, key))
    .map((key) => rules[key]);
  if (values.length !== 1) return null;

  const value = values[0];
  const refs = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  if (refs.length < 1 || refs.length > 2 || refs.some((ref) => typeof ref !== "string")) return null;

  const chapterIds = refs.map((ref) => ref.trim());
  if (chapterIds.some((chapterId) => !chapterId)) return null;
  return [...new Set(chapterIds)];
}

type FreeQuizTemplate = Pick<
  typeof quizTemplates.$inferSelect,
  "category" | "visibility" | "status" | "selectionRules"
>;

function normalizeChapterIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((chapterId): chapterId is string => typeof chapterId === "string")
    .map((chapterId) => chapterId.trim())
    .filter(Boolean);
}

/**
 * The shared Free quiz predicate used by course catalog, detail, and attempt
 * boundaries. It is deliberately fail-closed for malformed or broad rules.
 */
export function isFreeQuizTemplate(
  template: FreeQuizTemplate,
  freeChapterIds: ReadonlySet<string> | readonly string[],
): boolean {
  if (template.status !== "published") return false;
  if (template.visibility !== "free") return false;
  if (!FREE_QUIZ_CATEGORIES.has(template.category)) return false;

  const rules = parseQuizSelectionRules(template.selectionRules);
  const assessmentTypes = [rules.assessmentType, rules.assessment_type]
    .filter((value) => value !== undefined);
  if (assessmentTypes.some((value) => value !== "quiz")) return false;

  const chapterIds = extractFreeQuizChapterScope(rules);
  return chapterIds !== null && hasChapterScopeWithin(chapterIds, freeChapterIds);
}

export type StudentMaterialAccess = {
  access: StudentCourseAccess;
  chapterIds: string[];
  /** Free may read only Article and Diktat products, never generic PDFs. */
  contentKind: "article" | "diktat" | "other";
};

/** Resolves a published material to its course and chapter scope for writes. */
export async function getStudentMaterialAccess(
  userId: string,
  materialId: string,
): Promise<StudentMaterialAccess | null> {
  const [canonicalArticle] = await db
    .select({ courseId: artikel.mataKuliahId, chapterId: artikel.babId })
    .from(artikel)
    .where(and(eq(artikel.id, materialId), eq(artikel.status, "published")))
    .limit(1);
  if (canonicalArticle) {
    const access = await getStudentCourseAccess(userId, canonicalArticle.courseId);
    return access
      ? { access, chapterIds: canonicalArticle.chapterId ? [canonicalArticle.chapterId] : [], contentKind: "article" }
      : null;
  }

  const [canonicalDiktat] = await db
    .select({ courseId: diktatMateri.mataKuliahId, chapterId: diktatMateri.babId, legacyChapterId: bab.legacyChapterId })
    .from(diktatMateri)
    .leftJoin(bab, eq(diktatMateri.babId, bab.id))
    .where(and(eq(diktatMateri.id, materialId), eq(diktatMateri.status, "published")))
    .limit(1);
  if (canonicalDiktat) {
    const access = await getStudentCourseAccess(userId, canonicalDiktat.courseId);
    return access
      ? {
          access,
          chapterIds: [canonicalDiktat.chapterId, canonicalDiktat.legacyChapterId].filter((id): id is string => Boolean(id)),
          contentKind: "diktat",
        }
      : null;
  }

  const [webMaterial] = await db
    .select({ courseId: websiteMaterials.courseId, chapterId: websiteMaterials.chapterId })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.id, materialId), eq(websiteMaterials.status, "published")))
    .limit(1);
  if (webMaterial) {
    const access = await getStudentCourseAccess(userId, webMaterial.courseId);
    return access ? { access, chapterIds: [webMaterial.chapterId], contentKind: "article" } : null;
  }

  const [legacyDiktat] = await db
    .select({ courseId: diktats.courseId, chapterIds: diktats.chapterIds })
    .from(diktats)
    .where(and(eq(diktats.id, materialId), eq(diktats.status, "ready")))
    .limit(1);
  if (legacyDiktat) {
    const access = await getStudentCourseAccess(userId, legacyDiktat.courseId);
    return access
      ? {
          access,
          chapterIds: Array.isArray(legacyDiktat.chapterIds) ? legacyDiktat.chapterIds : [],
          contentKind: "diktat",
        }
      : null;
  }

  const [legacyMaterial] = await db
    .select({ courseId: courseMaterials.courseId, chapterIds: courseMaterials.chapterIds })
    .from(courseMaterials)
    .where(eq(courseMaterials.id, materialId))
    .limit(1);
  if (legacyMaterial) {
    const access = await getStudentCourseAccess(userId, legacyMaterial.courseId);
    return access
      ? {
          access,
          chapterIds: Array.isArray(legacyMaterial.chapterIds) ? legacyMaterial.chapterIds : [],
          contentKind: "other",
        }
      : null;
  }

  const [aiMaterial] = await db
    .select({ courseId: aiMaterialInstances.courseId, chapterIds: aiMaterialInstances.chapterIds })
    .from(aiMaterialInstances)
    .where(and(eq(aiMaterialInstances.id, materialId), notLike(aiMaterialInstances.title, "[DRAF]%")))
    .limit(1);
  if (aiMaterial) {
    const access = await getStudentCourseAccess(userId, aiMaterial.courseId);
    return access
      ? {
          access,
          chapterIds: Array.isArray(aiMaterial.chapterIds) ? aiMaterial.chapterIds : [],
          contentKind: "article",
        }
      : null;
  }

  return null;
}

export async function getCourse(id: string) {
  const course = await resolveStudentCourse(id);
  return course
    ? {
        id: course.id,
        canonicalId: course.canonicalId,
        legacyId: course.legacyId,
        title: course.title,
        category: course.category,
        description: course.description,
      }
    : undefined;
}

export async function getCourseMaterials(courseId: string, studentId?: string, preloadedCompletedSet?: Set<string>) {
  const course = await resolveStudentCourse(courseId);
  const legacyCourseId = course?.legacyId ?? courseId;
  const canonicalCourseId = course?.canonicalId;
  const canonicalArticles = await getCanonicalPublishedArticlesForCourse(courseId, studentId);

  // AI material instances (active only ; drafts and archived stay hidden)
  const dbMaterials = await db
    .select({
      id: aiMaterialInstances.id,
      title: aiMaterialInstances.title,
      chapterIds: aiMaterialInstances.chapterIds,
    })
    .from(aiMaterialInstances)
    .where(and(eq(aiMaterialInstances.courseId, legacyCourseId), notLike(aiMaterialInstances.title, "[DRAF]%")));

  // Website materials (published AST articles, linked 1:1 with chapters)
  const webMaterials = await db
    .select({
      id: websiteMaterials.id,
      title: websiteMaterials.title,
      chapterId: websiteMaterials.chapterId,
    })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, legacyCourseId), eq(websiteMaterials.status, "published")));

  // Diktats
  const courseDiktats = await db
    .select({
      id: diktats.id,
      title: diktats.title,
      fileUrl: diktats.fileUrl,
      updatedAt: diktats.updatedAt,
      chapterIds: diktats.chapterIds,
    })
    .from(diktats)
    .where(and(eq(diktats.courseId, legacyCourseId), eq(diktats.status, "ready")));

  const canonicalDiktats = canonicalCourseId
    ? await db
        .select({
          id: diktatMateri.id,
          title: diktatMateri.title,
          fileKey: diktatMateri.fileKey,
          babId: diktatMateri.babId,
          legacyChapterId: bab.legacyChapterId,
          updatedAt: diktatMateri.updatedAt,
        })
        .from(diktatMateri)
        .innerJoin(bab, eq(diktatMateri.babId, bab.id))
        .where(and(eq(diktatMateri.mataKuliahId, canonicalCourseId), eq(diktatMateri.status, "published")))
    : [];

  const studentAccess = studentId ? await getStudentCourseAccess(studentId, courseId) : null;
  if (studentId && !studentAccess) return [];
  const canDownloadDiktat = Boolean(studentAccess?.policy.capabilities.canDownloadDiktat);

  // User progress - bounded to course material IDs or preloaded set to eliminate full table scans (P1-10)
  let completedSet = new Set<string>();
  if (preloadedCompletedSet) {
    completedSet = preloadedCompletedSet;
  } else if (studentId) {
    const courseMaterialIds = [
      ...dbMaterials.map((m) => m.id),
      ...webMaterials.map((m) => m.id),
      ...courseDiktats.map((d) => d.id),
      ...canonicalDiktats.map((d) => d.id),
      ...canonicalArticles.map((a) => a.id),
    ];
    if (courseMaterialIds.length > 0) {
      const progressRecords = await db
        .select({ materialId: progressTable.materialId })
        .from(progressTable)
        .where(
          and(
            eq(progressTable.userId, studentId),
            eq(progressTable.status, "completed"),
            inArray(progressTable.materialId, courseMaterialIds)
          )
        );
      completedSet = new Set(
        progressRecords
          .map((p) => p.materialId)
          .filter((id): id is string => id !== null)
      );
    }
  }

  const canonicalChapterIds = new Set(
    canonicalArticles.flatMap((article) => [article.babId, article.chapterId, article.legacyChapterId].filter((id): id is string => Boolean(id))),
  );
  const canonicalDiktatChapterIds = new Set(
    canonicalDiktats.flatMap((diktat) => [diktat.babId, diktat.legacyChapterId].filter((id): id is string => Boolean(id))),
  );

  const mappedCanonicalArticles = canonicalArticles.map((article) => ({
    id: article.id,
    courseId,
    chapterId: article.chapterId,
    title: article.title,
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: `${article.totalEstimatedReadingMinutes} menit baca`,
    completed: article.completed || completedSet.has(article.id),
    completionPercent: completedSet.has(article.id) ? 100 : article.completionPercent,
    isPastYear: false,
    isPreview: false,
    chapterIds: [article.chapterId, article.babId, article.legacyChapterId].filter((id): id is string => Boolean(id)),
  }));

  const mappedCanonicalDiktats = canonicalDiktats.map((diktat) => ({
    id: diktat.id,
    courseId,
    chapterId: diktat.legacyChapterId ?? diktat.babId,
    title: diktat.title,
    kind: "article" as const,
    docCategory: "diktat" as const,
    fileSize: "Diktat canonical",
    completed: completedSet.has(diktat.id),
    completionPercent: completedSet.has(diktat.id) ? 100 : 0,
    isPastYear: false,
    isPreview: false,
    url: diktat.fileKey
      ? `/api/courses/${encodeURIComponent(courseId)}/diktats/${encodeURIComponent(diktat.id)}/pdf${canDownloadDiktat ? "?download=1" : ""}`
      : undefined,
    chapterIds: [diktat.babId, diktat.legacyChapterId].filter((id): id is string => Boolean(id)),
  }));

  const mappedDiktats = courseDiktats.filter((diktat) => {
    const chapterIds = normalizeChapterIds(diktat.chapterIds);
    return !chapterIds.some((chapterId) => canonicalDiktatChapterIds.has(chapterId));
  }).map((d) => ({
    id: d.id,
    courseId,
    title: d.title,
    kind: "pdf" as const,
    docCategory: "diktat" as const,
    fileSize: "PDF File",
    completed: completedSet.has(d.id),
    isPastYear: false,
    isPreview: true,
    url: d.fileUrl
      ? `/api/courses/${encodeURIComponent(courseId)}/diktats/${encodeURIComponent(d.id)}/pdf${canDownloadDiktat ? "?download=1" : ""}`
      : undefined,
    chapterIds: normalizeChapterIds(d.chapterIds),
  }));

  const mappedDb = dbMaterials.filter((material) => {
    const chapterIds = normalizeChapterIds(material.chapterIds);
    return !chapterIds.some((chapterId) => canonicalChapterIds.has(chapterId));
  }).map((m) => ({
    id: m.id,
    courseId,
    title: m.title.replace(/^\[DRAF\]\s*/, ""),
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: "Disusun otomatis",
    completed: completedSet.has(m.id),
    isPastYear: false,
    isPreview: true,
    chapterIds: normalizeChapterIds(m.chapterIds),
  }));

  const mappedWeb = webMaterials.filter((material) => !canonicalChapterIds.has(material.chapterId)).map((m) => ({
    id: m.id,
    courseId,
    chapterId: m.chapterId,
    title: m.title,
    kind: "article" as const,
    docCategory: "materi" as const,
    fileSize: "Disusun otomatis",
    completed: completedSet.has(m.id),
    isPastYear: false,
    isPreview: true,
    chapterIds: m.chapterId ? [m.chapterId] : [],
  }));

  const allMaterials = [...mappedCanonicalArticles, ...mappedCanonicalDiktats, ...mappedDiktats, ...mappedDb, ...mappedWeb];
  if (studentAccess?.tier === "free") {
    return allMaterials.filter((material) => {
      const isFreeProduct = material.kind === "article" || material.docCategory === "diktat";
      return isFreeProduct && isFreeChapterScoped(material.chapterIds, studentAccess.freeChapterIds);
    });
  }
  return allMaterials;
}

export type ChapterOutlineItem = {
  id: string;
  title: string;
  orderIndex: number;
  materialId: string | null;
  hasMaterial: boolean;
  completed: boolean;
  completionPercent: number;
};

/**
 * Published chapters for a course, each linked to its published website
 * material (if any) and the student's completion state. Powers the course
 * overview syllabus outline. Returns [] when the course has no published
 * chapters yet.
 */
export async function getCourseChapterOutline(
  courseId: string,
  studentId?: string
): Promise<ChapterOutlineItem[]> {
  const course = await resolveStudentCourse(courseId);
  const legacyCourseId = course?.legacyId ?? courseId;
  const canonicalRows = course?.canonicalId
    ? await db
        .select({
          id: bab.id,
          legacyChapterId: bab.legacyChapterId,
          title: bab.title,
          orderIndex: bab.orderIndex,
        })
        .from(bab)
        .where(and(eq(bab.mataKuliahId, course.canonicalId), eq(bab.status, "active")))
        .orderBy(bab.orderIndex)
    : [];
  const legacyRows = await db
    .select({ id: chaptersTable.id, title: chaptersTable.title, orderIndex: chaptersTable.orderIndex })
    .from(chaptersTable)
    .where(and(eq(chaptersTable.courseId, legacyCourseId), eq(chaptersTable.status, "published")))
    .orderBy(chaptersTable.orderIndex);
  const chapterRows = canonicalRows.length > 0
    ? canonicalRows.map((chapter) => ({
        id: chapter.legacyChapterId ?? chapter.id,
        canonicalId: chapter.id,
        title: chapter.title,
        orderIndex: chapter.orderIndex,
      }))
    : legacyRows.map((chapter) => ({ ...chapter, canonicalId: null }));

  if (chapterRows.length === 0) return [];

  const studentAccess = studentId ? await getStudentCourseAccess(studentId, courseId) : null;
  if (studentId && !studentAccess) return [];
  const visibleChapterRows = studentAccess?.tier === "free"
    ? chapterRows.filter((chapter) => isFreeChapterScoped(
        [chapter.id, "canonicalId" in chapter ? chapter.canonicalId : null],
        studentAccess.freeChapterIds,
      ))
    : chapterRows;

  const canonicalArticles = await getCanonicalPublishedArticlesForCourse(courseId, studentId);
  const canonicalByChapter = new Map<string, (typeof canonicalArticles)[number]>();
  for (const article of canonicalArticles) {
    for (const chapterId of [article.babId, article.chapterId, article.legacyChapterId]) {
      if (chapterId && !canonicalByChapter.has(chapterId)) canonicalByChapter.set(chapterId, article);
    }
  }

  const webRows = await db
    .select({ id: websiteMaterials.id, chapterId: websiteMaterials.chapterId })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, legacyCourseId), eq(websiteMaterials.status, "published")));

  const materialByChapter = new Map(webRows.map((w) => [w.chapterId, w.id]));

  const completedSet = new Set<string>();
  const percentByMaterial = new Map<string, number>();

  if (studentId) {
    if (webRows.length > 0) {
      const matIds = webRows.map((w) => w.id);
      const progRows = await db
        .select({
          materialId: studentMaterialProgress.materialId,
          completionPercent: studentMaterialProgress.completionPercent,
        })
        .from(studentMaterialProgress)
        .where(
          and(
            eq(studentMaterialProgress.studentId, studentId),
            inArray(studentMaterialProgress.materialId, matIds)
          )
        );
      for (const p of progRows) {
        percentByMaterial.set(p.materialId, p.completionPercent);
        if (p.completionPercent >= 90) completedSet.add(p.materialId);
      }
    }
    const legacyRows = await db
      .select({ materialId: progressTable.materialId })
      .from(progressTable)
      .where(and(eq(progressTable.userId, studentId), eq(progressTable.status, "completed")));
    for (const l of legacyRows) {
      if (l.materialId) completedSet.add(l.materialId);
    }
  }

  return visibleChapterRows.map((c) => {
    const legacyChapterId = c.canonicalId ? canonicalRows.find((chapter) => chapter.id === c.canonicalId)?.legacyChapterId : c.id;
    const canonicalArticle = canonicalByChapter.get(c.canonicalId ?? c.id) ?? (legacyChapterId ? canonicalByChapter.get(legacyChapterId) : undefined);
    const materialId = canonicalArticle?.id ?? materialByChapter.get(c.id) ?? null;
    if (canonicalArticle) {
      const completed = canonicalArticle.completed || completedSet.has(canonicalArticle.id);
      return {
        id: c.id,
        title: c.title,
        orderIndex: c.orderIndex,
        materialId,
        hasMaterial: true,
        completed,
        completionPercent: completed ? 100 : canonicalArticle.completionPercent,
      };
    }
    const completed = materialId ? completedSet.has(materialId) : false;
    const completionPercent = materialId
      ? percentByMaterial.get(materialId) ?? (completed ? 100 : 0)
      : 0;
    return {
      id: c.id,
      title: c.title,
      orderIndex: c.orderIndex,
      materialId,
      hasMaterial: Boolean(materialId),
      completed,
      completionPercent,
    };
  });
}

export async function getStudentVisibleCourseQuizzes(courseId: string, studentId?: string) {
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;
  const templates = await db
    .select()
    .from(quizTemplates)
    .where(
      and(
        eq(quizTemplates.courseId, compatibilityCourseId),
        eq(quizTemplates.status, "published"),
        ne(quizTemplates.category, "simulation")
      )
    )
    .orderBy(desc(quizTemplates.createdAt));
  if (!studentId) return templates;
  const access = await getStudentCourseAccess(studentId, courseId);
  if (!access) return [];
  if (access.tier !== "free") return templates;
  return templates.filter((template) => isFreeQuizTemplate(template, access.freeChapterIds));
}

export async function getCourseQuizzes(courseId: string, studentId?: string) {
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;
  let templates = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.courseId, compatibilityCourseId))
    .orderBy(desc(quizTemplates.createdAt));

  if (studentId) {
    const access = await getStudentCourseAccess(studentId, courseId);
    if (!access) return [];
    if (access.tier === "free") {
      templates = templates.filter((template) => isFreeQuizTemplate(template, access.freeChapterIds));
    }
  }

  const mappedQuizzes = templates.map((t) => ({
    id: t.id,
    courseId,
    title: t.title,
    type: "quiz" as const,
    status: "published" as const,
    settings: {
      timeLimitMinutes: t.timeLimitSeconds ? Math.floor(t.timeLimitSeconds / 60) : 15,
      maxAttempts: t.maxAttempts || 3
    },
    questions: [],
  }));

  return mappedQuizzes;
}

export async function getCourseTryouts(courseId: string, studentId?: string) {
  if (studentId) {
    const access = await getStudentCourseAccess(studentId, courseId);
    if (!access || access.tier === "free") return [];
  }
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;
  const dbTryouts = await db
    .select()
    .from(exams)
    .where(and(eq(exams.courseId, compatibilityCourseId), eq(exams.type, "tryout"), eq(exams.status, "published")));

  const mappedTryouts = dbTryouts.map((t) => {
    const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
    return {
      id: t.id,
      courseId,
      title: t.title,
      type: "tryout" as const,
      status: t.status,
      settings: settings || { timeLimitMinutes: 90, maxAttempts: 2 },
      questions: [],
    };
  });

  return mappedTryouts;
}

export async function getCourseSubmissions(courseId: string, studentId?: string) {
  if (!studentId) {
    return [];
  }
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;

  const dbAttempts = await db
    .select({
      id: studentQuizAttempts.id,
      title: quizTemplates.title,
      status: studentQuizAttempts.status,
      score: studentQuizAttempts.score,
      submittedAt: studentQuizAttempts.submittedAt,
    })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .where(
      and(
        eq(studentQuizAttempts.studentId, studentId),
        eq(quizTemplates.courseId, compatibilityCourseId),
        eq(studentQuizAttempts.status, "completed")
      )
    );

  const dbTryouts = await db
    .select({
      id: submissions.id,
      title: exams.title,
      status: submissions.status,
      score: submissions.score,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id))
    .where(
      and(
        eq(submissions.userId, studentId),
        eq(exams.courseId, compatibilityCourseId)
      )
    );

  const mappedSubmissions = [
    ...dbAttempts.map(a => ({
      id: a.id,
      courseId,
      examId: a.id,
      examTitle: a.title,
      examType: "quiz" as const,
      status: a.status === "completed" ? ("graded" as const) : ("pending_review" as const),
      score: a.score,
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : new Date().toISOString(),
    })),
    ...dbTryouts.map(t => ({
      id: t.id,
      courseId,
      examId: t.id,
      examTitle: t.title,
      examType: "tryout" as const,
      status: t.status as any,
      score: t.score,
      submittedAt: t.submittedAt ? t.submittedAt.toISOString() : new Date().toISOString(),
    }))
  ];

  return mappedSubmissions;
}

export async function getCourseLeaderboard(
  courseId: string,
  filterType: "quiz" | "simulation" | "all" = "quiz"
) {
  const course = await resolveStudentCourse(courseId);
  const compatibilityCourseId = course?.legacyId ?? courseId;
  const categoryCondition =
    filterType === "simulation"
      ? eq(quizTemplates.category, "simulation")
      : filterType === "quiz"
      ? ne(quizTemplates.category, "simulation")
      : undefined;

  // Fetch total published quizzes for the course to calculate proper averages
  const courseQuizzes = await db
    .select({ id: quizTemplates.id })
    .from(quizTemplates)
    .where(
      and(
        eq(quizTemplates.courseId, compatibilityCourseId),
        eq(quizTemplates.status, "published"),
        categoryCondition
      )
    );
  const totalQuizzes = Math.max(1, courseQuizzes.length);

  // Fetch all completed attempts for the course
  const attempts = await db
    .select({
      studentId: studentQuizAttempts.studentId,
      studentName: user.name,
      score: studentQuizAttempts.score,
      durationSeconds: studentQuizAttempts.durationSeconds,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
    })
    .from(studentQuizAttempts)
    .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
    .innerJoin(user, eq(studentQuizAttempts.studentId, user.id))
    .where(
      and(
        eq(quizTemplates.courseId, compatibilityCourseId),
        eq(studentQuizAttempts.status, "completed"),
        categoryCondition
      ),
    );

  const studentData: Record<string, {
    studentId: string;
    studentName: string;
    attemptsCount: number;
    totalScore: number;
    totalDuration: number;
    correctHardCount: number;
    attemptedMediumCount: number;
  }> = {};

  for (const attempt of attempts) {
    const studentId = attempt.studentId;
    if (!studentData[studentId]) {
      studentData[studentId] = {
        studentId,
        studentName: attempt.studentName || "Siswa",
        attemptsCount: 0,
        totalScore: 0,
        totalDuration: 0,
        correctHardCount: 0,
        attemptedMediumCount: 0,
      };
    }

    const data = studentData[studentId];
    data.attemptsCount++;
    data.totalScore += attempt.score ?? 0;
    data.totalDuration += attempt.durationSeconds ?? 0;

    let questions: any[] = [];
    try {
      questions = typeof attempt.questionsSnapshot === "string"
        ? JSON.parse(attempt.questionsSnapshot)
        : (attempt.questionsSnapshot as any) || [];
      if (!Array.isArray(questions)) questions = [];
    } catch {
      questions = [];
    }

    let answers: Record<string, any> = {};
    try {
      answers = typeof attempt.answersSnapshot === "string"
        ? JSON.parse(attempt.answersSnapshot)
        : (attempt.answersSnapshot as any) || {};
      if (typeof answers !== "object") answers = {};
    } catch {
      answers = {};
    }

    for (const q of questions) {
      const difficulty = q.difficulty || "medium";
      if (difficulty === "hard") {
        const correctIndices = q.correct_indices || q.correctIndices || [];
        const submitted = answers[q.id] ?? [];
        const isCorrect =
          Array.isArray(submitted) &&
          Array.isArray(correctIndices) &&
          submitted.length === correctIndices.length &&
          submitted.every((i) => correctIndices.includes(i));
        if (isCorrect) {
          data.correctHardCount++;
        }
      } else if (difficulty === "medium") {
        data.attemptedMediumCount++;
      }
    }
  }

  const leaderboardList = Object.values(studentData).map((data) => {
    const avgScore = Number((data.totalScore / totalQuizzes).toFixed(1));
    const avgDuration = Number((data.totalDuration / data.attemptsCount).toFixed(1));
    return {
      studentId: data.studentId,
      userId: data.studentId, // legacy/compatibility
      displayName: data.studentName, // legacy/compatibility
      studentName: data.studentName,
      attemptCount: data.attemptsCount,
      attempts: data.attemptsCount, // legacy/compatibility
      avgScore,
      score: avgScore, // legacy/compatibility
      avgDuration,
      correctHardCount: data.correctHardCount,
      attemptedMediumCount: data.attemptedMediumCount,
    };
  });

  // Sort based on:
  // 1. avgScore (descending)
  // 2. avgDuration (ascending)
  // 3. correctHardCount (descending)
  // 4. attemptedMediumCount (descending)
  leaderboardList.sort((a, b) => {
    if (b.avgScore !== a.avgScore) {
      return b.avgScore - a.avgScore;
    }
    if (a.avgDuration !== b.avgDuration) {
      return a.avgDuration - b.avgDuration;
    }
    if (b.correctHardCount !== a.correctHardCount) {
      return b.correctHardCount - a.correctHardCount;
    }
    return b.attemptedMediumCount - a.attemptedMediumCount;
  });

  return leaderboardList.map((item, i) => ({
    ...item,
    rank: i + 1,
  }));
}
