"use client";

import { TutorQuizForm, type QuestionBankItem } from "@/components/tutor/tutor-quiz-form";

const questionBank: QuestionBankItem[] = Array.from({ length: 45 }, (_, index) => ({
  id: `question-${index + 1}`,
  courseId: "visual-math",
  prompt: `Pertanyaan contoh ${index + 1}`,
  options: ["Pilihan pertama", "Pilihan kedua"],
  difficulty: "medium",
  questionType: "multiple_choice",
  tags: [],
}));

export default function TutorQuizPaginationFixture() {
  return <main className="min-h-screen bg-background p-4 text-foreground"><TutorQuizForm courseId="visual-math" courseTitle="Matematika" questionBank={questionBank} /></main>;
}
