import { db } from "@/db";
import { artikel, diktatMateri, progress, user } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { getCourse, getCourseChapterOutline, getStudentCourseAccess, normalizeChapterIds } from "@/lib/course-utils";
import { getCourseOverviewData } from "@/lib/learning-analytics";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { isPkaEnrolled } from "@/lib/pka-enrollment";
import { canAccessCourseContent, hasChapterScopeWithin } from "@/lib/student/course-access";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { loadStudentCourseCatalog } from "@/lib/student/course-catalog-view-data";
import { getDashboardCourseMaterialsBatch } from "@/lib/student/dashboard-materials";
import { loadCourseMaterialData } from "@/lib/student/course-material-list";
import {
  loadOnboardingData,
  loadPrimaryLearningData,
  loadRecommendedCoursesData,
} from "@/app/(student)/dashboard/dashboard-sections";
import type { CourseCard, LearningData, LearningQuery, MaterialRow } from "@/packages/native-parity/student/courses/contract";

type NativeLearningResult = LearningData | { status: 403 | 404 };
type Course = NonNullable<Awaited<ReturnType<typeof getCourse>>>;
type Access = NonNullable<Awaited<ReturnType<typeof getStudentCourseAccess>>>;
type DocumentRow = Awaited<ReturnType<typeof loadCourseMaterialData>>["materialsWithLockState"][number];

function projectCourse(course: Pick<Course, "id" | "title" | "category" | "description">, hasFullContentAccess: boolean): CourseCard {
  return {
    id: course.id,
    title: course.title,
    category: course.category,
    description: course.description,
    hasFullContentAccess,
  };
}

async function loadDashboard(studentId: string): Promise<LearningData> {
  const [enrollments, [profile]] = await Promise.all([
    listStudentEnrollments(studentId),
    db.select({ name: user.name, faculty: user.faculty, major: user.major, entryYear: user.entryYear })
      .from(user).where(eq(user.id, studentId)).limit(1),
  ]);
  const userSeed = { id: studentId, ...profile };
  const firstName = profile?.name?.trim().split(/\s+/u)[0] ?? "";

  if (enrollments.length === 0) {
    const { catalogCourses } = await loadOnboardingData(userSeed);
    return {
      view: "dashboard",
      firstName,
      enrolled: [],
      continueReading: [],
      recommended: catalogCourses.map((course) => ({ ...projectCourse(course, false), materialsCount: course.materialsCount, quizzesCount: course.quizzesCount, tryoutsCount: course.tryoutsCount })),
    };
  }

  // Re-read the same course policies before returning personal learning rows.
  const checks = await Promise.all(enrollments.map(async (course) => ({ course, access: await getStudentCourseAccess(studentId, course.id) })));
  const active = checks.filter(({ access }) => access?.hasFullContentAccess && access.isEnrolled);
  const activeCourses = active.map(({ course }) => course);
  const activeCourseIds = activeCourses.map(({ id }) => id);
  const [primary, { recommendedCourses }] = await Promise.all([
    loadPrimaryLearningData(studentId, activeCourses, {
      getMaterialsProgress: () => db.select().from(progress).where(eq(progress.userId, studentId)),
      getDashboardCourseMaterialsBatch: (courseIds) => getDashboardCourseMaterialsBatch(courseIds, studentId),
      // The next-step cache is owned by the study path route. This view needs
      // reading resume and active course metadata.
      getNextConceptsForCourses: async () => ({}),
    }),
    loadRecommendedCoursesData(userSeed, activeCourseIds),
  ]);
  const allowedByCourse = new Map(active.map(({ course, access }) => [course.id, access] as const));

  return {
    view: "dashboard",
    firstName,
    enrolled: activeCourses.map((course) => ({
      ...projectCourse(course, true),
      materialsCount: primary.materialsByCourseId.get(course.id)?.length ?? 0,
    })),
    recommended: recommendedCourses.map((course) => ({
      ...projectCourse({ ...course, description: "" }, false),
      materialsCount: course.materialsCount,
    })),
    continueReading: primary.inProgressDocuments.flatMap((document) => {
      const access = allowedByCourse.get(document.courseId);
      const chapterIds = normalizeChapterIds(document.chapterIds);
      if (!access || !canAccessCourseContent(access.policy, document.docCategory === "diktat" ? "diktat" : "article", chapterIds)) return [];
      return [{
        courseId: document.courseId,
        courseTitle: document.courseTitle,
        materialId: document.id,
        title: document.title,
        completionPercent: document.completionPercent,
        section: document.lastSectionId,
      }];
    }),
  };
}

function documentChapterIds(row: DocumentRow): string[] {
  const chapterIds = normalizeChapterIds(row.chapterIds);
  return "chapterId" in row && row.chapterId ? [...new Set([...chapterIds, row.chapterId])] : chapterIds;
}

function canOpenDocument(access: Access, row: DocumentRow): boolean {
  const chapterIds = documentChapterIds(row);
  if (row.kind === "quiz" || row.kind === "tryout" || row.kind === "solution_collection") return !row.locked;
  if (row.kind === "pdf" && row.docCategory !== "diktat" && hasChapterScopeWithin(chapterIds, access.policy.scopedChapterIds)) return true;
  return canAccessCourseContent(access.policy, row.docCategory === "diktat" ? "diktat" : "article", chapterIds);
}

async function findCanonicalDetail(courseId: string, materialId: string) {
  const [articles, handbooks] = await Promise.all([
    db.select({ id: artikel.id, title: artikel.title, chapterId: artikel.babId })
      .from(artikel)
      .where(and(eq(artikel.mataKuliahId, courseId), eq(artikel.status, "published"), or(eq(artikel.id, materialId), eq(artikel.slug, materialId))))
      .limit(2),
    db.select({ id: diktatMateri.id, title: diktatMateri.title, chapterId: diktatMateri.babId })
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

export async function loadNativeCourseData(studentId: string, query: LearningQuery): Promise<NativeLearningResult> {
  if (query.view === "dashboard") return loadDashboard(studentId);
  if (query.view === "catalog") {
    const { groups, studentTargetCategory } = await loadStudentCourseCatalog(studentId);
    return {
      view: "catalog",
      targetCategory: studentTargetCategory,
      courses: groups.flatMap((group) => group.courses.map((course) => ({
        ...projectCourse(course, Boolean(course.hasFullContentAccess)),
        category: group.jurusan,
        priority: group.isStudentMajor,
        materialsCount: course.materialsCount,
        quizzesCount: course.quizzesCount,
        tryoutsCount: course.tryoutsCount,
      }))),
    };
  }

  if (!("courseId" in query)) return { status: 404 };
  const id = query.courseId;
  const [course, access] = await Promise.all([getCourse(id), getStudentCourseAccess(studentId, id)]);
  if (!course) return { status: 404 };
  if (!access) return { status: 403 };
  if (course.id === PKA_COURSE_ID && !(await isPkaEnrolled(studentId))) return { status: 403 };
  const courseCard = projectCourse({ ...course, description: course.description.split(" - ")[0] ?? "" }, access.hasFullContentAccess);

  if (query.view === "course") {
    const chapters = await getCourseChapterOutline(id, studentId);
    const overview = access.hasFullContentAccess ? await getCourseOverviewData(studentId, id, chapters) : null;
    return {
      view: "course",
      course: courseCard,
      chapters: chapters.map(({ id, title, materialId, completionPercent, completed }) => ({ id, title, materialId, completionPercent, completed })),
      actions: overview ? (["reading", "quiz", "schedule"] as const).map((key) => ({
        key, title: overview[key].title, meta: overview[key].meta, path: overview[key].href,
      })) : [],
    };
  }

  if (query.view === "material-detail") {
    const canonical = access.canonicalCourseId ? await findCanonicalDetail(access.canonicalCourseId, query.materialId) : null;
    if (canonical && "ambiguous" in canonical) return { status: 404 };
    if (canonical && !canAccessCourseContent(access.policy, canonical.policyKind, [canonical.chapterId])) {
      return {
        view: "material-detail",
        course: courseCard,
        material: { id: canonical.id, title: canonical.title, kind: "article", group: canonical.group, completed: false, locked: true },
      };
    }

    const data = await loadCourseMaterialData({ id, studentId, course });
    const row = data.materialsWithLockState.find((material) => material.id === (canonical?.id ?? query.materialId));
    if (canonical) {
      return {
        view: "material-detail",
        course: courseCard,
        material: { id: canonical.id, title: row?.title ?? canonical.title, kind: "article", group: canonical.group, completed: Boolean(row?.completed), locked: false },
      };
    }
    if (!row || (row.kind !== "article" && row.kind !== "pdf")) return { status: 404 };
    const locked = !canOpenDocument(access, row);
    return {
      view: "material-detail",
      course: courseCard,
      material: { id: row.id, title: row.title, kind: row.kind, group: row.tabGroup, completed: !locked && row.completed, locked },
    };
  }

  const data = await loadCourseMaterialData({ id, studentId, course });
  return {
    view: "material-list",
    course: courseCard,
    chapters: data.courseChapters.map(({ id, title, canonicalId, legacyChapterId }) => ({
      id,
      title,
      aliases: [...new Set([id, canonicalId, legacyChapterId].filter((value): value is string => Boolean(value)))],
    })),
    materials: data.materialsWithLockState.map((row): MaterialRow => {
      const locked = !canOpenDocument(access, row);
      return { id: row.id, title: row.title, group: row.tabGroup, kind: row.kind, locked, completed: !locked && row.completed, chapterIds: documentChapterIds(row), meta: "fileSize" in row ? row.fileSize : undefined };
    }),
  };
}
