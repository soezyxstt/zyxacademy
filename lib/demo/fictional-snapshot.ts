import { publicDemoSnapshotSchema } from "./snapshot";

export const publicDemoCourseTitles = ["Matematika I", "Fisika Dasar I", "Kimia Dasar I", "Berpikir Komputasional"] as const;

/** Fictional baseline only. Real product authorization always runs separately. */
export function fictionalDemoSnapshot(courseId: string) {
  return publicDemoSnapshotSchema.parse({
    version: 2, contentPolicy: "free-first-chapter", courseId,
    revision: "demo-2026-11-05-v1", displayName: "Pelajar Demo", asOf: "2026-11-05", streakDays: 3,
    course: { completedMaterials: 16, totalMaterials: 40, nextConcept: "Penerapan konsep" },
    mockChapters: [
      { id: "fictional-next", title: "Pengembangan konsep", orderIndex: 2, completionPercent: 45 },
      { id: "fictional-application", title: "Penerapan dan latihan", orderIndex: 3, completionPercent: 20 },
    ],
    inProgressDocuments: [{ id: "fictional-document", title: "Pengantar konsep", completionPercent: 60 }],
    flashcards: { dueCount: 8, recentReviews: [{ id: "fictional-review", front: "Bagaimana mengenali konsep utama?", grade: 3, reviewedOn: "2026-11-05" }] },
    weakConcepts: [{ id: "fictional-concept", title: "Menghubungkan konsep", masteryPercent: 45 }],
    availableAssessments: [{ id: "fictional-assessment", title: "Latihan konsep", type: "quiz" }],
    history: ["2026-06-12", "2026-07-10", "2026-08-16", "2026-09-20", "2026-10-28", "2026-11-03", "2026-11-04", "2026-11-05"].map((date, index) => ({
      date, materialsCompleted: index < 5 ? 3 : index === 5 ? 1 : 0,
      flashcardsReviewed: index < 5 ? 12 : 4, quizzesCompleted: index % 2,
    })),
  });
}
