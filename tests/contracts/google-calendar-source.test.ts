import { afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
const { calendarSource } = await import("@/lib/google-calendar/source");
afterAll(() => client.close());

test("tutor mirror respects course scope and legacy assignments, and keeps quizzes at their deadline", async () => {
  await testDb.insert(schema.user).values({ id: "fixture-tutor", email: "fixture-tutor@example.test", name: "Tutor", role: "teacher" });
  await testDb.insert(schema.pengguna).values({ id: "fixture-tutor", status: "active" });
  await testDb.insert(schema.peran).values({ id: "fixture-role", code: "tutor" });
  await testDb.insert(schema.penggunaPeran).values({ id: "fixture-membership", penggunaId: "fixture-tutor", peranId: "fixture-role", source: "seed" });
  for (const label of ["course", "chapter", "content", "legacy"]) {
    await testDb.insert(schema.courses).values({ id: label, title: label, category: "Matematika" });
    await testDb.insert(schema.mataKuliah).values({ id: `canonical-${label}`, code: label, title: label, legacyCourseId: label, status: "active" });
    await testDb.insert(schema.academicSchedules).values({ id: `schedule-${label}`, title: label, courseId: label, startDate: new Date("2026-12-01T03:00:00Z"), status: "published" });
  }
  await testDb.insert(schema.penugasanTutor).values(["course", "chapter", "content"].map(label => ({ id: label, penggunaId: "fixture-tutor", mataKuliahId: `canonical-${label}`, status: "active" as const, assignmentScope: label as "course" | "chapter" | "content" })));
  await testDb.insert(schema.tutorCourses).values({ id: "legacy-assignment", tutorId: "fixture-tutor", courseId: "legacy" });
  const deadline = new Date("2026-12-08T03:00:00Z");
  await testDb.insert(schema.quizTemplates).values({ id: "week-quiz", title: "Week quiz", courseId: "course", category: "weekly", status: "published", selectionRules: {}, openAt: new Date("2026-12-01T03:00:00Z"), closeAt: deadline });
  const entries = await calendarSource("fixture-tutor");
  expect(entries.filter(entry => entry.key.startsWith("academic:")).map(entry => entry.key).sort()).toEqual(["academic:schedule-course", "academic:schedule-legacy"]);
  const quiz = entries.find(entry => entry.key === "quiz:week-quiz")!;
  expect(quiz.start).toEqual(deadline);
  expect(quiz.end.getTime() - quiz.start.getTime()).toBe(60000);
});

let tokenError: unknown;
mock.module("@/lib/auth", () => ({ auth: { api: { getAccessToken: async () => { throw tokenError; } } } }));
const { syncGoogleCalendar } = await import("@/lib/google-calendar/sync");

test("temporary token failures retry with sanitized errors, confirmed invalid grants reconnect", async () => {
  await testDb.insert(schema.account).values({ id: "fixture-google", accountId: "google-fixture", providerId: "google", userId: "fixture-tutor", scope: "https://www.googleapis.com/auth/calendar.events", refreshToken: "fixture-refresh" });
  tokenError = new Error("private provider failure: 503");
  await expect(syncGoogleCalendar("user:fixture-tutor")).rejects.toThrow("Google Calendar sync failed");
  let rows = await testDb.select().from(schema.googleCalendarSync);
  expect(rows.find(row => row.target === "user:fixture-tutor")?.error).toBe("failed");
  tokenError = { body: { code: "INVALID_REFRESH_TOKEN" } };
  await syncGoogleCalendar("user:fixture-tutor");
  rows = await testDb.select().from(schema.googleCalendarSync);
  expect(rows.find(row => row.target === "user:fixture-tutor")?.error).toBe("reconnect");
});
