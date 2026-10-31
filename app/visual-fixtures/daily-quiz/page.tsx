"use client";

import { DailyQuizPopup } from "@/components/course/daily-quiz-popup";

export default function DailyQuizFixture() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <h1 className="font-heading text-h5">Matematika</h1>
      <DailyQuizPopup courseId="visual-daily-quiz" courseTitle="Matematika" dailyTrivia={{
        id: "visual-question",
        question: "Berapakah hasil 2 + 2?",
        options: ["3", "4", "5"],
        correctIndex: 1,
        explanation: "Dua ditambah dua sama dengan empat.",
      }} />
    </main>
  );
}
