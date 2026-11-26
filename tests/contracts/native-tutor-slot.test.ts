import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { tutorSlotCourses, tutorSlotNotes } from "@/db/schedule-extras";
import { addCalendarDays, getJakartaCalendarDate } from "@/lib/date-utils";
import type { TutorSlotFields, TutorSlotTarget } from "@/packages/academic/tutor-slot";
import { createPostgresTestDb } from "../helpers/postgres";

let database: Awaited<ReturnType<typeof createPostgresTestDb>>;
const dbProxy = new Proxy({} as Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"], {
  get(_proxy, key) {
    const value = Reflect.get(database.testDb, key);
    return typeof value === "function" ? value.bind(database.testDb) : value;
  },
});
mock.module("@/db", () => ({ db: dbProxy }));

import { handleTutorSlotWrite } from "@/lib/native/academic/handle-tutor-slot";
import { saveTutorSlot, tutorSlotDetails } from "@/lib/native/academic/tutor-slot-service";

const tutor = "slot-tutor";
const secondTutor = "slot-second-tutor";
const student = "slot-student";
const origin = "https://academic.example.test";
const date = addCalendarDays(getJakartaCalendarDate(), 1);
const fields: TutorSlotFields = { date, start: "09:00", mode: "online", notes: "Slot sesi latihan", location: "" };

beforeAll(async () => {
  database = await createPostgresTestDb();
  const { testDb } = database;
  await testDb.insert(schema.peran).values({ id: "slot-peran-tutor", code: "tutor" }).onConflictDoNothing();
  const [role] = await testDb.select({ id: schema.peran.id }).from(schema.peran).where(eq(schema.peran.code, "tutor"));
  await testDb.insert(schema.user).values([tutor, secondTutor, student].map((id): typeof schema.user.$inferInsert => ({
    id, name: id, email: id + "@example.test", role: id === student ? "student" : "teacher",
  })));
  await testDb.insert(schema.pengguna).values([tutor, secondTutor, student].map((id) => ({ id, status: "active" as const })));
  await testDb.insert(schema.penggunaPeran).values([tutor, secondTutor].map((id) => ({ id: id + "-membership", penggunaId: id, peranId: role.id, source: "seed" })));
  await testDb.insert(schema.session).values([tutor, secondTutor, student, tutor + "-second"].map((id) => ({
    id: id + "-session", userId: id === tutor + "-second" ? tutor : id, token: "slot-test-" + id, expiresAt: new Date(Date.now() + 300_000),
  })));
  await testDb.insert(schema.courses).values({ id: "slot-course", title: "Biologi", category: "Biologi" });
  await testDb.insert(schema.groups).values({ id: "slot-group", name: "Kelompok", status: "active" });
}, 60_000);

afterAll(async () => { await database?.client.close(); });
beforeEach(async () => {
  await database.testDb.delete(schema.tutorSlots);
  await database.testDb.delete(schema.auditMutasi);
});

async function write(data: TutorSlotFields, options: {
  target?: TutorSlotTarget; requestId?: string; account?: string; sessionId?: string; origin?: string;
} = {}) {
  const { target, requestId = "tutor-slot-request-001", account = tutor, sessionId = account + "-session" } = options;
  const headers = { Origin: options.origin ?? origin, "Content-Type": "application/json", "Idempotency-Key": requestId };
  return handleTutorSlotWrite(new Request(origin, { method: target ? "PATCH" : "POST", headers,
    body: JSON.stringify(target ? { ...data, expectedRevision: target.expectedRevision } : data),
  }), ["schedule", "slots", ...(target ? [target.slotId] : [])], origin, {
    async session() { return { user: { id: account }, session: { id: sessionId } }; },
    async hasTutor() { return true; },
    save: saveTutorSlot,
  });
}

async function readCreated(response: Response) {
  expect(response.status).toBe(200);
  const outcome = await response.json() as { slotId: string; date: string; requestId: string };
  expect(outcome.date).toBe(date);
  return outcome;
}

describe("native Tutor availability against PostgreSQL", () => {
  test("creates one 90-minute slot and replays the receipt within the same session", async () => {
    const created = await readCreated(await write(fields));
    expect(await readCreated(await write(fields))).toEqual(created);
    expect((await write({ ...fields, notes: "Isi lain" })).status).toBe(409);
    expect((await write(fields, { sessionId: tutor + "-second-session" })).status).toBe(409);
    const [slot] = await tutorSlotDetails(tutor, [created.slotId]);
    expect(slot).toMatchObject({ start: "09:00", end: "10:30", notes: fields.notes, date, booked: false });
    expect(await tutorSlotDetails(secondTutor, [created.slotId])).toEqual([]);
    expect(await database.testDb.select().from(schema.tutorSlots)).toHaveLength(1);
    expect(await database.testDb.select().from(schema.bookings)).toHaveLength(0);
  });

  test("edits owned slots with a revision and preserves course limitations", async () => {
    const { testDb } = database;
    const { slotId } = await readCreated(await write(fields));
    await testDb.insert(tutorSlotCourses).values({ slotId, courseId: "slot-course" });
    const [slot] = await tutorSlotDetails(tutor, [slotId]);
    const target = { slotId, expectedRevision: slot.revision };
    const edit = { ...fields, start: "10:30", mode: "offline" as const, location: "Ruang 3", notes: "" };
    expect((await write(edit, { target, account: secondTutor })).status).toBe(404);
    const saved = await readCreated(await write(edit, { target }));
    expect(await readCreated(await write(edit, { target }))).toEqual(saved);
    expect((await write(edit, { target, requestId: "tutor-slot-request-002" })).status).toBe(409);
    const [changed] = await tutorSlotDetails(tutor, [slotId]);
    expect(changed).toMatchObject({ start: "10:30", end: "12:00", mode: "offline", location: "Ruang 3", notes: null });
    expect(changed.revision).not.toBe(slot.revision);
    expect(await testDb.select().from(tutorSlotCourses).where(eq(tutorSlotCourses.slotId, slotId))).toHaveLength(1);
  });

  test("serializes concurrent overlapping writes and retries", async () => {
    const responses = await Promise.all([
      write(fields), write(fields), write({ ...fields, start: "09:30" }, { requestId: "tutor-slot-request-002" }),
    ]);
    expect(responses[0].status).toBe(responses[1].status);
    expect([responses[0].status, responses[2].status].sort()).toEqual([200, 409]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
    expect(await database.testDb.select().from(schema.tutorSlots)).toHaveLength(1);
  });

  test("honors overlap, past-date, location, ownership and historical booking rules", async () => {
    const invalidCases = [
      { ...fields, mode: "offline" as const, location: " " },
      { ...fields, date: addCalendarDays(getJakartaCalendarDate(), -1) },
      { ...fields, start: "22:30" },
    ];
    for (const input of invalidCases) expect((await write(input)).status).toBe(400);
    expect((await write(fields, { account: student })).status).toBe(403);
    expect((await write(fields, { sessionId: secondTutor + "-session" })).status).toBe(401);
    expect((await write(fields, { origin: "https://foreign.example.test" })).status).toBe(403);
    const { slotId } = await readCreated(await write(fields));
    expect((await write({ ...fields, start: "09:30" }, { requestId: "tutor-slot-request-002" })).status).toBe(409);
    const [slot] = await tutorSlotDetails(tutor, [slotId]);
    await database.testDb.insert(schema.bookings).values({
      id: "fixture-historical-booking", slotId, studentId: student,
      courseId: "slot-course", groupId: "slot-group", status: "cancelled", sessionDate: date,
    } satisfies typeof schema.bookings.$inferInsert);
    const denied = await write({ ...fields, start: "13:00" }, { target: { slotId, expectedRevision: slot.revision } });
    expect(denied.status).toBe(409);
    expect(await denied.json()).toEqual({ error: "CANNOT_EDIT_BOOKED_SLOT" });
  });

  test("rolls the slot and note back when the durable receipt cannot commit", async () => {
    await database.client.exec(`
      create function deny_tutor_slot_receipt() returns trigger language plpgsql as $$
      begin
        if NEW.action = 'native.tutor.slot.command' then raise exception 'synthetic slot receipt failure'; end if;
        return NEW;
      end $$;
      create trigger deny_tutor_slot_receipt before insert on audit_mutasi
        for each row execute function deny_tutor_slot_receipt();
    `);
    try {
      expect((await write(fields)).status).toBe(500);
      expect(await database.testDb.select().from(schema.tutorSlots)).toHaveLength(0);
      expect(await database.testDb.select().from(tutorSlotNotes)).toHaveLength(0);
    } finally {
      await database.client.exec("drop trigger deny_tutor_slot_receipt on audit_mutasi; drop function deny_tutor_slot_receipt()");
    }
    expect((await write(fields)).status).toBe(200);
  });
});

test("Tutor replies once to an owned Student ticket and decides it with the web schedule rules", async () => {
  mock.module("server-only", () => ({}));
  mock.module("next/cache", () => ({ revalidatePath() {} }));
  const notifyReply = mock(async () => {});
  const notifyDecision = mock(async () => {});
  mock.module("@/lib/schedule/tutor-ticket-notifications", () => ({ notifyTutorTicketReply: notifyReply, notifyTutorTicketDecision: notifyDecision }));
  const { writeTutorTicket } = await import("@/lib/native/academic/tutor-ticket-service");
  const { handleTutorTicket } = await import("@/lib/native/academic/handle-tutor-ticket");
  const { testDb } = database;
  const { slotId } = await readCreated(await write(fields));
  const bookingId = "native-tutor-ticket-booking";
  const ticketId = "native-tutor-ticket";
  await testDb.insert(schema.bookings).values({ id: bookingId, slotId, studentId: student, courseId: "slot-course",
    groupId: "slot-group", status: "scheduled", sessionDate: date });
  await testDb.insert(schema.bookingRescheduleTickets).values({ id: ticketId, bookingId, groupId: "slot-group",
    requestedById: student, type: "cancellation", reason: "Ujian" });
  const submit = (body: object, key: string, account = tutor, sessionId = account + "-session") => handleTutorTicket(
    new Request(origin, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) }),
    ["schedule", "tickets", ticketId], origin, { session: async () => ({ user: { id: account }, session: { id: sessionId } }),
      hasTutor: async () => true, save: writeTutorTicket });
  const reply = { action: "reply", message: "Ada jadwal pengganti?" };
  const replyKey = "native-ticket-message";
  expect((await submit(reply, replyKey, student)).status).toBe(403);
  expect((await submit(reply, replyKey, secondTutor)).status).toBe(404);
  expect((await submit(reply, replyKey)).status).toBe(200);
  expect((await submit(reply, replyKey)).status).toBe(200);
  expect((await submit({ ...reply, message: "Pesan lain" }, replyKey)).status).toBe(409);
  expect((await submit(reply, replyKey, tutor, tutor + "-second-session")).status).toBe(409);
  expect(await testDb.select().from(schema.bookingTicketMessages).where(eq(schema.bookingTicketMessages.ticketId, ticketId))).toHaveLength(1);
  expect(notifyReply).toHaveBeenCalledTimes(1);
  const decision = { action: "decide", decision: "rejected", notes: "Sesi awal tetap berjalan." };
  expect((await submit(decision, "native-ticket-decision")).status).toBe(200);
  expect((await submit(decision, "native-ticket-decision")).status).toBe(200);
  expect((await submit({ ...decision, decision: "approved" }, "native-ticket-another")).status).toBe(409);
  expect((await testDb.select().from(schema.bookingRescheduleTickets).where(eq(schema.bookingRescheduleTickets.id, ticketId)))[0])
    .toMatchObject({ status: "rejected", decisionNotes: decision.notes, decidedById: tutor });
  expect(notifyDecision).toHaveBeenCalledTimes(1);
});

test("calendar deletion and week copy preserve ownership, slot revision and retry counts", async () => {
  const { writeTutorCalendar } = await import("@/lib/native/academic/tutor-calendar-service");
  const { getCalendarWeekRange } = await import("@/lib/date-utils");
  const monday = addCalendarDays(getCalendarWeekRange(getJakartaCalendarDate()).startIso, 21);
  const { testDb } = database;
  const item = await readCreated(await write(fields));
  const [slot] = await tutorSlotDetails(tutor, [item.slotId]);
  const actor = { id: tutor, sessionId: tutor + "-session", requestId: "native-calendar-delete" };
  const remove = { action: "delete", slotId: item.slotId, expectedRevision: slot.revision, confirmed: true } as const;
  await expect(writeTutorCalendar({ ...actor, id: secondTutor, sessionId: secondTutor + "-session" }, remove)).rejects.toThrow("NOT_FOUND");
  await expect(writeTutorCalendar(actor, { ...remove, expectedRevision: "0".repeat(64) })).rejects.toThrow("CONFLICT");
  // Only slots beyond the availability edit deadline are deletable.
  await testDb.update(schema.tutorSlots).set({ sessionDate: monday, dayOfWeek: "Senin" }).where(eq(schema.tutorSlots.id, item.slotId));
  const [future] = await tutorSlotDetails(tutor, [item.slotId]);
  const copy = { action: "copy", week: addCalendarDays(monday, 7) } as const;
  const copyActor = { ...actor, requestId: "native-calendar-copy" };
  const copied = await writeTutorCalendar(copyActor, copy);
  expect(copied.outcome).toEqual({ action: "copy", created: 1, skipped: 0 });
  expect(await writeTutorCalendar(copyActor, copy)).toEqual(copied);
  expect((await writeTutorCalendar(actor, { ...remove, expectedRevision: future.revision })).outcome).toEqual({ action: "delete" });
  expect((await writeTutorCalendar(actor, { ...remove, expectedRevision: future.revision })).outcome).toEqual({ action: "delete" });
  expect(await testDb.select().from(schema.tutorSlots)).toHaveLength(1);
});

test("weekly slots retain selected courses, skip occupied weeks and replay the series", async () => {
  const { testDb } = database;
  await testDb.insert(schema.tutorCourses).values({ id: "native-availability-assignment", tutorId: tutor, courseId: "slot-course" });
  const future = addCalendarDays(date, 35);
  await write({ ...fields, date: addCalendarDays(future, 7) }, { requestId: "existing-slot-second-week" });
  expect((await write({ ...fields, date: future, weeks: 3, courseIds: ["foreign"] }, { requestId: "foreign-slot-restrictions" })).status).toBe(400);
  const repeat = { ...fields, date: future, courseIds: ["slot-course"], weeks: 3 };
  const send = () => write(repeat, { requestId: "native-three-week-availability" });
  const response = await send();
  expect(response.status).toBe(200);
  const receipt = await response.json();
  expect(receipt).toMatchObject({ created: 2, skipped: 1, date: future });
  expect(await (await send()).json()).toEqual(receipt);
  const created = await testDb.select().from(schema.tutorSlots);
  expect(created).toHaveLength(3);
  const slots = await tutorSlotDetails(tutor, created.map(row => row.id));
  expect(slots.filter(row => row.courseIds.includes("slot-course"))).toHaveLength(2);
  const slot = slots.find(row => row.id === receipt.slotId)!;
  expect((await write({ ...fields, date: future, courseIds: [] }, { requestId: "native-clear-course-selection",
    target: { slotId: slot.id, expectedRevision: slot.revision } })).status).toBe(200);
  expect((await tutorSlotDetails(tutor, [slot.id]))[0].courseIds).toEqual([]);
});
