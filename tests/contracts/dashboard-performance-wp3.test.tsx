import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { Suspense } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { notFound, redirect } from "next/navigation";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { loadMessages } from "@/lib/i18n/catalogs";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import type { StudentEnrollmentRecord } from "@/lib/student/course-catalog";

mock.module("server-only", () => ({}));
process.env.SKIP_ENV_VALIDATION ??= "1";
process.env.ZYX_POSTGRES_BUILD_PLACEHOLDER ??= "1";

const messages = await loadMessages("id");
const { ApplicationPage } = await import("@/components/application-page");
const { DashboardSectionErrorBoundary, DashboardSectionErrorFallback } =
  await import("@/app/(student)/dashboard/dashboard-section-error-boundary");
const {
  DashboardHeaderShell,
  DashboardPrimaryLearningSkeleton,
  DashboardSectionSkeleton,
} = await import("@/app/(student)/dashboard/dashboard-skeletons");
const {
  PrimaryLearningSection,
  ReviewQueueSection,
  TodayPlanSection,
  WeeklyReflectionSection,
  loadAvailableAssessmentsData,
  loadOnboardingData,
  loadPrimaryLearningData,
  loadRecommendedCoursesData,
  resolveStudentAcademicProfile,
  syncDashboardStreak,
} = await import("@/app/(student)/dashboard/dashboard-sections");
type DashboardSectionDeps = import("@/app/(student)/dashboard/dashboard-sections").DashboardSectionDeps;

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockRouter(onRefresh?: () => void): AppRouterInstance {
  return {
    back: () => {},
    forward: () => {},
    refresh: () => onRefresh?.(),
    push: () => {},
    replace: () => {},
    prefetch: () => {},
  };
}

function wrapProviders(node: React.ReactNode, router = createMockRouter()) {
  return (
    <AppRouterContext.Provider value={router}>
      <LocaleProvider initialLocale="id" initialMessages={messages}>
        {node}
      </LocaleProvider>
    </AppRouterContext.Provider>
  );
}

const sampleEnrollment: StudentEnrollmentRecord = {
  id: "ma1101",
  canonicalId: "mk-ma1101",
  legacyId: "ma1101",
  title: "Matematika IA",
  category: "TPB",
  description: "Kalkulus dasar TPB",
  enrolledAt: new Date("2026-08-01T00:00:00.000Z"),
  expiresAt: new Date("2026-12-31T00:00:00.000Z"),
};

type MaterialList = Awaited<ReturnType<DashboardSectionDeps["getCourseMaterials"]>>;
type ProgressList = Awaited<ReturnType<DashboardSectionDeps["getMaterialsProgress"]>>;
type StudyPathList = Awaited<ReturnType<DashboardSectionDeps["getOrComputeStudyPath"]>>;
type ReviewQueueList = Awaited<ReturnType<DashboardSectionDeps["getReviewQueue"]>>;
type QuizList = Awaited<ReturnType<DashboardSectionDeps["getCourseQuizzes"]>>;
type TryoutList = Awaited<ReturnType<DashboardSectionDeps["getCourseTryouts"]>>;
type SubmissionList = Awaited<ReturnType<DashboardSectionDeps["getStudentSubmissions"]>>;
type ChapterOutlineList = Awaited<ReturnType<DashboardSectionDeps["getCourseChapterOutline"]>>;

const sampleMaterials: MaterialList = [
  {
    id: "mat-1",
    courseId: "ma1101",
    chapterId: "bab-1",
    title: "Artikel Limit",
    kind: "article",
    docCategory: "materi",
    fileSize: "10 menit baca",
    completed: false,
    completionPercent: 45,
    isPastYear: false,
    isPreview: false,
    chapterIds: ["bab-1"],
  },
  {
    id: "mat-2",
    courseId: "ma1101",
    chapterId: "bab-2",
    title: "Artikel Turunan",
    kind: "article",
    docCategory: "materi",
    fileSize: "12 menit baca",
    completed: true,
    completionPercent: 100,
    isPastYear: false,
    isPreview: false,
    chapterIds: ["bab-2"],
  },
];

describe("WP3 dashboard streaming orchestration and error recovery", () => {
  test("keeps Free onboarding in the streamed child and only auth and enrollments in the parent gate", () => {
    const page = readFileSync("app/(student)/dashboard/page.tsx", "utf8");
    const sections = readFileSync("app/(student)/dashboard/dashboard-sections.tsx", "utf8");
    const parent = page.slice(page.indexOf("export default async function DashboardPage"));
    expect(parent.match(/\bawait\b/g)).toHaveLength(1);
    expect(parent).toContain("getAuthSession(),");
    expect(parent).toContain("getStudentEnrollments(),");
    expect(parent).toContain("<DashboardOnboardingSection user={user} userName={userName} />");
    expect(sections).toContain("d.getCourseChapterOutline(course.id, userId)");
    expect(sections).toContain("d.getCourseMaterials(course.id, userId)");
    expect(sections).toContain("d.getCourseQuizzes(course.id, userId)");
    expect(sections).toContain("freeChapters: chapterOutline.map");
    expect(sections).toContain("firstIncompleteMaterialId: firstIncompleteChapter?.materialId ?? null");
    expect(sections).toContain("completedFreeMaterialCount: completedMaterialCount");
  });

  test("flushes header shell immediately and resolves child Suspense boundaries independently", async () => {
    const primaryGate = createDeferred<MaterialList>();
    const reviewGate = createDeferred<ReviewQueueList>();

    const stream = await renderToReadableStream(
      wrapProviders(
        <ApplicationPage className="pb-16">
          <DashboardHeaderShell firstName="Budi" />
          <DashboardSectionErrorBoundary variant="primary">
            <Suspense fallback={<DashboardPrimaryLearningSkeleton count={1} />}>
              <PrimaryLearningSection
                userId="student-1"
                enrollments={[sampleEnrollment]}
                deps={{
                  getMaterialsProgress: async () => [] as ProgressList,
                  getCourseMaterials: () => primaryGate.promise,
                  queryInProgressMaterialProgress: async () => [],
                  getOrComputeStudyPath: async () => [] as StudyPathList,
                }}
              />
            </Suspense>
          </DashboardSectionErrorBoundary>
          <DashboardSectionErrorBoundary variant="secondary">
            <Suspense fallback={<DashboardSectionSkeleton rows={2} />}>
              <ReviewQueueSection
                userId="student-1"
                enrollments={[sampleEnrollment]}
                deps={{
                  getReviewQueue: () => reviewGate.promise,
                  queryRecentFlashcardReviews: async () => [],
                }}
              />
            </Suspense>
          </DashboardSectionErrorBoundary>
        </ApplicationPage>,
      ),
    );

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const firstChunk = await reader.read();
    let html = decoder.decode(firstChunk.value, { stream: true });

    expect(html).toContain("Halo");
    expect(html).toContain("Budi");
    expect(html).not.toContain("Matematika IA");

    primaryGate.resolve(sampleMaterials);
    while (!html.includes("Matematika IA")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
    }
    expect(html).toContain("Artikel Limit");
    expect(html).not.toContain("/courses/ma1101/flashcard");

    reviewGate.resolve([]);
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
    }
    expect(html).toContain("/courses/ma1101/flashcard");
  });

  test("isolates secondary RSC failures, separates primary vs secondary fallback UI, and wires catchError retry", async () => {
    const capturedErrors: unknown[] = [];
    const stream = await renderToReadableStream(
      wrapProviders(
        <ApplicationPage className="pb-16">
          <DashboardSectionErrorBoundary variant="primary" sectionTitle="Kelas aktif">
            <Suspense fallback={<DashboardPrimaryLearningSkeleton count={1} />}>
              <PrimaryLearningSection
                userId="student-1"
                enrollments={[sampleEnrollment]}
                deps={{
                  getMaterialsProgress: async () => [] as ProgressList,
                  getCourseMaterials: async () => sampleMaterials,
                  queryInProgressMaterialProgress: async () => [],
                  getOrComputeStudyPath: async () =>
                    [{ conceptName: "Limit Fungsi", status: "available" }] as unknown as StudyPathList,
                }}
              />
            </Suspense>
          </DashboardSectionErrorBoundary>
          <DashboardSectionErrorBoundary variant="secondary" sectionTitle="Spaced repetition">
            <Suspense fallback={<DashboardSectionSkeleton rows={2} />}>
              <ReviewQueueSection
                userId="student-1"
                enrollments={[sampleEnrollment]}
                deps={{
                  getReviewQueue: async () => {
                    throw new Error("DB timeout for secret.student@itb.ac.id");
                  },
                  queryRecentFlashcardReviews: async () => [],
                }}
              />
            </Suspense>
          </DashboardSectionErrorBoundary>
        </ApplicationPage>,
      ),
      { onError: (err) => capturedErrors.push(err) },
    );

    await stream.allReady;
    const html = await new Response(stream).text();
    expect(capturedErrors).toHaveLength(1);
    expect(html).toContain("Matematika IA");
    expect(html).toContain("Limit Fungsi");
    // React development embeds server debugging metadata in template attributes.
    // Assert rendered UI separately; production also must omit the raw metadata.
    expect(html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g, "")).not.toContain("secret.student@itb.ac.id");
    if (process.env.NODE_ENV === "production") expect(html).not.toContain("secret.student@itb.ac.id");

    let refreshed = 0;
    let retried = 0;
    const sensitiveError = new Error("SELECT * FROM users WHERE email='secret@itb.ac.id'");
    const errorInfo = { error: sensitiveError, reset: () => {}, retry: () => { retried += 1; } };

    let capturedElement: React.ReactElement | null = null;
    function InspectBoundary() {
      const BoundaryFn = DashboardSectionErrorBoundary as unknown as (p: Record<string, unknown>) => React.ReactElement;
      capturedElement = BoundaryFn({ variant: "primary", children: React.createElement("span", null, "ok") });
      return capturedElement;
    }
    expect(renderToStaticMarkup(wrapProviders(<InspectBoundary />))).toBe("<span>ok</span>");

    const CatchErrorCtor = (capturedElement as unknown as {
      type: {
        new (props: Record<string, unknown>): {
          context: AppRouterInstance;
          state: { error: unknown };
          setState: (next: { error: unknown }) => void;
          retry: () => void;
        };
        getDerivedStateFromError: (err: unknown) => { error: { thrownValue: unknown } };
      };
    }).type;

    let routerRedirectErr: unknown;
    try {
      redirect("/login");
    } catch (err) {
      routerRedirectErr = err;
    }
    expect(() => CatchErrorCtor.getDerivedStateFromError(routerRedirectErr)).toThrow();

    const derived = CatchErrorCtor.getDerivedStateFromError(sensitiveError);
    const instance = new CatchErrorCtor({ pathname: "/dashboard", isPagesRouter: false, props: { variant: "primary" } });
    instance.state = { error: derived.error };
    instance.context = createMockRouter(() => { refreshed += 1; });
    instance.setState = (next) => { instance.state = next; };
    instance.retry();
    expect(refreshed).toBe(1);
    expect(instance.state.error).toBeNull();

    let retryFromFallback: (() => void) | undefined;
    function FallbackHarness(props: Parameters<typeof DashboardSectionErrorFallback>[0]) {
      const fallback = DashboardSectionErrorFallback(props, errorInfo);
      if (fallback) {
        retryFromFallback = fallback.props.children[1].props.children.props.onRetry;
      }
      return <>{fallback}</>;
    }
    const primaryHtml = renderToStaticMarkup(wrapProviders(<FallbackHarness variant="primary" sectionTitle="Kelas aktif" />));
    const secondaryHtml = renderToStaticMarkup(wrapProviders(<FallbackHarness variant="secondary" sectionTitle="Spaced repetition" />));
    const silentHtml = renderToStaticMarkup(wrapProviders(<FallbackHarness variant="silent" />));

    expect(primaryHtml).toContain('data-error-variant="primary"');
    expect(primaryHtml).toContain("Terjadi kendala");
    expect(primaryHtml).toContain("Coba lagi");
    expect(primaryHtml).toContain("text-body-sm");
    expect(primaryHtml).not.toContain("secret@itb.ac.id");
    expect(secondaryHtml).toContain('data-error-variant="secondary"');
    expect(secondaryHtml).not.toContain("border-status-error/25");
    expect(silentHtml).toBe("");

    expect(retryFromFallback).toBe(errorInfo.retry);
    retryFromFallback!();
    expect(retried).toBe(1);
  });

  test("preserves Next.js redirect and notFound control signals across child catch blocks", async () => {
    let signal: unknown;
    try {
      redirect("/login");
    } catch (err) {
      signal = err;
    }
    expect(isNextRouterError(signal)).toBe(true);

    await expect(
      resolveStudentAcademicProfile({ id: "u1" }, { queryUserAcademicFields: async () => redirect("/login") }),
    ).rejects.toThrow();
    await expect(
      syncDashboardStreak("u1", { getOrUpdateStreak: async () => notFound() }),
    ).rejects.toThrow();
    await expect(
      loadPrimaryLearningData("u1", [sampleEnrollment], {
        getMaterialsProgress: async () => [] as ProgressList,
        getCourseMaterials: async () => sampleMaterials,
        queryInProgressMaterialProgress: async () => [],
        getOrComputeStudyPath: async () => redirect("/courses"),
      }),
    ).rejects.toThrow();
    await expect(
      WeeklyReflectionSection({ userId: "u1", deps: { queryLatestWeeklyReflection: async () => notFound() } }),
    ).rejects.toThrow();
  });

  test("serializes server streak before TodayPlan mount and preserves streak on onboarding", async () => {
    const events: string[] = [];
    const streakGate = createDeferred<{ current: number; longest: number }>();

    const todayPromise = TodayPlanSection({
      userId: "student-1",
      firstName: "Siti",
      deps: {
        getOrUpdateStreak: async () => {
          events.push("streak:start");
          const res = await streakGate.promise;
          events.push("streak:done");
          return res as Awaited<ReturnType<DashboardSectionDeps["getOrUpdateStreak"]>>;
        },
      },
    }).then((el) => {
      events.push("todayPlan:ready");
      return el;
    });

    await Promise.resolve();
    expect(events).toEqual(["streak:start"]);

    streakGate.resolve({ current: 4, longest: 7 });
    const element = await todayPromise;
    expect(events).toEqual(["streak:start", "streak:done", "todayPlan:ready"]);
    expect(element.props.firstName).toBe("Siti");

    let onboardingStreakCalls = 0;
    const onboarding = await loadOnboardingData(
      { id: "student-new", faculty: "FMIPA", major: "TPB FMIPA (Belum Penjurusan)", entryYear: 2026 },
      {
        getOrUpdateStreak: async () => {
          onboardingStreakCalls += 1;
          return { current: 1, longest: 1 } as Awaited<ReturnType<DashboardSectionDeps["getOrUpdateStreak"]>>;
        },
        listStudentCourses: async () => [
          { id: "ma1101", canonicalId: "mk-ma1101", legacyId: "ma1101", title: "Matematika IA", category: "TPB", description: "Kalkulus" },
          { id: "embed-test-course", canonicalId: null, legacyId: "embed-test-course", title: "Fixture", category: "TPB", description: "" },
        ],
        getCatalogCourseSummaries: async (list) =>
          list.map((c) => ({ id: c.id, title: c.title, category: c.category, description: c.description, materialsCount: 2, quizzesCount: 1, tryoutsCount: 0 })),
        getCourseChapterOutline: async () =>
          [{ id: "ch-1", title: "Bab 1 Limit", completed: false, completionPercent: 50, hasMaterial: true, materialId: "mat-1" }] as unknown as ChapterOutlineList,
        getCourseMaterials: async () => sampleMaterials,
        getCourseQuizzes: async () => [{ id: "q-1" }] as unknown as QuizList,
        isPkaEnabled: () => false,
      },
    );

    expect(onboardingStreakCalls).toBe(1);
    expect(onboarding.studentTargetCategory).toBe("TPB");
    expect(onboarding.catalogCourses).toHaveLength(1);
    expect(onboarding.catalogCourses[0]?.completedFreeMaterialCount).toBe(1);
    expect(onboarding.catalogCourses[0]?.firstIncompleteMaterialId).toBe("mat-1");
  });

  test("preserves differential outputs for open-material merge, major recommendations, and pending_review exams", async () => {
    const primary = await loadPrimaryLearningData("student-1", [sampleEnrollment], {
      getMaterialsProgress: async () => [{ materialId: "mat-2", status: "completed" }] as unknown as ProgressList,
      getCourseMaterials: async () => sampleMaterials,
      queryInProgressMaterialProgress: async () => [{ materialId: "mat-1", completionPercent: 65, lastSectionId: "sec-limit-2" }],
      getOrComputeStudyPath: async () =>
        [{ conceptName: "Himpunan", status: "mastered" }, { conceptName: "Kekontinuan", status: "in_progress" }] as unknown as StudyPathList,
    });

    expect(primary.completedIds.has("mat-2")).toBe(true);
    expect(primary.nextConcepts.ma1101).toBe("Kekontinuan");
    expect(primary.inProgressDocuments).toHaveLength(1);
    expect(primary.inProgressDocuments[0]).toMatchObject({
      id: "mat-1",
      completionPercent: 65,
      lastSectionId: "sec-limit-2",
    });

    const recommended = await loadRecommendedCoursesData(
      { id: "student-1", faculty: "STEI", major: "TPB STEI (Belum Penjurusan)", entryYear: 2026 },
      ["ma1101"],
      {
        isPkaEnabled: () => false,
        listStudentCourses: async () => [
          { id: "ma1101", canonicalId: "mk-ma1101", legacyId: "ma1101", title: "Matematika IA", category: "TPB", description: "" },
          { id: "fi1101", canonicalId: "mk-fi1101", legacyId: "fi1101", title: "Fisika Dasar IA", category: "TPB", description: "" },
          { id: PKA_COURSE_ID, canonicalId: null, legacyId: PKA_COURSE_ID, title: "Tutorial PKA", category: "TPB", description: "" },
          { id: "if2110", canonicalId: null, legacyId: "if2110", title: "Algoritma", category: "Teknik Informatika", description: "" },
        ],
        getCourseMaterials: async () => sampleMaterials,
      },
    );

    expect(recommended.studentTargetCategory).toBe("TPB");
    expect(recommended.recommendedCourses.map((c) => c.id)).toEqual(["fi1101"]);

    const assessments = await loadAvailableAssessmentsData([sampleEnrollment], {
      getStudentSubmissions: async () =>
        [{ examId: "quiz-graded", status: "graded" }, { examId: "tryout-pending", status: "pending_review" }] as unknown as SubmissionList,
      getCourseQuizzes: async () => [{ id: "quiz-graded", title: "Kuis 1 Limit", type: "quiz", status: "published" }] as unknown as QuizList,
      getCourseTryouts: async () => [{ id: "tryout-pending", title: "Tryout UTS", type: "tryout", status: "published" }] as unknown as TryoutList,
    });

    expect(assessments.map((exam) => exam.id)).toEqual(["tryout-pending"]);
    expect(assessments[0]?.courseTitle).toBe("Matematika IA");
  });
});
