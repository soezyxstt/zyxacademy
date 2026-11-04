"use client";
import { useState } from "react";
import { FlashcardClient } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import type { DemoFlashcard } from "@/app/(marketing)/demo/demo-data";
import { demoFlashcardQueue } from "@/lib/demo/learning-flashcards";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoSession } from "./demo-session";

export function DemoFlashcards({ cards }: { cards: DemoFlashcard[]; nextPath: string }) {
  const { record, ready, generation } = useDemoSession();
  const experience = useStudentExperience();
  const [restart, setRestart] = useState(0);
  if (!ready) return null;
  return <FlashcardClient key={`${generation}:${restart}`} courseId="demo-course" studentId="demo-student" initialQueue={demoFlashcardQueue(cards)} adapter={{ onReview: (id, grade) => record("review", id, grade), backHref: experience.route("courses"), onRestart: () => setRestart((n) => n + 1) }} />;
}
