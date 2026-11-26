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

test("native quiz editor sends canonical create and edit commands and records only verified notices", async () => {
  const { defaultQuiz } = await import("./model");
  const calls: Array<{ path: string; init: unknown }> = [];
  const gateway = createAssessmentReadGateway({
    accountId: "session-admin", origin: "https://example.test", locale: "id",
    get: async () => Response.json(null, { status: 404 }),
    command: async (path, init) => {
      calls.push({ path, init });
      return Response.json({ requestId: init.requestId, templateId: "tpl-live", actingRole: "admin" });
    },
  });
  const context = { actor: { id: "session-admin", role: "admin" }, scenario: "populated", scope: { kind: "admin", slug: "biologi" } } as const;
  const input = { ...defaultQuiz("admin"), title: "Kuis biologi" };
  assert.equal(gateway.canSaveQuiz, true);
  assert.equal(gateway.canMutate, false);
  assert.equal(gateway.takeQuizSaveNotice?.(context, "spoof"), null);
  assert.equal((await gateway.mutate(context, "create", { kind: "quiz.save", target: null, courseId: "mk-bio", input })).ok, true);
  assert.equal(gateway.takeQuizSaveNotice?.(context, "create"), "Kuis tersimpan.");
  assert.equal(gateway.takeQuizSaveNotice?.(context, "create"), null);
  assert.equal((await gateway.mutate(context, "edit", {
    kind: "quiz.save", target: { id: "tpl-live", expectedRevision: 1891 }, courseId: "mk-bio", input,
  })).ok, true);
  assert.equal((await gateway.mutate(context, "publish", {
    kind: "quiz.status", target: { id: "tpl-live", expectedRevision: 1892 }, courseId: "mk-bio", status: "published",
  })).ok, true);
  assert.equal((await gateway.mutate(context, "delete", {
    kind: "quiz.delete", target: { id: "tpl-live", expectedRevision: 1893 }, courseId: "mk-bio",
  })).ok, true);
  assert.deepEqual(calls.map(({ path }) => path), ["/api/quiz/templates", "/api/quiz/templates/tpl-live", "/api/quiz/templates/tpl-live", "/api/quiz/templates/tpl-live"]);
  assert.equal((calls[0].init as { method: string }).method, "POST");
  assert.equal((calls[1].init as { method: string }).method, "PATCH");
  assert.equal((calls[3].init as { method: string }).method, "DELETE");
  assert.equal((calls[1].init as { body: { expectedRevision: number } }).body.expectedRevision, 1891);
  assert.deepEqual(calls.map(({ init }) => (init as { body: { actingRole: string } }).body.actingRole), Array(4).fill("admin"));
});

test("a lost create response preserves the same immutable command and key across screen remount", async () => {
  const { defaultQuiz } = await import("./model");
  const calls: unknown[] = [];
  const transport = {
    accountId: "session-tutor", origin: "https://example.test", locale: "id",
    get: async () => Response.json([], { status: 200 }),
    command: async (path: string, init: import("../../../../apps/mobile-native/features/academic/client").AcademicCommand) => {
      calls.push({ path, init });
      if (calls.length === 1) throw new Error("Lost response");
      return Response.json({ requestId: init.requestId, templateId: "created", actingRole: calls.length === 2 ? "admin" : "tutor" });
    },
  };
  const gateway = createAssessmentReadGateway(transport);
  const context = { actor: { id: "session-tutor", role: "tutor" }, scenario: "populated", scope: { kind: "tutor", courseId: "course" } } as const;
  const command = {
    kind: "quiz.save", target: null, courseId: "course",
    input: { ...defaultQuiz("tutor"), title: "Kuis pertama", selection: { mode: "specific", questionIds: ["question"] } },
  } as const;
  const draft = { ...command, input: { ...command.input, selection: { ...command.input.selection, questionIds: [...command.input.selection.questionIds] } } };
  const key = "first-save-key";
  const saved = await gateway.mutate(context, key, draft);
  assert.equal(saved.ok, false);

  const remounted = createAssessmentReadGateway(transport);
  assert.equal(remounted, gateway);
  assert.equal(createAssessmentReadGateway({ ...transport }).pendingQuizSave?.(context, null), null);
  const outstanding = remounted.pendingQuizSave?.(context, null);
  assert.ok(outstanding);
  assert.equal(outstanding.requestId, key);
  assert.equal(outstanding.command.input.title, "Kuis pertama");
  assert.equal(outstanding.confirmed, false);
  const adminContext = { ...context, actor: { id: context.actor.id, role: "admin" }, scope: { kind: "admin", slug: "course" } } as const;
  assert.equal(remounted.pendingQuizSave?.(adminContext, null), null);
  assert.equal((await remounted.mutate(adminContext, outstanding.requestId, outstanding.command)).ok, false);
  assert.equal((await remounted.mutate(context, "different-key", { ...draft, input: { ...draft.input, title: "Kuis berbeda" } })).ok, false);
  assert.equal(calls.length, 1);
  const wrongScope = await remounted.mutate(context, outstanding.requestId, outstanding.command);
  assert.equal(wrongScope.ok, false);
  assert.equal(remounted.pendingQuizSave?.(context, null)?.confirmed, false);
  const retried = await remounted.mutate(context, outstanding.requestId, outstanding.command);
  assert.equal(retried.ok, true);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0], calls[2]);
  assert.equal(remounted.pendingQuizSave?.(context, null)?.confirmed, true);
  assert.equal((await remounted.mutate(context, outstanding.requestId, outstanding.command)).ok, true);
  assert.equal(calls.length, 3);
  assert.equal(remounted.takeQuizSaveNotice?.(context, key), "Kuis tersimpan.");
  assert.equal(remounted.pendingQuizSave?.(context, null), null);
});

test("Admin tryout draft writes keep the scoped payload and request across navigation", async () => {
  const commands: Array<{ path: string; init: import("../../../../apps/mobile-native/features/academic/client").AcademicCommand }> = [];
  const transport = {
    accountId: "admin", origin: "https://example.test", locale: "id",
    get: async () => Response.json(null, { status: 404 }),
    command: async (path: string, init: import("../../../../apps/mobile-native/features/academic/client").AcademicCommand) => {
      commands.push({ path, init });
      if (commands.length === 1) throw new Error("Lost response");
      return Response.json({ requestId: init.requestId, examId: "draft", revision: "b".repeat(64) });
    },
  };
  const context = { actor: { id: "admin", role: "admin" }, scope: { kind: "admin", slug: "biologi" }, scenario: "populated" } as const;
  const gateway = createAssessmentReadGateway(transport);
  assert.equal(gateway.canSaveTryoutDraft, true);
  const input = { title: "Tryout", status: "draft", timeLimitMinutes: 90, maxAttempts: 2, openAt: null, closeAt: null } as const;
  const draft = { kind: "tryout.save", input, target: null, courseId: "mk-bio" } as const;
  assert.equal(await gateway.mutate(context, "draft-save", { ...draft, input: { ...input, status: "published" } }).then((value) => value.ok), false);
  assert.equal(commands.length, 0);
  assert.equal(await gateway.mutate(context, "draft-save", draft).then((value) => value.ok), false);
  const remounted = createAssessmentReadGateway(transport);
  const pending = remounted.pendingTryoutDraft?.(context);
  assert.ok(pending);
  assert.equal(pending.confirmed, false);
  assert.equal(await remounted.mutate(context, "another-id", draft).then((value) => value.ok), false);
  assert.equal(await remounted.mutate(context, pending.requestId, pending.command).then((value) => value.ok), true);
  assert.deepEqual(commands[0], commands[1]);
  assert.deepEqual(commands[0], {
    path: "/api/native/academic-assessment/admin/biologi/tryouts",
    init: {
      method: "POST", requestId: "draft-save", body: { courseId: "mk-bio", expectedRevision: null, title: "Tryout",
        timeLimitMinutes: 90, maxAttempts: 2, openAt: null, closeAt: null },
    },
  });
  remounted.confirmTryoutDraft?.(context, pending.requestId);
  assert.equal(remounted.pendingTryoutDraft?.(context), null);
  const edit = { ...draft, target: { id: "draft", expectedRevision: 0, metadataRevision: "a".repeat(64) } };
  assert.equal(await remounted.mutate(context, "draft-edit", edit).then((value) => value.ok), true);
  assert.equal(commands[2].path, "/api/native/academic-assessment/admin/biologi/tryouts/draft");
  assert.equal(commands[2].init.method, "PATCH");
  assert.equal((commands[2].init.body as { expectedRevision: string }).expectedRevision, "a".repeat(64));
});

test("same-session Admin bank selection retries keep the original course, exam, order and revision", async () => {
  const calls: Array<{ path: string; init: import("../../../../apps/mobile-native/features/academic/client").AcademicCommand }> = [];
  const transport = {
    accountId: "admin", origin: "https://example.test", locale: "id",
    get: async () => Response.json(null, { status: 404 }),
    command: async (path: string, init: import("../../../../apps/mobile-native/features/academic/client").AcademicCommand) => {
      calls.push({ path, init });
      const examId = calls.length === 1 ? "different-draft" : "draft";
      return Response.json({ requestId: init.requestId, examId, revision: "b".repeat(64), imported: 2, skipped: 0 });
    },
  };
  const context = { actor: { id: "admin", role: "admin" }, scope: { kind: "admin", slug: "biologi" }, scenario: "populated" } as const;
  const command = {
    kind: "tryout.question.import", courseId: "mk-bio", exam: { id: "draft", expectedRevision: 0 },
    questionSetRevision: "a".repeat(64), bankIds: ["q-two", "q-one"],
  } as const;
  const edit = { ...command, bankIds: [...command.bankIds] };
  const gateway = createAssessmentReadGateway(transport);
  const requestId = "tryout-bank-request";
  assert.equal((await gateway.mutate(context, requestId, edit)).ok, false);
  const remounted = createAssessmentReadGateway(transport);
  const pending = remounted.pendingTryoutDraft?.(context);
  assert.ok(pending);
  const otherContext = { ...context, scope: { ...context.scope, slug: "fisika" } };
  assert.equal(remounted.pendingTryoutDraft?.(otherContext), null);
  assert.equal((await remounted.mutate(otherContext, requestId, pending.command)).ok, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(await remounted.mutate(context, pending.requestId, pending.command),
    { ok: true, value: { id: "draft", message: "2 soal diimpor." } });
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0], {
    path: "/api/native/academic-assessment/admin/biologi/tryouts/draft/questions",
    init: { method: "POST", requestId, body: { courseId: "mk-bio", expectedRevision: "a".repeat(64), action: "import", bankIds: ["q-two", "q-one"] } },
  });
  remounted.confirmTryoutDraft?.(context, requestId);
  assert.equal(remounted.pendingTryoutDraft?.(context), null);
});
