import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as tables from "@/db/schema";
import type { AdminTutorialCommand } from "@/packages/academic/admin-tutorial-operations";
import { tutorialBookingRevision, tutorialSlotRevision, tutorQualificationRevision } from "@/lib/schedule/admin-tutorial-revisions";
import { createPostgresTestDb } from "../helpers/postgres";

const { testDb, client } = await createPostgresTestDb();
const enqueued: { id: string; former?: readonly (string | undefined)[] }[] = [];
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidatePath() {} }));
mock.module("@/lib/google-calendar/trigger", () => ({
  async triggerGoogleCalendarSyncForScheduleChange() {},
  async triggerGoogleCalendarSyncForBookingId(id: string, former?: readonly (string | undefined)[]) { enqueued.push({ id, former }); },
}));

let googleEffect: () => Promise<{ name: string; meetingUri: string }> = async () => { throw new Error("unexpected Meet call"); };
class GoogleMeetRequestRejected extends Error {}
mock.module("@/lib/google-meet", () => ({ GoogleMeetRequestRejected, createGoogleMeetSpace: () => googleEffect() }));
const { pendingBookingMeets, provisionBookingMeet } = await import("@/lib/schedule/booking-meet");
const { saveNativeTutorialOperation } = await import("@/lib/native/academic/administration/tutorial-operations-service");
const actor = "native-tutorial-admin";
const tutor = "native-tutorial-tutor";
const student = "native-tutorial-student";
const courseId = "native-tutorial-course";
const groupId = "native-tutorial-group";
const viewer = { user: { id: actor }, session: { id: "native-tutorial-admin-session" } };

beforeAll(async () => {
  await testDb.insert(tables.peran).values([
    { id: "tutorial-admin-role", code: "admin" }, { id: "tutorial-tutor-role", code: "tutor" },
  ]).onConflictDoNothing();
  const roles = await testDb.select().from(tables.peran);
  await testDb.insert(tables.user).values([actor, tutor, student].map(id => ({ id, name: id, email: `${id}@test.example` })));
  await testDb.insert(tables.pengguna).values([actor, tutor, student].map(id => ({ id, status: "active" as const })));
  await testDb.insert(tables.penggunaPeran).values([
    { id: "tutorial-admin-membership", penggunaId: actor, peranId: roles.find(role => role.code === "admin")!.id, source: "test" },
    { id: "tutorial-tutor-membership", penggunaId: tutor, peranId: roles.find(role => role.code === "tutor")!.id, source: "test" },
  ]);
  await testDb.insert(tables.session).values({ id: viewer.session.id, token: "synthetic-tutorial-session", userId: actor, expiresAt: new Date(Date.now() + 300_000) });
  await testDb.insert(tables.courses).values({ id: courseId, title: "Kalkulus", category: "Matematika" });
  await testDb.insert(tables.mataKuliah).values({ id: courseId, legacyCourseId: courseId, code: "NATUT", title: "Kalkulus", status: "active" });
  await testDb.insert(tables.groups).values({ id: groupId, name: "Kelompok A", totalQuotaSessions: 2 });
  await testDb.insert(tables.groupCourses).values({ id: "tutorial-group-course", groupId, courseId });
  await testDb.insert(tables.groupMembers).values({ id: "tutorial-group-student", groupId, userId: student, role: "leader" });
});
afterAll(() => client.close());

test("all six Admin tutorial writes preserve revisions, audit, quota and post-commit Calendar behavior", async () => {
  const call = (command: AdminTutorialCommand, key: string = crypto.randomUUID()) => saveNativeTutorialOperation(command, key, viewer);
  const create = { action: "create-availability", tutorId: tutor, sessionDate: "2026-11-30", startTime: "09:00", endTime: "10:30",
    mode: "online", location: null, reason: "Kelas tambahan" } as const;
  const key = crypto.randomUUID();
  const first = await call(create, key);
  expect(await call(create, key)).toEqual({ id: first.id, replay: true });
  await expect(call({ ...create, reason: "Lain" }, key)).rejects.toThrow("REQUEST_CONFLICT");
  await expect(call({ ...create, endTime: "10:00" })).rejects.toThrow("INVALID_DURATION_NOT_90_MINUTES");
  const second = await call({ ...create, startTime: "11:00", endTime: "12:30" });
  const readSlot = (id: string) => testDb.select().from(tables.tutorSlots).where(eq(tables.tutorSlots.id, id));
  const [oldSlot] = await readSlot(first.id);
  const [newSlot] = await readSlot(second.id);
  const assign = { action: "assign", id: oldSlot.id, expectedRevision: tutorialSlotRevision(oldSlot),
    groupId, courseId, reason: "Penugasan", topic: "Integral" } as const;
  await expect(call(assign)).rejects.toThrow("TUTOR_NOT_ASSIGNED_TO_COURSE");
  const qualification = { action: "qualifications" as const, id: tutor, expectedRevision: tutorQualificationRevision(tutor, []), courseIds: [courseId] };
  await call(qualification);
  await expect(call(qualification)).rejects.toThrow("REVISION_CONFLICT");

  const assignmentKey = crypto.randomUUID();
  const booking = await call(assign, assignmentKey);
  expect(await call(assign, assignmentKey)).toEqual({ id: booking.id, replay: true });
  const [group] = await testDb.select().from(tables.groups).where(eq(tables.groups.id, groupId));
  expect(group.usedQuotaSessions).toBe(1);
  const readBooking = () => testDb.select().from(tables.bookings).where(eq(tables.bookings.id, booking.id));
  const [beforeMove] = await readBooking();
  expect(beforeMove.topic).toBe("Integral");
  const move = { action: "move", id: booking.id, targetSlotId: second.id, expectedRevision: tutorialBookingRevision(beforeMove),
    expectedTargetRevision: tutorialSlotRevision(newSlot), reason: "Perubahan waktu" } as const;
  await call(move);
  await expect(call(move)).rejects.toThrow("REVISION_CONFLICT");
  const [afterMove] = await readBooking();
  expect(afterMove.slotId).toBe(second.id);
  await call({ action: "cancel", id: booking.id, expectedRevision: tutorialBookingRevision(afterMove), reason: "Tutor berhalangan" });
  expect((await readBooking())[0].status).toBe("cancelled");
  await call({ action: "delete-availability", id: first.id, expectedRevision: tutorialSlotRevision(oldSlot), reason: "Slot kosong" });
  expect(await readSlot(first.id)).toEqual([]);
  await expect(call({ action: "delete-availability", id: second.id, expectedRevision: tutorialSlotRevision(newSlot), reason: "Menghapus riwayat" }))
    .rejects.toThrow("SLOT_ALREADY_BOOKED");
  expect(enqueued).toEqual([{ id: booking.id, former: undefined }, { id: booking.id, former: [tutor] }, { id: booking.id, former: undefined }]);
  const receipts = await testDb.select().from(tables.auditMutasi).where(eq(tables.auditMutasi.entityType, "native_admin_tutorial"));
  expect(receipts).toHaveLength(7);
});


test("web and native provisioning share one booking reservation across retries, role loss and uncertain delivery", async () => {
  for (const [index, id] of ["meet-a", "meet-b"].entries()) {
    await testDb.insert(tables.tutorSlots).values({ id, tutorId: tutor, dayOfWeek: "Senin", sessionDate: "2026-12-07", startTime: index ? "11:00" : "09:00", endTime: index ? "12:30" : "10:30" });
    await testDb.insert(tables.bookings).values({ id, slotId: id, studentId: student, groupId, courseId, mode: "online", status: "scheduled" });
  }
  const expired = { ...viewer, session: { id: "revoked" } };
  await expect(pendingBookingMeets(expired, null)).rejects.toThrow("UNAUTHENTICATED");
  expect((await pendingBookingMeets(viewer, null)).ids).toEqual(["meet-a", "meet-b"]);
  await expect(provisionBookingMeet("meet-a", expired)).rejects.toThrow("UNAUTHENTICATED");
  let calls = 0;
  const uri = "https://meet.google.com/abc-defg-hij";
  googleEffect = async () => { calls++; throw new GoogleMeetRequestRejected("denied"); };
  expect(await provisionBookingMeet("meet-a", viewer)).toEqual({ status: "rejected" });
  googleEffect = async () => { calls++; return { name: "spaces/example", meetingUri: uri }; };
  const values = await Promise.all([provisionBookingMeet("meet-a"), provisionBookingMeet("meet-a", viewer)]);
  expect(values.some(item => item.url === uri)).toBe(true);
  expect(await provisionBookingMeet("meet-a", viewer)).toEqual({ status: "ready", url: uri });
  expect(calls).toBe(2);
  expect((await pendingBookingMeets(viewer, null)).ids).toEqual(["meet-b"]);
  googleEffect = async () => { calls++; throw Error("connection lost"); };
  expect(await provisionBookingMeet("meet-b", viewer)).toEqual({ status: "uncertain" });
  expect(await provisionBookingMeet("meet-b")).toEqual({ status: "uncertain" });
  expect(calls).toBe(3);
  await testDb.update(tables.bookings).set({ status: "cancelled" }).where(eq(tables.bookings.id, "meet-b"));
  expect((await pendingBookingMeets(viewer, null)).ids).toEqual([]);
  expect(await provisionBookingMeet("meet-b", viewer)).toEqual({ status: "skipped" });
});
