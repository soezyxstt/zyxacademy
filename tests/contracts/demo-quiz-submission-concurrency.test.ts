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
  requests.get(0)!.resolve(pageResult(pages[0]));
  requests.get(3)!.reject(new Error("failed"));
  await expect(result).rejects.toThrow("failed");
  expect([...requests.keys()]).toEqual([0, 3]);
});


test("failure does not allow resubmission until the in-flight peer has settled", async () => {
  const first = deferred<DemoQuizResult>();
  const peer = deferred<DemoQuizResult>();
  let settled = false;
  const submission = gradeDemoQuizPages("course", pages, {}, async (_course, _questions, _token, _answers, offset = 0) => offset === 0 ? first.promise : peer.promise);
  void submission.then(() => { settled = true; }, () => { settled = true; });
  first.reject(new Error("early failure"));
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  peer.resolve(pageResult(pages[1]));
  await expect(submission).rejects.toThrow("early failure");
  expect(settled).toBe(true);
});


test("a failed page aborts its peer and no later batch starts", async () => {
  let aborted = false;
  const first = deferred<DemoQuizResult>();
  const started: number[] = [];
  const submission = gradeDemoQuizPages("course", pages, {}, async (_course, _questions, _token, _answers, offset = 0, signal) => {
    started.push(offset);
    if (offset === 0) return first.promise;
    return new Promise<DemoQuizResult>((_resolve, reject) => {
      signal!.addEventListener("abort", () => { aborted = true; reject(signal!.reason); }, { once: true });
    });
  });
  first.reject(new Error("peer failed"));
  await expect(submission).rejects.toThrow("peer failed");
  expect(aborted).toBe(true);
  expect(started).toEqual([0, 3]);
});

test("a stalled request is aborted at the batch deadline", async () => {
  const submission = gradeDemoQuizPages("course", pages, {}, async (_course, _questions, _token, _answers, _offset, signal) =>
    new Promise<DemoQuizResult>((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
    }), 1);
  await expect(submission).rejects.toThrow("Quiz submission timed out");
});
