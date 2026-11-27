import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as tables from "@/db/schema";
import type { AcademicEventFields } from "@/packages/academic/admin-schedule-events";
import { createPostgresTestDb } from "../helpers/postgres";

const { testDb, client } = await createPostgresTestDb();
let enqueued = 0;
mock.module("@/db", () => ({ db: testDb }));
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath() {} }));
mock.module("@/lib/google-calendar/trigger", () => ({ async triggerGoogleCalendarSyncForScheduleChange() { enqueued++; } }));
const { saveNativeAcademicEvent } = await import("@/lib/native/academic/administration/schedule-events-service");
const { academicEventView } = await import("@/lib/schedule/academic-event");
const admin = "event-admin";
const viewer = { user: { id: admin }, session: { id: "event-session" } };
const fields: AcademicEventFields = { title: "Ujian", type: "official_exam", courseId: null, description: null,
  startDate: "2026-11-29T09:00:00+07:00", endDate: null, location: "Ruang 1" };
beforeAll(async () => {
  await testDb.insert(tables.peran).values({ id: "event-admin-role", code: "admin" }).onConflictDoNothing();
  const [role] = await testDb.select().from(tables.peran).where(eq(tables.peran.code, "admin"));
  await testDb.insert(tables.user).values({ id: admin, name: admin, email: "event@example.test" });
  await testDb.insert(tables.pengguna).values({ id: admin });
  await testDb.insert(tables.penggunaPeran).values({ id: "event-member", penggunaId: admin, peranId: role.id, source: "test" });
  await testDb.insert(tables.session).values({ id: viewer.session.id, userId: admin, token: "event-token", expiresAt: new Date(Date.now() + 300000) });
});
afterAll(() => client.close());
test("event create, edit and delete check authority and revision and enqueue only once per change", async () => {
  const request = crypto.randomUUID();
  const create = { action: "create" as const, fields };
  const result = await saveNativeAcademicEvent(create, request, viewer);
  expect(await saveNativeAcademicEvent(create, request, viewer)).toEqual({ id: result.id, replay: true });
  const read = () => testDb.select().from(tables.academicSchedules).where(eq(tables.academicSchedules.id, result.id));
  const initial = academicEventView((await read())[0]);
  expect(initial.startDate).toBe("2026-11-29T02:00:00.000Z");
  const edit = { action: "edit" as const, id: result.id, expectedRevision: initial.revision, fields: { ...fields, title: "Ujian akhir" } };
  await expect(saveNativeAcademicEvent(edit, request, viewer)).rejects.toThrow("REQUEST_CONFLICT");
  await saveNativeAcademicEvent(edit, crypto.randomUUID(), viewer);
  await expect(saveNativeAcademicEvent(edit, crypto.randomUUID(), viewer)).rejects.toThrow("REVISION_CONFLICT");
  const latest = academicEventView((await read())[0]);
  expect(latest.title).toBe("Ujian akhir");
  const deletion = { action: "delete" as const, id: result.id, expectedRevision: latest.revision, confirmed: true as const };
  await expect(saveNativeAcademicEvent(deletion, crypto.randomUUID(), { ...viewer, session: { id: "expired" } })).rejects.toThrow("UNAUTHENTICATED");
  const key = crypto.randomUUID();
  await saveNativeAcademicEvent(deletion, key, viewer);
  await saveNativeAcademicEvent(deletion, key, viewer);
  expect(await read()).toEqual([]);
  expect(enqueued).toBe(3);
});
