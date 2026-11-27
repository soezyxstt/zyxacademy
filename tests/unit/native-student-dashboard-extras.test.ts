import { beforeEach, expect, mock, test } from "bun:test";
import { interventions, weeklyReflections } from "@/db/schema";
import type { StudentEnrollmentRecord } from "@/lib/student/course-catalog";

const student = "student-a";
const course: StudentEnrollmentRecord = {
  id: "math", title: "Matematika I", category: "TPB", description: "",
  canonicalId: null, legacyId: "math", enrolledAt: null, expiresAt: null,
  pricing: { category: "premium", startsAt: null, endsAt: null },
};

const buildPlan = mock(async (_userId: string, _ids: string[]) => ({
  items: [
    { id: "allowed", kind: "module", title: "Free preview", href: "/courses/math/material/allowed", done: false },
    { id: "revoked", kind: "module", title: "Revoked", href: "/courses/revoked/material/revoked", done: false },
    { id: "escape", kind: "module", title: "Mismatched course", href: "/courses/math/../revoked/material/escape", done: false },
  ],
}));
const getReviews = mock(async () => ({
  totalDueFlashcards: 2, firstCourseWithQueue: course.id,
  recentReviews: [
    { id: "review", front: "What is a function?", courseTitle: course.title, grade: 3, reviewedAt: new Date("2030-01-01T00:00:00Z") },
    { id: "review-old", front: "Outside the active dashboard", courseTitle: "Other class", grade: 2, reviewedAt: new Date("2030-01-01T00:00:00Z") },
  ],
}));
const getGameAccess = mock(async (): Promise<{ user: { id: string } } | null> => ({ user: { id: student } }));
const getGameSummary = mock(async () => ({ rankKey: "rakyat", baseXpMicro: 2_000_000, bonusXpMicro: 1_000_000, lpBalance: 5 }));
const getMastery = mock(async () => [{ conceptName: "Limit", masteryScore: 41.9, isMeasured: true, evidenceCount: 2 }]);
const getExams = mock(async () => [{ id: "quiz-1", title: "Quiz", type: "quiz", courseId: course.id, courseTitle: course.title }]);

mock.module("@/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          orderBy: () => ({
            async limit() {
              if (table === interventions) return [{
                id: "suggestion", courseId: "math", concept: "Fungsi", reason: "Practice",
                payload: { moduleHref: "https://outside.example", quizTemplateIds: ["quiz-1"], flashcardCount: 2 },
              }];
              if (table === weeklyReflections) return [{
                weekStart: "2030-01-01",
                payload: { completed: { quizzes: 1, flashcards: 2, modules: 3 }, masteryGrowth: 5, mostImproved: "Limit" },
              }];
              return [];
            },
          }),
        }),
      }),
    }),
  },
}));
mock.module("@/app/(student)/dashboard/dashboard-sections", () => ({ loadReviewQueueData: getReviews, loadAvailableAssessmentsData: getExams }));
mock.module("@/lib/gamification/access", () => ({ getStudentGamificationAccess: getGameAccess }));
mock.module("@/lib/gamification/catalog", () => ({ MICRO: 1_000_000 }));
mock.module("@/lib/gamification/queries", () => ({ getGamificationSummary: getGameSummary }));
mock.module("@/lib/mastery-store", () => ({ getMastery }));
mock.module("@/lib/recommendation-service", () => ({ getOrBuildTodayRecommendation: buildPlan }));
mock.module("@/lib/streak-service", () => ({ getOrUpdateStreak: async () => ({ current: 3 }) }));
mock.module("@/lib/student/dashboard-read-model", () => ({ getDashboardCourseExamsBatch: mock() }));

const { loadNativeDashboardExtras } = await import("@/lib/student/native-dashboard-extras");

beforeEach(() => {
  for (const spy of [buildPlan, getReviews, getGameAccess, getGameSummary, getMastery, getExams]) spy.mockClear();
});

test("keeps today's plan and review links within active course scope", async () => {
  const data = await loadNativeDashboardExtras(student, [course]);
  expect(buildPlan).toHaveBeenCalledWith(student, ["math"]);
  expect(data.today?.items.map(item => item.id)).toEqual(["allowed"]);
  expect(data.reviews?.recent.map(item => item.id)).toEqual(["review"]);
  expect(data.intervention?.materialHref).toBe("/courses/math");
  expect(data.intervention?.quizHref).toBe("/courses/math/quiz/quiz-1");
  expect(data.achievements?.xp).toBe(3);
  expect(data.reflection?.masteryGrowth).toBe(5);
  expect(data.mastery?.concepts[0]?.score).toBe(42);
  expect(data.assessments?.items[0]?.id).toBe("quiz-1");
});

test("keeps successful sibling sections and preserves the stricter achievements access gate", async () => {
  getReviews.mockRejectedValueOnce(new Error("Database temporarily unavailable"));
  getGameAccess.mockResolvedValueOnce({ user: { id: "student-b" } });
  const data = await loadNativeDashboardExtras(student, [course]);
  expect(data.partial).toBeTrue();
  expect(data.reviews).toBeUndefined();
  expect(data.today?.streak).toBe(3);
  expect(data.achievements).toBeUndefined();
  expect(getGameSummary).not.toHaveBeenCalled();
});

test("skips supplemental reads when the Student has no active classes", async () => {
  expect(await loadNativeDashboardExtras(student, [])).toEqual({ view: "dashboard-extras" });
  expect(buildPlan).not.toHaveBeenCalled();
  expect(getGameAccess).not.toHaveBeenCalled();
});
