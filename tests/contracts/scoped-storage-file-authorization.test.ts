import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { TRYOUT_GRADE_ATTACHMENT_ACCOUNT, TRYOUT_GRADE_ATTACHMENT_SESSION, tryoutGradeAttachmentPath } from "@/packages/academic/tryout-grade-attachment";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => null } } }));
const { authorizeScopedStorageFile } = await import("@/lib/storage/scoped-file-authorization");
const nativeViewer = { user: { id: "grader" }, session: { id: "native-grader" } };
let nativeFileReads = 0;
let objectOwner = "student";
mock.module("@/lib/auth-session", () => ({
  getAuthSession: async () => nativeViewer,
  getAuthUser: async () => nativeViewer.user,
  requireAuthUser: async () => nativeViewer.user,
}));
mock.module("@/app/api/storage/file/[...key]/route", () => ({
  async GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
    nativeFileReads++;
    const key = (await params).key.join("/");
    const submissionId = new URL(request.url).searchParams.get("submissionId");
    const auth = await authorizeScopedStorageFile("tryout", key, nativeViewer.user.id, [key], submissionId);
    return auth.allowed && auth.owners?.has(objectOwner)
      ? new Response("%PDF-student", { headers: { "Content-Type": "application/pdf" } }) : new Response(null, { status: 404 });
  },
}));
const { GET: nativeTryoutFile } = await import("@/app/api/native/academic/tutor-support/courses/[courseId]/grading/[submissionId]/attachment/[questionId]/route");

const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");
const { deleteBookingResource } = await import("@/lib/schedule/session-resources");

const tryoutKey = "exams/final-exam/attachments/essay.pdf";
const scheduleKey = "schedules/booking/pre_session/notes.pdf";
const productKey = "overhaul/product-bundles/run/archive.zip";
const scheduleUrl = `/api/storage/file/${scheduleKey}`;
const courseId = "scoped-files-course";

beforeAll(async () => {
  const accounts = [
    { id: "student", role: "student" },
    { id: "outsider", role: "student" },
    { id: "grader", role: "teacher" },
    { id: "admin", role: "admin" },
  ] as const;
  for (const { id, role } of accounts) {
    await testDb.insert(schema.user).values({ id, email: `${id}@example.test`, name: id, role });
    await provisionPenggunaForNewUser({ id, role });
  }
  await testDb.insert(schema.courses).values([
    { id: courseId, title: "Fixture course", category: "Matematika" },
    { id: "unassigned-course", title: "Another course", category: "Matematika" },
  ]);
  await testDb.insert(schema.session).values({ id: nativeViewer.session.id, userId: nativeViewer.user.id,
    token: "local-fixture-native-grader", expiresAt: new Date("2099-01-01") });
  await testDb.insert(schema.mataKuliah).values({ id: "canonical-course", legacyCourseId: courseId, code: "FIX", title: "Fixture course", status: "active" });
  await testDb.insert(schema.tutorCourses).values({ id: "assignment", tutorId: "grader", courseId });
  await testDb.insert(schema.enrollments).values({ id: "grant", userId: "student", courseId, expiresAt: new Date("2099-01-01") });
  await testDb.insert(schema.exams).values({ id: "Final Exam", title: "Fixture tryout", type: "tryout", status: "published", courseId });
  await testDb.insert(schema.submissions).values({
    id: "submission", examId: "Final Exam", userId: "student", status: "pending_review",
    questionsSnapshot: [{ id: "q1", type: "multiple_choice" }, { id: "q2", type: "essay" }],
    answersSnapshot: { q1: { type: "multiple_choice", index: 0 }, q2: { type: "essay", fileKey: tryoutKey } },
  });
  await testDb.insert(schema.groups).values({ id: "group", name: "Fixture group" });
  await testDb.insert(schema.groupMembers).values({ id: "membership", groupId: "group", userId: "student" });
  await testDb.insert(schema.tutorSlots).values({ id: "slot", tutorId: "grader", dayOfWeek: "Rabu", startTime: "09:00", endTime: "10:30" });
  await testDb.insert(schema.bookings).values({
    id: "booking", courseId, groupId: "group", slotId: "slot", studentId: "student",
    preSessionAttachments: [{ id: "legacy", name: "notes.pdf", url: scheduleUrl, uploadedBy: "student", uploadedByName: "Student", uploadedAt: "2026-01-01" }],
  });
  await testDb.insert(schema.bookingResources).values({
    id: "resource", bookingId: "booking", phase: "pre", kind: "file", label: "notes.pdf", url: scheduleUrl,
    createdById: "student", metadata: { legacyAttachmentId: "legacy" },
  });
  await testDb.insert(schema.imporBundle).values({
    id: "draft", bundleId: "product", checksum: "a".repeat(64), bundleType: "product", status: "draft",
    sourceUriOrKey: productKey, requestedBy: "admin", courseId,
  });
});
afterAll(() => client.close());

test("native tryout file checks the active grading session and returns bytes only for the stored essay uploader", async () => {
  const target = { courseId, submissionId: "submission", questionId: "q2" };
  const headers = { [TRYOUT_GRADE_ATTACHMENT_ACCOUNT]: nativeViewer.user.id,
    [TRYOUT_GRADE_ATTACHMENT_SESSION]: nativeViewer.session.id };
  const open = (scope = target, requestHeaders = headers) =>
    nativeTryoutFile(new Request("https://example.test" + tryoutGradeAttachmentPath(scope), { headers: requestHeaders }), { params: Promise.resolve(scope) });
  expect((await open(target, { ...headers, [TRYOUT_GRADE_ATTACHMENT_SESSION]: "old" })).status).toBe(404);
  expect((await open({ ...target, courseId: "unassigned-course" })).status).toBe(404);
  expect((await open({ ...target, questionId: "q1" })).status).toBe(404);
  expect((await open({ ...target, submissionId: "another" })).status).toBe(404);
  expect(nativeFileReads).toBe(0);
  const pdf = await open();
  expect(pdf.status).toBe(200);
  expect(pdf.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await pdf.text()).toBe("%PDF-student");
  objectOwner = "outsider";
  try { expect((await open()).status).toBe(404); }
  finally { objectOwner = "student"; }
  await testDb.update(schema.session).set({ expiresAt: new Date("2000-01-01") }).where(eq(schema.session.id, nativeViewer.session.id));
  expect((await open()).status).toBe(404);
  expect(nativeFileReads).toBe(2);
});

test("tryout access follows the exact essay, current enrollment, and current grader assignment", async () => {
  const access = (id: string, submission: string | null = null) =>
    authorizeScopedStorageFile("tryout", tryoutKey, id, [tryoutKey], submission);
  expect(await access("student")).toEqual({ allowed: true, owners: new Set(["student"]) });
  expect(await access("grader", "submission")).toEqual({ allowed: true, owners: new Set(["student"]) });
  expect((await access("outsider")).allowed).toBe(false);
  expect((await access("grader", "missing")).allowed).toBe(false);
  await testDb.update(schema.enrollments).set({ expiresAt: new Date("2000-01-01") }).where(eq(schema.enrollments.id, "grant"));
  await testDb.delete(schema.tutorCourses).where(eq(schema.tutorCourses.id, "assignment"));
  expect((await access("student")).allowed).toBe(false);
  expect((await access("grader")).allowed).toBe(false);
  await testDb.update(schema.enrollments).set({ expiresAt: new Date("2099-01-01") }).where(eq(schema.enrollments.id, "grant"));
});

test("tutorial access checks booking membership and revokes removed normalized and legacy files", async () => {
  const access = (id: string) => authorizeScopedStorageFile("tutorial", scheduleKey, id, [scheduleKey, scheduleUrl], null);
  expect((await access("student")).allowed).toBe(true);
  expect((await access("outsider")).allowed).toBe(false);
  await testDb.update(schema.groups).set({ endDate: new Date("2000-01-01") }).where(eq(schema.groups.id, "group"));
  expect((await access("student")).allowed).toBe(false);
  await testDb.update(schema.groups).set({ endDate: null }).where(eq(schema.groups.id, "group"));
  expect(await deleteBookingResource("resource", { actorId: "student", executor: testDb })).toMatchObject({ success: true });
  expect((await access("student")).allowed).toBe(false);
  expect((await access("admin")).allowed).toBe(false);
});

test("only active admins can read the current Product draft archive", async () => {
  const access = (id: string) => authorizeScopedStorageFile("product-bundle", productKey, id, [productKey], null);
  expect((await access("admin")).allowed).toBe(true);
  expect((await access("outsider")).allowed).toBe(false);
  await testDb.update(schema.imporBundle).set({ sourceUriOrKey: "overhaul/product-bundles/run/current.zip" }).where(eq(schema.imporBundle.id, "draft"));
  expect((await access("admin")).allowed).toBe(false);
});
