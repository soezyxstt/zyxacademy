import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("Quiz Timeout and Submission Invariant Contracts", () => {
  const normalize = (s: string) => s.replace(/\r\n/g, "\n");
  const submitRouteCode = normalize(readFileSync("app/api/quiz/attempts/[id]/route.ts", "utf8"));
  const quizPlayerCode = normalize(readFileSync("components/course/quiz-player.tsx", "utf8"));
  const studentQuizPageCode = normalize(readFileSync("app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "utf8"));
  const featuresDocCode = normalize(readFileSync("docs/features.md", "utf8"));

  it("ensures submit route does not reject timeout submissions with 403 QUIZ_TIME_EXPIRED", () => {
    // 403 QUIZ_TIME_EXPIRED was the root cause of zombie attempts and contradictory toasts
    expect(submitRouteCode).not.toContain("QUIZ_TIME_EXPIRED");
    expect(submitRouteCode).not.toContain("Waktu pengerjaan kuis telah berakhir. Jawaban tidak dapat dikumpulkan.");
  });

  it("ensures submit route caps final duration to template timeLimitSeconds if defined", () => {
    expect(submitRouteCode).toContain("templateMeta?.timeLimitSeconds != null");
    expect(submitRouteCode).toContain("finalDurationSeconds = Math.min(finalDurationSeconds, templateMeta.timeLimitSeconds)");
  });

  it("ensures QuizPlayer supports timeLimitSeconds in settings and prioritizes it over minutes", () => {
    expect(quizPlayerCode).toContain("timeLimitSeconds?: number;");
    expect(quizPlayerCode).toContain(
      "const durationSeconds =\n    exam.settings?.timeLimitSeconds ?? (exam.settings?.timeLimitMinutes ?? 15) * 60;",
    );
  });

  it("ensures QuizPlayer preserves draft in localStorage until POST succeeds", () => {
    // In handleSubmit, localStorage.removeItem must only happen AFTER res.ok check
    const handleSubmitIndex = quizPlayerCode.indexOf("const handleSubmit = useCallback(");
    const fetchIndex = quizPlayerCode.indexOf("const res = await fetch(`/api/quiz/attempts/${attemptId}`", handleSubmitIndex);
    const resOkIndex = quizPlayerCode.indexOf("if (!res.ok)", fetchIndex);
    const answersRemoveIndex = quizPlayerCode.indexOf("window.localStorage.removeItem(`zyx-quiz-answers-${attemptId}`)", handleSubmitIndex);

    expect(handleSubmitIndex).toBeGreaterThan(0);
    expect(fetchIndex).toBeGreaterThan(handleSubmitIndex);
    expect(resOkIndex).toBeGreaterThan(fetchIndex);
    expect(answersRemoveIndex).toBeGreaterThan(resOkIndex);
  });

  it("ensures student quiz page passes timeLimitSeconds to QuizPlayer", () => {
    expect(studentQuizPageCode).toContain("timeLimitSeconds: template.timeLimitSeconds ?? undefined,");
  });

  it("ensures features documentation reflects that deadline submissions are accepted and capped", () => {
    expect(featuresDocCode).toContain("POST `/api/quiz/attempts/[id]` accepts timeout and late submissions");
    expect(featuresDocCode).toContain("caps the recorded duration at `timeLimitSeconds`");
  });
});
