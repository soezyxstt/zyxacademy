"use client";

import { TryoutsClient } from "@/app/(tutor)/tutor/[courseId]/tryouts/tryouts-client";

export default function TutorTryoutsFixture() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <TryoutsClient
        courseId="visual-math"
        initialTryouts={[{ id: "tryout-1", courseId: "visual-math", title: "Tryout matematika dasar", type: "tryout", status: "draft", settings: { timeLimitMinutes: 90 } }]}
        initialQuestions={[{ id: "question-1", examId: "tryout-1", type: "multiple_choice", order: 1, content: { prompt: "Berapa hasil turunan fungsi ini?", options: ["Dua", "Empat"], correctIndex: 0 } }]}
        questionBank={Array.from({ length: 21 }, (_, index) => ({ id: `bank-${index + 1}`, prompt: `Pertanyaan bank ${index + 1}`, questionType: "multiple_choice", difficulty: "medium", origin: "zyx_original" as const, sourceEventName: null }))}
      />
    </main>
  );
}
