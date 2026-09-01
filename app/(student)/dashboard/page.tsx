import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import {
  ClipboardList,
  GraduationCap,
  Play,
  CheckCircle2,
  Bookmark,
  Trophy,
  ArrowUpRight,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageTitle } from "@/lib/site";
import { Reveal } from "@/components/ui/reveal";
import { auth } from "@/lib/auth";
import {
  getStudentEnrollments,
  getMaterialsProgress,
  getStudentSubmissions,
} from "@/app/(student)/dashboard/actions";
import { getCourseMaterials, getCourseQuizzes, getCourseTryouts } from "@/lib/course-utils";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
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
} from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getReviewQueue } from "@/lib/flashcard-actions";
import { WeeklyReflection } from "@/components/dashboard/weekly-reflection";
import { getOrUpdateStreak } from "@/lib/streak-service";
import { ActivateClassModal } from "@/components/dashboard/activate-class-modal";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { StudentOnboardingView } from "@/components/dashboard/student-onboarding-view";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { listStudentCourses } from "@/lib/student/course-catalog";

export const metadata: Metadata = {
  title: pageTitle("Dashboard Siswa"),
  description:
    "Pantau progres belajar, materi, kuis, tryout ITB TPB; semua dalam satu ruang belajar personal.",
};

const dashboardSectionClass = "border-b border-border/70 pb-6";
const dashboardInsetClass = "border-y border-border bg-background/35 px-4 py-5 md:px-5";

export default async function DashboardPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
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

  // If not enrolled in any course, fetch catalog courses for onboarding preview
  let catalogCourses: Array<{
    id: string;
    title: string;
    category: string;
    description: string;
    materialsCount: number;
    quizzesCount: number;
    tryoutsCount: number;
  }> = [];

  if (!isEnrolledInAny) {
    const dbCourses = await listStudentCourses();
    const TEST_COURSE_IDS = new Set([
      "embed-test-course",
      "miscon-test-course",
      "remed-test-course",
      "term-test-course",
      "graph-test-course",
    ]);
    const activeCourses = dbCourses.filter(
      (c) => !TEST_COURSE_IDS.has(c.id) && (c.id !== PKA_COURSE_ID || env.FEATURE_PKA === "1")
    );

    catalogCourses = await Promise.all(
      activeCourses.map(async (c) => {
        if (c.id === PKA_COURSE_ID) {
          return {
            id: c.id,
            title: c.title,
            category: c.category,
            description: c.description || "",
            materialsCount: 0,
            quizzesCount: 0,
            tryoutsCount: 0,
          };
        }
        const [materials, quizzes, tryouts] = await Promise.all([
          getCourseMaterials(c.id),
          getCourseQuizzes(c.id),
          getCourseTryouts(c.id),
        ]);
        return {
          id: c.id,
          title: c.title,
          category: c.category,
          description: c.description || "",
          materialsCount: materials.length,
          quizzesCount: quizzes.length,
          tryoutsCount: tryouts.length,
        };
      })
    );
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

  const totalDueFlashcards = user?.id && isEnrolledInAny
    ? (await Promise.all(enrollments.map((course) => getReviewQueue(user.id, course.id))))
        .reduce((total, queue) => total + queue.length, 0)
    : 0;

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
    <div className="pb-16 pt-8 md:pt-12">
      <div className="marketing-container">
        {!isEnrolledInAny ? (
          <Reveal duration="duration-500">
            <StudentOnboardingView
              userName={userName}
              catalogCourses={catalogCourses}
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
                              {streakInfo.current > 0 ? `${streakInfo.current} Hari` : "Mulai Hari Ini"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  }
                />
              </Reveal>
            )}

            <Reveal duration="duration-700">
              <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Column (Main study track) - 7 cols */}
            <div className="space-y-6 lg:col-span-7">
              {/* Classes list Section */}
              <section className={dashboardSectionClass}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-y-2">
                  <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                    <GraduationCap className="size-5 text-brand-primary" />
                    Kelas Aktif
                  </h2>
                  <div className="flex items-center gap-3">
                    <ActivateClassModal />
                    <Link href="/courses" className="text-body-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5">
                      Lihat Semua
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                </div>

                <div className="divide-y divide-border/50">
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
                        className="group block py-4 hover:bg-muted/30 px-4 -mx-4 rounded-xl transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            {/* Category Badge + Title on one line */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary uppercase tracking-wider ring-1 ring-brand-primary/20 shrink-0">
                                {course.category}
                              </span>
                              <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors truncate min-w-0">
                                {course.title}
                              </h3>
                            </div>
                            
                            {/* Sleek inline progress */}
                            <div className="mt-3 flex items-center gap-3 max-w-md">
                              <div className="h-1.5 w-24 overflow-hidden rounded bg-muted/70">
                                <div
                                  className="h-full bg-brand-primary transition-all duration-300 rounded"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="text-body-xs font-semibold text-foreground">{progressPct}%</span>
                              <span className="text-body-xs text-muted-foreground">({doneCount} dari {materials.length} materi)</span>
                            </div>

                            {nextConcepts[course.id] && (
                              <div className="mt-2.5 text-body-xs font-medium text-muted-foreground">
                                Langkah selanjutnya:{" "}
                                <span className="text-brand-primary font-semibold group-hover:underline">
                                  {nextConcepts[course.id]}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Interactive arrow indicator */}
                          <div className="flex size-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground group-hover:text-brand-primary group-hover:border-brand-primary/30 transition-all shrink-0">
                            <ArrowUpRight className="size-4" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>

              {/* Documents In Progress ("sedang dibaca tetapi belum selesai") */}
              <section className={dashboardSectionClass}>
                <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-5">
                  <Bookmark className="size-5 text-brand-primary" />
                  Materi Terbuka (Belum Selesai)
                </h2>
                {inProgressDocuments.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {inProgressDocuments.map((doc) => {
                      if (!doc) return null;
                      return (
                        <div key={doc.id} className="group py-4.5 first:pt-0 last:pb-0">
                          <Link
                            href={`/courses/${doc.courseId}/material/${doc.id}${doc.lastSectionId ? `?section=${encodeURIComponent(doc.lastSectionId)}` : ""}`}
                            className="flex items-center justify-between gap-4"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  {doc.courseTitle}
                                </span>
                                <span className="text-body-xs text-muted-foreground capitalize">
                                  ({doc.kind})
                                </span>
                              </div>
                              <h4 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors mt-2 truncate">
                                {doc.title}
                              </h4>
                              {/* Completion Progress Bar */}
                              <div className="mt-2.5 flex items-center gap-3 max-w-xs">
                                <div className="h-1.5 w-20 overflow-hidden rounded bg-muted/70">
                                  <div
                                    className="h-full bg-brand-primary transition-all duration-300 rounded"
                                    style={{ width: `${doc.completionPercent}%` }}
                                  />
                                </div>
                                <span className="text-body-xs font-semibold text-foreground">{doc.completionPercent}%</span>
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
                  <div className="flex flex-col items-center justify-center border-y border-dashed border-border/60 py-10 text-center">
                    <CheckCircle2 className="size-8 text-muted-foreground/30 mb-2" />
                    <p className="text-body-sm text-muted-foreground">Semua dokumen telah selesai dibaca.</p>
                  </div>
                )}
              </section>
            </div>

            {/* Right Column (Activities & Task list) - 5 cols */}
            <div className="space-y-6 lg:col-span-5">
              <DashboardWeakConcepts concepts={masteryConcepts} />

              {/* Status Spaced Repetition & Streak */}
              <section className={dashboardSectionClass}>
                <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-5">
                  <Flame className="size-5 text-brand-secondary fill-brand-secondary/10" />
                  Status Spaced Repetition
                </h2>
                <div className="space-y-4">
                  <div className={dashboardInsetClass}>
                    <div>
                      <p className="text-body-sm font-semibold text-foreground">
                        {totalDueFlashcards} kartu perlu diulas
                      </p>
                      <p className="text-body-xs text-muted-foreground mt-0.5">
                        Spaced repetition membantu ingatan jangka panjang
                      </p>
                    </div>
                  </div>

                  {streakInfo && (
                    <div className={cn(dashboardInsetClass, "flex items-center gap-3 border-t-0")}>
                      <Flame className="size-8 text-brand-secondary fill-brand-secondary/10 shrink-0" />
                      <div>
                        <p className="text-body-sm font-semibold text-foreground">
                          Streak belajar: {streakInfo.current} hari
                        </p>
                        <p className="text-body-xs text-muted-foreground mt-0.5">
                          Streak terpanjang: {streakInfo.longest} hari
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Recent Activity */}
              <section className={dashboardSectionClass}>
                <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-5">
                  <Trophy className="size-5 text-yellow-500" />
                  Aktivitas Ulasan Terbaru
                </h2>
                {recentReviews.length > 0 ? (
                  <ul className="divide-y divide-border/50">
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
                        <li key={review.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <span className={cn(
                              "inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0",
                              gradeColors[review.grade] || "text-muted-foreground border-border bg-muted/40"
                            )}>
                              {gradeLabels[review.grade] || "Ulasan"}
                            </span>
                            <p className="text-body-xs font-medium text-foreground mt-1.5 truncate">
                              {review.front}
                            </p>
                            <p className="text-body-xs text-muted-foreground mt-0.5">
                              {review.courseTitle}, {new Date(review.reviewedAt).toLocaleDateString("id-ID")}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center border-y border-dashed border-border/60 py-8 text-center">
                    <p className="text-body-xs text-muted-foreground">Belum ada ulasan baru-baru ini.</p>
                  </div>
                )}
              </section>
              
              {/* Quizzes and Tryouts */}
              <section className={dashboardSectionClass}>
                <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-5">
                  <ClipboardList className="size-5 text-brand-primary" />
                  Kuis & Tryout Tersedia
                </h2>
                {availableExams.length > 0 ? (
                  <ul className="divide-y divide-border/50">
                    {availableExams.map((exam) => (
                      <li key={exam.id} className="group py-4.5 first:pt-0 last:pb-0">
                        <Link
                          href={`/courses/${exam.courseId}/${exam.type}/${exam.id}`}
                          className="flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors truncate">
                              {exam.title}
                            </h4>
                            <p className="text-body-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                              <span className="font-semibold text-brand-primary">{exam.courseTitle}</span>
                              <span className="text-border-strong">,</span>
                              <span className="capitalize">{exam.type}</span>
                            </p>
                          </div>
                          <Button size="sm" className="rounded-md shrink-0 pointer-events-none group-hover:bg-brand-primary/95 transition-all">
                            Kerjakan
                          </Button>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center border-y border-dashed border-border/60 py-10 text-center">
                    <Trophy className="size-8 text-brand-secondary/60 mb-2" />
                    <p className="text-body-sm text-muted-foreground">Semua ujian telah selesai.</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </Reveal>
      </>
    )}
  </div>
</div>
);
}
