"use client";

import { QuizzesClient } from "@/app/(tutor)/tutor/[courseId]/quizzes/quizzes-client";

const questionBank = Array.from({ length: 21 }, (_, index) => ({
  id: `q-${index + 1}`,
  courseId: "visual-math",
  origin: "zyx_original" as const,
  prompt: `Pertanyaan contoh ${index + 1}`,
  options: ["Pilihan pertama", "Pilihan kedua"],
  correctIndices: [1],
  difficulty: "medium" as const,
  questionType: "multiple_choice" as const,
  explanation: "Penjelasan jawaban.",
  tags: [],
}));

export default function TutorQuizListFixture() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <QuizzesClient courseId="visual-math" initialQuestionBank={questionBank} initialTemplates={[{
        id: "quiz-1", courseId: "visual-math", title: "Kuis turunan dan penerapannya", category: "weekly",
        visibility: "free", status: "draft", manualStatus: "open", timeLimitSeconds: 1800,
        maxAttempts: 2, selectionRules: { count: 2, fixedQuestionIds: ["q-1", "q-2"] }, creatorName: "Pengajar",
      }]} />
    </main>
  );
}
