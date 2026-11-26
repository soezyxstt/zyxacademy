import { assessmentApiPath, type AssessmentPage, type AssessmentPlayer } from "./contract";

const courseId = "native-assessment-course";
const quizId = "native-quiz";
const attemptId = "native-player-attempt";

export const quizPlayerEvidence = {
  scenario: "quiz-player-parity",
  path: `/courses/${courseId}/quiz/${quizId}?attemptId=${attemptId}`,
  courseId, quizId, attemptId, locale: "id", theme: "light", store: "disk",
  states: ["unanswered", "answered", "flagged-restored"],
} as const;

const player: AssessmentPlayer = {
  questions: [
    { id: "even-number", type: "multiple_choice", prompt: "Bilangan manakah yang termasuk bilangan genap?", options: ["3", "4", "5"] },
    { id: "addition", type: "multiple_choice", prompt: "Berapa hasil penjumlahan 7 dan 5?", options: ["12", "13", "14"] },
    { id: "product", type: "multiple_choice", prompt: "Berapa hasil perkalian 3 dan 6?", options: ["9", "12", "18"] },
  ],
  answers: {}, startAt: "2026-10-05T12:00:00.000Z", durationSeconds: null, closeAt: null,
  canGoBack: true, requireAllAnswered: false, perQuestionSeconds: null,
};

export const quizPlayerFixture = {
  kind: "quiz-detail", courseTitle: "Kalkulus dasar", player, history: [], review: null,
  assessment: { id: quizId, title: "Kuis bilangan dasar", availability: "open", durationSeconds: player.durationSeconds,
    questionCount: player.questions.length, openAt: null, closeAt: null, maxAttempts: 1, attempts: 1, visibility: "free",
    activeAttemptId: attemptId, discussionAvailable: false },
} satisfies Extract<AssessmentPage, { kind: "quiz-detail" }>;

export async function quizPlayerFixtureRequest(path: string, init?: RequestInit) {
  if (init?.signal?.aborted) throw new Error("ABORTED");
  const matched = (!init?.method || init.method === "GET") && path === assessmentApiPath(quizPlayerEvidence.path);
  return new Response(JSON.stringify(matched ? quizPlayerFixture : { error: "QUIZ_PLAYER_NOT_FOUND" }), {
    status: matched ? 200 : 404, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}
