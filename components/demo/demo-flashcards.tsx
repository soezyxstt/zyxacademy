"use client";
import { useEffect, useState } from "react";
import { StudentFlashcardsView } from "@/components/course/student-flashcards-view";
import { Reveal } from "@/components/ui/reveal";
import { FlashcardClient } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import type { DemoFlashcard } from "@/app/(marketing)/demo/demo-data";
import { demoFlashcardQueue } from "@/lib/demo/learning-flashcards";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoSession } from "./demo-session";
import { DemoViewSkeleton } from "./demo-loading";

export function DemoFlashcards({ cards, course }: { cards: DemoFlashcard[]; course: {id:string; title:string} }) {
  const { record, ready, generation } = useDemoSession();
  const experience = useStudentExperience();
  const [restart, setRestart] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !ready) return <DemoViewSkeleton view="flashcards" />;
  return <StudentFlashcardsView courseTitle={course.title}><Reveal><FlashcardClient key={`${generation}:${restart}`} courseId={course.id} studentId="fictional-demo-student" initialQueue={demoFlashcardQueue(cards)} adapter={{ onReview: (id, grade) => record("review", id, grade), backHref: experience.courseHref(course.id), onRestart: () => setRestart((n) => n + 1) }} /></Reveal></StudentFlashcardsView>;
}
