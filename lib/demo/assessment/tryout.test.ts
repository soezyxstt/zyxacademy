import { describe, expect, test } from "bun:test";
import { syntheticTryout } from "./tryout";

describe("synthetic demo tryout", () => {
  test("uses stable synthetic identifiers and no answer keys", () => {
    const exam = syntheticTryout("course-a", "id");
    expect(exam.courseId).toBe("course-a");
    expect(exam.questions.length).toBeGreaterThan(0);
    expect(exam.questions.every((question) => question.id.startsWith("synthetic-") && !("correctIndex" in question) && !("correctIndices" in question))).toBe(true);
    expect(syntheticTryout("course-b", "en").questions.map((question) => question.id)).toEqual(exam.questions.map((question) => question.id));
  });
});
