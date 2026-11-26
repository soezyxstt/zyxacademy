import { assessmentApiPath, type AssessmentPage, type AssessmentPlayer, type AssessmentQuestion, type AssessmentResult, type AssessmentRow, type ReviewedQuestion } from "./contract";

export const assessmentFixtureScenarios = ["populated", "empty", "locked", "offline", "long", "retry"] as const;
export type AssessmentFixtureScenario = (typeof assessmentFixtureScenarios)[number];

const courseId = "native-assessment-course";
const course = `/courses/${courseId}`;
const quizId = "native-quiz";
const tryoutId = "native-tryout";
const attemptId = "native-completed-attempt";
const activeAttemptId = "native-active-attempt";
const tryoutSubmissionId = "native-tryout-submission";
const solutionId = "native-solutions";
const courseTitle = "Kalkulus dasar";
const submittedAt = "2026-10-05T03:20:00.000Z";
const quizPath = `${course}/quiz/${quizId}`;
export const assessmentFixturePaths = {
  quizList: `${course}/quiz`, quiz: quizPath, quizPlayer: `${quizPath}?attemptId=${activeAttemptId}`,
  quizReview: `${quizPath}?attemptId=${attemptId}`, quizSummary: `${quizPath}/summary/${attemptId}`,
  tryoutList: `${course}/tryout`, tryout: `${course}/tryout/${tryoutId}`,
  results: `${course}/my-results`, review: `${course}/my-results/${tryoutSubmissionId}`,
  summary: `${course}/my-results/${attemptId}/summary`, solutions: `${course}/solutions/${solutionId}`,
};
const componentNames: Record<keyof typeof assessmentFixturePaths, string> = {
  quizList: "AssessmentList", quiz: "QuizDetail", quizPlayer: "AssessmentPlay", quizReview: "ReviewPage", quizSummary: "SummaryPage",
  tryoutList: "AssessmentList", tryout: "TryoutDetail", results: "ResultsPage", review: "ReviewPage", summary: "SummaryPage", solutions: "SolutionReader",
};
export const assessmentFixtureCases = (Object.keys(assessmentFixturePaths) as (keyof typeof assessmentFixturePaths)[]).flatMap((fixture) =>
  (["populated", "locked", "long"] as const).flatMap((scenario) => (["light", "dark"] as const).map((theme) => ({
    id: `student.assessment.${fixture}.${scenario}.${theme}`, component: componentNames[fixture], path: assessmentFixturePaths[fixture], scenario, theme,
  }))));

const baseQuestions: AssessmentQuestion[] = [
  { id: "question-1", type: "multiple_choice", prompt: "Berapakah gradien garis $y = 2x + 1$?", options: ["1", "2", "3"] },
  { id: "question-2", type: "multiple_choices", prompt: "Pilih semua bilangan genap.", options: ["2", "3", "4", "7"] },
  { id: "question-3", type: "short_answer", prompt: "Tulis turunan dari $x^2$.", options: [] },
];
const fixtureQuiz: AssessmentResult = { id: attemptId, assessmentId: quizId, assessmentTitle: "Fungsi, limit, dan turunan", kind: "quiz", status: "completed", score: 80, submittedAt, durationSeconds: 301 };
const fixtureTryout: AssessmentResult = { id: tryoutSubmissionId, assessmentId: tryoutId, assessmentTitle: "Simulasi Ujian Tengah Semester", kind: "tryout", status: "pending_review", score: null, submittedAt };
const md = (id: string, markdown: string) => [{ id, kind: "markdown" as const, markdown }];
const provenance = { attribution: "Disusun oleh Zyx Academy", sources: [] };

/** Deterministic client transport fixture with a committed write whose response can be lost once. */
export function createAssessmentFixtureRequest(scenario: AssessmentFixtureScenario = "populated") {
  const empty = scenario === "empty";
  const locked = scenario === "locked";
  const long = scenario === "long";
  let loseResponse = scenario === "retry";
  const questions = long ? baseQuestions.map((question) => ({ ...question, prompt: `${question.prompt} Jelaskan hubungan koefisien dengan perubahan gradien ketika nilai variabel bertambah. `.repeat(3) })) : baseQuestions;
  const activeByKey = new Map<string, string>();
  const tryoutByKey = new Map<string, string>();
  const completed = new Set([attemptId]);
  const results = empty ? [] : [fixtureQuiz, fixtureTryout];
  const quiz: AssessmentRow = { id: quizId, title: fixtureQuiz.assessmentTitle, availability: locked ? "locked" : "open", durationSeconds: 900,
    questionCount: questions.length, openAt: null, closeAt: null, maxAttempts: 3, attempts: empty ? 0 : 1, bestScore: empty ? undefined : 80, visibility: "free", discussionAvailable: !empty && !locked };
  const tryout: AssessmentRow = { id: tryoutId, title: fixtureTryout.assessmentTitle, availability: locked ? "locked" : "open", durationSeconds: 3600,
    questionCount: questions.length, openAt: null, closeAt: null, maxAttempts: 3, attempts: empty ? 0 : 1 };
  const simulatedQuiz = () => ({ ...quiz, activeAttemptId: activeByKey.size && !completed.has(activeAttemptId) ? activeAttemptId : undefined });
  const player = (kind: "quiz" | "tryout"): AssessmentPlayer => ({ questions, answers: {}, startAt: kind === "quiz" ? new Date(Date.now() - 1000).toISOString() : null,
    durationSeconds: kind === "quiz" ? 900 : 3600, closeAt: null, canGoBack: true, requireAllAnswered: false, perQuestionSeconds: null });
  const reviewQuestions: ReviewedQuestion[] = questions.map((question, i) => ({ ...question,
    selected: i === 0 ? "B. 2" : "", expected: i === 0 ? "B. 2" : i === 1 ? "A, C" : "2x", correct: i === 0,
    explanation: i === 0 ? "Koefisien $x$ menunjukkan gradien garis." : "Periksa kembali langkah perhitungan." }));
  const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  const ok = (page: AssessmentPage) => json(page);
  const missing = () => json({ error: "Asesmen tidak tersedia." }, 404);
  function commitReceipt(body: unknown) {
    if (loseResponse) { loseResponse = false; throw new TypeError("Fixture response lost"); }
    return json(body);
  }

  return async (path: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(path, "https://student.invalid");
    const prefix = `${assessmentApiPath(course)}/`;
    if (!url.pathname.startsWith(prefix)) return missing();
    if (scenario === "offline") throw new TypeError("Fixture network unavailable");
    const [family, id, action, selected] = url.pathname.slice(prefix.length).split("/");
    if (init?.method === "POST") {
      if (locked) return json({ error: "Akses asesmen tidak tersedia." }, 403);
      if (family === "solutions" && id === solutionId) return commitReceipt({ success: true });
      if ((family === "quiz" || family === "my-results") && action === "summary") return json({ status: "processing" });
      const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
      if (family === "quiz" && id === quizId && action === "attempt" && selected) {
        if (!completed.has(selected)) { completed.add(selected); results.unshift({ ...fixtureQuiz, id: selected }); }
        return commitReceipt({ status: "completed", attemptId: selected });
      }
      if (family === "quiz" && id === quizId) {
        const attempt = activeByKey.get(body.requestId) ?? activeAttemptId;
        activeByKey.set(body.requestId, attempt);
        return commitReceipt({ attemptId: attempt, templateId: quizId });
      }
      if (family === "tryout" && id === tryoutId) {
        let submissionId = tryoutByKey.get(body.requestId);
        if (!submissionId) {
          submissionId = `native-tryout-${tryoutByKey.size + 1}`;
          tryoutByKey.set(body.requestId, submissionId);
          results.unshift({ ...fixtureTryout, id: submissionId, status: "completed", score: 75 });
        }
        return commitReceipt({ success: true, submissionId });
      }
      return missing();
    }
    if (family === "quiz" && !id) return ok({ kind: "quiz-list", courseTitle, fullAccess: !locked, rows: empty || url.searchParams.get("access") === "premium" ? [] : [simulatedQuiz()] });
    if (family === "tryout" && !id) return ok({ kind: "tryout-list", courseTitle, fullAccess: !locked, rows: empty ? [] : [tryout] });
    if (family === "my-results" && !id) return ok({ kind: "results", courseTitle, fullAccess: !locked, results: locked ? [] : results });
    if (family === "quiz" && id === quizId && !action) {
      const target = url.searchParams.get("attemptId");
      const isReview = target !== null && completed.has(target);
      const review = !locked && (isReview || url.searchParams.get("viewDiscussion") === "true")
        ? { result: target ? { ...fixtureQuiz, id: target } : null, discussionAvailable: true, items: reviewQuestions } : null;
      return ok({ kind: "quiz-detail", courseTitle, assessment: empty ? { ...quiz, questionCount: 0 } : simulatedQuiz(),
        history: empty || locked ? [] : results.filter((row) => row.kind === "quiz"),
        player: !locked && !empty && target === activeAttemptId && !isReview ? player("quiz") : null, review });
    }
    if (family === "tryout" && id === tryoutId) return ok({ kind: "tryout-detail", courseTitle, assessment: empty ? { ...tryout, questionCount: 0 } : tryout, player: !locked && !empty ? player("tryout") : null });
    if (locked) return missing();
    if (action === "summary" && ((family === "my-results" && id === attemptId) || (family === "quiz" && id === quizId && selected && completed.has(selected)))) {
      return ok({ kind: "summary", courseTitle, result: { ...fixtureQuiz, id: selected ?? id }, discussionAvailable: true,
        analytics: { status: empty ? "processing" : "completed", aiDiagnosis: null, computedMetrics: empty ? null : {
          quizTitle: quiz.title, courseId, templateId: quizId, attemptId: selected ?? id, score: 80, correctCount: 2, incorrectCount: 1,
          unansweredCount: 0, totalQuestions: 3, durationSeconds: 301, conceptMastery: [], cognitiveSkills: [], difficultyBreakdown: [],
          timeAnalysis: { totalDurationSeconds: 301, avgTimePerQuestionSeconds: 100, fastAnswerCount: 0, fastIncorrectCount: 0, slowAnswerCount: 0 },
          historicalComparison: { totalAttemptsAnalyzed: 1, scoreTrend: [80], overallImprovementDelta: 0, consistentlyWeakConcepts: [], improvedConcepts: [] },
        } } });
    }
    if (family === "my-results" && id) {
      const result = results.find((item) => item.id === id);
      return result ? ok({ kind: "review", courseTitle, review: { result, discussionAvailable: true, items: reviewQuestions } }) : missing();
    }
    if (family === "solutions" && id === solutionId) return ok({ kind: "solutions", courseTitle, id, version: 1, canComplete: true,
      collection: { title: "Pembahasan turunan fungsi", chapter: { title: "Turunan" }, items: empty ? [] : [{
        id: "solution-item-1", title: "Turunan fungsi kuadrat", template: "calculation", prompt: md("prompt", questions[2].prompt), options: [],
        answer: { parts: md("answer", "$2x$"), optionIds: [] }, hintMarkdown: "Gunakan aturan pangkat.",
        strategy: md("strategy", "Turunkan pangkat lalu kurangi pangkat satu satuan."), steps: [{ id: "step", operationMarkdown: "Gunakan $n = 2$.", reasonMarkdown: "Aturan pangkat berlaku untuk bilangan bulat positif." }],
        verification: md("verify", "Cek gradien pada $x=1$."), provenance: { problem: provenance, solution: provenance }, visuals: [],
      }] } });
    return missing();
  };
}
