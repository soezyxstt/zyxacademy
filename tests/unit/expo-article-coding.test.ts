import { expect, test } from "bun:test";
import { nativeArticleCodingHeader } from "@/lib/coding/native-article-contract";
import { articleCodingDraftKey, sectionCodingParts } from "@/lib/coding/native-article-parts";
import { articleCodingApi, articleCodingRequest, releaseArticleSubmission, reserveArticleSubmission } from "@/apps/mobile-native/features/student/courses/article-coding";
import type { StudentRequest } from "@/apps/mobile-native/features/student/contracts";
import { personalAccountSessionHeader } from "@/packages/student-community/account-access";

const scope = { materialId: "article", sectionId: "section", partId: "exercise", revision: "a".repeat(64) };
const locator = { problemId: "problem", version: 3 };
const problem = { ...locator, courseId: "canonical", language: "python" as const, title: "Print a value", prompt: "Write Python.",
  learningObjectives: ["Print"], starterCode: "", publicTests: [{ id: "demo", stdin: "", expectedStdout: "2" }],
  limits: { timeoutMs: 5000, maxOutputChars: 8000 } };
const submission = { requestId: "first", problem: locator, code: "print(2)", stdin: "" };
const signal = new AbortController().signal;

test("only runnable typed coding parts become controls, with the web draft identity", () => {
  const exercise = { id: "exercise", kind: "coding_exercise", problem: locator } as const;
  const staticPart = { id: "static", kind: "code_example", language: "python", code: "def x(): pass", runnable: false };
  const runnable = { ...staticPart, id: "run", runnable: true };
  const entries = sectionCodingParts([{ id: "block", title: "Example", parts: [exercise, staticPart, runnable] }]);
  expect(entries.map(({ part }) => part.id)).toEqual(["exercise", "run"]);
  expect(articleCodingDraftKey("article", 2, entries[0].part)).toBe("exercise:article:2:exercise");
  expect(articleCodingDraftKey("article", 2, entries[1].part)).toBe("example:article:2:run");
  expect(sectionCodingParts([{ id: "a", parts: [exercise] }, { id: "b", parts: [exercise] }])).toEqual([]);
});

test("problem requests bind the signed cookie account, session and exact structured article, rejecting private data", async () => {
  let response: unknown = { problem };
  let requested: { path: string; headers: Headers } | undefined;
  const request: StudentRequest = async (path, init) => {
    requested = { path, headers: new Headers(init?.headers) };
    return Response.json(response);
  };
  const scoped = articleCodingRequest(request, { userId: "student", sessionId: "cookie-session", role: "student", origin: "https://app.example", locale: "id" }, scope);
  const api = articleCodingApi(scoped, "course", "article", 2, "exercise");
  expect(await api.problem(locator, signal)).toEqual(problem);
  expect(requested?.headers.get("x-student-id")).toBe("student");
  expect(requested?.headers.get(personalAccountSessionHeader)).toBe("cookie-session");
  expect(JSON.parse(decodeURIComponent(requested!.headers.get(nativeArticleCodingHeader)!))).toEqual(scope);
  expect(JSON.parse(new URL(requested!.path, "https://app.example").searchParams.get("surface")!))
    .toEqual({ kind: "article", articleId: "article", articleVersion: 2, partId: "exercise" });
  response = { problem: { ...problem, privateTests: [{ id: "hidden" }] } };
  await expect(api.problem(locator, signal)).rejects.toThrow();
  response = { attemptId: "attempt", ordinal: 1, feedback: { problem: locator, authority: "trusted_server",
    verdict: "correct", passed: 1, total: 1, publicCases: [{ testId: "hidden", passed: true,
      execution: { status: "completed", stdout: "secret", stderr: "", truncated: false } }] } };
  await expect(api.submit(problem, submission, signal)).rejects.toThrow("Coding feedback identity mismatch.");
});

test("an uncertain submission retains its original payload and cannot clear another attempt", async () => {
  let raw: string | null = null;
  const store = {
    get: async () => raw,
    set: async (_key: string, value: string) => { raw = value; },
    remove: async () => { raw = null; },
    update: async (_key: string, change: (current: string | null) => string | null) => { raw = change(raw); },
  };
  expect(await reserveArticleSubmission(store, "key", submission)).toEqual(submission);
  const another = { ...submission, requestId: "second", code: "print(9)" };
  expect(await reserveArticleSubmission(store, "key", another)).toEqual(submission);
  await releaseArticleSubmission(store, "key", another);
  expect(await store.get()).toBe(JSON.stringify(submission));
  await releaseArticleSubmission(store, "key", submission);
  expect(await store.get()).toBeNull();
});

test("attempt history is scoped to the exercise signature and projects only public feedback", async () => {
  let path = "";
  let contents: unknown = { attempts: [{ id: "attempt", ordinal: 1, status: "pending", code: "print(1)", feedback: null }] };
  const request: StudentRequest = async requested => { path = requested; return Response.json(contents); };
  const api = articleCodingApi(request, "course", "article", 2, "exercise");
  expect(await api.history(problem, signal)).toMatchObject([{ id: "attempt", ordinal: 1 }]);
  const query = new URL(path, "https://app.example").searchParams;
  expect(query.get("problemId")).toBe("problem");
  expect(JSON.parse(query.get("surface")!)).toEqual({ kind: "article", articleId: "article", articleVersion: 2, partId: "exercise" });
  contents = { attempts: [{ id: "private", status: "failed", ordinal: 1, code: "", feedback: { problem: locator,
    authority: "trusted_server", verdict: "incorrect", passed: 0, total: 1, publicCases: [{ testId: "hidden", passed: false,
      execution: { status: "completed", stdout: "private", stderr: "", truncated: false } }] } }] };
  await expect(api.history(problem, signal)).rejects.toThrow("Coding feedback identity mismatch.");
});

test("Python fences use the web examples' namespace and AST location without revealing commented source", async () => {
  const { appendArticleMarkdownScope, markdownPythonId } = await import("@/lib/coding/article-markdown-scope");
  const content = "A worked example.\n\n```py\nprint(2)\n```";
  const first = appendArticleMarkdownScope(null, JSON.stringify(["section", "body"]));
  const expected = markdownPythonId(appendArticleMarkdownScope(first, "md-1-code"), "md-1-code");
  const entries = sectionCodingParts([{ id: "body", content }, { id: "private", content: "<!--\n```python\nsecret()\n```\n-->" }], "section");
  expect(entries.map(entry => entry.part)).toEqual([
    { id: expected, kind: "code_example", language: "python", code: "print(2)", runnable: true },
  ]);
  expect(articleCodingDraftKey("article", 3, entries[0].part, entries[0].namespace)).toBe("markdown-example:article:3:" + expected);
  expect(sectionCodingParts([{ id: "body", parts: [{ kind: "markdown", id: "p", markdown: content }] }], "section")[0].part.id).not.toBe(expected);
});
