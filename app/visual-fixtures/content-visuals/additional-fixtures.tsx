"use client";

import { DailyQuizPopup } from "@/components/course/daily-quiz-popup";
import { TryoutForm } from "@/components/course/tryout-form";
import { FlashcardClient, type QueueItem } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import { explanation, options, prompt } from "./content";

const transport = { submit: async () => {} };
const flashcardAdapter = { onReview: () => {}, backHref: "/visual-fixtures/content-visuals" };
const queue: QueueItem[] = [{
  card: {
    id: "visual-flashcard", setId: "visual-flashcard-set", koId: null,
    front: prompt, back: explanation, explanation: null, status: "published", metadata: {},
    createdAt: new Date("2026-11-01T00:00:00Z"),
  },
  progress: null, dueStatus: "new", nextReviewDue: new Date("2026-11-01T00:00:00Z"),
  ideaId: null, masteryScore: null, confidence: null, seenBefore: false, priorityReason: "new_card",
}];

export function AdditionalContentVisualFixture({ mode }: { mode: "tryout" | "daily" | "flashcard" }) {
  if (mode === "daily") return <DailyQuizPopup
    courseId="visual-content-course" courseTitle="Kemiringan garis" triggerManual
    dailyTrivia={{ id: "visual-daily-question", question: "Bagaimana arah garis dengan kemiringan positif?", options, correctIndex: 0, explanation }}
  />;
  if (mode === "flashcard") return <FlashcardClient courseId="visual-content-course" studentId="visual-student" initialQueue={queue} adapter={flashcardAdapter} />;
  return <TryoutForm courseId="visual-content-course" transport={transport} exam={{
    id: "visual-tryout", courseId: "visual-content-course", title: "Kemiringan garis", type: "tryout", status: "published",
    settings: { timeLimitMinutes: 60 },
    questions: [{ id: "visual-tryout-question", order: 1, type: "multiple_choice", prompt: "Bagaimana arah garis dengan kemiringan positif?", options }],
  }} />;
}
