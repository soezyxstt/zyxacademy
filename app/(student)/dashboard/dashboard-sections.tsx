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
  Trophy,
} from "lucide-react";
import {
  getMaterialsProgress,
  getStudentSubmissions,
} from "@/app/(student)/dashboard/actions";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { MathText } from "@/components/course/math-text";
import { ActivateClassModal } from "@/components/dashboard/activate-class-modal";
import { CompleteProfileDialog } from "@/components/dashboard/complete-profile-dialog";
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
} from "@/lib/course-utils";
import { env } from "@/lib/env";
import { getReviewQueue } from "@/lib/flashcard-actions";
import { getDashboardReviewSummary } from "@/lib/student/dashboard-review-summary";
import { getMastery } from "@/lib/mastery-store";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { getOrUpdateStreak } from "@/lib/streak-service";
import {
  listStudentCourses,
  type StudentEnrollmentRecord,
} from "@/lib/student/course-catalog";
import { getDashboardCourseMaterialsBatch } from "@/lib/student/dashboard-materials";
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
  listStudentCourses,
  getOrUpdateStreak,
  getMastery,
  getOrComputeStudyPath,
  getNextConceptsForCourses,
  getReviewQueue,
  getDashboardReviewSummary,
  isPkaEnabled: () => env.FEATURE_PKA === "1",
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
  const [profile, , dbCourses] = await Promise.all([
    getStudentAcademicProfile(user, deps),
    syncDashboardStreak(user?.id, deps),
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

  const summaries = await d.getCatalogCourseSummaries(activeCourses);
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));

  const catalogCourses = await Promise.all(
    activeCourses.map(async (course) => {
      const [chapterOutline, freeMaterials, freeQuizzes] = await Promise.all([
        d.getCourseChapterOutline(course.id, userId),
        d.getCourseMaterials(course.id, userId),
        d.getCourseQuizzes(course.id, userId),
      ]);
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
      const summary = summaryById.get(course.id);

      return {
        ...(summary ?? {
          id: course.id,
          title: course.title,
          category: course.category,
          description: course.description,
          materialsCount: 0,
          quizzesCount: 0,
          tryoutsCount: 0,
        }),
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
    }),
  );

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

  const recommendedCourses =
    unenrolledMatching.length > 0
      ? await Promise.all(
          unenrolledMatching.slice(0, 4).map(async (c) => {
            const materials = await d.getCourseMaterials(c.id);
            return { id: c.id, title: c.title, category: c.category, materialsCount: materials.length };
          }),
        )
      : [];

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
  const firstCourseWithQueue =
    flashcardQueues.find((item) => item.count > 0)?.courseId ?? enrollments[0]?.id;

  return { totalDueFlashcards, firstCourseWithQueue, recentReviews };
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
  deps,
}: {
  userId: string;
  firstName: string;
  deps?: Partial<DashboardSectionDeps>;
}) {
  await syncDashboardStreak(userId, deps);
  return <TodayPlan firstName={firstName} />;
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
    <>
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
          <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="size-4 text-brand-primary" />
            <TranslatedText namespace="student" messageKey="dashboard.classesActive" />
          </h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <ActivateClassModal />
            <Link href="/courses" className="text-body-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5 shrink-0">
              <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>

        <div className="divide-y divide-border/30">
          {enrollments.map((course) => {
            const materials = materialsByCourseId.get(course.id) || [];
            const doneCount = materials.filter((m) => m.completed || completedIds.has(m.id)).length;
            const progressPct = materials.length > 0 ? Math.round((doneCount / materials.length) * 100) : 0;

            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="group block py-3.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20 shrink-0">
                        {course.category}
                      </span>
                      <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors break-words min-w-0">
                        {course.title}
                      </h3>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:gap-3 max-w-md">
                      <div className="h-1.5 w-20 sm:w-28 shrink-0 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-brand-primary transition-all duration-300 rounded" style={{ width: `${progressPct}%` }} />
                      </div>
                      <span className="text-body-xs font-semibold text-foreground shrink-0">{progressPct}%</span>
                      <span className="text-body-xs text-muted-foreground"><TranslatedText namespace="student" messageKey="dashboard.enrolledMaterialProgress" values={{ done: doneCount, total: materials.length }} /></span>
                    </div>

                    {nextConcepts[course.id] && (
                      <div className="mt-2 text-body-xs font-medium text-muted-foreground break-words min-w-0">
                        <TranslatedText namespace="student" messageKey="dashboard.nextStep" />{" "}
                        <span className="text-brand-primary font-semibold group-hover:underline">
                          <MathText as="span">{nextConcepts[course.id]}</MathText>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground group-hover:text-brand-primary group-hover:border-brand-primary/30 transition-all shrink-0">
                    <ArrowUpRight className="size-4" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
          <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
            <Bookmark className="size-4 text-brand-primary" />
            <TranslatedText namespace="student" messageKey="dashboard.openMaterials" />
          </h2>
          {inProgressDocuments.length > 0 && (
            <span className="text-body-xs font-semibold bg-muted px-2 py-0.5 rounded-md text-muted-foreground shrink-0">
              <TranslatedText namespace="student" messageKey="dashboard.materialCount" values={{ count: inProgressDocuments.length }} />
            </span>
          )}
        </div>

        {inProgressDocuments.length > 0 ? (
          <div className="divide-y divide-border/30">
            {inProgressDocuments.map((doc) => {
              if (!doc) return null;
              return (
                <div key={doc.id} className="group py-3 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40">
                  <Link
                    href={`/courses/${doc.courseId}/material/${doc.id}${doc.lastSectionId ? `?section=${encodeURIComponent(doc.lastSectionId)}` : ""}`}
                    className="flex items-center justify-between gap-3 sm:gap-4 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex max-w-full break-words rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                          {doc.courseTitle}
                        </span>
                        <span className="text-body-xs text-muted-foreground capitalize">({doc.kind})</span>
                      </div>
                      <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors mt-1.5 break-words min-w-0">
                        {doc.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3 max-w-xs">
                        <div className="h-1.5 w-20 sm:w-24 shrink-0 overflow-hidden rounded bg-muted">
                          <div className="h-full bg-brand-primary transition-all duration-300 rounded" style={{ width: `${doc.completionPercent}%` }} />
                        </div>
                        <span className="text-body-xs font-semibold text-foreground shrink-0">{doc.completionPercent}%</span>
                        {doc.lastSectionId && (
                          <span className="max-w-[120px] truncate text-body-xs text-muted-foreground">, {doc.lastSectionId}</span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="rounded-md gap-1.5 shrink-0 pointer-events-none group-hover:bg-muted transition-colors">
                      <Play className="size-3 fill-current" />
                      <TranslatedText namespace="student" messageKey="dashboard.continue" />
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/15">
            <CheckCircle2 className="size-8 text-status-success/60 mb-2" />
            <p className="text-body-sm font-medium text-foreground"><TranslatedText namespace="student" messageKey="dashboard.documentsRead" /></p>
            <p className="text-body-xs text-muted-foreground mt-0.5"><TranslatedText namespace="student" messageKey="dashboard.newClassMaterial" /></p>
          </div>
        )}
      </section>
    </>
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Compass className="size-4 text-brand-primary" />
          <h2 className="font-heading text-body-base font-bold text-foreground">
            <TranslatedText namespace="student" messageKey="dashboard.recommendedCourses" />
          </h2>
          {studentTargetCategory && (
            <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20 shrink-0">
              {studentTargetCategory === "TPB" ? "TPB" : studentTargetCategory}
            </span>
          )}
        </div>
        <Link href="/courses" className="text-body-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5 shrink-0">
          <TranslatedText namespace="student" messageKey="dashboard.viewAll" />
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="divide-y divide-border/30">
        {recommendedCourses.map((course) => (
          <div key={course.id} className="group py-2.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40">
            <Link href={`/courses/${course.id}`} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20">
                    {course.category}
                  </span>
                  <span className="text-body-xs text-muted-foreground">
                    <TranslatedText namespace="student" messageKey="dashboard.materialCount" values={{ count: course.materialsCount }} />
                  </span>
                </div>
                <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors break-words mt-1">
                  {course.title}
                </h3>
              </div>
              <div className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground group-hover:text-brand-primary group-hover:border-brand-primary/30 transition-all shrink-0">
                <ArrowRight className="size-4" />
              </div>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function ReviewQueueSection({
  userId,
  enrollments,
  deps,
}: {
  userId: string | null | undefined;
  enrollments: ReadonlyArray<StudentEnrollmentRecord>;
  deps?: Partial<DashboardSectionDeps>;
}) {
  const { totalDueFlashcards, firstCourseWithQueue, recentReviews } =
    await loadReviewQueueData(userId, enrollments, deps);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
          <Layers className="size-4 text-brand-primary" />
          <TranslatedText namespace="student" messageKey="dashboard.spacedRepetition" />
        </h2>
        <span className={cn(
          "text-body-xs font-semibold px-2 py-0.5 rounded-md shrink-0",
          totalDueFlashcards > 0 ? "bg-brand-secondary/15 text-brand-secondary" : "bg-status-success/15 text-status-success",
        )}>
          {totalDueFlashcards > 0
            ? <TranslatedText namespace="student" messageKey="dashboard.cardsDue" values={{ count: totalDueFlashcards }} />
            : <TranslatedText namespace="student" messageKey="dashboard.allCardsDone" />}
        </span>
      </div>

      <p className="text-body-xs text-muted-foreground leading-relaxed">
        <TranslatedText namespace="student" messageKey="dashboard.spacedRepetitionDescription" />
      </p>

      {firstCourseWithQueue && (
        <Button asChild className="w-full mt-3 rounded-lg text-body-sm font-semibold">
          <Link href={`/courses/${firstCourseWithQueue}/flashcard`}>
            {totalDueFlashcards > 0
              ? <TranslatedText namespace="student" messageKey="dashboard.startFlashcardReview" />
              : <TranslatedText namespace="student" messageKey="dashboard.openFlashcardCollection" />}
            <ArrowRight className="ml-1.5 size-4" />
          </Link>
        </Button>
      )}

      <div className="mt-4 pt-3 border-t border-border/40">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-body-xs font-semibold text-foreground flex items-center gap-1.5">
            <History className="size-3.5 text-muted-foreground" />
            <TranslatedText namespace="student" messageKey="dashboard.recentReviews" />
          </span>
        </div>

        {recentReviews.length > 0 ? (
          <div className="divide-y divide-border/30">
            {recentReviews.map((review) => {
              const gradeLabels: Record<number, string> = { 1: "gradeAgain", 2: "gradeHard", 3: "gradeGood", 4: "gradeEasy" };
              const gradeColors: Record<number, string> = {
                1: "text-status-error bg-status-error/10 border-status-error/20",
                2: "text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20",
                3: "text-brand-primary bg-brand-primary/10 border-brand-primary/20",
                4: "text-status-success bg-status-success/10 border-status-success/20",
              };
              return (
                <div key={review.id} className="py-2.5 px-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn(
                      "inline-flex rounded-md border px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider shrink-0",
                      gradeColors[review.grade] || "text-muted-foreground border-border bg-muted/40",
                    )}>
                      <TranslatedText namespace="student" messageKey={`dashboard.${gradeLabels[review.grade] || "recentReviews"}`} />
                    </span>
                    <span className="text-body-xs text-muted-foreground shrink-0">
                      <FormattedDate date={review.reviewedAt} options={{ dateStyle: "medium" }} />
                    </span>
                  </div>
                  <p className="text-body-xs font-medium text-foreground mt-1 truncate">{review.front}</p>
                  <p className="text-body-xs text-muted-foreground mt-0.5 truncate">{review.courseTitle}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-body-xs text-muted-foreground py-2 text-center"><TranslatedText namespace="student" messageKey="dashboard.noRecentReviews" /></p>
        )}
      </div>
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
          className="mt-3 pt-2.5 border-t border-border/40 inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
        >
          <TranslatedText namespace="student" messageKey="dashboard.fullMasteryMap" />
          <ArrowUpRight className="size-3.5" />
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="size-4 text-brand-primary" />
          <TranslatedText namespace="student" messageKey="dashboard.availableAssessments" />
        </h2>
        {availableExams.length > 0 && (
          <span className="text-body-xs font-semibold bg-muted px-2 py-0.5 rounded-md text-muted-foreground shrink-0">
            <TranslatedText namespace="student" messageKey="dashboard.examCount" values={{ count: availableExams.length }} />
          </span>
        )}
      </div>

      {availableExams.length > 0 ? (
        <div className="divide-y divide-border/30">
          {availableExams.slice(0, 4).map((exam) => (
            <div key={exam.id} className="group py-2.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40">
              <Link href={`/courses/${exam.courseId}/${exam.type}/${exam.id}`} className="flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <h4 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors break-words min-w-0">
                    {exam.title}
                  </h4>
                  <p className="text-body-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                    <span className="font-semibold text-brand-primary truncate max-w-[120px]">{exam.courseTitle}</span>
                    <span className="text-border-strong">,</span>
                    <span className="capitalize shrink-0"><TranslatedText namespace="student" messageKey={exam.type === "quiz" ? "dashboard.examQuiz" : "dashboard.examTryout"} /></span>
                  </p>
                </div>
                <Button size="sm" className="rounded-md shrink-0 pointer-events-none group-hover:bg-brand-primary/95 transition-all text-body-sm h-8 px-3">
                  <TranslatedText namespace="student" messageKey="dashboard.workOnIt" />
                </Button>
              </Link>
            </div>
          ))}

          {availableExams.length > 4 && (
            <div className="pt-2 text-center border-t border-border/40">
              <Link
                href={availableExams[0] ? `/courses/${availableExams[0].courseId}/quiz` : "/courses"}
                className="text-body-xs font-semibold text-brand-primary hover:underline inline-flex items-center gap-1"
              >
                <TranslatedText namespace="student" messageKey="dashboard.seeAllExams" values={{ count: availableExams.length }} />
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/15">
          <Trophy className="size-8 text-brand-secondary/60 mb-2" />
          <p className="text-body-sm font-medium text-foreground"><TranslatedText namespace="student" messageKey="dashboard.allExamsDone" /></p>
          <p className="text-body-xs text-muted-foreground mt-0.5"><TranslatedText namespace="student" messageKey="dashboard.newPracticeLater" /></p>
        </div>
      )}
    </section>
  );
}
