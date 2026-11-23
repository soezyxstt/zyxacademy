import { describe, expect, mock, test } from "bun:test";
import type { StudentEnrollmentRecord } from "@/lib/student/course-catalog";

mock.module("server-only", () => ({}));
process.env.SKIP_ENV_VALIDATION ??= "1";
process.env.ZYX_POSTGRES_BUILD_PLACEHOLDER ??= "1";

const { pickDashboardPriority } = await import("@/components/dashboard/dashboard-focus-strip");
const { loadFocusData } = await import("@/app/(student)/dashboard/dashboard-sections");

const sampleEnrollments: StudentEnrollmentRecord[] = [
  {
    id: "ma1101",
    canonicalId: "ma1101",
    legacyId: "ma1101",
    title: "Matematika I",
    category: "TPB",
    description: null,
    pricing: { tier: "premium", price: 0, label: "Premium" },
  } as unknown as StudentEnrollmentRecord,
];

describe("dashboard focus strip priority", () => {
  test("picks cards > weak > materials > exams > null in urgency order", () => {
    expect(
      pickDashboardPriority({
        cards: { due: 12, href: "/courses/ma1101/flashcard" },
        weak: { weakCount: 3, measuredCount: 5, lowest: { conceptName: "Limit", score: 15 }, href: "/courses/ma1101/mastery" },
        materials: { done: 2, total: 6, href: "/courses/ma1101" },
        exams: { quizzes: 2, tryouts: 1, href: "/courses/ma1101/quiz/1" },
      }),
    ).toBe("cards");

    expect(
      pickDashboardPriority({
        cards: { due: 0, href: "/courses/ma1101/flashcard" },
        weak: { weakCount: 2, measuredCount: 5, lowest: { conceptName: "Limit", score: 20 }, href: "/courses/ma1101/mastery" },
        materials: { done: 2, total: 6, href: "/courses/ma1101" },
        exams: { quizzes: 2, tryouts: 0, href: "/courses/ma1101/quiz/1" },
      }),
    ).toBe("weak");

    expect(
      pickDashboardPriority({
        cards: { due: 0, href: "/courses/ma1101/flashcard" },
        weak: { weakCount: 0, measuredCount: 5, lowest: { conceptName: "Limit", score: 75 }, href: "/courses/ma1101/mastery" },
        materials: { done: 2, total: 6, href: "/courses/ma1101" },
        exams: { quizzes: 1, tryouts: 0, href: "/courses/ma1101/quiz/1" },
      }),
    ).toBe("materials");

    expect(
      pickDashboardPriority({
        cards: { due: 0, href: "/courses/ma1101/flashcard" },
        weak: { weakCount: 0, measuredCount: 5, lowest: { conceptName: "Limit", score: 85 }, href: "/courses/ma1101/mastery" },
        materials: { done: 6, total: 6, href: "/courses/ma1101" },
        exams: { quizzes: 1, tryouts: 0, href: "/courses/ma1101/quiz/1" },
      }),
    ).toBe("exams");

    expect(
      pickDashboardPriority({
        cards: { due: 0, href: "/courses/ma1101/flashcard" },
        weak: { weakCount: 0, measuredCount: 0, lowest: null, href: "/courses/ma1101/mastery" },
        materials: { done: 6, total: 6, href: "/courses/ma1101" },
        exams: { quizzes: 0, tryouts: 0, href: null },
      }),
    ).toBeNull();
  });

  test("loadFocusData aggregates metrics and tolerates partial source failure", async () => {
    const data = await loadFocusData("student-1", sampleEnrollments, {
      getMaterialsProgress: async () => [],
      getCourseMaterials: async () => [
        { id: "m1", title: "Bab 1", kind: "article", completed: true },
        { id: "m2", title: "Bab 2", kind: "article", completed: false },
      ] as never,
      queryInProgressMaterialProgress: async () => [],
      getOrComputeStudyPath: async () => [],
      getReviewQueue: async () => [{ id: "fc-1" }, { id: "fc-2" }] as never,
      queryRecentFlashcardReviews: async () => [],
      getMastery: async () => [
        { conceptName: "Akar kuadrat", masteryScore: 12, confidence: 0.5, evidenceCount: 2, isMeasured: true, trend: "declining", blockedBy: [], lastEvidenceAt: new Date() },
        { conceptName: "Limit fungsi", masteryScore: 72, confidence: 0.7, evidenceCount: 3, isMeasured: true, trend: "improving", blockedBy: [], lastEvidenceAt: new Date() },
      ],
      getStudentSubmissions: async () => {
        throw new Error("temporary failure");
      },
      getCourseQuizzes: async () => [],
      getCourseTryouts: async () => [],
    });

    expect(data).not.toBeNull();
    expect(data?.cards).toEqual({ due: 2, href: "/courses/ma1101/flashcard" });
    expect(data?.materials).toEqual({ done: 1, total: 2, href: "/courses/ma1101" });
    expect(data?.weak?.weakCount).toBe(1);
    expect(data?.weak?.lowest).toEqual({ conceptName: "Akar kuadrat", score: 12 });
    expect(data?.exams).toBeNull();
    expect(data?.priority).toBe("cards");
  });
});
