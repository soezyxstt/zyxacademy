import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createQuizSubmissionGate } from "@/lib/quiz/player-state";

describe("Quiz Timeout and Submission Invariant Contracts", () => {
  const normalize = (s: string) => s.replace(/\r\n/g, "\n");
  const submitRouteCode = normalize(readFileSync("app/api/quiz/attempts/[id]/route.ts", "utf8"));
  const quizPlayerCode = ["components/course/quiz-player.tsx", "hooks/use-quiz-player.ts", "lib/quiz/player-state.ts"].map(path => normalize(readFileSync(path, "utf8"))).join("\n");
  const studentQuizPageCode = normalize(readFileSync("app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "utf8"));
  const featuresDocCode = normalize(readFileSync("docs/features.md", "utf8"));

  it("ensures submit route does not reject timeout submissions with 403 QUIZ_TIME_EXPIRED", () => {
    // 403 QUIZ_TIME_EXPIRED was the root cause of zombie attempts and contradictory toasts
    expect(submitRouteCode).not.toContain("QUIZ_TIME_EXPIRED");
    expect(submitRouteCode).not.toContain("Waktu pengerjaan kuis telah berakhir. Jawaban tidak dapat dikumpulkan.");
  });

  it("ensures submit route caps final duration to template timeLimitSeconds if defined", () => {
    const expression = submitRouteCode.match(/const finalDurationSeconds = ([^\n;]+);/)?.[1];
    expect(expression).toBeDefined();
    const recordedDuration = new Function("elapsedSeconds", "templateMeta", `return (${expression});`);
    expect(recordedDuration(45, { timeLimitSeconds: 30 })).toBe(30);
    expect(recordedDuration(45, { timeLimitSeconds: 60 })).toBe(45);
    expect(recordedDuration(45, { timeLimitSeconds: 0 })).toBe(0);
    expect(recordedDuration(45, { timeLimitSeconds: null })).toBe(45);
    expect(recordedDuration(45, {})).toBe(45);
    expect(submitRouteCode).toContain("durationSeconds: finalDurationSeconds");
  });

  it("ensures QuizPlayer supports timeLimitSeconds in settings and prioritizes it over minutes", () => {
    expect(quizPlayerCode).toContain("timeLimitSeconds?: number;");
    expect(quizPlayerCode).toContain(
      "const durationSeconds =\n    exam.settings?.timeLimitSeconds ?? (exam.settings?.timeLimitMinutes ?? 15) * 60;",
    );
  });

  it("preserves a draft after failed submission and clears it only after acknowledgement", async () => {
    const gate = createQuizSubmissionGate();
    let draft: unknown = { answer: "saved" };
    const options = {
      waitForUploads: async () => {},
      snapshot: () => ({ answers: { answer: "saved" }, durationSeconds: 30 }),
      onSuccess: () => { draft = null; },
    };
    await expect(gate.run({ ...options, submit: async () => { throw new Error("unavailable"); } })).rejects.toThrow("unavailable");
    expect(draft).toEqual({ answer: "saved" });
    expect(gate.phase).toBe("idle");
    await gate.run({ ...options, submit: async () => ({ score: 100 }) });
    expect(draft).toBeNull();
    expect(gate.phase).toBe("submitted");
  });

  it("ensures student quiz page passes timeLimitSeconds to QuizPlayer", () => {
    expect(studentQuizPageCode).toContain("timeLimitSeconds: template.timeLimitSeconds ?? undefined,");
  });

  it("ensures features documentation reflects that deadline submissions are accepted and capped", () => {
    expect(featuresDocCode).toContain("POST `/api/quiz/attempts/[id]` accepts timeout and late submissions");
    expect(featuresDocCode).toContain("caps the recorded duration at `timeLimitSeconds`");
  });
});
