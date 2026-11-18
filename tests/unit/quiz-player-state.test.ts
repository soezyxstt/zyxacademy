import { describe, expect, test } from "bun:test";
import {
  createQuizSubmissionGate, formatQuizAnswers, readQuizAnswers, readQuizFlags,
  remainingQuizSeconds, resolveQuizDeadline, waitForQuizUploads,
  type QuizAnswers, type QuizQuestion,
} from "@/lib/quiz/player-state";

const questions: QuizQuestion[] = [
  { id: "choice", order: 0, type: "multiple_choice", prompt: "Choice", options: ["a", "b"] },
  { id: "essay", order: 1, type: "essay", prompt: "Essay", options: [] },
  { id: "short", order: 2, type: "short_answer", prompt: "Short", options: [] },
];

describe("quiz recovery", () => {
  test("keeps valid drafts and falls back to server answers for malformed values", () => {
    const draft = JSON.stringify({ choice: 1, essay: false, extra: "unrelated", _attachments: { secret: true } });
    expect(readQuizAnswers(draft, questions, { essay: { text: "server essay" }, short: "server short" })).toEqual({
      choice: 1, essay: { text: "server essay" }, short: "server short",
    });
    expect(readQuizAnswers("null", questions, { choice: [0] })).toEqual({ choice: [0] });
    expect(readQuizAnswers("[1,2]", questions, { short: "saved" })).toEqual({ short: "saved" });
    expect(readQuizAnswers("{broken", questions, { choice: 0 })).toEqual({ choice: 0 });
    expect(readQuizFlags(JSON.stringify({ choice: true, essay: "false", other: true }), questions)).toEqual({ choice: true });
  });

  test("preserves attachments and multi-select answers without sending recovery metadata", () => {
    const answers = { choice: [0, 1], essay: { text: "work", fileKey: "attempt/file.pdf", fileName: "file.pdf" }, ignored: "metadata" };
    expect(formatQuizAnswers(questions, answers)).toEqual({
      choice: [0, 1], essay: answers.essay, short: "",
    });
    expect(formatQuizAnswers(questions, { choice: 0 })).toEqual({
      choice: [0], essay: { text: "", fileName: null, fileKey: null }, short: "",
    });
  });
});

describe("quiz deadline", () => {
  const now = 100_000;
  test("restores the clock without granting new time on reload", () => {
    expect(resolveQuizDeadline({ stored: "110000", durationSeconds: 60, now })).toBe(110_000);
    expect(resolveQuizDeadline({ stored: null, startedAtMs: 90_000, durationSeconds: 60, now })).toBe(150_000);
    expect(resolveQuizDeadline({ stored: "bad", durationSeconds: 60, now })).toBe(160_000);
  });
  test("a local draft cannot extend the server's start or closing time", () => {
    expect(resolveQuizDeadline({ stored: "999999", startedAtMs: 90_000, durationSeconds: 60, now })).toBe(150_000);
    expect(resolveQuizDeadline({ stored: "150000", startedAtMs: 90_000, closeAtMs: 120_000, durationSeconds: 60, now })).toBe(120_000);
    expect(remainingQuizSeconds(100_001, now)).toBe(1);
    expect(remainingQuizSeconds(99_000, now)).toBe(0);
  });
});

describe("quiz submission ownership", () => {
  test("concurrent timeout and manual submits share a lock before upload completion", async () => {
    const gate = createQuizSubmissionGate();
    let finishUpload!: () => void;
    const upload = new Promise<void>((resolve) => { finishUpload = resolve; });
    let answers: QuizAnswers = { essay: { text: "last typed answer" } };
    const sent: QuizAnswers[] = [];
    let cleaned = 0;
    const options = {
      waitForUploads: () => waitForQuizUploads([upload]),
      snapshot: () => ({ answers: formatQuizAnswers(questions, answers), durationSeconds: 60 }),
      submit: async (payload: { answers: QuizAnswers }) => { sent.push(payload.answers); },
      onSuccess: () => { cleaned++; },
    };
    const first = gate.run(options);
    expect(gate.phase).toBe("waiting");
    expect(await gate.run(options)).toBe(false);
    answers = { ...answers, essay: { text: "last typed answer", fileName: "answer.pdf", fileKey: "registered/file" } };
    finishUpload();
    expect(await first).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].essay).toEqual(answers.essay);
    expect(cleaned).toBe(1);
    expect(await gate.run(options)).toBe(false);
  });

  test("an unmounted attempt cannot submit after its uploads settle", async () => {
    const gate = createQuizSubmissionGate();
    let sent = false;
    let cleaned = false;
    await expect(gate.run({
      waitForUploads: async () => { throw new DOMException("Quiz left", "AbortError"); },
      snapshot: () => ({ answers: {}, durationSeconds: 0 }),
      submit: async () => { sent = true; },
      onSuccess: () => { cleaned = true; },
    })).rejects.toThrow("Quiz left");
    expect(sent).toBe(false);
    expect(cleaned).toBe(false);
  });

  test("a stalled upload cannot prevent timeout submission forever", async () => {
    await waitForQuizUploads([new Promise<void>(() => {})], 5);
  });
});
