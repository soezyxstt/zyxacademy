"use client";
import { useState } from "react";
import { StudentFlashcardsView } from "@/components/course/student-flashcards-view";
import { Reveal } from "@/components/ui/reveal";
import { FlashcardClient } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import type { DemoFlashcard } from "@/app/(marketing)/demo/demo-data";
import { demoFlashcardQueue } from "@/lib/demo/learning-flashcards";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoSession } from "./demo-session";

export function DemoFlashcards({ cards, course }: { cards: DemoFlashcard[]; course: {id:string; title:string} }) {
  const { record, ready, generation } = useDemoSession();
  const experience = useStudentExperience();
  const [restart, setRestart] = useState(0);
  if (!ready) return null;
  return <StudentFlashcardsView courseTitle={course.title}><Reveal><FlashcardClient key={`${generation}:${restart}`} courseId={course.id} studentId="fictional-demo-student" initialQueue={demoFlashcardQueue(cards)} adapter={{ onReview: (id, grade) => record("review", id, grade), backHref: experience.courseHref(course.id), onRestart: () => setRestart((n) => n + 1) }} /></Reveal></StudentFlashcardsView>;
}
