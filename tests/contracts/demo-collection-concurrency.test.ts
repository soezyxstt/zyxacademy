import { expect, mock, test } from "bun:test";
import { collectDemoFlashcards, type DemoProductCollections } from "@/lib/demo/product-pages";
import { collectDemoQuizPages } from "@/lib/demo/quiz-pages";

mock.module("server-only", () => ({}));
const { getDemoExperience } = await import("../visual/demo-harness/demo-data");
const courseId = "fictional-berpikir";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("quiz pages load at most two at a time and retain cursor order and individual tokens", async () => {
  const first = (await getDemoExperience(courseId))!;
  const page = (offset: number) => {
    const item = structuredClone(first);
    item.content.collections.quiz = { offset, total: 10, pageSize: 3, previousOffset: offset ? offset - 3 : null, nextOffset: offset + 3 < 10 ? offset + 3 : null };
    item.content.quiz = Array.from({ length: Math.min(3, 10 - offset) }, (_, index) => ({ id: `q-${offset + index}`, prompt: "P", options: ["A", "B"], multiple: false }));
    item.content.quizSetToken = `token-${offset}`;
    return item;
  };
  const pending = new Map<number, ReturnType<typeof deferred<ReturnType<typeof page>>>>();
  const nextBatch = deferred<void>();
  let active = 0;
  let maxActive = 0;
  const collecting = collectDemoQuizPages(page(0), async (_id, selection) => {
    const offset = selection.quizOffset!;
    const result = deferred<ReturnType<typeof page>>();
    pending.set(offset, result);
    active++;
    maxActive = Math.max(maxActive, active);
    if (pending.has(6) && pending.has(9)) nextBatch.resolve();
    const value = await result.promise;
    active--;
    return value;
  });
  expect([...pending.keys()]).toEqual([3]);
  pending.get(3)!.resolve(page(3));
  await nextBatch.promise;
  expect([...pending.keys()]).toEqual([3, 6, 9]);
  pending.get(9)!.resolve(page(9));
  pending.get(6)!.resolve(page(6));
  const result = await collecting;
  expect(maxActive).toBe(2);
  expect(result?.map(item => [item.offset, item.token, item.questions.length])).toEqual([[0, "token-0", 3], [3, "token-3", 3], [6, "token-6", 3], [9, "token-9", 1]]);
  expect(result?.flatMap(item => item.questions.map(question => question.id))).toEqual(Array.from({ length: 10 }, (_, index) => `q-${index}`));
});

test("concurrent quiz aggregation rejects inconsistent pages and duplicate questions", async () => {
  const first = structuredClone((await getDemoExperience(courseId))!);
  first.content.collections.quiz.total = 7;
  first.content.quiz = Array.from({ length: 3 }, (_, index) => ({ id: `q-${index}`, prompt: "P", options: ["A", "B"], multiple: false }));
  for (const error of ["revision", "cursor", "duplicate", "token"] as const) {
    const result = await collectDemoQuizPages(first, async (_id, selection) => {
      const offset = selection.quizOffset!;
      const item = structuredClone(first);
      item.content.collections.quiz = { offset, total: 7, pageSize: 3, previousOffset: offset - 3, nextOffset: offset === 3 ? 6 : null };
      item.content.quiz = Array.from({ length: Math.min(3, 7 - offset) }, (_, index) => ({ id: `q-${offset + index}`, prompt: "P", options: ["A", "B"], multiple: false }));
      if (offset === 6) {
        if (error === "revision") item.snapshot.revision = "other";
        if (error === "cursor") item.content.collections.quiz.nextOffset = 9;
        if (error === "duplicate") item.content.quiz[0].id = "q-0";
        if (error === "token") item.content.quizSetToken = "";
      }
      return item;
    });
    expect(result).toBeNull();
  }
});

test("flashcards reuse the matching first page, read sets concurrently, and preserve set order", async () => {
  const initial = structuredClone((await getDemoExperience(courseId))!);
  const [firstSet, secondSet] = initial.content.collections.flashcardSets;
  const thirdSet = { id: "third-set", title: "Third set" };
  initial.content.flashcards = Array.from({ length: 100 }, (_, index) => ({ front: `A-${index}`, back: "A", explanation: null }));
  initial.content.collections.flashcards = { offset: 0, pageSize: 100, nextOffset: 100 };
  const products: DemoProductCollections = { articles: [], diktats: [], flashcardSets: [firstSet, secondSet, thirdSet].map(set => ({ ...set, collectionOffset: 0 })) };
  const calls: string[] = [];
  const requests = new Map<string, ReturnType<typeof deferred<typeof initial>>>();
  const thirdStarted = deferred<void>();
  let active = 0;
  let maxActive = 0;
  const collecting = collectDemoFlashcards(initial, products, async (_id, selection) => {
    const key = `${selection.flashcardSetId}:${selection.flashcardOffset}`;
    calls.push(key);
    const request = deferred<typeof initial>();
    requests.set(key, request);
    active++;
    maxActive = Math.max(maxActive, active);
    if (selection.flashcardSetId === thirdSet.id) thirdStarted.resolve();
    try { return await request.promise; } finally { active--; }
  }, initial);
  const firstNext = `${firstSet.id}:100`, secondFirst = `${secondSet.id}:0`;
  expect(calls).toEqual([firstNext, secondFirst]);
  const second = structuredClone(initial);
  second.content.selected.flashcardSetId = secondSet.id;
  second.content.collections.flashcards = { offset: 0, pageSize: 100, nextOffset: null };
  second.content.flashcards = [{ front: "B-0", back: "B", explanation: null }];
  requests.get(secondFirst)!.resolve(second);
  await thirdStarted.promise;
  const third = structuredClone(second);
  third.content.selected.flashcardSetId = thirdSet.id;
  third.content.flashcards = [{ front: "C-0", back: "C", explanation: null }];
  requests.get(`${thirdSet.id}:0`)!.resolve(third);
  const next = structuredClone(initial);
  next.content.collections.flashcards = { offset: 100, pageSize: 100, nextOffset: null };
  next.content.flashcards = [{ front: "A-100", back: "A", explanation: null }];
  requests.get(firstNext)!.resolve(next);
  const cards = await collecting;
  expect(maxActive).toBe(2);
  expect(cards).toHaveLength(103);
  expect(cards?.slice(99).map(card => card.front)).toEqual(["A-99", "A-100", "B-0", "C-0"]);
});

test("flashcard reuse still rejects a bad cursor, foreign scope, and excessive totals", async () => {
  const initial = structuredClone((await getDemoExperience(courseId))!);
  const set = { ...initial.content.collections.flashcardSets[0], collectionOffset: 0 };
  const products: DemoProductCollections = { articles: [], diktats: [], flashcardSets: [set] };
  const badCursor = structuredClone(initial);
  badCursor.content.collections.flashcards.nextOffset = 99;
  expect(await collectDemoFlashcards(initial, products, async () => null, badCursor)).toBeNull();
  const foreign = structuredClone(initial);
  foreign.snapshot.revision = "other";
  expect(await collectDemoFlashcards(initial, products, async () => null, foreign)).toBeNull();
  const manySets: DemoProductCollections = { articles: [], diktats: [], flashcardSets: Array.from({ length: 101 }, (_, index) => ({ id: `set-${index}`, title: "Set", collectionOffset: 0 })) };
  expect(await collectDemoFlashcards(initial, manySets, async (_id, selection) => {
    const page = structuredClone(initial);
    page.content.selected.flashcardSetId = selection.flashcardSetId!;
    page.content.collections.flashcards = { offset: 0, pageSize: 100, nextOffset: null };
    page.content.flashcards = Array.from({ length: 100 }, (_, index) => ({ front: `F-${index}`, back: "B", explanation: null }));
    return page;
  })).toBeNull();
});

test("reuses an already loaded later flashcard page only after following its preceding cursor", async () => {
  const initial = structuredClone((await getDemoExperience(courseId))!);
  const set = { ...initial.content.collections.flashcardSets[0], collectionOffset: 0 };
  const products: DemoProductCollections = { articles: [], diktats: [], flashcardSets: [set] };
  initial.content.collections.flashcards = { offset: 100, pageSize: 100, nextOffset: null };
  initial.content.flashcards = [{ front: "Later", back: "B", explanation: null }];
  const calls: number[] = [];
  const result = await collectDemoFlashcards(initial, products, async (_id, selection) => {
    calls.push(selection.flashcardOffset!);
    const first = structuredClone(initial);
    first.content.collections.flashcards = { offset: 0, pageSize: 100, nextOffset: 100 };
    first.content.flashcards = Array.from({ length: 100 }, (_, index) => ({ front: `First-${index}`, back: "B", explanation: null }));
    return first;
  }, initial);
  expect(calls).toEqual([0]);
  expect(result).toHaveLength(101);
  expect(result?.[100].front).toBe("Later");
});
