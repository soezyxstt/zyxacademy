import { describe, expect, test } from "bun:test";
import { demoFlashcardResumeKey, parseFlashcardResume, type FlashcardResume } from "./flashcard-resume";

const identity = JSON.stringify(["course", "revision", "set", 0]);
const initial: FlashcardResume = {
  version: 1, identity, queue: [{ id: "b", dueStatus: "new" }, { id: "a", dueStatus: "new" }],
  batchOffset: 0, currentIndex: 0, isFlipped: false, mode: "standard", typedAnswer: "", isChecked: false, passedExam: null, completedCount: 0,
};
const parse = (value: unknown, ids = ["a", "b"]) => parseFlashcardResume(JSON.stringify(value), identity, ids);

describe("demo flashcard resume", () => {
  test("preserves skip order, retry IDs and checked exam state without card content", () => {
    expect(parse(initial)).toEqual(initial);
    const retry: FlashcardResume = { ...initial, queue: [...initial.queue, { id: "b", dueStatus: "review" }], currentIndex: 1, completedCount: 1, mode: "exam", typedAnswer: "answer", isChecked: true, passedExam: false, isFlipped: true };
    expect(parse(retry)).toEqual(retry);
    expect(parse({ ...initial, queue: [{ id: "a", dueStatus: "new", back: "injected" }, initial.queue[1]] })).toBeNull();
  });
  test("validates batch cursor and completed state beyond the first ten cards", () => {
    const ids = Array.from({ length: 12 }, (_, i) => String(i));
    const value: FlashcardResume = { ...initial, queue: ids.map(id => ({ id, dueStatus: "new" })), batchOffset: 10, currentIndex: 2, completedCount: 12 };
    expect(parse(value, ids)).toEqual(value);
    expect(parse({ ...value, currentIndex: 3 }, ids)).toBeNull();
    expect(parse({ ...value, batchOffset: 11 }, ids)).toBeNull();
    expect(parse({ ...value, completedCount: 11 }, ids)).toBeNull();
  });
  test("rejects malformed, stale, unknown, missing or unearned retry state", () => {
    for (const value of [
      { ...initial, version: 2 }, { ...initial, identity: "another revision" },
      { ...initial, queue: [{ id: "x", dueStatus: "new" }] },
      { ...initial, queue: [initial.queue[0]] }, { ...initial, queue: [...initial.queue, initial.queue[0]] },
      { ...initial, currentIndex: -1 }, { ...initial, batchOffset: 10 },
      { ...initial, mode: "exam", isFlipped: true },
      { ...initial, mode: "exam", isChecked: true, passedExam: true },
      { ...initial, passedExam: true }, { ...initial, typedAnswer: "x".repeat(20001) },
    ]) expect(parse(value)).toBeNull();
    expect(parseFlashcardResume("{", identity, ["a", "b"])).toBeNull();
    expect(parseFlashcardResume(null, identity, ["a", "b"])).toBeNull();
    expect(demoFlashcardResumeKey(identity)).not.toBe(demoFlashcardResumeKey(`${identity}another page`));
  });
});
