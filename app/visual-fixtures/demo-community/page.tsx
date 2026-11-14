import { notFound } from "next/navigation";
import { DemoCommunity } from "@/components/demo/demo-community";
import { DemoDashboard } from "@/components/demo/demo-dashboard";
import { DemoShell } from "@/components/demo/demo-shell";
import { DemoQuiz } from "@/components/demo/demo-quiz";
import { DemoFlashcards } from "@/components/demo/demo-flashcards";

export default async function DemoCommunityFixture({ searchParams }: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view = "dashboard" } = await searchParams;
  if (view !== "dashboard" && view !== "schedule" && view !== "leaderboard" && view !== "groups" && view !== "quiz" && view !== "flashcards") notFound();
  const course = {
    id: "demo-math", title: "Matematika I", category: "Matematika", description: null,
    chapterNumber: 2, chapterTitle: "Fungsi dan Limit",
  };
  return (
    <DemoShell course={course} activeView={view}>
      {view === "dashboard" ? <DemoDashboard nextPath="/courses/demo-math" /> : view === "quiz" ? (
        <DemoQuiz nextPath="/courses/demo-math" quizSetToken="fixture-only" questions={[
          { id: "fixture-q1", prompt: "Berapa nilai 2 + 2?", options: ["4", "5"], multiple: false },
          { id: "fixture-q2", prompt: "Pilih bilangan genap", options: ["2", "3"], multiple: false },
          { id: "fixture-q3", prompt: "Nilai 3 + 3", options: ["6", "7"], multiple: false },
        ]} />
      ) : view === "flashcards" ? (
        <DemoFlashcards nextPath="/courses/demo-math" cards={[
          { front: "Apa itu fungsi?", back: "Pemetaan setiap anggota domain ke tepat satu anggota kodomain.", explanation: null },
          { front: "Apa itu limit?", back: "Nilai yang didekati suatu fungsi.", explanation: null },
        ]} />
      ) : (
        <DemoCommunity view={view} course={course} nextPath="/courses/demo-math" />
      )}
    </DemoShell>
  );
}
