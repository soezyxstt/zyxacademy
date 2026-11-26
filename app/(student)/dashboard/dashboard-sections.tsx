import { cache } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CheckCircle2,
  ClipboardList,
  Compass,
  GraduationCap,
  History,
  Layers,
  Play,
} from "lucide-react";
import {
  getMaterialsProgress,
  getStudentSubmissions,
} from "@/app/(student)/dashboard/actions";
import { CoursePricingLabel } from "@/components/course/course-pricing-label";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { MathText } from "@/components/course/math-text";
import { ActivateClassModal } from "@/components/dashboard/activate-class-modal";
import { CompleteProfileDialog } from "@/components/dashboard/complete-profile-dialog";
import {
  DashboardInlineEmpty,
  DashboardSectionCount,
  DashboardSectionHeading,
} from "@/components/dashboard/dashboard-section-heading";
import {
  StudentOnboardingView,
  type CatalogCourse,
} from "@/components/dashboard/student-onboarding-view";
import { TodayPlan } from "@/components/dashboard/today-plan";
import { WeeklyReflection } from "@/components/dashboard/weekly-reflection";
import { TranslatedText } from "@/components/i18n/translated-text";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import {
  courses,
  flashcard as canonicalFlashcard,
  flashcardReviews,
  flashcards,
  flashcardSets,
  kemajuanFlashcardMurid,
  mataKuliah,
  reviewFlashcard,
  setFlashcard,
  studentMaterialProgress,
  user as userTable,
  weeklyReflections,
} from "@/db/schema";
import {
  getCourseChapterOutline,
  getCourseMaterials,
  getCourseQuizzes,
  getCourseTryouts,
  getStudentCourses,
} from "@/lib/course-utils";
import { getReviewQueue } from "@/lib/flashcard-actions";
import { getDashboardReviewSummary } from "@/lib/student/dashboard-review-summary";
import { getMastery } from "@/lib/mastery-store";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { getOrUpdateStreak } from "@/lib/streak-service";
import {
  type StudentEnrollmentRecord,
} from "@/lib/student/course-catalog";
import { getCourseCatalogStatsMap } from "@/lib/student/course-catalog-stats";
import { getDashboardCourseMaterialsBatch } from "@/lib/student/dashboard-materials";
import { resolveCourseAccessBatch } from "@/lib/student/course-access";
import type { StudentCourseAccess } from "@/lib/course-utils";
import {
  getCatalogCourseSummaries,
  getDashboardCourseExamsBatch,
  getDashboardStudentSubmissionSummaries,
} from "@/lib/student/dashboard-read-model";
import {
  getStudentTargetCategory,
  isCourseMatchingMajor,
} from "@/lib/student/itb-academic-data";
import { getNextConceptsForCourses, getOrComputeStudyPath } from "@/lib/study-path-service";
import { cn } from "@/lib/utils";

const TEST_COURSE_IDS = new Set([
  "embed-test-course",
  "miscon-test-course",
  "remed-test-course",
  "term-test-course",
  "graph-test-course",
]);

export type DashboardUserSeed = {
  id?: string | null;
  name?: string | null;
  faculty?: string | null;
  major?: string | null;
  entryYear?: number | null;
};

const defaultDeps = {
  async queryUserAcademicFields(userId: string) {
    const [dbUser] = await db
      .select({
        faculty: userTable.faculty,
        major: userTable.major,
        entryYear: userTable.entryYear,
      })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);
    return dbUser ?? null;
  },
  async queryLatestWeeklyReflection(userId: string) {
    const rows = await db
      .select()
      .from(weeklyReflections)
      .where(eq(weeklyReflections.studentId, userId))
      .orderBy(desc(weeklyReflections.weekStart))
      .limit(1);
    return rows[0] ?? null;
  },
  async queryInProgressMaterialProgress(userId: string) {
    return db
      .select({
        materialId: studentMaterialProgress.materialId,
        completionPercent: studentMaterialProgress.completionPercent,
        lastSectionId: studentMaterialProgress.lastSectionId,
      })
      .from(studentMaterialProgress)
      .where(
        and(
          eq(studentMaterialProgress.studentId, userId),
          sql`${studentMaterialProgress.completionPercent} > 0`,
          sql`${studentMaterialProgress.completionPercent} < 100`,
        ),
      );
  },
  async queryRecentFlashcardReviews(userId: string) {
    const [legacyRows, canonicalRows] = await Promise.all([
      db
        .select({
          id: flashcardReviews.id,
          grade: flashcardReviews.grade,
          reviewedAt: flashcardReviews.reviewedAt,
          front: flashcards.front,
          back: flashcards.back,
          courseTitle: courses.title,
        })
        .from(flashcardReviews)
        .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
        .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
        .innerJoin(courses, eq(flashcardSets.courseId, courses.id))
        .where(eq(flashcardReviews.studentId, userId))
        .orderBy(desc(flashcardReviews.reviewedAt))
        .limit(5),
      db
        .select({
          id: reviewFlashcard.id,
          grade: reviewFlashcard.grade,
          reviewedAt: reviewFlashcard.reviewedAt,
          front: canonicalFlashcard.front,
          back: canonicalFlashcard.back,
          courseTitle: mataKuliah.title,
        })
        .from(reviewFlashcard)
        .innerJoin(kemajuanFlashcardMurid, eq(reviewFlashcard.kemajuanFlashcardMuridId, kemajuanFlashcardMurid.id))
        .innerJoin(canonicalFlashcard, eq(kemajuanFlashcardMurid.flashcardId, canonicalFlashcard.id))
        .innerJoin(setFlashcard, eq(canonicalFlashcard.setFlashcardId, setFlashcard.id))
        .innerJoin(mataKuliah, eq(setFlashcard.mataKuliahId, mataKuliah.id))
        .where(eq(kemajuanFlashcardMurid.penggunaId, userId))
        .orderBy(desc(reviewFlashcard.reviewedAt))
        .limit(5),
    ]);
    return [...legacyRows, ...canonicalRows]
      .sort((left, right) => right.reviewedAt.getTime() - left.reviewedAt.getTime())
      .slice(0, 5);
  },
  getMaterialsProgress,
  getStudentSubmissions,
  getDashboardStudentSubmissionSummaries,
  getCourseChapterOutline,
  getCourseMaterials,
  getDashboardCourseMaterialsBatch,
  getCourseQuizzes,
  getCourseTryouts,
  getDashboardCourseExamsBatch,
  getCatalogCourseSummaries,
  listStudentCourses: getStudentCourses,
  getOrUpdateStreak,
  getMastery,
  getOrComputeStudyPath,
  getNextConceptsForCourses,
  getReviewQueue,
  getDashboardReviewSummary,
  isPkaEnabled: () => true,
};

export type DashboardSectionDeps = typeof defaultDeps;

function withDeps(deps?: Partial<DashboardSectionDeps>): DashboardSectionDeps {
  return deps ? { ...defaultDeps, ...deps } : defaultDeps;
}

export async function resolveStudentAcademicProfile(
  user: DashboardUserSeed | null | undefined,
  deps?: Partial<DashboardSectionDeps>,
) {
  const d = withDeps(deps);
  let faculty = user?.faculty ?? null;
  let major = user?.major ?? null;
  let entryYear = user?.entryYear ?? null;
  let missingFields = { faculty: false, major: false, entryYear: false };
  let isProfileIncomplete = false;

  if (user?.id && (!faculty || !major || !entryYear)) {
    try {
      const dbUser = await d.queryUserAcademicFields(user.id);
      if (dbUser) {
        faculty = faculty ?? dbUser.faculty;
        major = major ?? dbUser.major;
        entryYear = entryYear ?? dbUser.entryYear;
      }
      missingFields = { faculty: !faculty, major: !major, entryYear: !entryYear };
      isProfileIncomplete = missingFields.faculty || missingFields.major || missingFields.entryYear;
    } catch (error) {
      unstable_rethrow(error);
      console.error("[Dashboard] Failed to query academic profile fields:", error);
    }
  }

  return {
    faculty,
    major,
    entryYear,
    missingFields,
    isProfileIncomplete,
    targetCategory: getStudentTargetCategory(major, entryYear),
  };
}

const getCachedAcademicProfile = cache(
  async (userId: string, faculty: string | null, major: string | null, entryYear: number | null) =>
    resolveStudentAcademicProfile({ id: userId, faculty, major, entryYear }),
);

export async function getStudentAcademicProfile(
  user: DashboardUserSeed | null | undefined,
  deps?: Partial<DashboardSectionDeps>,
) {
  if (deps || !user?.id) return resolveStudentAcademicProfile(user, deps);
  return getCachedAcademicProfile(user.id, user.faculty ?? null, user.major ?? null, user.entryYear ?? null);
}

export async function syncDashboardStreak(
  userId: string | null | undefined,
  deps?: Partial<DashboardSectionDeps>,
) {
  if (!userId) return null;
  try {
    return await withDeps(deps).getOrUpdateStreak(userId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error loading streak:", error);
    return null;
  }
}

export async function loadOnboardingData(
  user: DashboardUserSeed | null | undefined,
  deps?: Partial<DashboardSectionDeps>,
): Promise<{ catalogCourses: CatalogCourse[]; studentTargetCategory: string | null }> {
  const d = withDeps(deps);
  const [profile, dbCourses] = await Promise.all([
    getStudentAcademicProfile(user, deps),
    user?.id ? d.listStudentCourses() : Promise.resolve([]),
  ]);

  if (!user?.id) {
    return { catalogCourses: [], studentTargetCategory: profile.targetCategory };
  }

  const userId = user.id;
  const pkaEnabled = d.isPkaEnabled();
  const activeCourses = dbCourses.filter(
    (c) =>
      !TEST_COURSE_IDS.has(c.id) &&
      (c.id !== PKA_COURSE_ID || pkaEnabled) &&
      isCourseMatchingMajor(c.category, profile.major, profile.entryYear),
  );

  const courseIds = activeCourses.map((course) => course.id);
  const useIndividualReaders = Boolean(deps?.getCourseChapterOutline || deps?.getCourseMaterials || deps?.getCourseQuizzes);
  const [summaries, courseDetails] = await Promise.all([
    d.getCatalogCourseSummaries(activeCourses),
    (async () => {
      const policies = useIndividualReaders ? null : await resolveCourseAccessBatch(userId, courseIds);
      const preloaded = policies ? new Map(activeCourses.map((course) => {
        const policy = policies.get(course.id);
        const access: StudentCourseAccess | null = policy?.isAuthenticated && policy.hasCourseAccess && policy.tier !== "anonymous"
          ? { courseId: policy.courseId ?? course.id, canonicalCourseId: policy.canonicalCourseId,
              legacyCourseId: policy.legacyCourseId, tier: policy.tier === "free" ? "free" : "standard",
              isEnrolled: policy.isEnrolled, hasFullContentAccess: policy.hasFullContentAccess, freeChapterIds: policy.freeChapterIds, policy }
          : null;
        return [course.id, { course, access }] as const;
      })) : undefined;
      const [materialEntries, examEntries] = useIndividualReaders
        ? [null, null]
        : await Promise.all([
            d.getDashboardCourseMaterialsBatch(courseIds, userId, undefined, { includeOutline: true, preloaded }),
            d.getDashboardCourseExamsBatch(courseIds, userId, { quizCountOnly: true, preloaded }),
          ]);
      return Promise.all(activeCourses.map(async (course, index) => {
      const [chapterOutline, freeMaterials, freeQuizzes] = useIndividualReaders
        ? await Promise.all([
            d.getCourseChapterOutline(course.id, userId),
            d.getCourseMaterials(course.id, userId),
            d.getCourseQuizzes(course.id, userId),
          ])
        : [materialEntries![index].chapterOutline ?? [], materialEntries![index].materials, examEntries![index].quizzes] as const;
      const completedMaterialCount = freeMaterials.filter(
        (material) =>
          material.completed ||
          ("completionPercent" in material &&
            typeof material.completionPercent === "number" &&
            material.completionPercent >= 100),
      ).length;
      const firstIncompleteChapter = chapterOutline.find(
        (chapter) => chapter.hasMaterial && !chapter.completed,
      );
      return {
        freeChapters: chapterOutline.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          completed: chapter.completed,
          completionPercent: chapter.completionPercent,
          materialId: chapter.materialId,
        })),
        freeMaterialCount: freeMaterials.length,
        completedFreeMaterialCount: completedMaterialCount,
        freeQuizCount: freeQuizzes.length,
        firstIncompleteMaterialId: firstIncompleteChapter?.materialId ?? null,
      };
      }));
    })(),
  ]);
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const catalogCourses = activeCourses.map((course, index) => ({
    ...(summaryById.get(course.id) ?? {
      id: course.id,
      title: course.title,
      category: course.category,
      description: course.description,
      materialsCount: 0,
      quizzesCount: 0,
      tryoutsCount: 0,
    }),
    ...courseDetails[index],
    pricing: course.pricing,
  }));

  return { catalogCourses, studentTargetCategory: profile.targetCategory };
}

export async function loadPrimaryLearningData(
  userId: string | null | undefined,
  enrollments: ReadonlyArray<StudentEnrollmentRecord>,
  deps?: Partial<DashboardSectionDeps>,
) {
  const d = withDeps(deps);
  const loadNextConcepts = async (): Promise<Record<string, string>> => {
    const nextConcepts: Record<string, string> = {};
    if (!userId || enrollments.length === 0) return nextConcepts;
    try {
      if (deps?.getOrComputeStudyPath && !deps.getNextConceptsForCourses) {
        await Promise.all(enrollments.map(async (course) => {
          const path = await d.getOrComputeStudyPath(userId, course.id);
          const active = path.find((step) => step.status === "available" || step.status === "in_progress");
          if (active) nextConcepts[course.id] = active.conceptName;
        }));
      } else {
        Object.assign(nextConcepts, await d.getNextConceptsForCourses(userId, enrollments.map((course) => course.id)));
      }
    } catch (error) {
      unstable_rethrow(error);
      console.error("Error loading next concepts for dashboard:", error);
    }
    return nextConcepts;
  };

  const [progressList, courseMaterialsList, inProgressMaterialProgress, nextConcepts] =
    await Promise.all([
      d.getMaterialsProgress(),
      deps?.getCourseMaterials && !deps.getDashboardCourseMaterialsBatch
        ? Promise.all(
            enrollments.map(async (course) => ({
              courseId: course.id,
              materials: await d.getCourseMaterials(course.id),
            })),
          )
        : d.getDashboardCourseMaterialsBatch(enrollments.map((course) => course.id)),
      userId && enrollments.length > 0
        ? d.queryInProgressMaterialProgress(userId)
        : Promise.resolve([]),
      loadNextConcepts(),
    ]);

  const materialsByCourseId = new Map(
    courseMaterialsList.map((entry) => [entry.courseId, entry.materials]),
  );

  const compatibilityInProgressDocuments = inProgressMaterialProgress
    .map((record) => {
      for (const courseData of courseMaterialsList) {
        const mat = courseData.materials.find((m) => m.id === record.materialId);
        if (mat) {
          const course = enrollments.find((e) => e.id === courseData.courseId);
          return {
            ...mat,
            courseTitle: course?.title || "Course",
            courseId: courseData.courseId,
            completionPercent: record.completionPercent,
            lastSectionId: record.lastSectionId,
          };
        }
      }
      return null;
    })
    .filter((document) => document !== null);

  const canonicalInProgressDocuments = courseMaterialsList.flatMap((courseData) => {
    const course = enrollments.find((e) => e.id === courseData.courseId);
    return courseData.materials.flatMap((material) => {
      const completionPercent =
        "completionPercent" in material && typeof material.completionPercent === "number"
          ? material.completionPercent
          : 0;
      if (completionPercent <= 0 || completionPercent >= 100) return [];
      return [{
        ...material,
        courseTitle: course?.title || "Course",
        courseId: courseData.courseId,
        completionPercent,
        lastSectionId: null,
      }];
    });
  });

  const inProgressDocuments = [
    ...new Map(
      [...canonicalInProgressDocuments, ...compatibilityInProgressDocuments].map(
        (document) => [document.id, document],
      ),
    ).values(),
  ];

  const completedIds = new Set(
    progressList.filter((p) => p.status === "completed").map((p) => p.materialId),
  );

  return { materialsByCourseId, completedIds, inProgressDocuments, nextConcepts };
}

export async function loadRecommendedCoursesData(
  user: DashboardUserSeed | null | undefined,
  enrolledCourseIds: ReadonlyArray<string>,
  deps?: Partial<DashboardSectionDeps>,
) {
  if (!user?.id) return { recommendedCourses: [], studentTargetCategory: null };
  const d = withDeps(deps);
  const [profile, dbCourses] = await Promise.all([
    getStudentAcademicProfile(user, deps),
    d.listStudentCourses(),
  ]);

  const enrolledSet = new Set(enrolledCourseIds);
  const pkaEnabled = d.isPkaEnabled();
  const unenrolledMatching = dbCourses.filter(
    (c) =>
      !TEST_COURSE_IDS.has(c.id) &&
      !enrolledSet.has(c.id) &&
      (c.id !== PKA_COURSE_ID || pkaEnabled) &&
      isCourseMatchingMajor(c.category, profile.major, profile.entryYear),
  );

  const topCandidates = unenrolledMatching.slice(0, 4);
  let recommendedCourses: Array<{
    id: string;
    title: string;
    category: string;
    pricing: (typeof topCandidates)[number]["pricing"];
    materialsCount: number;
  }> = [];

  if (topCandidates.length > 0) {
    if (deps?.getCourseMaterials && !deps.getDashboardCourseMaterialsBatch) {
      recommendedCourses = await Promise.all(
        topCandidates.map(async (c) => {
          const materials = await d.getCourseMaterials(c.id);
          return { id: c.id, title: c.title, category: c.category, pricing: c.pricing, materialsCount: materials.length };
        }),
      );
    } else if (deps?.getDashboardCourseMaterialsBatch) {
      const batch = await d.getDashboardCourseMaterialsBatch(topCandidates.map((c) => c.id));
      const countById = new Map(batch.map((entry) => [entry.courseId, entry.materials.length]));
      recommendedCourses = topCandidates.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        pricing: c.pricing,
        materialsCount: countById.get(c.id) ?? 0,
      }));
    } else {
      const statsMap = await getCourseCatalogStatsMap(topCandidates);
      recommendedCourses = topCandidates.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
        pricing: c.pricing,
        materialsCount: statsMap.get(c.id)?.materialsCount ?? 0,
      }));
    }
  }

  return { recommendedCourses, studentTargetCategory: profile.targetCategory };
}

export async function loadReviewQueueData(
  userId: string | null | undefined,
  enrollments: ReadonlyArray<StudentEnrollmentRecord>,
  deps?: Partial<DashboardSectionDeps>,
) {
  if (!userId || enrollments.length === 0) {
    return {
      totalDueFlashcards: 0,
      coursesWithQueueCount: 0,
      firstCourseWithQueue: enrollments[0]?.id,
      recentReviews: [] as Awaited<ReturnType<DashboardSectionDeps["queryRecentFlashcardReviews"]>>,
    };
  }
  const d = withDeps(deps);
  const [flashcardQueues, recentReviews] = await Promise.all([
    deps?.getReviewQueue && !deps.getDashboardReviewSummary
      ? Promise.all(enrollments.map(async (course) => ({ courseId: course.id, count: (await d.getReviewQueue(userId, course.id)).length })))
      : d.getDashboardReviewSummary(userId, enrollments.map((course) => course.id)),
    d.queryRecentFlashcardReviews(userId),
  ]);

  const totalDueFlashcards = flashcardQueues.reduce((total, item) => total + item.count, 0);
  const coursesWithQueueCount = flashcardQueues.filter((item) => item.count > 0).length;
  const firstCourseWithQueue =
    flashcardQueues.find((item) => item.count > 0)?.courseId ?? enrollments[0]?.id;

  return { totalDueFlashcards, coursesWithQueueCount, firstCourseWithQueue, recentReviews };
}

export async function loadAvailableAssessmentsData(
  enrollments: ReadonlyArray<StudentEnrollmentRecord>,
  deps?: Partial<DashboardSectionDeps>,
) {
  const d = withDeps(deps);
  const useLegacyExams =
    Boolean(deps?.getCourseQuizzes || deps?.getCourseTryouts) &&
    !deps?.getDashboardCourseExamsBatch;
  const useLegacySubmissions =
    Boolean(deps?.getStudentSubmissions) &&
    !deps?.getDashboardStudentSubmissionSummaries;

  const [submissionsList, courseExamsList] = await Promise.all([
    useLegacySubmissions
      ? d.getStudentSubmissions()
      : d.getDashboardStudentSubmissionSummaries(),
    useLegacyExams
      ? Promise.all(
          enrollments.map(async (course) => {
            const [quizzes, tryouts] = await Promise.all([
              d.getCourseQuizzes(course.id),
              d.getCourseTryouts(course.id),
            ]);
            return { courseId: course.id, exams: [...quizzes, ...tryouts] };
          }),
        )
      : d.getDashboardCourseExamsBatch(enrollments.map((course) => course.id)),
  ]);

  return courseExamsList.flatMap((courseData) => {
    const course = enrollments.find((e) => e.id === courseData.courseId);
    return courseData.exams
      .filter((exam) => !submissionsList.some((sub) => sub.examId === exam.id && sub.status !== "pending_review"))
      .map((exam) => ({
        ...exam,
        courseTitle: course?.title || "Course",
        courseId: courseData.courseId,
      }));
  });
}

export async function ProfilePromptSection({
  user,
  deps,
}: {
  user: DashboardUserSeed | null | undefined;
  deps?: Partial<DashboardSectionDeps>;
}) {
  const profile = await getStudentAcademicProfile(user, deps);
  return (
    <CompleteProfileDialog
      isProfileIncomplete={profile.isProfileIncomplete}
      missingFields={profile.missingFields}
    />
  );
}

export async function DashboardOnboardingSection({
  user,
  userName,
  deps,
}: {
  user: DashboardUserSeed | null | undefined;
  userName: string;
  deps?: Partial<DashboardSectionDeps>;
}) {
  const { catalogCourses, studentTargetCategory } = await loadOnboardingData(user, deps);
  return (
    <Reveal duration="duration-500">
      <StudentOnboardingView
        userName={userName}
        catalogCourses={catalogCourses}
        studentTargetCategory={studentTargetCategory}
      />
    </Reveal>
  );
}

export async function TodayPlanSection({
  userId,
  firstName,
}: {
  userId: string;
  firstName: string;
  deps?: Partial<DashboardSectionDeps>;
}) {
  return <TodayPlan firstName={firstName} serverUserId={userId} />;
}

export async function WeeklyReflectionSection({
  userId,
  deps,
}: {
  userId: string;
  deps?: Partial<DashboardSectionDeps>;
}) {
  let reflection;
  try {
    const row = await withDeps(deps).queryLatestWeeklyReflection(userId);
    if (!row) return null;
    reflection = { ...row, createdAt: row.createdAt.toISOString() };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error loading weekly reflection:", error);
    return null;
  }
  return <WeeklyReflection reflection={reflection} />;
}

export async function PrimaryLearningSection({
  userId,
  enrollments,
  deps,
}: {
  userId: string | null | undefined;
  enrollments: ReadonlyArray<StudentEnrollmentRecord>;
  deps?: Partial<DashboardSectionDeps>;
}) {
  const { materialsByCourseId, completedIds, inProgressDocuments, nextConcepts } =
    await loadPrimaryLearningData(userId, enrollments, deps);

  return (
    <div className="space-y-10">
      <section>
        <DashboardSectionHeading
          icon={GraduationCap}
          title={<TranslatedText namespace="student" messageKey="dashboard.classesActive" />}
          actions={
            <>
              <ActivateClassModal />
              <Link href="/courses" className="group flex shrink-0 items-center gap-0.5 text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
                <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
                <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </>
          }
        />

        <div className="divide-y divide-border/25">
          {enrollments.map((course) => {
            const materials = materialsByCourseId.get(course.id) || [];
            const doneCount = materials.filter((m) => m.completed || completedIds.has(m.id)).length;
            const progressPct = materials.length > 0 ? Math.round((doneCount / materials.length) * 100) : 0;
            const nextConcept = nextConcepts[course.id];

            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="group -mx-2 block rounded-lg px-2 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="min-w-0 break-words font-heading text-body-base font-bold text-foreground transition-colors group-hover:text-primary">
                        {course.title}
                      </h3>
                      <span className="shrink-0 text-body-xs font-medium uppercase tracking-wider text-muted-foreground">{course.category}</span>
                    </div>
                    {course.pricing?.category === "limited_time_free" && <CoursePricingLabel pricing={course.pricing} compact />}

                    <div className="mt-2 flex items-center gap-3">
                      <div
                        className="h-1.5 min-w-16 max-w-56 flex-1 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progressPct}
                        aria-label={course.title}
                      >
                        <div
                          className={cn("h-full rounded-full transition-all duration-300", progressPct >= 100 ? "bg-status-success" : "bg-primary")}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-body-sm font-semibold tabular-nums text-foreground">{progressPct}%</span>
                      <span className="shrink-0 text-body-xs tabular-nums text-muted-foreground">
                        <TranslatedText namespace="student" messageKey="dashboard.materialProgressShort" values={{ done: doneCount, total: materials.length }} />
                      </span>
                    </div>

                    {nextConcept && (
                      <div className="mt-2 flex min-w-0 items-baseline gap-1.5 text-body-sm">
                        <span className="shrink-0 text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <TranslatedText namespace="student" messageKey="dashboard.nextUp" />
                        </span>
                        <div className="min-w-0 wrap-anywhere font-medium text-foreground group-hover:underline">
                          <MathText as="div">{nextConcept}</MathText>
                        </div>
                      </div>
                    )}
                  </div>

                  <ArrowUpRight
                    className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {inProgressDocuments.length > 0 && (
        <section>
          <DashboardSectionHeading
            icon={Bookmark}
            title={<TranslatedText namespace="student" messageKey="dashboard.openMaterials" />}
            meta={
              <DashboardSectionCount>
                <TranslatedText namespace="student" messageKey="dashboard.materialCount" values={{ count: inProgressDocuments.length }} />
              </DashboardSectionCount>
            }
          />
          <div className="divide-y divide-border/30">
            {inProgressDocuments.map((doc) => (
              <Link
                key={doc.id}
                href={`/courses/${doc.courseId}/material/${doc.id}${doc.lastSectionId ? `?section=${encodeURIComponent(doc.lastSectionId)}` : ""}`}
                className="group -mx-2 flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3.5 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="min-w-0 break-words text-body-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                    {doc.title}
                  </h3>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-body-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{doc.courseTitle}</span>
                    <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${doc.completionPercent}%` }} />
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">{doc.completionPercent}%</span>
                  </div>
                </div>
                <Play className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export async function RecommendedCoursesSection({
  user,
  enrolledCourseIds,
  deps,
}: {
  user: DashboardUserSeed | null | undefined;
  enrolledCourseIds: ReadonlyArray<string>;
  deps?: Partial<DashboardSectionDeps>;
}) {
  const { recommendedCourses, studentTargetCategory } =
    await loadRecommendedCoursesData(user, enrolledCourseIds, deps);

  if (recommendedCourses.length === 0) return null;

  return (
    <section>
      <DashboardSectionHeading
        icon={Compass}
        title={<TranslatedText namespace="student" messageKey="dashboard.recommendedCourses" />}
        meta={studentTargetCategory ? <DashboardSectionCount>{studentTargetCategory}</DashboardSectionCount> : null}
        actions={
          <Link href="/courses" className="group flex shrink-0 items-center gap-0.5 text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
            <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        }
      />

      <div className="divide-y divide-border/25">
        {recommendedCourses.map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.id}`}
            className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3.5 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <h3 className="break-words text-body-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                {course.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
                {course.category !== studentTargetCategory && (
                  <span className="font-medium uppercase tracking-wider">{course.category}</span>
                )}
                <CoursePricingLabel pricing={course.pricing} />
                {course.materialsCount > 0 && (
                  <span className="tabular-nums">
                    <TranslatedText namespace="student" messageKey="dashboard.materialCount" values={{ count: course.materialsCount }} />
                  </span>
                )}
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}

const GRADE_LABELS: Record<number, string> = { 1: "gradeAgain", 2: "gradeHard", 3: "gradeGood", 4: "gradeEasy" };
const GRADE_TONES: Record<number, string> = {
  1: "text-status-error",
  2: "text-status-warning",
  3: "text-foreground/80",
  4: "text-status-success",
};

export async function ReviewQueueSection({
  userId,
  enrollments,
  deps,
}: {
  userId: string | null | undefined;
  enrollments: ReadonlyArray<StudentEnrollmentRecord>;
  deps?: Partial<DashboardSectionDeps>;
}) {
  const { totalDueFlashcards, coursesWithQueueCount, firstCourseWithQueue, recentReviews } =
    await loadReviewQueueData(userId, enrollments, deps);
  const targetCourseTitle = enrollments.find((course) => course.id === firstCourseWithQueue)?.title;

  return (
    <section>
      <DashboardSectionHeading
        icon={Layers}
        title={<TranslatedText namespace="student" messageKey="dashboard.spacedRepetition" />}
        meta={
          <DashboardSectionCount tone={totalDueFlashcards > 0 ? "warning" : "success"}>
            {totalDueFlashcards > 0
              ? coursesWithQueueCount > 1
                ? (
                    <TranslatedText
                      namespace="student"
                      messageKey="dashboard.cardsDueMultiCourse"
                      values={{ count: totalDueFlashcards, courses: coursesWithQueueCount }}
                    />
                  )
                : <TranslatedText namespace="student" messageKey="dashboard.cardsDue" values={{ count: totalDueFlashcards }} />
              : <TranslatedText namespace="student" messageKey="dashboard.allCardsDone" />}
          </DashboardSectionCount>
        }
      />

      {firstCourseWithQueue && (
        <Button
          asChild
          size="sm"
          variant={totalDueFlashcards > 0 ? "default" : "outline"}
          className="group mt-1 h-auto min-h-8 w-full max-w-full whitespace-normal py-1.5 text-left sm:w-auto"
        >
          <Link href={`/courses/${firstCourseWithQueue}/flashcard`}>
            <span className="min-w-0 break-words">
              {totalDueFlashcards > 0
                ? targetCourseTitle
                  ? <TranslatedText namespace="student" messageKey="dashboard.startFlashcardReviewCourse" values={{ courseTitle: targetCourseTitle }} />
                  : <TranslatedText namespace="student" messageKey="dashboard.startFlashcardReview" />
                : targetCourseTitle
                  ? <TranslatedText namespace="student" messageKey="dashboard.openFlashcardCollectionCourse" values={{ courseTitle: targetCourseTitle }} />
                  : <TranslatedText namespace="student" messageKey="dashboard.openFlashcardCollection" />}
            </span>
            <ArrowRight className="shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      )}

      {recentReviews.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground">
            <History className="size-3.5" aria-hidden />
            <TranslatedText namespace="student" messageKey="dashboard.recentReviews" />
          </h3>
          <ul className="divide-y divide-border/30">
            {recentReviews.map((review) => (
              <li key={review.id} className="flex min-w-0 items-center justify-between gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <MathText as="p" className="line-clamp-2 break-words text-body-sm text-foreground">{review.front}</MathText>
                  <p className="truncate text-body-xs text-muted-foreground">{review.courseTitle}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className={cn("text-body-xs font-semibold", GRADE_TONES[review.grade] ?? "text-muted-foreground")}>
                    <TranslatedText namespace="student" messageKey={`dashboard.${GRADE_LABELS[review.grade] || "recentReviews"}`} />
                  </span>
                  <span className="text-body-xs text-muted-foreground">
                    <FormattedDate date={review.reviewedAt} options={{ dateStyle: "medium" }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export async function WeakConceptsSection({
  userId,
  firstCourse,
  deps,
}: {
  userId: string | null | undefined;
  firstCourse: StudentEnrollmentRecord | undefined;
  deps?: Partial<DashboardSectionDeps>;
}) {
  const masteryConcepts =
    userId && firstCourse?.id ? await withDeps(deps).getMastery(userId, firstCourse.id) : [];

  return (
    <section>
      <DashboardWeakConcepts concepts={masteryConcepts} courseTitle={firstCourse?.title} showHeader={true} />
      {firstCourse?.id && (
        <Link
          href={`/courses/${firstCourse.id}/mastery`}
          className="group mt-2 inline-flex items-center gap-1 text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <TranslatedText namespace="student" messageKey="dashboard.fullMasteryMap" />
          <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      )}
    </section>
  );
}

export async function AvailableAssessmentsSection({
  enrollments,
  deps,
}: {
  enrollments: ReadonlyArray<StudentEnrollmentRecord>;
  deps?: Partial<DashboardSectionDeps>;
}) {
  const availableExams = await loadAvailableAssessmentsData(enrollments, deps);

  return (
    <section>
      <DashboardSectionHeading
        icon={ClipboardList}
        title={<TranslatedText namespace="student" messageKey="dashboard.availableAssessments" />}
        meta={
          availableExams.length > 0 ? (
            <DashboardSectionCount>
              <TranslatedText namespace="student" messageKey="dashboard.examCount" values={{ count: availableExams.length }} />
            </DashboardSectionCount>
          ) : null
        }
      />

      {availableExams.length > 0 ? (
        <div className="divide-y divide-border/25">
          {availableExams.slice(0, 4).map((exam) => (
            <Link
              key={exam.id}
              href={`/courses/${exam.courseId}/${exam.type}/${exam.id}`}
              className="group -mx-2 flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3.5 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <h3 className="min-w-0 break-words text-body-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                  {exam.title}
                </h3>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-body-xs text-muted-foreground">
                  <span className="shrink-0 font-medium">
                    <TranslatedText namespace="student" messageKey={exam.type === "quiz" ? "dashboard.examQuiz" : "dashboard.examTryout"} />
                  </span>
                  <span className="min-w-0 truncate">{exam.courseTitle}</span>
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
            </Link>
          ))}

          {availableExams.length > 4 && (
            <div className="pt-2">
              <Link
                href={availableExams[0] ? `/courses/${availableExams[0].courseId}/quiz` : "/courses"}
                className="group inline-flex items-center gap-1 text-body-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <TranslatedText namespace="student" messageKey="dashboard.seeAllExams" values={{ count: availableExams.length }} />
                <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </div>
      ) : (
        <DashboardInlineEmpty icon={CheckCircle2}>
          <TranslatedText namespace="student" messageKey="dashboard.allExamsDone" />
        </DashboardInlineEmpty>
      )}
    </section>
  );
}
