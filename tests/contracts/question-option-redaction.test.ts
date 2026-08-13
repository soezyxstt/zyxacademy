import { describe, expect, test } from "bun:test";
import { redactQuestionAnswerKeys } from "@/lib/asesmen/question-options";

describe("question option answer-key redaction", () => {
  test("keeps renderable options while removing grading fields", () => {
    expect(redactQuestionAnswerKeys([
      { id: "a", text: "First", isCorrect: true },
      { id: "b", text: "Second", correct: false, explanation: "Visible option note" },
    ])).toEqual([
      { id: "a", text: "First" },
      { id: "b", text: "Second", explanation: "Visible option note" },
    ]);
  });
});
