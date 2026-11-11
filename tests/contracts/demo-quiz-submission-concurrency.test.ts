import { expect, test } from "bun:test";
import { gradeDemoQuizPages } from "@/lib/demo/quiz-submission";
import type { DemoQuizPage } from "@/lib/demo/quiz-pages";
import type { DemoQuizResult } from "@/lib/demo/assessment/quiz";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const pages: DemoQuizPage[] = [0, 3, 6].map(offset => ({ offset, token: `token-${offset}`, questions: Array.from({ length: offset === 6 ? 1 : 3 }, (_, index) => ({ id: `q-${offset + index}`, prompt: "P", options: ["A", "B"], multiple: false })) }));
const pageResult = (page: DemoQuizPage): DemoQuizResult => ({ score: page.questions.length, total: page.questions.length, results: page.questions.map((_, index) => ({ index, isCorrect: true, correctIndices: [0], explanation: null })) });

test("submits signed pages in pairs and assembles results in page order", async () => {
  const requests = new Map<number, ReturnType<typeof deferred<DemoQuizResult>>>();
  const thirdStarted = deferred<void>();
  const answers = Object.fromEntries(pages.flatMap(page => page.questions.map(question => [question.id, [0]])));
  let active = 0;
  let maxActive = 0;
  const resultPromise = gradeDemoQuizPages("course", pages, answers, async (courseId, questions, token, submittedAnswers, offset = 0) => {
    expect(courseId).toBe("course");
    expect(questions).toEqual(pages.find(page => page.offset === offset)!.questions);
    expect(token).toBe(`token-${offset}`);
    expect(submittedAnswers).toBe(answers);
    const request = deferred<DemoQuizResult>();
    requests.set(offset, request);
    active++;
    maxActive = Math.max(maxActive, active);
    if (offset === 6) thirdStarted.resolve();
    try { return await request.promise; } finally { active--; }
  });
  expect([...requests.keys()]).toEqual([0, 3]);
  requests.get(3)!.resolve(pageResult(pages[1]));
  requests.get(0)!.resolve(pageResult(pages[0]));
  await thirdStarted.promise;
  requests.get(6)!.resolve(pageResult(pages[2]));
  const result = await resultPromise;
  expect(maxActive).toBe(2);
  expect(result.score).toBe(7);
  expect(result.total).toBe(7);
  expect(result.results.map(item => item.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
});

test("a failed page rejects the whole submission and does not start the next batch", async () => {
  const requests = new Map<number, ReturnType<typeof deferred<DemoQuizResult>>>();
  const result = gradeDemoQuizPages("course", pages, {}, async (_course, _questions, _token, _answers, offset = 0) => {
    const request = deferred<DemoQuizResult>();
    requests.set(offset, request);
    return request.promise;
  });
  const rejected = expect(result).rejects.toThrow("failed");
  requests.get(0)!.resolve(pageResult(pages[0]));
  requests.get(3)!.reject(new Error("failed"));
  await rejected;
  expect([...requests.keys()]).toEqual([0, 3]);
});
