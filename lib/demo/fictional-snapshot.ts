import { publicDemoSnapshotSchema } from "./snapshot";
import { addCalendarDays } from "@/lib/date-utils";

export const publicDemoCourseTitles = ["Matematika I", "Fisika Dasar I", "Kimia Dasar I", "Berpikir Komputasional"] as const;

/** Fictional baseline only. Real product authorization always runs separately. */
export function fictionalDemoSnapshot(courseId: string, title?: string, counts?: { total: number; completed: number }) {
  const profile = ({
    "Matematika I": { completed: [4, 3, 4, 2, 3, 2, 1, 1], total: 42, streak: 6, due: 9, concept: "Turunan dan perubahan", mastery: 58 },
    "Fisika Dasar I": { completed: [2, 3, 2, 2, 1, 1, 0, 1], total: 34, streak: 2, due: 5, concept: "Gaya dan gerak", mastery: 43 },
    "Kimia Dasar I": { completed: [3, 2, 2, 3, 2, 1, 1, 0], total: 38, streak: 4, due: 7, concept: "Ikatan kimia", mastery: 51 },
    "Berpikir Komputasional": { completed: [1, 1, 2, 1, 1, 0, 1, 0], total: 20, streak: 1, due: 3, concept: "Dekomposisi masalah", mastery: 67 },
  } as const)[title ?? ""] ?? { completed: [3, 3, 3, 3, 3, 1, 0, 0], total: 40, streak: 3, due: 8, concept: "Menghubungkan konsep", mastery: 45 };
  const completed = counts?.completed ?? profile.completed.reduce<number>((sum, count) => sum + count, 0);
  const dates = ["2026-06-12", "2026-07-10", "2026-08-16", "2026-09-20", "2026-10-28", ...Array.from({ length: profile.streak }, (_, index) => addCalendarDays("2026-11-05", index - profile.streak + 1))];
  const distribution = dates.map((_, index) => index < 5 ? profile.completed[index] : 1 + (index % 3));
  const weightTotal = distribution.reduce((sum, count) => sum + count, 0);
  const weights = distribution.map(count => completed * count / weightTotal);
  const historyCounts = weights.map(Math.floor);
  const remaining = completed - historyCounts.reduce((sum, count) => sum + count, 0);
  weights.map((weight, index) => ({ index, fraction: weight - historyCounts[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index).slice(0, remaining).forEach(({ index }) => historyCounts[index]++);
  return publicDemoSnapshotSchema.parse({
    version: 2, contentPolicy: "free-first-chapter", courseId,
    revision: "demo-2026-11-05-v2", displayName: "Pelajar Demo", asOf: "2026-11-05", streakDays: profile.streak,
    course: { completedMaterials: completed, totalMaterials: counts?.total ?? profile.total, nextConcept: profile.concept },
    mockChapters: [
      { id: "fictional-next", title: "Pengembangan konsep", orderIndex: 2, completionPercent: 45 },
      { id: "fictional-application", title: "Penerapan dan latihan", orderIndex: 3, completionPercent: 20 },
    ],
    inProgressDocuments: [{ id: "fictional-document", title: "Pengantar konsep", completionPercent: Math.min(90, profile.mastery + 10) }],
    flashcards: { dueCount: profile.due, recentReviews: [{ id: "fictional-review", front: "Bagaimana mengenali konsep utama?", grade: 3, reviewedOn: "2026-11-05" }] },
    weakConcepts: [{ id: "fictional-concept", title: profile.concept, masteryPercent: profile.mastery }],
    availableAssessments: [{ id: "fictional-assessment", title: "Latihan konsep", type: "quiz" }],
    history: dates.map((date, index) => ({
      date, materialsCompleted: historyCounts[index],
      flashcardsReviewed: index < 5 ? profile.due + index : Math.max(1, profile.due - index), quizzesCompleted: (index + profile.streak) % 2,
    })),
  });
}
