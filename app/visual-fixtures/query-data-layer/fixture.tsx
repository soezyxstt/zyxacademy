"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QuizPlayer } from "@/components/course/quiz-player";
import { FlashcardClient } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import { demoFlashcardQueue } from "@/lib/demo/learning-flashcards";
import { studentTodayQuery } from "@/lib/student/today-query";
import { removeOtherAccounts } from "@/lib/query/client";
import { Button } from "@/components/ui/button";

function TodayProbe({ owner, name }: { owner: string; name: string }) {
  const { data, isPending, isError } = useQuery(studentTodayQuery(owner));
  return <output data-testid={name}>{isError ? "invalid" : isPending ? "loading" : data?.items[0]?.title}</output>;
}
function CacheFixture() {
  const [owner, setOwner] = useState("alice");
  const client = useQueryClient();
  return <section className="space-y-4">
    <h1 className="text-xl">Data cache</h1>
    <TodayProbe owner={owner} name="first" /><TodayProbe owner={owner} name="second" />
    <Button onClick={() => { const next = owner === "alice" ? "bob" : "alice"; removeOtherAccounts(client, next); setOwner(next); }}>Switch account</Button>
    <Button onClick={() => { void client.invalidateQueries({ queryKey: studentTodayQuery(owner).queryKey, exact: true }); }}>Refresh</Button>
  </section>;
}

export function QueryDataFixture() {
  const params = useSearchParams();
  const surface = params.get("surface") ?? "quiz";
  const live = params.get("live") === "1";
  const duration = Math.min(3600, Math.max(1, Number(params.get("seconds")) || 3600));
  const [receipts, setReceipts] = useState<unknown[]>([]);
  const queue = useMemo(() => demoFlashcardQueue([
    { front: "Gaya", back: "Massa dikali percepatan", explanation: null },
    { front: "Kecepatan", back: "Perpindahan per waktu", explanation: null },
  ]), []);
  const flashcardAdapter = useMemo(() => ({ backHref: "/visual-fixtures/query-data-layer", onReview: async (cardId: string, grade: number) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    setReceipts((old) => [...old, { cardId, grade }]);
  } }), []);
  return <main className="mx-auto max-w-6xl space-y-4 p-4">
    {surface === "cache" ? <CacheFixture /> : surface === "completed" ? <p>Attempt submitted</p> : surface === "flashcards" ?
      <FlashcardClient courseId="query-fixture-course" studentId="query-fixture-student" initialQueue={queue} adapter={flashcardAdapter} /> :
      <QuizPlayer courseId="query-fixture-course" attemptId={`query-fixture-${live ? "live" : "demo"}`}
        getRedirectPath={() => "/visual-fixtures/query-data-layer?surface=completed"}
        transport={live ? undefined : { submit: async (answers) => {
          await new Promise((resolve) => setTimeout(resolve, 150)); setReceipts((old) => [...old, answers]);
        } }}
        exam={{ id: "query-fixture-quiz", title: "Latihan fisika", settings: { timeLimitSeconds: duration, canGoBack: true },
          questions: [
            { id: "q-choice", order: 0, type: "multiple_choice", prompt: "Berapa hasil $2+3$?", options: ["5", "6"] },
            { id: "q-short", order: 1, type: "short_answer", prompt: "Tuliskan satuan gaya.", options: [] },
            { id: "q-essay", order: 2, type: "essay", prompt: "Jelaskan hubungan gaya dan percepatan.", options: [] },
          ] }} />}
    <output data-testid="receipts" className="block break-all text-sm">{JSON.stringify(receipts)}</output>
  </main>;
}
