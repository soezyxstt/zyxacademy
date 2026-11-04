"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssessmentResult } from "./assessment/assessment-result";
import { QuizPlayer } from "@/components/course/quiz-player";
import type { DemoQuizQuestion } from "@/app/(marketing)/demo/demo-data";
import { demoQuizEventKey, demoQuizExam, demoQuizIdentity, gradeDemoQuiz, parseDemoQuizResult, serializeDemoQuizResult, type DemoQuizResult } from "@/lib/demo/assessment/quiz";
import { useTranslations } from "@/lib/i18n/client";
import { useDemoSession } from "./demo-session";
import { useStudentExperience } from "@/components/student-experience-provider";

/** Uses only the server-provided, redacted question set. */
export function DemoQuiz({ questions, quizSetToken, courseId, quizOffset = 0 }: {
  questions: DemoQuizQuestion[];
  quizSetToken: string;
  quizOffset?: number;
  courseId: string;
  nextPath: string;
}) {
  const t = useTranslations("marketing");
  const { record, ready, generation, overlay } = useDemoSession();
  const experience = useStudentExperience();
  const revision = experience.baseline.find((snapshot) => snapshot.courseId === courseId)?.revision;
  const identity = demoQuizIdentity(courseId, revision ?? "", quizOffset, questions);
  const questionKey = demoQuizEventKey(identity);
  const resultKey = `zyx-demo-quiz-result:v2:${questionKey}`;
  const memoryResult = useRef<{ identity: string; result: DemoQuizResult } | null>(null);
  const [loaded, setLoaded] = useState<{ identity: string; generation: number; result: DemoQuizResult | null } | null>(null);
  const exam = useMemo(() => demoQuizExam(questions, t("demo.quiz.title")), [questions, t]);
  useEffect(() => {
    if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId) return;
    let stored = memoryResult.current?.identity === identity ? memoryResult.current.result : null;
    if (overlay.events.some((event) => event.kind === "quiz" && event.id === questionKey)) {
      try { stored = parseDemoQuizResult(sessionStorage.getItem(resultKey), identity, questions.length) ?? stored; } catch { /* Storage is optional. */ }
    } else {
      stored = null;
      memoryResult.current = null;
      try { sessionStorage.removeItem(resultKey); } catch { /* Storage is optional. */ }
    }
    setLoaded({ identity, generation, result: stored });
  }, [ready, revision, generation, overlay, questionKey, resultKey, identity, questions.length, experience.mode, experience.selectedCourseId, courseId]);
  const submit = useCallback(async (answers: Record<string, unknown>) => {
    if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId) throw new Error("Session unavailable");
    const graded = await gradeDemoQuiz(courseId, questions, quizSetToken, answers, quizOffset);
    try { sessionStorage.setItem(resultKey, serializeDemoQuizResult(identity, graded)); } catch { /* Keep the result in memory. */ }
    memoryResult.current = { identity, result: graded };
    record("quiz", questionKey);
    setLoaded({ identity, generation, result: graded });
  }, [courseId, questions, quizSetToken, quizOffset, ready, revision, experience.mode, experience.selectedCourseId, record, questionKey, resultKey, identity, generation]);
  const transport = useMemo(() => ({ submit }), [submit]);

  if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId || (loaded?.identity !== identity || loaded.generation !== generation)) return null;
  if (loaded.result) return <DemoQuizResults result={loaded.result} />;
  return <QuizPlayer key={`${questionKey}:${generation}`} courseId={courseId} exam={exam} attemptId={`demo:${questionKey}:${generation}`} transport={transport} />;
}

/** Route owners may reuse this after loading a validated local result. */
export function DemoQuizResults({ result }: { result: DemoQuizResult }) {
  const t = useTranslations("marketing");
  return <AssessmentResult title={t("demo.quiz.score", { score: result.score, total: result.total })}>
    <ol className="divide-y divide-border rounded-xl border border-border bg-card px-4">
      {[...result.results].sort((a, b) => a.index - b.index).map((item) => <li key={item.index} className="space-y-1 py-3 text-body-sm">
        <p className={item.isCorrect ? "text-status-success" : "text-status-error"}>{item.index + 1}. {item.isCorrect ? t("demo.quiz.correct") : t("demo.quiz.incorrect")}</p>
        {item.explanation && <p className="text-muted-foreground">{item.explanation}</p>}
      </li>)}
    </ol>
  </AssessmentResult>;
}
