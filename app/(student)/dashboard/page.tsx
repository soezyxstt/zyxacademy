import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  GraduationCap,
  Play,
  CheckCircle2,
  Bookmark,
  Trophy,
  ArrowUpRight,
  ArrowRight,
  Flame,
  History,
  Layers,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
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
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { MathText } from "@/components/course/math-text";
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

export const metadata: Metadata = createMetadata({
  title: "Dashboard Siswa",
  description:
    "Pantau progres belajar, materi, kuis, tryout ITB TPB; semua dalam satu ruang belajar personal.",
  path: "/dashboard",
});


/**
 * Server-rendered dashboard page displaying student course enrollments, learning progress, recommendations, and academic prompts.
 */
export default async function DashboardPage() {
  const session = await getAuthSession();
  const user = session?.user;
  const userName = user?.name || "Siswa";

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
                    <>
                      Halo, <span className="bg-linear-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">{userName}</span>
                    </>
                  }
                  actions={
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 rounded-lg bg-muted/55 px-3.5 py-1.5">
                        <GraduationCap className="size-4 text-brand-primary" />
                        <div className="text-left">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Kelas</p>
                          <p className="text-body-xs font-semibold text-foreground mt-0.5 leading-none">{enrollments.length} Aktif</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-lg bg-muted/55 px-3.5 py-1.5">
                        <Bookmark className="size-4 text-brand-primary" />
                        <div className="text-left">
                          <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Materi</p>
                          <p className="text-body-xs font-semibold text-foreground mt-0.5 leading-none">{inProgressDocuments.length} Dibaca</p>
                        </div>
                      </div>

                      {streakInfo && (
                        <div className="flex items-center gap-2 rounded-lg bg-muted/55 px-3.5 py-1.5">
                          <Flame className={cn("size-4", streakInfo.current > 0 ? "text-brand-secondary fill-brand-secondary/10" : "text-muted-foreground")} />
                          <div className="text-left">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Streak</p>
                            <p className="text-body-xs font-semibold text-foreground mt-0.5 leading-none">
                              {streakInfo.current > 0 ? `${streakInfo.current} hari` : "Mulai hari ini"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  }
                />
              </Reveal>
            )}

            <Reveal duration="duration-700" className="w-full min-w-0">
              <div className="grid gap-6 lg:grid-cols-12 w-full min-w-0">
                {/* Left Column (Primary learning track) - 7 cols */}
                <div className="space-y-6 lg:col-span-7 min-w-0">
                  {/* Classes list Section */}
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                      <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                        <GraduationCap className="size-4 text-brand-primary" />
                        Kelas aktif
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                        <ActivateClassModal />
                        <Link
                          href="/courses"
                          className="text-body-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5 shrink-0"
                        >
                          Lihat semua
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </div>
                    </div>

                    <div className="divide-y divide-border/30">
                      {enrollments.map((course) => {
                        const materials = courseDataMap.get(course.id)?.materials || [];
                        const courseCompletedIds = progressList
                          .filter((p) => p.status === "completed")
                          .map((p) => p.materialId);
                        const doneCount = materials.filter((m) => m.completed || courseCompletedIds.includes(m.id)).length;
                        const progressPct = materials.length > 0 ? Math.round((doneCount / materials.length) * 100) : 0;

                        return (
                          <Link
                            key={course.id}
                            href={`/courses/${course.id}`}
                            className="group block py-3.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                {/* Category Badge + Title */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20 shrink-0">
                                    {course.category}
                                  </span>
                                  <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors truncate min-w-0">
                                    {course.title}
                                  </h3>
                                </div>

                                {/* Sleek inline progress */}
                                <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:gap-3 max-w-md">
                                  <div className="h-1.5 w-20 sm:w-28 shrink-0 overflow-hidden rounded bg-muted">
                                    <div
                                      className="h-full bg-brand-primary transition-all duration-300 rounded"
                                      style={{ width: `${progressPct}%` }}
                                    />
                                  </div>
                                  <span className="text-body-xs font-semibold text-foreground shrink-0">{progressPct}%</span>
                                  <span className="text-body-xs text-muted-foreground">({doneCount} dari {materials.length} materi)</span>
                                </div>

                                {nextConcepts[course.id] && (
                                  <div className="mt-2 text-body-xs font-medium text-muted-foreground break-words min-w-0">
                                    Langkah selanjutnya:{" "}
                                    <span className="text-brand-primary font-semibold group-hover:underline">
                                      <MathText as="span">{nextConcepts[course.id]}</MathText>
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Interactive arrow indicator */}
                              <div className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground group-hover:text-brand-primary group-hover:border-brand-primary/30 transition-all shrink-0">
                                <ArrowUpRight className="size-4" />
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </section>

                  {/* Documents In Progress */}
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                      <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                        <Bookmark className="size-4 text-brand-primary" />
                        Materi terbuka (belum selesai)
                      </h2>
                      {inProgressDocuments.length > 0 && (
                        <span className="text-body-xs font-semibold bg-muted px-2 py-0.5 rounded-md text-muted-foreground shrink-0">
                          {inProgressDocuments.length} materi
                        </span>
                      )}
                    </div>

                    {inProgressDocuments.length > 0 ? (
                      <div className="divide-y divide-border/30">
                        {inProgressDocuments.map((doc) => {
                          if (!doc) return null;
                          return (
                            <div
                              key={doc.id}
                              className="group py-3 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
                            >
                              <Link
                                href={`/courses/${doc.courseId}/material/${doc.id}${doc.lastSectionId ? `?section=${encodeURIComponent(doc.lastSectionId)}` : ""}`}
                                className="flex items-center justify-between gap-3 sm:gap-4 min-w-0"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex max-w-full break-words rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                                      {doc.courseTitle}
                                    </span>
                                    <span className="text-body-xs text-muted-foreground capitalize">
                                      ({doc.kind})
                                    </span>
                                  </div>
                                  <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors mt-1.5 truncate min-w-0">
                                    {doc.title}
                                  </h3>
                                  {/* Completion Progress Bar */}
                                  <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3 max-w-xs">
                                    <div className="h-1.5 w-20 sm:w-24 shrink-0 overflow-hidden rounded bg-muted">
                                      <div
                                        className="h-full bg-brand-primary transition-all duration-300 rounded"
                                        style={{ width: `${doc.completionPercent}%` }}
                                      />
                                    </div>
                                    <span className="text-body-xs font-semibold text-foreground shrink-0">{doc.completionPercent}%</span>
                                    {doc.lastSectionId && (
                                      <span className="max-w-[120px] truncate text-body-xs text-muted-foreground">, {doc.lastSectionId}</span>
                                    )}
                                  </div>
                                </div>
                                <Button size="sm" variant="outline" className="rounded-md gap-1.5 shrink-0 pointer-events-none group-hover:bg-muted transition-colors">
                                  <Play className="size-3 fill-current" />
                                  Lanjutkan
                                </Button>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/15">
                        <CheckCircle2 className="size-8 text-status-success/60 mb-2" />
                        <p className="text-body-sm font-medium text-foreground">Dokumen selesai dibaca</p>
                        <p className="text-body-xs text-muted-foreground mt-0.5">Lanjutkan ke materi baru di kelas.</p>
                      </div>
                    )}
                  </section>

                  {/* Recommended Courses for Student Major */}
                  {recommendedUnenrolledCourses.length > 0 && (
                    <section>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Compass className="size-4 text-brand-primary" />
                          <h2 className="font-heading text-body-base font-bold text-foreground">
                            Rekomendasi mata kuliah
                          </h2>
                          {studentTargetCategory && (
                            <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20 shrink-0">
                              {studentTargetCategory === "TPB" ? "TPB" : studentTargetCategory}
                            </span>
                          )}
                        </div>
                        <Link
                          href="/courses"
                          className="text-body-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5 shrink-0"
                        >
                          Lihat semua
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </div>

                      <div className="divide-y divide-border/30">
                        {recommendedUnenrolledCourses.map((course) => (
                          <div
                            key={course.id}
                            className="group py-2.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
                          >
                            <Link
                              href={`/courses/${course.id}`}
                              className="flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20">
                                    {course.category}
                                  </span>
                                  <span className="text-body-xs text-muted-foreground">
                                    {course.materialsCount} materi
                                  </span>
                                </div>
                                <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors truncate mt-1">
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
                  )}
                </div>

                {/* Right Column (Review, Mastery & Available Quizzes) - 5 cols */}
                <div className="space-y-8 lg:col-span-5 min-w-0">
                  {/* Status Spaced Repetition & Aktivitas Ulasan */}
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                      <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                        <Layers className="size-4 text-brand-primary" />
                        Spaced repetition
                      </h2>
                      <span className={cn(
                        "text-body-xs font-semibold px-2 py-0.5 rounded-md shrink-0",
                        totalDueFlashcards > 0
                          ? "bg-brand-secondary/15 text-brand-secondary"
                          : "bg-status-success/15 text-status-success"
                      )}>
                        {totalDueFlashcards > 0 ? `${totalDueFlashcards} kartu perlu diulas` : "Semua kartu tuntas"}
                      </span>
                    </div>

                    <p className="text-body-xs text-muted-foreground leading-relaxed">
                      Metode pengulangan berkala membantu memindahkan memori belajar jangka pendek menjadi pemahaman jangka panjang.
                    </p>

                    {firstCourseWithQueue && (
                      <Button asChild className="w-full mt-3 rounded-lg text-body-sm font-semibold">
                        <Link href={`/courses/${firstCourseWithQueue}/flashcard`}>
                          {totalDueFlashcards > 0 ? "Mulai ulas flashcard" : "Buka koleksi flashcard"}
                          <ArrowRight className="ml-1.5 size-4" />
                        </Link>
                      </Button>
                    )}

                    {/* Integrated Recent Reviews */}
                    <div className="mt-4 pt-3 border-t border-border/40">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-body-xs font-semibold text-foreground flex items-center gap-1.5">
                          <History className="size-3.5 text-muted-foreground" />
                          Aktivitas ulasan terbaru
                        </span>
                      </div>

                      {recentReviews.length > 0 ? (
                        <div className="divide-y divide-border/30">
                          {recentReviews.map((review) => {
                            const gradeLabels: Record<number, string> = {
                              1: "Ulangi",
                              2: "Sulit",
                              3: "Baik",
                              4: "Mudah",
                            };
                            const gradeColors: Record<number, string> = {
                              1: "text-status-error bg-status-error/10 border-status-error/20",
                              2: "text-brand-secondary bg-brand-secondary/10 border-brand-secondary/20",
                              3: "text-brand-primary bg-brand-primary/10 border-brand-primary/20",
                              4: "text-status-success bg-status-success/10 border-status-success/20",
                            };
                            return (
                              <div
                                key={review.id}
                                className="py-2.5 px-1"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className={cn(
                                    "inline-flex rounded-md border px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider shrink-0",
                                    gradeColors[review.grade] || "text-muted-foreground border-border bg-muted/40"
                                  )}>
                                    {gradeLabels[review.grade] || "Ulasan"}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground shrink-0">
                                    <FormattedDate date={review.reviewedAt} options={{ dateStyle: "medium" }} />
                                  </span>
                                </div>
                                <p className="text-body-xs font-medium text-foreground mt-1 truncate">
                                  {review.front}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                  {review.courseTitle}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-body-xs text-muted-foreground py-2 text-center">Belum ada ulasan baru.</p>
                      )}
                    </div>
                  </section>

                  {/* Peta Penguasaan */}
                  <section>
                    <DashboardWeakConcepts
                      concepts={masteryConcepts}
                      courseTitle={enrollments[0]?.title ?? "Kuliah"}
                      showHeader={true}
                    />
                    {enrollments[0]?.id && (
                      <Link
                        href={`/courses/${enrollments[0].id}/mastery`}
                        className="mt-3 pt-2.5 border-t border-border/40 inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
                      >
                        Lihat peta lengkap
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    )}
                  </section>

                  {/* Quizzes and Tryouts */}
                  <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                      <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                        <ClipboardList className="size-4 text-brand-primary" />
                        Kuis & tryout tersedia
                      </h2>
                      {availableExams.length > 0 && (
                        <span className="text-body-xs font-semibold bg-muted px-2 py-0.5 rounded-md text-muted-foreground shrink-0">
                          {availableExams.length} ujian
                        </span>
                      )}
                    </div>

                    {availableExams.length > 0 ? (
                      <div className="divide-y divide-border/30">
                        {availableExams.slice(0, 4).map((exam) => (
                          <div
                            key={exam.id}
                            className="group py-2.5 px-2 -mx-2 rounded-xl transition-colors hover:bg-muted/40"
                          >
                            <Link
                              href={`/courses/${exam.courseId}/${exam.type}/${exam.id}`}
                              className="flex items-center justify-between gap-3 min-w-0"
                            >
                              <div className="min-w-0 flex-1">
                                <h4 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors truncate min-w-0">
                                  {exam.title}
                                </h4>
                                <p className="text-body-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                                  <span className="font-semibold text-brand-primary truncate max-w-[120px]">{exam.courseTitle}</span>
                                  <span className="text-border-strong">,</span>
                                  <span className="capitalize shrink-0">{exam.type}</span>
                                </p>
                              </div>
                              <Button size="sm" className="rounded-md shrink-0 pointer-events-none group-hover:bg-brand-primary/95 transition-all text-body-xs h-7 px-2.5">
                                Kerjakan
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
                              Lihat semua ({availableExams.length}) kuis & tryout
                              <ArrowUpRight className="size-3.5" />
                            </Link>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/15">
                        <Trophy className="size-8 text-brand-secondary/60 mb-2" />
                        <p className="text-body-sm font-medium text-foreground">Semua ujian telah selesai</p>
                        <p className="text-body-xs text-muted-foreground mt-0.5">Latihan baru tersedia saat bab berikutnya dibuka.</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </Reveal>
          </>
        )}
    </ApplicationPage>
  );
}
