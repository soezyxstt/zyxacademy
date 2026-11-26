import { db } from "@/db";
import { aiMaterialInstances, artikel, courseMaterials, diktatMateri, diktats, progress, studentMaterialProgress, user, websiteMaterials } from "@/db/schema";
import { and, eq, notLike, or } from "drizzle-orm";
import { getCourse, getCourseChapterOutline, getStudentCourseAccess, normalizeChapterIds } from "@/lib/course-utils";
import { getMaterialArticleSummaries } from "@/app/(student)/courses/[id]/material/canonical-summaries";
import { env } from "@/lib/env";
import { getCourseOverviewData } from "@/lib/learning-analytics";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { isPkaEnrolled } from "@/lib/pka-enrollment";
import { canAccessCourseContent, hasChapterScopeWithin } from "@/lib/student/course-access";
import { listStudentEnrollments, type StudentEnrollmentRecord } from "@/lib/student/course-catalog";
import { loadStudentCourseCatalog } from "@/lib/student/course-catalog-view-data";
import { getDashboardCourseMaterialsBatch } from "@/lib/student/dashboard-materials";
import { loadCourseMaterialData } from "@/lib/student/course-material-list";
import {
  loadOnboardingData,
  loadPrimaryLearningData,
  loadRecommendedCoursesData,
} from "@/app/(student)/dashboard/dashboard-sections";
import { getWhatsAppAdminChatHref } from "@/lib/whatsapp-admin";
import type { CourseCard, LearningData, LearningQuery, MaterialDetailData, MaterialRow } from "@/packages/native-parity/student/courses/contract";

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

function serializePricing(pricing: Access["policy"]["pricing"]): CourseCard["pricing"] {
  const serialize = (date: Date | null) => date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  return { category: pricing.category, startsAt: serialize(pricing.startsAt), endsAt: serialize(pricing.endsAt) };
}

async function findActiveDashboardCourses(studentId: string, enrollments: StudentEnrollmentRecord[]) {
  const checks = await Promise.all(enrollments.map(async (course) => ({ course, access: await getStudentCourseAccess(studentId, course.id) })));
  return checks.filter(({ access }) => access?.hasFullContentAccess && access.isEnrolled);
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
    const { catalogCourses, studentTargetCategory } = await loadOnboardingData(userSeed);
    return {
      view: "dashboard",
      firstName,
      enrolled: [],
      continueReading: [],
      recommended: catalogCourses.map((course) => ({ ...projectCourse(course, false), materialsCount: course.materialsCount, quizzesCount: course.quizzesCount, tryoutsCount: course.tryoutsCount })),
      preview: {
        targetCategory: studentTargetCategory,
        courses: catalogCourses.map(course => ({
          id: course.id,
          title: course.title,
          category: course.category,
          pricing: course.pricing ? serializePricing(course.pricing) : undefined,
          freeChapters: course.freeChapters.map(({ id, title, completed }) => ({ id, title, completed })),
          freeMaterialCount: course.freeMaterialCount,
          completedFreeMaterialCount: course.completedFreeMaterialCount,
          freeQuizCount: course.freeQuizCount,
          firstIncompleteMaterialId: course.firstIncompleteMaterialId,
        })),
      },
    };
  }

  // Re-read the same course policies before returning personal learning rows.
  const active = await findActiveDashboardCourses(studentId, enrollments);
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
    completedMaterialsByCourse: Object.fromEntries(activeCourses.map(course => [course.id,
      (primary.materialsByCourseId.get(course.id) ?? []).filter(material => material.completed || primary.completedIds.has(material.id)).length,
    ])),
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
  const chapterIds = Array.isArray(row.chapterIds) ? [...row.chapterIds] : [];
  if ("chapterId" in row && row.chapterId) chapterIds.push(row.chapterId);
  if (row.kind === "quiz") return row.canOpen;
  if (row.kind === "tryout") return access.hasFullContentAccess;
  if (row.kind === "solution_collection") return canAccessCourseContent(access.policy, "article", chapterIds);
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

async function hasCompletedMaterial(studentId: string, materialId: string): Promise<boolean> {
  const [[legacy], [current]] = await Promise.all([
    db.select({ id: progress.id }).from(progress)
      .where(and(eq(progress.userId, studentId), eq(progress.materialId, materialId), eq(progress.status, "completed"))).limit(1),
    db.select({ completionPercent: studentMaterialProgress.completionPercent }).from(studentMaterialProgress)
      .where(and(eq(studentMaterialProgress.studentId, studentId), eq(studentMaterialProgress.materialId, materialId))).limit(1),
  ]);
  return Boolean(legacy || (current && current.completionPercent >= 90));
}

async function findLegacyDetail(
  studentId: string,
  materialId: string,
  course: Course,
  access: Access,
): Promise<MaterialDetailData["material"] | null> {
  const id = course.legacyId ?? course.id;
  const [[diktat], [webArticle], [manual], [generatedArticle]] = await Promise.all([
    db.select({ title: diktats.title, chapterIds: diktats.chapterIds }).from(diktats)
      .where(and(eq(diktats.id, materialId), eq(diktats.courseId, id), eq(diktats.status, "ready"))).limit(1),
    db.select({ title: websiteMaterials.title, chapterId: websiteMaterials.chapterId }).from(websiteMaterials)
      .where(and(eq(websiteMaterials.id, materialId), eq(websiteMaterials.courseId, id), eq(websiteMaterials.status, "published"))).limit(1),
    db.select({ title: courseMaterials.title, chapterIds: courseMaterials.chapterIds }).from(courseMaterials)
      .where(and(eq(courseMaterials.id, materialId), eq(courseMaterials.courseId, id))).limit(1),
    db.select({ title: aiMaterialInstances.title, chapterIds: aiMaterialInstances.chapterIds }).from(aiMaterialInstances)
      .where(and(eq(aiMaterialInstances.id, materialId), eq(aiMaterialInstances.courseId, id), notLike(aiMaterialInstances.title, "[DRAF]%"))).limit(1),
  ]);
  // Use the same source priority as the web reader. Each lookup is
  // course-bound, even when an identifier also exists in another course.
  const reference = diktat ?? webArticle ?? manual ?? generatedArticle;
  if (!reference) return null;
  const isManual = reference === manual;
  const isDiktat = reference === diktat;
  const title = reference === generatedArticle ? reference.title.replace(/^\[DRAF\]\s*/u, "") : reference.title;
  const chapterIds = "chapterId" in reference ? [reference.chapterId]
    : Array.isArray(reference.chapterIds) ? reference.chapterIds : [];
  const isFreePdf = isManual && hasChapterScopeWithin(chapterIds, access.policy.scopedChapterIds);
  const locked = !isFreePdf && !canAccessCourseContent(access.policy, isDiktat ? "diktat" : "article", chapterIds);
  const kind = isDiktat || isManual ? "pdf" : "article";
  const group = isDiktat ? "diktat" : isManual ? "pdf" : "materi";
  const completed = !locked && await hasCompletedMaterial(studentId, materialId);
  return { id: materialId, title, kind, group, completed, locked };
}

export async function loadNativeCourseData(studentId: string, query: LearningQuery): Promise<NativeLearningResult> {
  if (query.view === "dashboard") return loadDashboard(studentId);
  if (query.view === "dashboard-extras") {
    const { loadNativeDashboardExtras } = await import("./native-dashboard-extras");
    const active = await findActiveDashboardCourses(studentId, await listStudentEnrollments(studentId));
    return loadNativeDashboardExtras(studentId, active.map(({ course }) => course));
  }
  if (query.view === "catalog") {
    const { groups, studentTargetCategory } = await loadStudentCourseCatalog(studentId);
    return {
      view: "catalog",
      targetCategory: studentTargetCategory,
      supportUrl: getWhatsAppAdminChatHref(),
      courses: groups.flatMap((group) => group.courses.map((course) => ({
        ...projectCourse(course, Boolean(course.hasFullContentAccess)),
        category: group.jurusan,
        priority: group.isStudentMajor,
        materialsCount: course.materialsCount,
        quizzesCount: course.quizzesCount,
        tryoutsCount: course.tryoutsCount,
        pricing: course.pricing ? serializePricing(course.pricing) : undefined,
      }))),
    };
  }

  const id = query.courseId;
  const [course, access] = await Promise.all([getCourse(id), getStudentCourseAccess(studentId, id)]);
  if (!course) return { status: 404 };
  if (!access) return { status: 403 };
  if (course.id === PKA_COURSE_ID && !(await isPkaEnrolled(studentId))) return { status: 403 };
  const courseCard = {
    ...projectCourse({ ...course, description: course.description.split(" - ")[0] ?? "" }, access.hasFullContentAccess),
    pricing: serializePricing(access.policy.pricing),
  };

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
      attention: overview?.attention?.items.map((item) => ({
        kind: item.kind,
        title: item.conceptName ?? item.label,
        path: item.href,
        count: item.count,
        masteryScore: item.masteryScore,
      })),
      liveEnabled: env.FEATURE_LIVE === "1",
    };
  }

  if (query.view === "material-detail") {
    const canonical = access.canonicalCourseId ? await findCanonicalDetail(access.canonicalCourseId, query.materialId) : null;
    if (canonical && "ambiguous" in canonical) return { status: 404 };
    if (canonical) {
      const locked = !canAccessCourseContent(access.policy, canonical.policyKind, [canonical.chapterId]);
      const [summaries, legacyCompleted] = locked ? [[], false] as const : await Promise.all([
        canonical.group === "materi" ? getMaterialArticleSummaries(id, studentId, canonical.id) : [],
        hasCompletedMaterial(studentId, canonical.id),
      ]);
      return {
        view: "material-detail",
        course: courseCard,
        material: {
          id: canonical.id,
          title: canonical.title,
          kind: "article",
          group: canonical.group,
          completed: legacyCompleted || Boolean(summaries[0]?.completed),
          locked,
        },
      };
    }

    const material = await findLegacyDetail(studentId, query.materialId, course, access);
    return material ? { view: "material-detail", course: courseCard, material } : { status: 404 };
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
