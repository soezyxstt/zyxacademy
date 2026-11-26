import assert from "node:assert/strict";
import test from "node:test";
import { createAcademicClient } from "../../../../apps/mobile-native/features/academic/client";
import { handleAcademicRead, type AcademicReadServices } from "../../../../lib/native/academic/handle-read";
import { isAdminCourseLiveSection, rankCourseLeaderboard } from "./sections";

function harness(role: "admin" | "tutor" | "student" | null) {
  const sent: string[] = [];
  const seen: (string | undefined)[][] = [];
  const unexpected = async () => { throw new Error("Unexpected read"); };
  const services: AcademicReadServices = {
    session: async () => role ? { user: { id: "account-1" } } : null,
    hasAdmin: async (actorId) => actorId === "account-1" && role === "admin",
    hasTutor: async () => role === "tutor",
    dashboard: unexpected, analytics: unexpected, participants: unexpected, grading: unexpected, courses: unexpected, course: unexpected,
    courseSection: async (slug, section, item) => {
      seen.push([slug, section, item]);
      if (slug !== "biologi-dasar" || (item && !["document-1", "quiz-1"].includes(item))) return null;
      if (section === "results") throw new Error("internal connection detail");
      return { type: section, course: { slug } };
    },
  };
  const client = createAcademicClient({
    accountId: "account-1", locale: "id", origin: "https://academic.invalid",
    async get(path, signal) {
      signal.throwIfAborted();
      sent.push(path);
      return handleAcademicRead(path.split("/").slice(4).map(decodeURIComponent), services);
    },
  });
  return { sent, seen, services, client };
}

const signal = new AbortController().signal;

test("the live course adapter requests only supported course-keyed slices", async () => {
  const { client, sent, seen, services } = harness("admin");
  await client.courseSection("biologi-dasar", "documents", undefined, signal);
  await client.courseSection("biologi-dasar", "analytics", "quiz-1", signal);
  assert.deepEqual(sent, [
    "/api/native/academic/admin/courses/biologi-dasar/documents",
    "/api/native/academic/admin/courses/biologi-dasar/analytics/quiz-1",
  ]);
  assert.deepEqual(seen, [["biologi-dasar", "documents", undefined], ["biologi-dasar", "analytics", "quiz-1"]]);
  assert.equal((await handleAcademicRead(["admin", "courses", "biologi-dasar", "review"], services))
    .headers.get("Cache-Control"), "private, no-store");
  assert.equal(isAdminCourseLiveSection("quiz-insights"), false);
  assert.equal(isAdminCourseLiveSection("review", "extra"), false);
});

test("course section replies protect authorization, scope, malformed paths and private failures", async () => {
  for (const role of ["tutor", "student", null] as const) {
    const { client, seen } = harness(role);
    await assert.rejects(client.courseSection("biologi-dasar", "questions", undefined, signal), { status: role ? 403 : 401 });
    assert.deepEqual(seen, []);
  }
  const { client, seen, services } = harness("admin");
  await assert.rejects(client.courseSection("fisika-dasar", "documents", "document-1", signal), { status: 404 });
  await assert.rejects(client.courseSection("biologi-dasar", "analytics", "foreign-quiz", signal), { status: 404 });
  await assert.rejects(client.courseSection("unsafe/slug", "documents", "document-1", signal), { status: 400 });
  await assert.rejects(client.courseSection("biologi-dasar", "review", "extra", signal), { status: 404 });
  assert.deepEqual(seen, [["fisika-dasar", "documents", "document-1"], ["biologi-dasar", "analytics", "foreign-quiz"]]);
  const failed = await handleAcademicRead(["admin", "courses", "biologi-dasar", "results"], services);
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: "READ_FAILED" });
});


test("participant email filters the standings while attempt metrics keep their selected course and quiz type", () => {
  const attempt = { id: "a", participantId: "first", name: "Intan", title: "Bab 1", category: "weekly", score: 80, duration: 45, submittedAt: null };
  const rows = [attempt, { ...attempt, id: "b", participantId: "second", name: "Dito", score: 40 },
    { ...attempt, id: "c", score: 100, category: "simulation" }];
  const result = rankCourseLeaderboard(rows, "quiz", "MAIL.", [{ id: "first", email: "intan@mail.test" }]);
  assert.deepEqual(result.standings.map(row => [row.id, row.rank, row.best]), [["first", 1, 80]]);
  assert.equal(result.totalAttempts, 2);
  assert.equal(result.average, 60);
  assert.equal(result.best, 80);
});
