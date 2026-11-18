"use client";

import { QuizForm } from "@/app/(admin)/admin/(eval)/quizzes/_components/quiz-form";

export default function AdminQuizPickerFixture() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <QuizForm courses={[{ id: "visual-math", title: "Matematika" }]} />
    </main>
  );
}
