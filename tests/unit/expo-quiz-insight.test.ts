import { expect, test } from "bun:test";
import { courseQuizApi, parseQuizInsight } from "../../packages/academic/quiz-insight";

test("only the displayed template and course reach quiz analysis and answer snapshots", () => {
  expect(courseQuizApi("quiz/1", "course & 2", "analyze")).toBe("/api/admin/quiz-insights/quiz%2F1/analyze?expectedCourseId=course+%26+2");
  expect(courseQuizApi("quiz", "course", "attempts", false)).toEndWith("includeInProgress=false");
  expect(parseQuizInsight({ teachingRecommendations: [{ topic: "Luas", actionItem: "Konversi", rationale: "Satuan" }] })?.teachingRecommendations).toHaveLength(1);
  expect(parseQuizInsight({ misconceptions: "invalid" })).toBeUndefined();
});

import { quizAnswerDetail, quizAttemptSheet, readQuizAttempts, snapshotAnswer } from "../../packages/academic/quiz-attempt-sheet";

test("answer snapshots and sheet exports retain the quiz, course, filters and original choice order", () => {
  const quiz = { id: "quiz", courseId: "course", title: "Geometri" };
  const attempt = { id: "first", studentName: "Ana", studentEmail: "ana@example.test", score: 0, durationSeconds: 0,
    status: "completed", startedAt: null, submittedAt: null,
    questionsSnapshot: [{ id: "q", prompt: "Bentuk", options: ["Lingkaran", { text: "Segitiga" }] }], answersSnapshot: { q: 0 } };
  const listing = { template: quiz, attempts: [attempt, { ...attempt, id: "second", questionsSnapshot: [{ id: "q", options: ["Segitiga", "Lingkaran"] }] }] };
  expect(() => readQuizAttempts(listing, "different", "course")).toThrow();
  expect(() => readQuizAttempts(listing, "quiz", "other")).toThrow();
  const all = readQuizAttempts(listing, "quiz", "course");
  const matrix = quizAttemptSheet(quiz, all, [all[1]], "matrix");
  expect(matrix.entityId).toBe("quiz:matrix");
  expect(matrix.rows).toEqual([["second", attempt.studentName, attempt.studentEmail, 0, "Segitiga"]]);
  expect(quizAttemptSheet(quiz, all, [all[0]], "summary").rows[0]).toEqual(["first", attempt.studentName, attempt.studentEmail, "completed", 0, 0, "-", "-"]);
  expect(snapshotAnswer([0, 1], attempt.questionsSnapshot[0].options)).toBe("Lingkaran, Segitiga");
  expect(snapshotAnswer({ text: "Uraian", fileName: "bukti.pdf" })).toBe("Uraian bukti.pdf");
});

test("course attempts inspect the choices from each participant's own question order", () => {
  const question = { id: "q", prompt: "$x^2$", options: [{ text: "$1$" }, "$2$", "$3$"], correct_indices: [2, 0] };
  expect(quizAnswerDetail(question, [0, 2])).toMatchObject({ selected: [0, 2], correct: [2, 0], verdict: "correct", options: ["$1$", "$2$", "$3$"] });
  expect(quizAnswerDetail(question, 0).verdict).toBe("incorrect");
  expect(quizAnswerDetail(question, undefined).verdict).toBe("unanswered");
  expect(quizAnswerDetail({ ...question, correct_indices: undefined }, 1).verdict).toBeUndefined();
  expect(quizAnswerDetail({ id: "essay" }, { text: "Solusi", fileName: "foto.png" })).toMatchObject({ answer: "Solusi foto.png", verdict: undefined });
});
