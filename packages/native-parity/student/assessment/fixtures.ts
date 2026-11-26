import { assessmentApiPath, type AssessmentPage, type AssessmentPlayer, type AssessmentQuestion, type AssessmentResult, type AssessmentRow, type ReviewedQuestion } from "./contract";

export const quizGatewayEvidence = {
  states: ["new", "resumable", "exhausted"],
  locale: "id",
  theme: "light",
} as const;
export type QuizGatewayState = (typeof quizGatewayEvidence.states)[number];
export const quizGatewayScenario = <T extends QuizGatewayState>(state: T) => `quiz-gateway-${state}` as const;

export const assessmentFixtureScenarios = ["populated", "empty", "locked", "offline", "long", "retry",
  ...quizGatewayEvidence.states.map(quizGatewayScenario)] as const;
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
  const newGateway = scenario === quizGatewayScenario("new");
  const resumableGateway = scenario === quizGatewayScenario("resumable");
  const exhaustedGateway = scenario === quizGatewayScenario("exhausted");
  const gatewayEvidence = newGateway || resumableGateway || exhaustedGateway;
  let loseResponse = scenario === "retry";
  const questions = long ? baseQuestions.map((question) => ({ ...question, prompt: `${question.prompt} Jelaskan hubungan koefisien dengan perubahan gradien ketika nilai variabel bertambah. `.repeat(3) })) : baseQuestions;
  const quizByKey = new Map<string, string>();
  const tryoutByKey = new Map<string, string>();
  const fixtureStartAt = new Date(Date.now() - 1000).toISOString();
  const activeAttempts = new Map<string, string>(resumableGateway ? [[activeAttemptId, fixtureStartAt]] : []);
  const priorQuiz = gatewayEvidence ? { ...fixtureQuiz, submittedAt: "2026-10-05T12:00:00.000Z" } : fixtureQuiz;
  const results = empty || newGateway ? [] : [priorQuiz, fixtureTryout];
  const quizHistory = () => results.filter(row => row.kind === "quiz");
  const quizResult = (id: string) => quizHistory().find(row => row.id === id);
  // Existing player fixtures can open the first attempt directly, including after an app restart.
  const directFixtureAttempt = (id: string) => !gatewayEvidence && !empty && id === activeAttemptId;
  const quiz: AssessmentRow = { id: quizId, title: fixtureQuiz.assessmentTitle, availability: locked ? "locked" : "open", durationSeconds: 900,
    questionCount: questions.length, openAt: null, closeAt: null, maxAttempts: exhaustedGateway ? 1 : gatewayEvidence ? 2 : 3,
    attempts: empty || newGateway ? 0 : 1, bestScore: empty || newGateway ? undefined : 80, visibility: "free",
    discussionAvailable: !empty && !locked && !gatewayEvidence };
  const tryout: AssessmentRow = { id: tryoutId, title: fixtureTryout.assessmentTitle, availability: locked ? "locked" : "open", durationSeconds: 3600,
    questionCount: questions.length, openAt: null, closeAt: null, maxAttempts: 3, attempts: empty ? 0 : 1 };
  const simulatedQuiz = () => {
    const history = quizHistory();
    return { ...quiz, attempts: history.length + activeAttempts.size, activeAttemptId: Array.from(activeAttempts.keys()).at(-1), bestScore: history[0]?.score ?? undefined };
  };
  const player = (kind: "quiz" | "tryout", startAt: string | null = null): AssessmentPlayer => ({ questions, answers: {}, startAt,
    durationSeconds: kind === "quiz" ? 900 : 3600, closeAt: null, canGoBack: true, requireAllAnswered: false, perQuestionSeconds: null });
  const reviewQuestions: ReviewedQuestion[] = questions.map((question, i) => ({ ...question,
    selected: i === 0 ? "B. 2" : "", expected: i === 0 ? "B. 2" : i === 1 ? "A, C" : "2x", correct: i === 0,
    explanation: i === 0 ? "Koefisien $x$ menunjukkan gradien garis." : "Periksa kembali langkah perhitungan." }));
  const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  const ok = (page: AssessmentPage) => json(page);
  const missing = () => json({ error: "Asesmen tidak tersedia." }, 404);
  function commitReceipt(body: unknown, status = 200) {
    if (loseResponse) { loseResponse = false; throw new TypeError("Fixture response lost"); }
    return json(body, status);
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
        if (!quizResult(selected)) {
          if (!activeAttempts.delete(selected) && !directFixtureAttempt(selected)) return missing();
          results.unshift({ ...priorQuiz, id: selected });
        }
        return commitReceipt({ status: "completed", attemptId: selected });
      }
      if (family === "quiz" && id === quizId && !action) {
        const prior = quizByKey.get(body.requestId);
        if (prior) return commitReceipt({ attemptId: prior, templateId: quizId, replayed: true });
        if (empty) return json({ error: "Soal belum tersedia." }, 422);
        if (quiz.maxAttempts !== null && simulatedQuiz().attempts >= quiz.maxAttempts) {
          return json({ error: "Batas percobaan kuis tercapai" }, 409);
        }
        const numberedAttempts = activeAttempts.size + quizHistory().filter(row => row.id !== attemptId).length;
        const attempt = numberedAttempts === 0 ? activeAttemptId : `${activeAttemptId}-${numberedAttempts + 1}`;
        activeAttempts.set(attempt, new Date().toISOString());
        quizByKey.set(body.requestId, attempt);
        return commitReceipt({ attemptId: attempt, templateId: quizId }, 201);
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
      const assessment = empty ? { ...quiz, questionCount: 0 } : simulatedQuiz();
      const result = target ? quizResult(target) ?? null : null;
      const start = target && (activeAttempts.get(target) ?? (directFixtureAttempt(target) ? fixtureStartAt : null));
      if (gatewayEvidence && target && !result && !start) return missing();
      const review = !locked && (result || (!gatewayEvidence && url.searchParams.get("viewDiscussion") === "true"))
        ? { result, discussionAvailable: !gatewayEvidence, items: gatewayEvidence ? [] : reviewQuestions } : null;
      return ok({ kind: "quiz-detail", courseTitle, assessment,
        history: empty || locked ? [] : quizHistory(),
        player: !locked && !result && start ? player("quiz", start) : null, review });
    }
    if (family === "tryout" && id === tryoutId) return ok({ kind: "tryout-detail", courseTitle, assessment: empty ? { ...tryout, questionCount: 0 } : tryout, player: !locked && !empty ? player("tryout") : null });
    if (locked) return missing();
    const summaryId = action === "summary" ? (family === "my-results" ? id : family === "quiz" && id === quizId ? selected : undefined) : undefined;
    const summaryQuiz = summaryId === attemptId && empty ? fixtureQuiz : summaryId && quizResult(summaryId);
    if (summaryQuiz) {
      return ok({ kind: "summary", courseTitle, result: summaryQuiz, discussionAvailable: !gatewayEvidence,
        analytics: { status: empty ? "processing" : "completed", aiDiagnosis: null, computedMetrics: empty ? null : {
          quizTitle: quiz.title, courseId, templateId: quizId, attemptId: summaryQuiz.id, score: 80, correctCount: 2, incorrectCount: 1,
          unansweredCount: 0, totalQuestions: 3, durationSeconds: 301, conceptMastery: [], cognitiveSkills: [], difficultyBreakdown: [],
          timeAnalysis: { totalDurationSeconds: 301, avgTimePerQuestionSeconds: 100, fastAnswerCount: 0, fastIncorrectCount: 0, slowAnswerCount: 0 },
          historicalComparison: { totalAttemptsAnalyzed: 1, scoreTrend: [80], overallImprovementDelta: 0, consistentlyWeakConcepts: [], improvedConcepts: [] },
        } } });
    }
    if (family === "my-results" && id) {
      const result = results.find((item) => item.id === id);
      const disclosure = !gatewayEvidence || result?.kind !== "quiz";
      return result ? ok({ kind: "review", courseTitle, review: { result, discussionAvailable: disclosure, items: disclosure ? reviewQuestions : [] } }) : missing();
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
