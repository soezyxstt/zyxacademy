"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StudentFlashcardsView } from "@/components/course/student-flashcards-view";
import { Reveal } from "@/components/ui/reveal";
import { FlashcardClient, type QueueItem } from "@/app/(student)/courses/[id]/flashcard/flashcard-client";
import type { DemoFlashcard } from "@/app/(marketing)/demo/demo-data";
import { demoFlashcardQueue } from "@/lib/demo/learning-flashcards";
import { demoFlashcardResumeKey, parseFlashcardResume, type FlashcardSessionState } from "@/lib/demo/flashcard-resume";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useDemoSession } from "./demo-session";
import { DemoViewSkeleton } from "./demo-loading";

export function DemoFlashcards({ cards, course }: { cards: DemoFlashcard[]; course: {id:string; title:string} }) {
  const { ready, generation, scope, reviewScope } = useDemoSession();
  const [mounted, setMounted] = useState(false);
  const queue = useMemo(() => demoFlashcardQueue(cards), [cards]);
  const identity = JSON.stringify([scope.courseId, scope.revision, reviewScope?.setId ?? null, reviewScope?.offset ?? 0, queue.map(item => item.card.id)]);
  useEffect(() => setMounted(true), []);
  if (!mounted || !ready) return <DemoViewSkeleton view="flashcards" />;
  return <StudentFlashcardsView courseTitle={course.title}><Reveal><LocalFlashcards key={`${identity}:${generation}`} courseId={course.id} queue={queue} identity={identity} /></Reveal></StudentFlashcardsView>;
}

function LocalFlashcards({ courseId, queue, identity }: { courseId: string; queue: QueueItem[]; identity: string }) {
  const { record } = useDemoSession();
  const experience = useStudentExperience();
  const key = demoFlashcardResumeKey(identity);
  const [loaded] = useState(() => {
    try { return { resume: parseFlashcardResume(localStorage.getItem(key), identity, queue.map(item => item.card.id)), error: false }; }
    catch { return { resume: null, error: true }; }
  });
  const [storageError, setStorageError] = useState(loaded.error);
  const [restart, setRestart] = useState(0);
  const save = useCallback((state: FlashcardSessionState) => {
    try {
      const value = { ...state, version: 1, identity };
      const raw = JSON.stringify(value);
      if (!parseFlashcardResume(raw, identity, queue.map(item => item.card.id))) throw new Error("Invalid flashcard session");
      localStorage.setItem(key, raw);
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [identity, key, queue]);
  return <>
    {storageError && <p role="alert" className="mb-3 rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-body-sm text-status-error">Progres flashcard belum tersimpan di browser. Kosongkan penyimpanan atau izinkan akses penyimpanan.</p>}
    <FlashcardClient key={restart} courseId={courseId} studentId="fictional-demo-student" initialQueue={queue} adapter={{
      resume: restart === 0 ? loaded.resume : null,
      onStateChange: save,
      onReview: (id, grade) => record("review", id, grade),
      backHref: experience.courseHref(courseId),
      onRestart: () => setRestart(n => n + 1),
    }} />
  </>;
}
