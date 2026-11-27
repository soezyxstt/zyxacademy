import assert from "node:assert/strict";
import test from "node:test";
import { handleAcademicRead, type AcademicReadServices } from "../../../lib/native/academic/handle-read";
import { createAcademicClient } from "../../../apps/mobile-native/features/academic/client";

function localSession(role: "tutor" | "admin" | "student" | null) {
  const seen: string[] = [];
  const courseRead = (actor: string, id: string) => {
    assert.equal(actor, "session-user");
    if (id !== "assigned") throw new Error("TUTOR_ACCESS_DENIED: ASSIGNMENT");
    seen.push(id);
    return Promise.resolve({ participants: [], submissions: [] });
  };
  const admin = () => {
    if (role !== "admin") throw new Error("Forbidden, admin role required.");
    return Promise.resolve([]);
  };
  const services: AcademicReadServices = {
    session: async () => role ? { user: { id: "session-user" } } : null,
    hasAdmin: async () => role === "admin",
    hasTutor: async () => role === "tutor",
    participants: courseRead, analytics: courseRead, grading: courseRead, courses: admin,
    dashboard: async id => { seen.push(id); return { courses: [] }; },
    course: async slug => { await admin(); return slug === "biologi-dasar" ? { course: { slug } } : null; },
  };
  return { seen, services, client: createAcademicClient({
    origin: "https://academic.invalid", accountId: "session-user", locale: "id",
    get: async (path, signal) => {
      signal.throwIfAborted();
      assert.ok(path.startsWith("/api/native/academic/"));
      return handleAcademicRead(path.slice("/api/native/academic/".length).split("/").map(decodeURIComponent), services);
    },
  }) };
}

const signal = new AbortController().signal;

test("transport reads assigned data, accepts an empty roster, denies another course and each other role", async () => {
  const { client, seen } = localSession("tutor");
  await client.tutor.dashboard(signal);
  assert.deepEqual((await client.tutor.participants("assigned", signal)).participants, []);
  await client.tutor.grading("assigned", signal);
  assert.deepEqual(seen, ["session-user", "assigned", "assigned"]);
  await assert.rejects(client.tutor.participants("foreign", signal), { status: 403 });
  await assert.rejects(client.courses(signal), { status: 403 });
  for (const role of ["student", "admin", null] as const) {
    await assert.rejects(localSession(role).client.tutor.dashboard(signal), { status: role ? 403 : 401 });
  }
});

test("admin list and detail use web slug and distinguish missing from malformed", async () => {
  const { client, services } = localSession("admin");
  assert.deepEqual(await client.courses(signal), []);
  assert.equal((await client.course("biologi-dasar", signal)).course.slug, "biologi-dasar");
  await assert.rejects(client.course("unknown", signal), { status: 404 });
  await assert.rejects(client.course("a/b", signal), { status: 400 });
  const response = await handleAcademicRead(["admin", "courses"], services);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("failed reads expose a bounded error and may be retried", async () => {
  const { services } = localSession("tutor");
  const failing = { ...services, dashboard: async () => { throw new Error("private server detail"); } };
  const response = await handleAcademicRead(["tutor", "dashboard"], failing);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "READ_FAILED" });
  assert.equal((await handleAcademicRead(["tutor", "dashboard"], services)).status, 200);
});

test("grading releases only rendered fields for questions in this submission", async () => {
  const { projectTryoutSnapshots } = await import("../../../lib/native/academic/grading-snapshot");
  const projection = projectTryoutSnapshots('[{"id":"q1","type":"essay","prompt":"P","secret":"hidden"}]',
    { q1: { fileName: "jawaban.pdf", fileKey: "private-storage-key" }, unrelated: { text: "private" } });
  assert.deepEqual(projection, {
    questionsSnapshot: [{ id: "q1", type: "essay", prompt: "P" }],
    answersSnapshot: { q1: { fileName: "jawaban.pdf" } },
  });
});

test("the grading queue advertises a stored tryout essay attachment without revealing its object key", async () => {
  const { projectTryoutSnapshots } = await import("../../../lib/native/academic/grading-snapshot");
  const { readAnswers } = await import("./tutor/model");
  const questions = [{ id: "essay", type: "essay", prompt: "Explain" }, { id: "choice", type: "multiple_choice", prompt: "Choose" },
    { id: "foreign", type: "essay", prompt: "Explain more" }];
  const stored = { type: "essay", fileName: "work.pdf", fileSize: "1 MB", fileKey: "exams/tryout/attachments/work.pdf" };
  const projection = projectTryoutSnapshots(questions, { essay: stored, choice: stored, foreign: { ...stored, fileKey: "exams/another/attachments/work.pdf" } }, "Tryout");
  assert.deepEqual(projection.answersSnapshot.essay, { fileName: "work.pdf", fileSize: "1 MB", attachmentAvailable: true });
  const answers = readAnswers({ id: "submission", examTitle: "Tryout", studentName: "Student", studentEmail: null,
    status: "pending_review", score: null, teacherNotes: null, submittedAt: null, ...projection });
  assert.deepEqual(answers.map(answer => answer.attachmentAvailable), [true, false, false]);
  assert.equal(JSON.stringify(projection).includes(stored.fileKey), false);
});
