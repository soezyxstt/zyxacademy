import { beforeEach, expect, mock, test } from "bun:test";

let rows: unknown[][] = [];
let insertError: unknown;
let inserted: unknown[] = [];
let computeError: Error | undefined;

function query() {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "innerJoin", "leftJoin", "orderBy"]) {
    chain[method] = () => chain;
  }
  const result = () => {
    if (computeError) throw computeError;
    return rows.shift() ?? [];
  };
  chain.limit = async () => result();
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(result).then(resolve, reject);
  return chain;
}

mock.module("@/db", () => ({ db: {
  select: () => query(),
  selectDistinct: () => query(),
  insert: () => ({ values: async (value: unknown) => {
    inserted.push(value);
    if (insertError) throw insertError;
  } }),
} }));
mock.module("@/lib/study-path-service", () => ({ getOrComputeStudyPath: async () => [] }));
mock.module("@/lib/mastery-store", () => ({ getMastery: async () => [] }));

const { getOrBuildTodayRecommendation } = await import("@/lib/recommendation-service");
const item = { id: "flashcards", kind: "flashcards", title: "Review flashcards", count: 1, href: "/courses/course/flashcard", done: false };

beforeEach(() => {
  rows = [[], [{ cardId: "card", courseId: "course" }], [], [], [], []];
  insertError = undefined;
  inserted = [];
  computeError = undefined;
});

test("computes and stores the daily plan", async () => {
  expect(await getOrBuildTodayRecommendation("student", ["course"])).toEqual({ items: [item] });
  expect(inserted).toHaveLength(1);
  expect(inserted[0]).toMatchObject({ payload: { items: [expect.objectContaining({ id: "flashcards" })] }, completedItems: [] });
});

test("returns cached completion state without inserting", async () => {
  rows = [[{ payload: { items: [{ id: "cached", kind: "quiz", title: "Quiz", href: "/quiz" }] }, completedItems: ["cached"] }]];
  expect(await getOrBuildTodayRecommendation("student", ["course"])).toEqual({ items: [{ id: "cached", kind: "quiz", title: "Quiz", href: "/quiz", done: true }] });
  expect(inserted).toHaveLength(0);
});

for (const error of [Object.assign(new Error("private SQL details"), { code: "25006" }), new Error("private failure")]) {
  test(`returns the computed plan when persistence fails: ${"code" in error ? error.code : "other"}`, async () => {
    insertError = error;
    const log = mock(() => {});
    const original = console.error;
    console.error = log;
    try {
      expect(await getOrBuildTodayRecommendation("student", ["course"])).toEqual({ items: [item] });
      expect(log).toHaveBeenCalledWith("[recommendations] Daily cache persistence failed");
    } finally {
      console.error = original;
    }
  });
}

test("propagates computation failures and does not insert", async () => {
  // The cache lookup succeeds, then the first plan query fails.
  const failure = new Error("compute failed");
  rows = [[]];
  const originalShift = rows.shift.bind(rows);
  rows.shift = () => { const value = originalShift(); computeError = failure; return value; };
  expect(getOrBuildTodayRecommendation("student", ["course"])).rejects.toThrow("compute failed");
  expect(inserted).toHaveLength(0);
});
