"use client";

import { useEffect, useMemo, useState } from "react";
import { TryoutForm, type TryoutPresentationExam } from "@/components/course/tryout-form";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useAppLocale } from "@/lib/i18n/client";
import { syntheticTryout } from "@/lib/demo/assessment/tryout";
import { useDemoSession } from "../demo-session";

// A new document gets a new marker; generation detects resets within the document.
const documentMarker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type SavedCompletion = { version: 1; documentMarker: string; generation: number; complete: true };
function parseCompletion(raw: string | null): SavedCompletion | null {
  try {
    const value: unknown = JSON.parse(raw && raw.length < 1000 ? raw : "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (Object.keys(item).sort().join(",") !== "complete,documentMarker,generation,version" || item.version !== 1 || item.complete !== true || typeof item.documentMarker !== "string" || item.documentMarker.length > 100 || !Number.isSafeInteger(item.generation) || Number(item.generation) < 0) return null;
    return { version: 1, complete: true, documentMarker: item.documentMarker, generation: Number(item.generation) };
  } catch { return null; }
}

/** Optional exam must contain synthetic questions. This wrapper never sends answers to a server. */
export function DemoTryout({ courseId, exam: suppliedExam }: { courseId: string; exam?: TryoutPresentationExam }) {
  const { locale } = useAppLocale();
  const experience = useStudentExperience();
  const { ready, generation } = useDemoSession();
  const revision = experience.baseline.find((item) => item.courseId === courseId)?.revision;
  const exam = useMemo(() => suppliedExam ?? syntheticTryout(courseId, locale), [courseId, locale, suppliedExam]);
  const key = `zyx-demo-tryout:1:${encodeURIComponent(courseId)}:${encodeURIComponent(revision ?? "")}:${encodeURIComponent(exam.id)}`;
  const [loaded, setLoaded] = useState<{ key: string; generation: number; complete: boolean } | null>(null);
  const en = locale === "en";

  useEffect(() => {
    if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId) return;
    let complete = false;
    try {
      const saved = parseCompletion(sessionStorage.getItem(key));
      // A reset since this document loaded invalidates older completions, including
      // completions written by a previous document before a reload.
      complete = Boolean(saved && (saved.documentMarker === documentMarker ? saved.generation === generation : generation === 0));
      if (!complete) sessionStorage.removeItem(key);
    } catch { /* The form remains usable without storage. */ }
    setLoaded({ key, generation, complete });
  }, [ready, revision, key, generation, experience.mode, experience.selectedCourseId, courseId]);

  if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId || (loaded?.key !== key || loaded.generation !== generation)) return null;
  return <section>
    <p className="mb-3 text-body-xs text-muted-foreground">{en ? "These tryout questions are synthetic." : "Soal tryout ini dibuat untuk simulasi."}</p>
    <TryoutForm key={`${key}:${generation}`} courseId={courseId} exam={exam} transport={{
      initialSubmitted: loaded.complete,
      successTitle: en ? "Practice tryout completed" : "Tryout latihan selesai",
      submit: async () => {
        try { sessionStorage.setItem(key, JSON.stringify({ version: 1, documentMarker, generation, complete: true } satisfies SavedCompletion)); } catch { /* Completion remains visible in memory. */ }
      },
    }} />
  </section>;
}
