import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import learning from "@/messages/id/learning.json";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";
import { QuizPlayer } from "@/components/course/quiz-player";
import { AttemptReview } from "@/components/course/attempt-review";
import { Toaster } from "@/components/ui/toast";

declare global {
  interface Window {
    quizFixture: { mode: "player" | "review" | "demo"; seconds?: number; perQuestionSeconds?: number; expectedUserId?: string };
  }
}

function App() {
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const config = window.quizFixture;
  return <main className="mx-auto max-w-5xl p-4 text-foreground">
    {config.mode === "review" ? <AttemptReview attemptId="fixture-attempt" /> : <QuizPlayer
      courseId="fixture-course" attemptId="fixture-attempt"
      expectedUserId={config.expectedUserId}
      transport={config.mode === "demo" ? { submit: async () => { setDemoSubmitted(true); } } : undefined}
      exam={{
        id: "fixture-quiz", title: "Kuis matematika",
        settings: {
          timeLimitSeconds: config.seconds ?? 600, requireAllAnswered: false,
          perQuestionTimerEnabled: Boolean(config.perQuestionSeconds),
          defaultQuestionTimerSeconds: config.perQuestionSeconds,
        },
        questions: [
          { id: "q1", order: 1, type: "multiple_choices", prompt: "Pilih bilangan genap.", options: ["Dua", "Tiga", "Empat"] },
          { id: "q2", order: 2, type: "essay", prompt: "Jelaskan langkah penyelesaian.", options: [] },
        ],
      }}
    />}
    {demoSubmitted && <p role="status">Jawaban demo tersimpan</p>}
    <Toaster />
  </main>;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ learning, studentCourse, ui }}><App /></NextIntlClientProvider>
  </QueryClientProvider>,
);
