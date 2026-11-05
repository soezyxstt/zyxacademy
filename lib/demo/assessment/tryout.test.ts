import { describe, expect, test } from "bun:test";
import { parseDemoTryoutAnswers, syntheticTryout } from "./tryout";

describe("synthetic demo tryout", () => {
  test("uses stable synthetic identifiers and no answer keys", () => {
    const exam = syntheticTryout("course-a", "id");
    expect(exam.courseId).toBe("course-a");
    expect(exam.questions.length).toBeGreaterThan(0);
    expect(exam.questions.every((question) => question.id.startsWith("synthetic-") && !("correctIndex" in question) && !("correctIndices" in question))).toBe(true);
    expect(syntheticTryout("course-b", "en").questions.map((question) => question.id)).toEqual(exam.questions.map((question) => question.id));
  });
});

test("local tryout reviews reject foreign questions, out-of-range choices and uploaded file locators", () => {
 const exam = syntheticTryout("fictional-course", "id");
 expect(parseDemoTryoutAnswers(JSON.stringify({ "synthetic-plan": { type: "multiple_choice", index: 0 } }), exam)).toEqual({ "synthetic-plan": { type: "multiple_choice", index: 0 } });
 for (const value of [{ foreign: { type: "multiple_choice", index: 0 } }, { "synthetic-plan": { type: "multiple_choice", index: 100 } }, { "synthetic-reflection": { type: "short_answer", text: "Review", fileName: null, fileKey: "paid/object" } }]) expect(parseDemoTryoutAnswers(JSON.stringify(value), exam)).toEqual({});
});
