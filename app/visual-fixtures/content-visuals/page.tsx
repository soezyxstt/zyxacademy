import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { StudentQuizReview } from "@/components/course/student-quiz-review";
import { ContentVisualQuizFixture } from "./quiz-fixture";
import { AdditionalContentVisualFixture } from "./additional-fixtures";
import { explanation, invalidContent } from "./content";

export default async function ContentVisualFixturePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { mode } = await searchParams;
  return <main id="main-content" className="mx-auto w-full max-w-5xl min-w-0 space-y-4 p-4 text-foreground">
    <h1 className="font-heading text-h5">Kemiringan garis</h1>
    {mode === "tryout" || mode === "daily" || mode === "flashcard" ? <AdditionalContentVisualFixture mode={mode} /> : mode === "invalid" ? <MarkdownRenderer content={invalidContent} /> : mode === "review" ? <StudentQuizReview
      id="visual-content-course" quizId="visual-content-quiz" template={{ title: "Kemiringan garis" }}
      targetAttempt={{ id: "visual-content-attempt", score: 100, durationSeconds: 60, submittedAt: "2026-11-01T00:00:00Z" }}
      snapshot={[{ id: "visual-question", prompt: "Apa yang terjadi ketika koefisien a bernilai positif?", options: ["Garis naik.", "Garis turun."], correct_indices: [0], explanation, difficulty: "easy" }]}
      answers={{ "visual-question": 0 }}
    /> : <ContentVisualQuizFixture />}
  </main>;
}
