import { describe, it, expect } from "bun:test";
import { buildQuizAttachmentKey, quizAttachmentPrefix } from "@/lib/storage/keys";

describe("Quiz Attachment Keys", () => {
  it("generates consistent canonical quiz attachment prefixes", () => {
    const prefix1 = quizAttachmentPrefix("quiz-123");
    expect(prefix1).toBe("quizzes/quiz-123/attachments/");

    const prefix2 = quizAttachmentPrefix("Quiz_Math_101");
    expect(prefix2).toBe("quizzes/quiz-math-101/attachments/");
  });

  it("builds quiz attachment keys matching the canonical prefix", () => {
    const key = buildQuizAttachmentKey({
      quizId: "quiz-special-test",
      filename: "jawaban-soal-1.pdf",
    });

    const prefix = quizAttachmentPrefix("quiz-special-test");
    expect(key.startsWith(prefix)).toBe(true);
    expect(key).toMatch(/^quizzes\/quiz-special-test\/attachments\/\d+-[a-f0-9]{8}-jawaban-soal-1\.pdf$/);
  });
});
