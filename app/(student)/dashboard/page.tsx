import { StudentDashboardContent } from "@/components/dashboard/student-dashboard-content";
import type { Metadata } from "next";
import {
  GraduationCap,
  Bookmark,
  Flame,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata} from "@/lib/site";
import { getAuthSession } from "@/lib/auth-session";


import {
  getStudentEnrollments,
  getMaterialsProgress,
  getStudentSubmissions,
} from "@/app/(student)/dashboard/actions";
import {
  getCourseChapterOutline,
  getCourseMaterials,
  getCourseQuizzes,
  getCourseTryouts,
} from "@/lib/course-utils";
import { TodayPlan } from "@/components/dashboard/today-plan";
import { env } from "@/lib/env";
import { getMastery } from "@/lib/mastery-store";
import { InterventionBanner } from "@/components/dashboard/intervention-banner";
import { db } from "@/db";
import {
  weeklyReflections,
  studentMaterialProgress,
  flashcardReviews,
  flashcards,
  flashcardSets,
  courses,
  reviewFlashcard,
  kemajuanFlashcardMurid,
  flashcard as canonicalFlashcard,
  setFlashcard,
  mataKuliah,
  user as userTable,
} from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getReviewQueue } from "@/lib/flashcard-actions";
import { WeeklyReflection } from "@/components/dashboard/weekly-reflection";
import { getOrUpdateStreak } from "@/lib/streak-service";
import { ActivateClassModal } from "@/components/dashboard/activate-class-modal";
import { CompleteProfileDialog } from "@/components/dashboard/complete-profile-dialog";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import {
  StudentOnboardingView,
  type CatalogCourse,
} from "@/components/dashboard/student-onboarding-view";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { listStudentCourses } from "@/lib/student/course-catalog";
import { ApplicationPage } from "@/components/application-page";
import { getCatalogCourseSummaries } from "@/lib/student/dashboard-read-model";
import {
  isCourseMatchingMajor,
  getStudentTargetCategory,
} from "@/lib/student/itb-academic-data";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("dashboard.pageTitle"), description: t("dashboard.metadataDescription"), path: "/dashboard" });
}


/**
 * Server-rendered dashboard page displaying student course enrollments, learning progress, recommendations, and academic prompts.
 */
export default async function DashboardPage() {
  const session = await getAuthSession();
  const user = session?.user;
  const userName = user?.name ?? "";

  const firstName = userName.split(" ")[0];

  const [enrollments, progressList, submissionsList] = await Promise.all([
    getStudentEnrollments(),
    getMaterialsProgress(),
    getStudentSubmissions(),
  ]);

  const isEnrolledInAny = enrollments.length > 0;
  const enrolledCourseIds = enrollments.map((e) => e.id);

  let isProfileIncomplete = false;
  let missingFields = { faculty: false, major: false, entryYear: false };
  let studentFaculty = (user as any)?.faculty ?? null;
  let studentMajor = (user as any)?.major ?? null;
  let studentEntryYear = (user as any)?.entryYear ?? null;

  if (user?.id) {
    if (!studentFaculty || !studentMajor || !studentEntryYear) {
      try {
        const [dbUser] = await db
          .select({
            faculty: userTable.faculty,
            major: userTable.major,
            entryYear: userTable.entryYear,
          })
          .from(userTable)
          .where(eq(userTable.id, user.id))
          .limit(1);

        if (dbUser) {
          studentFaculty = studentFaculty ?? dbUser.faculty;
          studentMajor = studentMajor ?? dbUser.major;
          studentEntryYear = studentEntryYear ?? dbUser.entryYear;
        }

        missingFields = {
          faculty: !studentFaculty,
          major: !studentMajor,
          entryYear: !studentEntryYear,
        };
        isProfileIncomplete = missingFields.faculty || missingFields.major || missingFields.entryYear;
      } catch (error) {
        console.error("[Dashboard] Failed to query academic profile fields:", error);
      }
    }
  }

  const studentTargetCategory = getStudentTargetCategory(studentMajor, studentEntryYear);

  // If not enrolled in any course, fetch catalog courses for onboarding preview matching student's major
  let catalogCourses: CatalogCourse[] = [];

  if (!isEnrolledInAny && user?.id) {
    const dbCourses = await listStudentCourses();
    const TEST_COURSE_IDS = new Set([
      "embed-test-course",
      "miscon-test-course",
      "remed-test-course",
      "term-test-course",
      "graph-test-course",
    ]);
    const activeCourses = dbCourses.filter(
      (c) =>
        !TEST_COURSE_IDS.has(c.id) &&
        (c.id !== PKA_COURSE_ID || env.FEATURE_PKA === "1") &&
        isCourseMatchingMajor(c.category, studentMajor, studentEntryYear)
    );

    const summaries = await getCatalogCourseSummaries(activeCourses);
    const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));

    const freeCourseDetails = await Promise.all(
      activeCourses.map(async (course) => {
        const [chapterOutline, freeMaterials, freeQuizzes] = await Promise.all([
          getCourseChapterOutline(course.id, user.id),
          getCourseMaterials(course.id, user.id),
          getCourseQuizzes(course.id, user.id),
        ]);
        const completedMaterialCount = freeMaterials.filter((material) => (
          material.completed
          || ("completionPercent" in material
            && typeof material.completionPercent === "number"
            && material.completionPercent >= 100)
        )).length;
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

    catalogCourses = freeCourseDetails;
  }

  // If enrolled in courses, fetch recommended courses for the student's major that they haven't enrolled in
  let recommendedUnenrolledCourses: Array<{
    id: string;
    title: string;
    category: string;
    materialsCount: number;
  }> = [];

  if (isEnrolledInAny && user?.id) {
    const dbCourses = await listStudentCourses();
    const TEST_COURSE_IDS = new Set([
      "embed-test-course",
      "miscon-test-course",
      "remed-test-course",
      "term-test-course",
      "graph-test-course",
    ]);
    const unenrolledMatching = dbCourses.filter(
      (c) =>
        !TEST_COURSE_IDS.has(c.id) &&
        !enrolledCourseIds.includes(c.id) &&
        (c.id !== PKA_COURSE_ID || env.FEATURE_PKA === "1") &&
        isCourseMatchingMajor(c.category, studentMajor, studentEntryYear)
    );

    if (unenrolledMatching.length > 0) {
      recommendedUnenrolledCourses = await Promise.all(
        unenrolledMatching.slice(0, 4).map(async (c) => {
          const materials = await getCourseMaterials(c.id);
          return {
            id: c.id,
            title: c.title,
            category: c.category,
            materialsCount: materials.length,
          };
        })
      );
    }
  }

  let streakInfo = null;
  if (user?.id) {
    try {
      streakInfo = await getOrUpdateStreak(user.id);
    } catch (e) {
      console.error("Error loading streak:", e);
    }
  }

  // Fetch the latest weekly reflection for enrolled students.
  let latestReflection = null;
  if (user?.id && isEnrolledInAny) {
    try {
      const rows = await db
        .select()
        .from(weeklyReflections)
        .where(eq(weeklyReflections.studentId, user.id))
        .orderBy(desc(weeklyReflections.weekStart))
        .limit(1);

      if (rows[0]) {
        latestReflection = {
          ...rows[0],
          createdAt: rows[0].createdAt.toISOString(),
        };
      }
    } catch (e) {
      console.error("Error loading weekly reflection:", e);
    }
  }

  // Fetch weak concepts
  let masteryConcepts: Awaited<ReturnType<typeof getMastery>> = [];
  if (user?.id && isEnrolledInAny) {
    try {
      const firstCourseId = enrollments[0]?.id;
      if (firstCourseId) {
        masteryConcepts = await getMastery(user.id, firstCourseId);
      }
    } catch (e) {
      console.error("Error loading mastery concepts:", e);
    }
  }

  // Fetch next concepts from study paths
  const nextConcepts: Record<string, string> = {};
  if (user?.id && isEnrolledInAny) {
    try {
      const { getOrComputeStudyPath } = await import("@/lib/study-path-service");
      await Promise.all(
        enrollments.map(async (course) => {
          const path = await getOrComputeStudyPath(user.id, course.id);
          const activeStep = path.find(
            (step) => step.status === "available" || step.status === "in_progress"
          );
          if (activeStep) {
            nextConcepts[course.id] = activeStep.conceptName;
          }
        })
      );
    } catch (e) {
      console.error("Error loading next concepts for dashboard:", e);
    }
  }

  // Resolve all materials, quizzes, and tryouts for enrolled courses
  const courseDataList = await Promise.all(
    enrolledCourseIds.map(async (courseId) => {
      const [materials, quizzes, tryouts] = await Promise.all([
        getCourseMaterials(courseId),
        getCourseQuizzes(courseId),
        getCourseTryouts(courseId),
      ]);
      return {
        courseId,
        materials,
        exams: [...quizzes, ...tryouts],
      };
    })
  );

  const courseDataMap = new Map(courseDataList.map((d) => [d.courseId, d]));

  // 1. In-progress documents (materials) from studentMaterialProgress
  const inProgressMaterialProgress = user?.id && isEnrolledInAny ? await db
    .select({
      materialId: studentMaterialProgress.materialId,
      completionPercent: studentMaterialProgress.completionPercent,
      lastSectionId: studentMaterialProgress.lastSectionId,
    })
    .from(studentMaterialProgress)
    .where(
      and(
        eq(studentMaterialProgress.studentId, user.id),
        sql`${studentMaterialProgress.completionPercent} > 0`,
        sql`${studentMaterialProgress.completionPercent} < 100`
      )
    ) : [];

  const compatibilityInProgressDocuments = inProgressMaterialProgress
    .map((record) => {
      for (const courseData of courseDataList) {
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
  const canonicalInProgressDocuments = courseDataList.flatMap((courseData) => {
    const course = enrollments.find((enrollment) => enrollment.id === courseData.courseId);
    return courseData.materials.flatMap((material) => {
      const completionPercent = "completionPercent" in material && typeof material.completionPercent === "number"
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
  const inProgressDocuments = [...new Map(
    [...canonicalInProgressDocuments, ...compatibilityInProgressDocuments]
      .map((document) => [document.id, document]),
  ).values()];

  const flashcardQueues = user?.id && isEnrolledInAny
    ? await Promise.all(
        enrollments.map(async (course) => ({
          courseId: course.id,
          queue: await getReviewQueue(user.id, course.id),
        }))
      )
    : [];

  const totalDueFlashcards = flashcardQueues.reduce((total, item) => total + item.queue.length, 0);
  const firstCourseWithQueue = flashcardQueues.find((item) => item.queue.length > 0)?.courseId ?? enrollments[0]?.id;

  const recentReviews = user?.id && isEnrolledInAny
    ? (await Promise.all([
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
          .where(eq(flashcardReviews.studentId, user.id))
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
          .where(eq(kemajuanFlashcardMurid.penggunaId, user.id))
          .orderBy(desc(reviewFlashcard.reviewedAt))
          .limit(5),
      ]))
        .flat()
        .sort((left, right) => right.reviewedAt.getTime() - left.reviewedAt.getTime())
        .slice(0, 5)
    : [];

  // 2. Available exams
  const availableExams = courseDataList.flatMap((courseData) => {
    const course = enrollments.find((e) => e.id === courseData.courseId);
    return courseData.exams
      .filter((exam) => {
        const alreadySubmitted = submissionsList.some(
          (sub) => sub.examId === exam.id && sub.status !== "pending_review"
        );
        return !alreadySubmitted;
      })
      .map((exam) => ({
        ...exam,
        courseTitle: course?.title || "Course",
        courseId: courseData.courseId,
      }));
  });

  return (
    <ApplicationPage className="pb-16">
      <CompleteProfileDialog
        isProfileIncomplete={isProfileIncomplete}
        missingFields={missingFields}
      />
      {!isEnrolledInAny ? (
          <Reveal duration="duration-500">
            <StudentOnboardingView
              userName={userName}
              catalogCourses={catalogCourses}
              studentTargetCategory={studentTargetCategory}
            />
          </Reveal>
        ) : (
          <>
            {user?.id && <InterventionBanner />}
            {latestReflection && (
              <WeeklyReflection reflection={latestReflection} />
            )}
            {user?.id ? (
              <TodayPlan firstName={firstName} />
            ) : (
              /* Welcome Header for signed-out visitors */
              <Reveal duration="duration-500">
                <PageHeader
                  title={
                    <TranslatedText namespace="student" messageKey={userName ? "dashboard.hello" : "dashboard.helloFallback"} values={userName ? { name: userName } : undefined} />
                  }
                  actions={
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 rounded-lg bg-muted/55 px-3.5 py-1.5">
                        <GraduationCap className="size-4 text-brand-primary" />
                        <div className="text-left">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none"><TranslatedText namespace="student" messageKey="dashboard.classesLabel" /></p>
                          <p className="text-body-xs font-semibold text-foreground mt-0.5 leading-none"><TranslatedText namespace="student" messageKey="dashboard.activeCount" values={{ count: enrollments.length }} /></p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-lg bg-muted/55 px-3.5 py-1.5">
                        <Bookmark className="size-4 text-brand-primary" />
                        <div className="text-left">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none"><TranslatedText namespace="student" messageKey="dashboard.materialsLabel" /></p>
                          <p className="text-body-xs font-semibold text-foreground mt-0.5 leading-none"><TranslatedText namespace="student" messageKey="dashboard.readCount" values={{ count: inProgressDocuments.length }} /></p>
                        </div>
                      </div>

                      {streakInfo && (
                        <div className="flex items-center gap-2 rounded-lg bg-muted/55 px-3.5 py-1.5">
                          <Flame className={cn("size-4", streakInfo.current > 0 ? "text-brand-secondary fill-brand-secondary/10" : "text-muted-foreground")} />
                          <div className="text-left">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none"><TranslatedText namespace="student" messageKey="dashboard.streakLabel" /></p>
                            <p className="text-body-xs font-semibold text-foreground mt-0.5 leading-none">
                              {streakInfo.current > 0 ? <TranslatedText namespace="student" messageKey="dashboard.streakDays" values={{ count: streakInfo.current }} /> : <TranslatedText namespace="student" messageKey="dashboard.startToday" />}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  }
                />
              </Reveal>
            )}

            <StudentDashboardContent
              enrollments={enrollments.map(({id,title,category}) => ({id,title,category}))}
              courseProgress={Object.fromEntries(enrollments.map(course => {
                const materials = courseDataMap.get(course.id)?.materials ?? [];
                const completedIds = progressList.filter(p => p.status === "completed").map(p => p.materialId);
                return [course.id, { doneCount: materials.filter(m => m.completed || completedIds.includes(m.id)).length, total: materials.length, nextConcept: nextConcepts[course.id] }];
              }))}
              inProgressDocuments={inProgressDocuments.map(({id,title,kind,courseId,courseTitle,completionPercent,lastSectionId}) => ({id,title,kind,courseId,courseTitle,completionPercent,lastSectionId}))}
              recommendedUnenrolledCourses={recommendedUnenrolledCourses.map(({id,title,category,materialsCount}) => ({id,title,category,materialsCount}))}
              studentTargetCategory={studentTargetCategory}
              totalDueFlashcards={totalDueFlashcards}
              firstCourseWithQueue={firstCourseWithQueue}
              recentReviews={recentReviews.map(({id,front,grade,reviewedAt,courseTitle}) => ({id,front,grade,reviewedAt,courseTitle}))}
              masteryConcepts={masteryConcepts}
              availableExams={availableExams.map(({id,title,courseId,courseTitle,type}) => ({id,title,courseId,courseTitle,type}))}
              activateClassAction={<ActivateClassModal />}
            />
          </>
        )}
    </ApplicationPage>
  );
}
