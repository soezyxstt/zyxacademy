import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { StudentQuizReview } from "@/components/course/student-quiz-review";
import { MaterialViewer } from "@/components/course/material-viewer";
import { ContentVisualQuizFixture } from "./quiz-fixture";
import { AdditionalContentVisualFixture } from "./additional-fixtures";
import { explanation, invalidContent } from "./content";

export default async function ContentVisualFixturePage({ searchParams }: { searchParams: Promise<{ mode?: string; download?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { mode, download } = await searchParams;
  if (mode === "legacy-pdf") {
    return <MaterialViewer
      material={{ id: "visual-pdf", courseId: "visual-content-course", title: "Diktat kalkulus", kind: "pdf", url: "/v4/diktat.pdf", completed: false }}
      course={{ title: "Matematika I" }}
      canDownload={download === "1"}
      mode="admin-preview"
    />;
  }
  return <main id="main-content" className="mx-auto w-full max-w-5xl min-w-0 space-y-4 p-4 text-foreground">
    <h1 className="font-heading text-h5">Kemiringan garis</h1>
    {mode === "review-grading" ? <StudentQuizReview
      id="visual-content-course" quizId="visual-content-quiz" template={{ title: "Hasil kuis" }}
      targetAttempt={{ id: "visual-content-attempt", score: 25, durationSeconds: 60, submittedAt: "2026-11-01T00:00:00Z" }}
      snapshot={[
        { id: "extra", prompt: "Pilihan tunggal dengan jawaban tambahan", question_type: "multiple_choice", options: ["A", "B", "C"], correct_indices: [1], acceptable_answers: ["0"], explanation: "B benar.", difficulty: "easy" },
        { id: "duplicate", prompt: "Pilihan jamak dengan jawaban berulang", question_type: "multiple_choices", options: ["A", "B", "C"], correct_indices: [0, 2], acceptable_answers: ["0"], explanation: "A dan C benar.", difficulty: "medium" },
        { id: "correct", prompt: "Pilihan tunggal benar", question_type: "multiple_choice", options: ["A", "B"], correct_indices: [1], acceptable_answers: ["0"], explanation: "B benar.", difficulty: "easy" },
        { id: "wrong", prompt: "Pilihan tunggal salah", options: ["A", "B"], correct_indices: [1], explanation: "B benar.", difficulty: "easy" },
      ]}
      answers={{ extra: [1, 0], duplicate: [0, 0], correct: [1], wrong: [0] }}
    /> : mode === "tryout" || mode === "daily" || mode === "flashcard" ? <AdditionalContentVisualFixture mode={mode} /> : mode === "invalid" ? <MarkdownRenderer content={invalidContent} /> : mode === "review" ? <StudentQuizReview
      id="visual-content-course" quizId="visual-content-quiz" template={{ title: "Kemiringan garis" }}
      targetAttempt={{ id: "visual-content-attempt", score: 100, durationSeconds: 60, submittedAt: "2026-11-01T00:00:00Z" }}
      snapshot={[{ id: "visual-question", prompt: "Apa yang terjadi ketika koefisien a bernilai positif?", options: ["Garis naik.", "Garis turun."], correct_indices: [0], explanation, difficulty: "easy" }]}
      answers={{ "visual-question": 0 }}
    /> : <ContentVisualQuizFixture />}
  </main>;
}
