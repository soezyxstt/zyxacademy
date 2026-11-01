// Run with Bun as its own process to isolate the request mocks and clock.
import { expect, mock, setSystemTime, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { pushSQLiteSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

const directory = await mkdtemp(join(tmpdir(), "zyx-booking-"));
const client = createClient({ url: `file:${join(directory, "test.db")}` });
const db = drizzle(client, { schema });
const sessionDate = "2026-09-02";
let actorId = "first-student";

async function seedGroupsAndSlot() {
  for (const id of ["tutor", "first-student", "second-student"]) {
    const role = id === "tutor" ? "tutor" : "murid";
    await db.insert(schema.user).values({
      id, name: id, email: `${id}@example.test`, role: role === "tutor" ? "teacher" : "student",
    });
    await db.insert(schema.pengguna).values({ id });
    await db.insert(schema.peran).values({ id: role, code: role }).onConflictDoNothing();
    await db.insert(schema.penggunaPeran).values({
      id, penggunaId: id, peranId: role, source: "seed",
    });
  }

  await db.insert(schema.courses).values({ id: "course", title: "Math", category: "Matematika" });
  await db.insert(schema.mataKuliah).values({
    id: "math", code: "MA", title: "Math", legacyCourseId: "course",
  });
  await db.insert(schema.penugasanTutor).values({ id: "assignment", penggunaId: "tutor", mataKuliahId: "math" });
  await db.insert(schema.tutorCourses).values({ id: "assignment", tutorId: "tutor", courseId: "course" });
  await db.insert(schema.tutorSlots).values({
    id: "slot", tutorId: "tutor", dayOfWeek: "Rabu", sessionDate,
    startTime: "09:00", endTime: "10:30", mode: "offline",
  });
  for (const group of ["first", "second"]) {
    await db.insert(schema.groups).values({ id: group, name: group, totalQuotaSessions: 1 });
    await db.insert(schema.groupCourses).values({ id: group, groupId: group, courseId: "course" });
    await db.insert(schema.groupMembers).values({ id: group, userId: `${group}-student`, groupId: group });
  }
}

try {
  process.env.SKIP_ENV_VALIDATION = "1";
  setSystemTime(new Date("2026-08-31T08:00:00+07:00"));
  mock.module("@/db", () => ({ db }));
  mock.module("next/headers", () => ({ headers: async () => new Headers() }));
  mock.module("next/cache", () => ({ revalidatePath() {} }));
  mock.module("@/lib/auth", () => ({
    auth: { api: { getSession: async () => ({ user: { id: actorId, name: actorId } }) } },
  }));

  await (await pushSQLiteSchema(schema, db)).apply();
  await seedGroupsAndSlot();
  const { collaborativeBookSlot, collaborativeCancelSlot, completeTutorSessionAction, getScheduleData, tutorCompleteSession } =
    await import("@/app/(student)/dashboard/schedule/actions");
  const { getStudentStudyGroups } = await import("@/app/(student)/dashboard/groups/actions");

  async function expectUsage(used: number) {
    const [schedule, [group]] = await Promise.all([getScheduleData(), getStudentStudyGroups()]);
    const usage = { usedQuotaSessions: used, weeklyUsedSessions: used };
    expect(schedule.groups[0]).toMatchObject(usage);
    expect(group).toMatchObject({ ...usage, remainingQuota: 1 - used });
    return schedule;
  }

  const first = await collaborativeBookSlot("slot", "course", "first", sessionDate);
  expect(first.success).toBe(true);
  await expectUsage(1);
  const scheduled = await db.query.bookings.findFirst({
    where: eq(schema.bookings.id, first.bookingId!), with: { slot: true },
  });
  if (!scheduled) throw new Error("Missing scheduled booking");

  expect((await collaborativeCancelSlot(first.bookingId!)).success).toBe(true);
  expect((await collaborativeCancelSlot(first.bookingId!)).success).toBe(false);
  const cancelled = await expectUsage(0);
  expect(cancelled.availableSlots[0].booking).toBeNull();
  expect(cancelled.groupBookings).toMatchObject([{ id: first.bookingId, status: "cancelled" }]);

  actorId = "tutor";
  // Simulate a completion request that read the booking just before cancellation committed.
  // The writes still hit SQLite and must preserve the cancelled row and its resources.
  await db.insert(schema.bookingResources).values({
    id: "existing", bookingId: scheduled.id, phase: "post", kind: "link",
    label: "Prior notes", url: "https://example.test/notes", createdById: actorId,
  });
  const precheck = spyOn(db.query.bookings, "findFirst");
  try {
    for (const complete of [tutorCompleteSession, completeTutorSessionAction]) {
      precheck.mockResolvedValueOnce(scheduled);
      expect((await complete(scheduled.id, "Late submission")).success).toBe(false);
    }
  } finally {
    precheck.mockRestore();
  }
  expect((await db.select().from(schema.bookingResources)).map((r) => r.id)).toEqual(["existing"]);
  expect(await db.select().from(schema.bookingAuditLogs)
    .where(eq(schema.bookingAuditLogs.action, "SESSION_COMPLETED"))).toHaveLength(0);

  actorId = "second-student";
  const second = await collaborativeBookSlot("slot", "course", "second", sessionDate);
  expect(second.success).toBe(true);
  expect((await expectUsage(1)).availableSlots[0].booking).toEqual({ id: second.bookingId! });

  actorId = "tutor";
  expect((await completeTutorSessionAction(second.bookingId!, "Summary")).success).toBe(true);
  expect((await tutorCompleteSession(second.bookingId!, "Updated summary")).success).toBe(true);

  actorId = "first-student";
  expect((await collaborativeBookSlot("slot", "course", "first", sessionDate)).reason).toBe("SLOT_TAKEN");
  expect((await expectUsage(0)).groupBookings).toMatchObject([{ id: first.bookingId, status: "cancelled" }]);

  setSystemTime(new Date("2026-09-06T22:00:00+07:00"));
  // Existing post-lock cancellations have no refund marker and still count against quota.
  await db.update(schema.bookings).set({ status: "cancelled" }).where(eq(schema.bookings.id, second.bookingId!));
  actorId = "second-student";
  expect((await expectUsage(1)).availableSlots[0].booking).toBeNull();
} finally {
  client.close();
  await rm(directory, { recursive: true, force: true });
}
