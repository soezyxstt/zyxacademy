import { describe, expect, test } from "bun:test";
import { demoQuizEventKey, demoQuizExam, demoQuizIdentity, gradeDemoQuiz, parseDemoQuizResult, serializeDemoQuizResult } from "./quiz";
import type { DemoQuizQuestion } from "@/app/(marketing)/demo/demo-data";

const questions: DemoQuizQuestion[] = [0, 1, 2].map((index) => ({ id: `question-${index}`, prompt: "P", options: ["A", "B"], multiple: index === 1 }));
const result = (count: number) => ({ score: count, total: count, results: Array.from({ length: count }, (_, index) => ({ index, isCorrect: true, explanation: null })) });

describe("public quiz adapter", () => {
  test("maps redacted choices without adding answer keys", () => {
    expect(demoQuizExam([questions[1]], "Quiz").questions[0]).toEqual({ id: "question-1", order: 0, type: "multiple_choices", prompt: "P", options: ["A", "B"] });
  });
  test("accepts one and two question last pages and sends the offset", async () => {
    const original = globalThis.fetch;
    try {
      for (const count of [1, 2]) {
        const payloads: Record<string, unknown>[] = [];
        globalThis.fetch = async (_input, init) => {
          payloads.push(JSON.parse(String(init?.body)));
          return Response.json(result(count));
        };
        const page = questions.slice(0, count);
        expect((await gradeDemoQuiz("course", page, "token", {}, 3)).total).toBe(count);
        expect(payloads[0]?.quizOffset).toBe(3);
        expect(payloads[0]?.questionIds).toEqual(page.map((question) => question.id));
      }
    } finally { globalThis.fetch = original; }
  });
  test("rejects invalid counts, offsets and mismatched responses", async () => {
    await expect(gradeDemoQuiz("course", [], "token", {})).rejects.toThrow();
    await expect(gradeDemoQuiz("course", [...questions, { ...questions[0], id: "q4" }], "token", {})).rejects.toThrow();
    await expect(gradeDemoQuiz("course", questions, "token", {}, 1)).rejects.toThrow();
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () => Response.json(result(2));
      await expect(gradeDemoQuiz("course", questions.slice(0, 1), "token", {}, 3)).rejects.toThrow();
    } finally { globalThis.fetch = original; }
  });
  test("binds stored results to the complete page and revision", () => {
    const identity = demoQuizIdentity("course", "revision", 0, questions);
    const differentPage = demoQuizIdentity("course", "revision", 3, questions);
    const differentRevision = demoQuizIdentity("course", "next", 0, questions);
    const saved = serializeDemoQuizResult(identity, result(3));
    expect(parseDemoQuizResult(saved, identity, 3)).toEqual(result(3));
    expect(parseDemoQuizResult(saved, differentPage, 3)).toBeNull();
    expect(parseDemoQuizResult(saved, differentRevision, 3)).toBeNull();
    expect(parseDemoQuizResult(saved, identity, 2)).toBeNull();
    expect(demoQuizEventKey(identity)).not.toBe(demoQuizEventKey(differentPage));
    expect(demoQuizEventKey(demoQuizIdentity("course", "revision", 0, [{ ...questions[0], id: "x".repeat(150) + "a" }]))).not.toBe(demoQuizEventKey(demoQuizIdentity("course", "revision", 0, [{ ...questions[0], id: "x".repeat(150) + "b" }])));
  });
  test("rejects duplicate, out of range, and inconsistent results", () => {
    const identity = "page";
    const wrap = (value: unknown) => JSON.stringify({ version: 2, identity, result: value });
    expect(parseDemoQuizResult(wrap({ score: 2, total: 2, results: [result(1).results[0], result(1).results[0]] }), identity, 2)).toBeNull();
    expect(parseDemoQuizResult(wrap({ score: 1, total: 1, results: [{ index: 1, isCorrect: true, explanation: null }] }), identity, 1)).toBeNull();
    expect(parseDemoQuizResult(wrap({ ...result(2), score: 1 }), identity, 2)).toBeNull();
  });
});
