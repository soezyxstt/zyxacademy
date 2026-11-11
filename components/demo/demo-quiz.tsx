"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StudentQuizSummaryView } from "@/components/course/student-quiz-summary-view";
import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { StudentQuizReview } from "@/components/course/student-quiz-review";
import { QuizPlayer } from "@/components/course/quiz-player";
import type { DemoQuizPage } from "@/lib/demo/quiz-pages";
import type { DemoQuizQuestion } from "@/app/(marketing)/demo/demo-data";
import { demoQuizEventKey, demoQuizExam, demoQuizIdentity, parseDemoQuizAttempt, serializeDemoQuizResult, type DemoQuizResult } from "@/lib/demo/assessment/quiz";
import { gradeDemoQuizPages } from "@/lib/demo/quiz-submission";
import { fictionalQuizCorrectCount } from "@/lib/demo/assessment/history";
import { useTranslations } from "@/lib/i18n/client";
import { useDemoSession } from "./demo-session";
import { useStudentExperience } from "@/components/student-experience-provider";

// Fictional historical attempts never invent answers for real course questions.
const historicalQuestions: DemoQuizQuestion[] = [
 { id: "fictional-history-plan", prompt: "Apa langkah awal saat menyiapkan ujian?", options: ["Membuat rencana belajar", "Menghindari latihan"], multiple: false },
 { id: "fictional-history-recall", prompt: "Bagaimana cara melatih ingatan konsep?", options: ["Mengingat kembali tanpa melihat catatan", "Hanya menyalin catatan"], multiple: false },
 { id: "fictional-history-review", prompt: "Apa yang membantu setelah salah menjawab?", options: ["Meninjau alasan kesalahan", "Melewati pembahasan"], multiple: false },
 { id: "fictional-history-practice", prompt: "Apa yang membantu memahami penerapan konsep?", options: ["Mengerjakan contoh dan memeriksa langkahnya", "Menghafal jawaban saja"], multiple: false },
];

/** Uses only the server-provided, redacted question set for new attempts. */
export function DemoQuiz({ pages, courseId, view = "quiz" }: {
  view?: "quiz" | "quiz-review" | "quiz-summary";
  pages: DemoQuizPage[];
  courseId: string;
}) {
  const questions = useMemo(() => pages.flatMap(page => page.questions), [pages]);
  const quizOffset = 0;
  const t = useTranslations("marketing");
  const attempt = useSearchParams().get("attempt");
  const baselineCorrect = fictionalQuizCorrectCount(courseId, attempt ?? "latest");
  const { record, ready, generation, overlay } = useDemoSession();
  const experience = useStudentExperience();
  const revision = experience.baseline.find((snapshot) => snapshot.courseId === courseId)?.revision;
  const identity = demoQuizIdentity(courseId, revision ?? "", quizOffset, questions);
  const attemptKey = attempt && /^[a-f0-9-]{36}$/.test(attempt) ? attempt : "latest";
  const questionKey = `${demoQuizEventKey(identity)}:${attemptKey}`;
  const resultKey = `zyx-demo-quiz-result:v2:${questionKey}`;
  const memoryResult = useRef<{ identity: string; key: string; result: DemoQuizResult; answers: Record<string, number[]> } | null>(null);
  const [loaded, setLoaded] = useState<{ identity: string; key: string; generation: number; result: DemoQuizResult | null; answers: Record<string, number[]> } | null>(null);
  const exam = useMemo(() => demoQuizExam(questions, t("demo.quiz.title")), [questions, t]);
  useEffect(() => {
    if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId) return;
    let stored: { result: DemoQuizResult; answers: Record<string, number[]> } | null = memoryResult.current?.identity === identity && memoryResult.current.key === resultKey ? memoryResult.current : null;
    if (overlay.events.some((event) => event.kind === "quiz" && event.id === questionKey)) {
      try { stored = parseDemoQuizAttempt(sessionStorage.getItem(resultKey), identity, questions.length) ?? stored; } catch { /* Storage is optional. */ }
    } else {
      stored = null;
      memoryResult.current = null;
      try { sessionStorage.removeItem(resultKey); } catch { /* Storage is optional. */ }
    }
    setLoaded({ identity, key: resultKey, generation, result: stored?.result ?? null, answers: stored?.answers ?? {} });
  }, [ready, revision, generation, overlay, questionKey, resultKey, identity, questions.length, experience.mode, experience.selectedCourseId, courseId]);
  const submit = useCallback(async (answers: Record<string, unknown>) => {
    if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId) throw new Error("Session unavailable");
    const graded = await gradeDemoQuizPages(courseId, pages, answers);
    const submitted = Object.fromEntries(questions.map(question => {
      const value = answers[question.id];
      return [question.id, Array.isArray(value) ? value.filter((index): index is number => typeof index === "number") : typeof value === "number" ? [value] : []];
    }));
    try { sessionStorage.setItem(resultKey, serializeDemoQuizResult(identity, graded, submitted)); } catch { /* Keep the result in memory. */ }
    memoryResult.current = { identity, key: resultKey, result: graded, answers: submitted };
    record("quiz", questionKey);
    setLoaded({ identity, key: resultKey, generation, result: graded, answers: submitted });
  }, [courseId, questions, pages, ready, revision, experience.mode, experience.selectedCourseId, record, questionKey, resultKey, identity, generation]);
  const transport = useMemo(() => ({ submit }), [submit]);

  if (!ready || !revision || experience.mode !== "demo" || experience.selectedCourseId !== courseId || (loaded?.identity !== identity || loaded.key !== resultKey || loaded.generation !== generation)) return null;
  if (view === "quiz-summary") {
    const result = loaded.result;
    const total = result?.total ?? historicalQuestions.length, correct = result?.score ?? baselineCorrect;
    const title = experience.baseline.find(row => row.courseId === courseId)?.availableAssessments[0]?.title ?? "Kuis";
    const id = attempt ?? "latest";
    return <StudentQuizSummaryView title={title} reviewHref={`${experience.route("quiz-review")}&attempt=${encodeURIComponent(id)}`} historyHref={experience.route("results")} retryHref={experience.route("quiz-start")} pending={false}>
      <QuizAnalyticsView attemptId={`fictional-${id}`} courseId={courseId} initialData={{ status: "completed", computedMetrics: {
        quizTitle: title, courseId, templateId: "fictional-template", attemptId: `fictional-${id}`, score: Math.round(correct / total * 100), correctCount: correct, incorrectCount: total - correct, unansweredCount: 0, totalQuestions: total, durationSeconds: 240,
        conceptMastery: [], cognitiveSkills: [], difficultyBreakdown: [], timeAnalysis: { totalDurationSeconds: 240, avgTimePerQuestionSeconds: 240 / total, fastAnswerCount: 0, fastIncorrectCount: 0, slowAnswerCount: 0 },
        historicalComparison: { totalAttemptsAnalyzed: 3, scoreTrend: [60, 70, Math.round(correct / total * 100)], overallImprovementDelta: Math.round(correct / total * 100) - 70, consistentlyWeakConcepts: [], improvedConcepts: [] },
      } }} />
    </StudentQuizSummaryView>;
  }
  if (view === "quiz-review" && !loaded.result) {
    const baselineResult: DemoQuizResult = { score: baselineCorrect, total: historicalQuestions.length, results: historicalQuestions.map((_, index) => ({ index, isCorrect: index < baselineCorrect, correctIndices: [0], explanation: null })) };
    return <DemoQuizResults result={baselineResult} questions={historicalQuestions} answers={Object.fromEntries(historicalQuestions.map((question, index) => [question.id, [index < baselineCorrect ? 0 : 1]]))} courseId={courseId} />;
  }
  if (loaded.result) return <DemoQuizResults result={loaded.result} questions={questions} answers={loaded.answers} courseId={courseId} />;
  return <QuizPlayer key={`${questionKey}:${generation}`} courseId={courseId} exam={exam} attemptId={`demo:${questionKey}:${generation}`} transport={transport} />;
}

/** Route owners may reuse this after loading a validated local result. */
export function DemoQuizResults({ result, questions, answers, courseId }: { result: DemoQuizResult; questions: DemoQuizQuestion[]; answers: Record<string, number[]>; courseId: string }) {
  const experience = useStudentExperience();
  const snapshot = experience.baseline.find(row => row.courseId === courseId);
  const attempt = useSearchParams().get("attempt");
  return <StudentQuizReview href={experience.href} id={courseId} quizId={snapshot?.availableAssessments.find(item => item.type === "quiz")?.id ?? "fictional-quiz"}
    template={{ title: snapshot?.availableAssessments[0]?.title ?? "Kuis" }}
    targetAttempt={{ id: attempt ?? "latest", score: Math.round(result.score / result.total * 100), durationSeconds: null, submittedAt: `${snapshot?.asOf}T12:00:00Z` }}
    snapshot={questions.map((question, index) => ({ ...question, correct_indices: result.results.find(item => item.index === index)?.correctIndices ?? [], gradedCorrect: result.results.find(item => item.index === index)?.isCorrect ?? false, explanation: result.results.find(item => item.index === index)?.explanation ?? "", difficulty: "", type: question.multiple ? "multiple_choices" : "multiple_choice" }))}
    answers={answers} />;
}
