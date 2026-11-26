import { expect, test } from "bun:test";
import { courseQuizApi, parseQuizInsight } from "../../packages/academic/quiz-insight";

test("only the displayed template and course reach quiz analysis and answer snapshots", () => {
  expect(courseQuizApi("quiz/1", "course & 2", "analyze")).toBe("/api/admin/quiz-insights/quiz%2F1/analyze?expectedCourseId=course+%26+2");
  expect(courseQuizApi("quiz", "course", "attempts", false)).toEndWith("includeInProgress=false");
  expect(parseQuizInsight({ teachingRecommendations: [{ topic: "Luas", actionItem: "Konversi", rationale: "Satuan" }] })?.teachingRecommendations).toHaveLength(1);
  expect(parseQuizInsight({ misconceptions: "invalid" })).toBeUndefined();
});
