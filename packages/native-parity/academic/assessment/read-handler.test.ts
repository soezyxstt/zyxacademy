import { strict as assert } from "node:assert";
import { test } from "node:test";
import { handleAssessmentRead, type AssessmentReadServices } from "../../../../lib/native/academic/assessment/handle-read";
import { tryoutCorrectIndices } from "../../../../lib/native/academic/assessment/tryout-answer";
import { createAssessmentReadGateway } from "../../../../apps/mobile-native/features/academic/assessment/client";

function services(override: Partial<AssessmentReadServices> = {}): AssessmentReadServices {
  return {
    session: async () => ({ user: { id: "session-user" } }),
    isAdmin: async () => false,
    isTutor: async () => false,
    quizzes: async () => { assert.fail("Reached quiz reader without authorization"); },
    attempts: async () => { assert.fail("Reached attempt reader without authorization"); },
    preview: async () => { assert.fail("Reached preview reader without authorization"); },
    grading: async () => { assert.fail("Reached grading reader without authorization"); },
    gradeDetails: async () => { assert.fail("Reached grade detail reader without authorization"); },
    tryouts: async () => { assert.fail("Reached tryout reader without authorization"); },
    ...override,
  };
}

test("assessment console requires a matching authenticated staff role before calling read services", async () => {
  const path = ["tutor", "course-id", "quizzes"];
  const noSession = await handleAssessmentRead(path, services({ session: async () => null }));
  assert.equal(noSession.status, 401);
  assert.equal((await handleAssessmentRead(path, services())).status, 403);
  assert.equal((await handleAssessmentRead(["admin", "course-slug", "grading", "other"], services({ isAdmin: async () => true }))).status, 404);
  assert.equal((await handleAssessmentRead(["tutor", "course-id", "tryouts"], services({ isTutor: async () => true }))).status, 404);
  assert.equal((await handleAssessmentRead(["tutor", "x/y", "quizzes"], services())).status, 400);
  assert.equal((await handleAssessmentRead(["tutor", "x\u0000y", "quizzes"], services())).status, 400);
});

test("server read only calls scoped readers with trusted actor and marks protected responses private", async () => {
  const collection = { course: { id: "course-id", slug: "course-slug", title: "Biologi Dasar" }, quizzes: [], bank: [] };
  const result = await handleAssessmentRead(["tutor", "course-id", "quizzes"], services({
    isTutor: async (id) => id === "session-user",
    quizzes: async (scope) => {
      assert.deepEqual(scope, { role: "tutor", courseKey: "course-id", actorId: "session-user" });
      return collection;
    },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await result.json(), collection);
});

test("course access denial and cross-course detail miss return bounded errors", async () => {
  const api = services({
    isTutor: async () => true,
    quizzes: async () => { throw new Error("TUTOR_ACCESS_DENIED: NO_ASSIGNMENT"); },
    gradeDetails: async (scope, id) => {
      assert.equal(scope.courseKey, "course-id");
      assert.equal(id, "different-course-attempt");
      return null;
    },
  });
  assert.equal((await handleAssessmentRead(["tutor", "course-id", "quizzes"], api)).status, 403);
  assert.equal((await handleAssessmentRead(["tutor", "course-id", "grading", "different-course-attempt"], api)).status, 404);
});

test("live gateway binds account, forwards scoped path and exposes read-only capability", async () => {
  const paths: string[] = [];
  const gateway = createAssessmentReadGateway({
    accountId: "session-user", origin: "https://example.test", locale: "id",
    get: async (path) => {
      paths.push(path);
      return Response.json([], { status: 200 });
    },
  });
  const actor = { id: "session-user", role: "tutor" } as const;
  const context = { actor, scenario: "populated", scope: { kind: "tutor", courseId: "course id" } } as const;
  assert.equal(gateway.canMutate, false);
  const data = await gateway.pendingGrading(context);
  assert.deepEqual(data, { ok: true, value: [] });
  assert.deepEqual(paths, ["/api/native/academic-assessment/tutor/course%20id/grading"]);
  const error = await gateway.pendingGrading({ ...context, actor: { ...actor, id: "different-user" } });
  assert.equal(error.ok ? "ok" : error.code, "forbidden");
  assert.equal(paths.length, 1);
});

test("legacy single-choice tryout snapshots retain correctIndex when the array is empty", () => {
  assert.deepEqual(tryoutCorrectIndices("multiple_choice", { correctIndex: 1, correctIndices: [] }), [1]);
  assert.deepEqual(tryoutCorrectIndices("multiple_choice", { correctIndex: 0, correctIndices: [2] }), [0]);
  assert.deepEqual(tryoutCorrectIndices("multiple_choices", { correctIndex: 0, correctIndices: [1, 2, "3"] }), [1, 2]);
  assert.deepEqual(tryoutCorrectIndices("short_answer", { correctIndex: 0, correctIndices: [1] }), []);
});

test("native grading command validates origin, session, Tutor role and path-scoped input", async () => {
  const { handleGradeCommand } = await import("../../../../lib/native/academic/assessment/handle-grade-command");
  const origin = "https://example.test";
  const requestId = "grade-retry-12345678";
  const path = ["tutor", "course-id", "grading", "attempt-id"];
  const items = [{ questionId: "essay", score: 80, expectedRevision: 2, reviewNotes: "Catatan" }];
  const valid = () => ({ items, finalize: true });
  const request = (body: unknown = valid(), requestOrigin = origin) =>
    new Request(`${origin}/api/native/academic-assessment/${path.join("/")}`, {
      method: "POST", headers: {
        "Content-Type": "application/json", Origin: requestOrigin, "Idempotency-Key": requestId,
      },
      body: JSON.stringify(body),
    });
  let called = 0;
  const allowed = {
    session: async () => ({ user: { id: "session-user" } }),
    isTutor: async (id: string) => id === "session-user",
    grade: async (input: unknown, options: unknown) => {
      called += 1;
      assert.deepEqual(input, { courseId: "course-id", attemptId: "attempt-id", items });
      assert.deepEqual(options, { requestId, requireAllEssays: true });
      return { gradingStatus: "graded" as const };
    },
  };

  assert.equal((await handleGradeCommand(request(valid(), "https://other.test"), path, origin, allowed)).status, 403);
  assert.equal((await handleGradeCommand(request(), path, origin, { ...allowed, isTutor: async () => false })).status, 403);
  assert.equal((await handleGradeCommand(request(), path, origin, { ...allowed, session: async () => null })).status, 401);
  assert.equal((await handleGradeCommand(request({ ...valid(), actorId: "spoofed" }), path, origin, allowed)).status, 400);
  assert.equal(called, 0);
  const result = await handleGradeCommand(request(), path, origin, allowed);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await result.json(), { requestId, attemptId: "attempt-id", gradingStatus: "graded" });
  assert.equal(called, 1);
});

test("native grading client preserves request id and does not accept an unrelated receipt", async () => {
  const calls: unknown[] = [];
  const requestId = "grade-retry-12345678";
  const gateway = createAssessmentReadGateway({
    accountId: "session-user", origin: "https://example.test", locale: "id",
    get: async () => Response.json(null, { status: 404 }),
    command: async (path, init) => {
      calls.push({ path, init });
      const id = calls.length === 1 ? "different-request" : requestId;
      return Response.json({ requestId: id, attemptId: "attempt", gradingStatus: "graded" });
    },
  });
  const context = { actor: { id: "session-user", role: "tutor" }, scenario: "populated", scope: { kind: "tutor", courseId: "course" } } as const;
  const command = { kind: "grading.save", attemptId: "attempt", items: [{ questionId: "essay", expectedRevision: 1, score: 70, reviewNotes: null }], finalize: true } as const;
  const data = { ...command, items: [...command.items] };
  assert.equal(gateway.canGrade, true);
  assert.equal(gateway.canMutate, false);
  assert.equal((await gateway.mutate(context, requestId, data)).ok, false);
  assert.equal((await gateway.mutate(context, requestId, data)).ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});
