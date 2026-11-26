import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
const origin = "https://integration.example.test";
const staff = { user: { id: "staff" }, session: { id: "staff-session" } };
const tutor = { user: { id: "tutor" }, session: { id: "tutor-session" } };
const admin = { user: { id: "admin-only" }, session: { id: "admin-only-session" } };
let viewer = staff;
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => viewer }));
mock.module("@/lib/auth-site-url", () => ({ resolveAuthBaseUrl: () => origin }));
mock.module("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
const { GET, POST } = await import("@/app/api/native/academic/tutor-support/courses/[courseId]/materials/legacy/route");
const { provisionPenggunaForNewUser } = await import("@/lib/auth/authorization");

beforeAll(async () => {
  for (const account of [{ id: staff.user.id, role: "admin" }, { id: tutor.user.id, role: "teacher" }, { id: admin.user.id, role: "admin" }]) {
    await testDb.insert(schema.user).values({ ...account, name: account.id, email: `${account.id}@example.test` });
    await provisionPenggunaForNewUser(account);
    await testDb.insert(schema.session).values({ id: account.id + "-session", userId: account.id, token: account.id + "-fixture-token", expiresAt: new Date("2099-01-01") });
  }
  const [tutorRole] = await testDb.select({ id: schema.peran.id }).from(schema.peran).where(eq(schema.peran.code, "tutor"));
  await testDb.insert(schema.penggunaPeran).values({ id: "staff-tutor", penggunaId: staff.user.id, peranId: tutorRole.id, source: "seed" });
  await testDb.insert(schema.courses).values([
    { id: "legacy-1", title: "Kalkulus", category: "Matematika" }, { id: "legacy-2", title: "Statistika", category: "Matematika" },
  ]);
  await testDb.insert(schema.mataKuliah).values([
    { id: "course-1", code: "KALK", title: "Kalkulus", legacyCourseId: "legacy-1" },
    { id: "course-2", code: "STAT", title: "Statistika", legacyCourseId: "legacy-2" },
  ]);
  await testDb.insert(schema.tutorCourses).values({ id: "assignment", tutorId: tutor.user.id, courseId: "legacy-1" });
});
afterAll(() => client.close());

const context = (courseId: string) => ({ params: Promise.resolve({ courseId }) });
const route = (courseId: string) => origin + "/api/native/academic/tutor-support/courses/" + courseId + "/materials/legacy";
const open = (courseId: string, id: string) => GET(new Request(route(courseId) + "?" + new URLSearchParams({ materialId: id })), context(courseId));
const save = (courseId: string, command: object, requestId = crypto.randomUUID()) => POST(new Request(route(courseId), {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify(command),
}), context(courseId));

test("native legacy material edits require a live Admin override, preserve chunk order and lock the exact course and revision", async () => {
  const initial = { action: "create", title: "Diferensial", summary: "Ringkasan", markdown: "## Dasar\n\nKonsep awal.\n\n## Lanjutan\n\nContoh lanjut." };
  viewer = tutor;
  expect((await save("course-1", initial)).status).toBe(403);
  viewer = admin;
  expect((await save("course-1", initial)).status).toBe(403);
  viewer = staff;
  const requestId = crypto.randomUUID();
  expect((await save("course-1", initial, requestId)).status).toBe(200);
  expect((await save("course-1", initial, requestId)).status).toBe(200);
  expect((await save("course-2", initial, requestId)).status).toBe(409);
  const rows = await testDb.select().from(schema.aiMaterialInstances);
  expect(rows).toHaveLength(1);
  const id = rows[0].id;
  expect(rows[0]).toMatchObject({ courseId: "legacy-1", sourceType: "markdown", pineconeSyncStatus: "pending" });
  const result = await open("course-1", id);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  const content = await result.json();
  expect(content).toMatchObject({ id, courseId: "legacy-1", title: "Diferensial", markdown: initial.markdown });
  expect((await open("course-2", id)).status).toBe(404);
  const edit = { action: "edit", id, expectedRevision: content.revision, title: "Turunan", summary: initial.summary, markdown: "## Baru\n\n" + "Isi sumber. ".repeat(5_000) };
  expect((await save("course-2", edit)).status).toBe(404);
  expect((await save("course-1", edit)).status).toBe(200);
  expect((await save("course-1", { ...edit, title: "Meta lama" })).status).toBe(409);
  const sections = await testDb.select().from(schema.aiMaterialInstanceSections).where(eq(schema.aiMaterialInstanceSections.materialInstanceId, id));
  expect(sections.map(section => section.title)).toEqual(["Baru"]);
  const chunks = await testDb.select().from(schema.aiMaterialInstanceChunks).where(inArray(schema.aiMaterialInstanceChunks.sectionId, sections.map(section => section.id)));
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every(chunk => chunk.isSynced === false)).toBe(true);
  const latest = await (await open("legacy-1", id)).json();
  expect(latest.revision).not.toBe(content.revision);
  const remove = { action: "delete", id, expectedRevision: latest.revision };
  expect((await save("course-2", remove)).status).toBe(404);
  expect((await save("course-1", remove)).status).toBe(200);
  expect(await testDb.select().from(schema.aiMaterialInstances)).toEqual([]);
  expect(await testDb.select().from(schema.aiMaterialInstanceSections)).toEqual([]);
  expect(await testDb.select().from(schema.aiMaterialInstanceChunks)).toEqual([]);
  await testDb.update(schema.session).set({ expiresAt: new Date("2000-01-01") })
    .where(and(eq(schema.session.id, staff.session.id), eq(schema.session.userId, staff.user.id)));
  expect((await save("course-1", initial)).status).toBe(401);
});
