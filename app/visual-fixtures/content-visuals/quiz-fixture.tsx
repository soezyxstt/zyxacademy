"use client";

import { QuizPlayer } from "@/components/course/quiz-player";
import { options, prompt } from "./content";

const transport = { submit: async () => {} };

export function ContentVisualQuizFixture() {
  return <QuizPlayer
    courseId="visual-content-course"
    attemptId="visual-content-attempt"
    transport={transport}
    exam={{
      id: "visual-content-quiz", title: "Kemiringan garis",
      settings: { timeLimitSeconds: 3600, shuffleOptions: false, shuffleQuestions: false },
      questions: [{ id: "visual-question", order: 1, type: "multiple_choice", prompt, options }],
    }}
  />;
}
