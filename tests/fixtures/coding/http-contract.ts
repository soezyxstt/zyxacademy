import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import * as schema from "@/db/schema";
import type { CodingProblemPrivate } from "@/lib/coding/contracts";
const file = `/tmp/zyx-coding-http-${randomUUID()}.db`, client = createClient({ url: `file:${file}` });
const testDb = drizzle(client, { schema });
let userId: string | null = "student", executions = 0, providerFailure = false, cleanupFailure = false;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } }));
mock.module("@/lib/env", () => ({ env: {} }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async ({ courseId }: { courseId: string }) => ({ hasCourseAccess: courseId === "course", canonicalCourseId: "course", tier: "enrolled" }) }));
mock.module("@/lib/coding/server-runtime", () => ({ createTrustedPythonRuntime: async () => { if (providerFailure) throw new Error("provider failure"); return ({ async close() { if (cleanupFailure) throw new Error("cleanup failure"); }, async execute({ stdin }: { stdin: string }) { executions++; return { status: "completed", stdout: stdin === "public" ? "public-result\n" : "PRIVATE-RESULT\n", stderr: "", truncated: false }; } }); } }));
const publicProblemRoute = await import("@/app/api/coding/problems/[problemId]/route");
const submissions = await import("@/app/api/coding/submissions/route");
const drafts = await import("@/app/api/coding/drafts/route");
const problem: CodingProblemPrivate = { problemId: "problem", version: 1, courseId: "course", language: "python", title: "Python", prompt: "Solve this", learningObjectives: ["Loops"], starterCode: "", publicTests: [{ id: "public", stdin: "public", expectedStdout: "public-result\n" }], privateTests: [{ id: "private", stdin: "PRIVATE-INPUT", expectedStdout: "PRIVATE-RESULT\n" }], referenceSolution: "PRIVATE-SOLUTION", solutionExplanation: "PRIVATE-EXPLANATION", misconceptions: [], limits: { timeoutMs: 1000, maxOutputChars: 1000 } };
const surface = { kind: "article", articleId: "article", articleVersion: 1, partId: "exercise" };
const submission = { requestId: "request", problem: { problemId: "problem", version: 1 }, code: "print('answer')", stdin: "" };
function request(path: string, body?: object, method = "POST") { return new Request(`http://app.test${path}`, body ? { method, headers: { "Content-Type": "application/json", Origin: "http://app.test" }, body: JSON.stringify(body) } : undefined); }
beforeAll(async () => {
  await client.executeMultiple("CREATE TABLE user (id TEXT PRIMARY KEY); CREATE TABLE mata_kuliah (id TEXT PRIMARY KEY); INSERT INTO user VALUES ('student'), ('other'); INSERT INTO mata_kuliah VALUES ('course'); CREATE TABLE artikel (id TEXT PRIMARY KEY, mata_kuliah_id TEXT, version INTEGER, status TEXT); CREATE TABLE blok_artikel (id TEXT PRIMARY KEY, artikel_id TEXT, version INTEGER, status TEXT, content TEXT);");
  await client.executeMultiple(readFileSync("drizzle/0099_hard_meteorite.sql", "utf8").replaceAll("--> statement-breakpoint", ""));
  await testDb.insert(schema.codingProblems).values({ id: problem.problemId, version: 1, courseId: "course", status: "published", snapshot: problem, creatorId: "student" });
  await client.execute("INSERT INTO artikel VALUES ('article', 'course', 1, 'published')");
  const meta = Buffer.from(JSON.stringify({ parts: [{ id: "exercise", kind: "coding_exercise", problem: submission.problem }] })).toString("base64url");
  await client.execute({ sql: "INSERT INTO blok_artikel VALUES ('block', 'article', 1, 'published', ?)", args: [`<!--__ZYX_V4_BLOCK_PAYLOAD__:${meta}-->`] });
});
afterAll(() => { client.close(); rmSync(file, { force: true }); });

describe("authenticated coding HTTP integration", () => {
  it("enforces identity/course and never returns the private problem snapshot", async () => {
    const context = { params: Promise.resolve({ problemId: "problem" }) };
    userId = null;
    expect((await publicProblemRoute.GET(request("/api/coding/problems/problem?courseId=course&version=1"), context)).status).toBe(401);
    userId = "student";
    expect((await publicProblemRoute.GET(request("/api/coding/problems/problem?courseId=other&version=1"), context)).status).toBe(403);
    const response = await publicProblemRoute.GET(request("/api/coding/problems/problem?courseId=course&version=1"), context);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("PRIVATE");
  });
  it("binds submissions to the published part and rejects forged authority", async () => {
    expect((await submissions.POST(request("/api/coding/submissions", { courseId: "course", surface, submission: { ...submission, authority: "trusted_server" } }))).status).toBe(400);
    expect((await submissions.POST(request("/api/coding/submissions", { courseId: "course", surface: { ...surface, partId: "not-in-article" }, submission }))).status).toBe(400);
    expect(executions).toBe(0);
  });
  it("grades, persists, replays once and redacts all private execution data", async () => {
    const body = { courseId: "course", surface, submission };
    const response = await submissions.POST(request("/api/coding/submissions", body));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.feedback.verdict).toBe("correct");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(executions).toBe(2);
    const replay = await (await submissions.POST(request("/api/coding/submissions", body))).json();
    expect(replay.attemptId).toBe(result.attemptId);
    expect(executions).toBe(2);
    const history = await submissions.GET(request(`/api/coding/submissions?${new URLSearchParams({ courseId: "course", problemId: "problem", version: "1", surface: JSON.stringify(surface) })}`));
    expect(await history.text()).not.toContain("PRIVATE");
    userId = "other";
    const other = await submissions.GET(request("/api/coding/submissions?courseId=course&problemId=problem&version=1"));
    expect((await other.json()).attempts).toEqual([]);
    userId = "student";
  });
  it("keeps provider and cleanup failures ungradable and retryable", async () => {
    for (const mode of ["acquire", "release"]) {
      providerFailure = mode === "acquire";
      cleanupFailure = mode === "release";
      const response = await submissions.POST(request("/api/coding/submissions", { courseId: "course", surface, submission: { ...submission, requestId: `failed-${mode}` } }));
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.feedback.verdict).toBe("ungradable");
      expect(result.feedback.publicCases).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
    }
    providerFailure = cleanupFailure = false;
    const response = await submissions.POST(request("/api/coding/submissions", { courseId: "course", surface, submission: { ...submission, requestId: "recovered" } }));
    expect((await response.json()).feedback.verdict).toBe("correct");
  });
  it("scopes draft revisions to the learner and rejects stale writes", async () => {
    const body = { courseId: "course", draftKey: "playground", code: "print(1)", stdin: "", revision: 0 };
    expect((await drafts.PUT(request("/api/coding/drafts", body, "PUT"))).status).toBe(200);
    expect((await drafts.PUT(request("/api/coding/drafts", body, "PUT"))).status).toBe(409);
    userId = "other";
    expect((await (await drafts.GET(request("/api/coding/drafts?courseId=course&draftKey=playground"))).json()).draft).toBeNull();
    userId = "student";
  });
});
