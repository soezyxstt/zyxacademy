import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  backfillBookedNullTutorSlotDates,
  CANCELLED_QUOTA_REFUND_LOG_ACTION,
} from "@/lib/schedule/tutor-policy";
import {
  executeAddTutorSlot,
  executeDeleteTutorSlot,
  executeMoveTutorSession,
  executeDecideTutorRescheduleTicket,
  copyTutorAvailabilityFromPreviousWeek,
  getTutorAuthContext,
} from "@/app/(tutor)/tutor/schedule/actions";
import {
  recordTutorFailureAudit,
  recordUnauthenticatedRejectAudit,
  TutorAuditPersistenceError,
} from "@/lib/schedule/tutor-audit";
import {
  collaborativeBookSlot,
  collaborativeMoveSlot,
} from "@/app/(student)/dashboard/schedule/actions";
async function createTestDb() {
  const dbPath = `/tmp/zyx_test_${randomUUID().replace(/-/g, "")}.db`;
  const client = createClient({ url: `file:${dbPath}` });
  const testDb = drizzle(client, { schema });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT DEFAULT 'student',
      last_activity_at INTEGER
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS pengguna (
      id TEXT PRIMARY KEY REFERENCES user(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS peran (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS pengguna_peran (
      id TEXT PRIMARY KEY,
      pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
      peran_id TEXT NOT NULL REFERENCES peran(id),
      source TEXT NOT NULL,
      audit_actor_pengguna_id TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Matematika',
      description TEXT
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS mata_kuliah (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      legacy_course_id TEXT REFERENCES courses(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS penugasan_tutor (
      id TEXT PRIMARY KEY,
      pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      status TEXT NOT NULL DEFAULT 'active',
      assignment_scope TEXT NOT NULL DEFAULT 'course',
      legacy_tutor_course_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS tutor_courses (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      package_type TEXT NOT NULL DEFAULT 'reguler_15',
      package_name TEXT NOT NULL DEFAULT 'Paket Reguler (15 Sesi)',
      total_quota_sessions INTEGER NOT NULL DEFAULT 15,
      used_quota_sessions INTEGER NOT NULL DEFAULT 0,
      weekly_quota_sessions INTEGER NOT NULL DEFAULT 2,
      academic_year TEXT NOT NULL DEFAULT '2026/2027',
      semester TEXT NOT NULL DEFAULT 'Ganjil',
      start_date INTEGER,
      end_date INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS group_courses (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id),
      user_id TEXT NOT NULL REFERENCES user(id),
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS tutor_slots (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL REFERENCES user(id),
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'online',
      location TEXT,
      session_date TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL UNIQUE REFERENCES tutor_slots(id),
      student_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      group_id TEXT NOT NULL REFERENCES groups(id),
      status TEXT NOT NULL DEFAULT 'scheduled',
      session_date TEXT,
      start_time TEXT,
      end_time TEXT,
      mode TEXT NOT NULL DEFAULT 'online',
      location TEXT,
      google_meet_url TEXT,
      google_meet_space_name TEXT,
      last_modified_by TEXT,
      last_modified_at INTEGER NOT NULL,
      topic TEXT,
      pre_session_notes TEXT,
      pre_session_attachments TEXT,
      post_session_notes TEXT,
      post_session_attachments TEXT,
      post_session_link_url TEXT,
      post_session_link_title TEXT,
      post_session_link_description TEXT,
      post_session_link_image TEXT,
      completed_at INTEGER,
      completed_by_id TEXT,
      booked_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS booking_audit_logs (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      group_id TEXT REFERENCES groups(id),
      actor_id TEXT REFERENCES user(id),
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS booking_reschedule_tickets (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id),
      group_id TEXT NOT NULL REFERENCES groups(id),
      requested_by_id TEXT NOT NULL REFERENCES user(id),
      tutor_id TEXT REFERENCES user(id),
      type TEXT NOT NULL DEFAULT 'reschedule',
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT NOT NULL,
      proposed_slot_id TEXT REFERENCES tutor_slots(id),
      proposed_date TEXT,
      decision_notes TEXT,
      decided_at INTEGER,
      decided_by_id TEXT REFERENCES user(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_mutasi (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      before_snapshot TEXT,
      after_snapshot TEXT,
      correlation_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]);

  return { client, testDb };
}

describe("Tutor Schedule Action Contracts", () => {
  type TestDb = Awaited<ReturnType<typeof createTestDb>>["testDb"];

  async function seedQuotaFixture(
    testDb: TestDb,
    quotas: { weekly: number; total: number; used: number },
  ) {
    const now = new Date();
    await testDb.insert(schema.user).values([
      {
        id: "tutor-1",
        name: "Tutor Satu",
        email: "tutor1@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      },
      {
        id: "student-1",
        name: "Student Satu",
        email: "std1@zyx.test",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await testDb.insert(schema.pengguna).values({
      id: "tutor-1",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-1",
      penggunaId: "tutor-1",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });
    await testDb.insert(schema.courses).values({
      id: "crs-calc",
      title: "Kalkulus 1",
      category: "Matematika",
    });
    await testDb.insert(schema.mataKuliah).values({
      id: "mk-calc",
      code: "MA-1101",
      title: "Kalkulus 1",
      status: "active",
      legacyCourseId: "crs-calc",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-1",
      penggunaId: "tutor-1",
      mataKuliahId: "mk-calc",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.groups).values({
      id: "grp-q",
      name: "Kelompok Quota",
      status: "active",
      weeklyQuotaSessions: quotas.weekly,
      totalQuotaSessions: quotas.total,
      usedQuotaSessions: quotas.used,
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.groupCourses).values({
      id: "gc-1",
      groupId: "grp-q",
      courseId: "crs-calc",
      createdAt: now,
    });
    await testDb.insert(schema.groupMembers).values({
      id: "gm-1",
      groupId: "grp-q",
      userId: "student-1",
      role: "leader",
      joinedAt: now,
    });
    await testDb.insert(schema.tutorSlots).values([
      { id: "slot-a", tutorId: "tutor-1", dayOfWeek: "Senin", startTime: "09:00", endTime: "10:30", createdAt: now },
      { id: "slot-b", tutorId: "tutor-1", dayOfWeek: "Rabu", startTime: "09:00", endTime: "10:30", createdAt: now },
      { id: "slot-c", tutorId: "tutor-1", dayOfWeek: "Jumat", startTime: "09:00", endTime: "10:30", createdAt: now },
    ]);
    return { now };
  }

  async function seedFixtureBooking(
    testDb: TestDb,
    booking: {
      id: string;
      slotId: string;
      sessionDate: string;
      status: "scheduled" | "cancelled" | "completed" | "rescheduled";
    },
    now: Date,
  ) {
    // A booked legacy slot has an unambiguous session date. Keep the fixture
    // aligned with the compatibility backfill contract.
    await testDb
      .update(schema.tutorSlots)
      .set({ sessionDate: booking.sessionDate })
      .where(eq(schema.tutorSlots.id, booking.slotId));

    await testDb.insert(schema.bookings).values({
      id: booking.id,
      slotId: booking.slotId,
      studentId: "student-1",
      courseId: "crs-calc",
      groupId: "grp-q",
      status: booking.status,
      sessionDate: booking.sessionDate,
      startTime: "09:00",
      endTime: "10:30",
      lastModifiedAt: now,
      bookedAt: now,
    });
  }

  async function setFixtureSlotDate(testDb: TestDb, slotId: string, sessionDate: string) {
    await testDb
      .update(schema.tutorSlots)
      .set({ sessionDate })
      .where(eq(schema.tutorSlots.id, slotId));
  }

  async function seedTutorIdentity(testDb: TestDb, now = new Date(), tutorId = "tutor-1") {
    await testDb.insert(schema.user).values({
      id: tutorId,
      name: "Tutor Satu",
      email: `${tutorId}@zyx.test`,
      createdAt: now,
      updatedAt: now,
      role: "teacher",
    });
    await testDb.insert(schema.pengguna).values({
      id: tutorId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: `pp-${tutorId}`,
      penggunaId: tutorId,
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });
  }

  async function seedFixtureCancellationTicket(
    testDb: TestDb,
    ticketId: string,
    bookingId: string,
    now: Date,
    groupId = "grp-q",
  ) {
    await testDb.insert(schema.bookingRescheduleTickets).values({
      id: ticketId,
      bookingId,
      groupId,
      requestedById: "student-1",
      tutorId: "tutor-1",
      type: "cancellation",
      status: "pending",
      reason: "Mohon pembatalan sesi",
      createdAt: now,
      updatedAt: now,
    });
  }

  /* ────────────────────────────────────────────────────────────────────────
   * 1. executeAddTutorSlot
   * ──────────────────────────────────────────────────────────────────────── */
  describe("executeAddTutorSlot", () => {
    it("successfully creates a 90-minute slot and records mutation audit", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "tutor-1",
        name: "Tutor Satu",
        email: "tutor1@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      const res = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
          sessionDate: "2026-09-14",
          mode: "online",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          now: new Date("2026-09-09T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(true);
      expect(res.slotId).toBeDefined();

      const slots = await testDb.select().from(schema.tutorSlots);
      expect(slots).toHaveLength(1);
      expect(slots[0].tutorId).toBe("tutor-1");
      expect(slots[0].dayOfWeek).toBe("Senin");
      expect(slots[0].startTime).toBe("09:00");
      expect(slots[0].endTime).toBe("10:30");

      const audits = await testDb.select().from(schema.auditMutasi);
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe("tutor.slot.create");
      expect(audits[0].outcome).toBe("success");
      expect(audits[0].actorId).toBe("tutor-1");
    });

    it("rejects slot creation if duration is not 90 minutes and records rejected audit", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "tutor-1",
        name: "Tutor Satu",
        email: "tutor1@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      const res = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:00", // 60 mins -> invalid
          sessionDate: "2026-09-14",
          mode: "online",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          now: new Date("2026-09-09T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("INVALID_DURATION_NOT_90_MINUTES");

      const slots = await testDb.select().from(schema.tutorSlots);
      expect(slots).toHaveLength(0);

      const audits = await testDb.select().from(schema.auditMutasi);
      expect(audits).toHaveLength(1);
      expect(audits[0].outcome).toBe("rejected");
    });

    it("rejects offline slot creation when location is empty", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "tutor-1",
        name: "Tutor Satu",
        email: "tutor1@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      const res = await executeAddTutorSlot(
        {
          dayOfWeek: "Rabu",
          startTime: "13:00",
          endTime: "14:30",
          sessionDate: "2026-09-16",
          mode: "offline",
          location: "",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          now: new Date("2026-09-09T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("LOCATION_REQUIRED_FOR_OFFLINE");
    });

    it("rejects exact duplicates and overlaps while allowing adjacent slots", async () => {
      const { testDb } = await createTestDb();
      await seedTutorIdentity(testDb);
      const options = {
        actorId: "tutor-1",
        executor: testDb,
        now: new Date("2026-09-09T08:00:00.000+07:00"),
      };

      const first = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          sessionDate: "2026-09-14",
          startTime: "09:00",
          endTime: "10:30",
        },
        options,
      );
      expect(first.success).toBe(true);

      const duplicate = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          sessionDate: "2026-09-14",
          startTime: "09:00",
          endTime: "10:30",
        },
        options,
      );
      expect(duplicate.success).toBe(false);
      expect(duplicate.reason).toBe("DUPLICATE_TUTOR_SLOT");

      const overlap = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          sessionDate: "2026-09-14",
          startTime: "08:30",
          endTime: "10:00",
        },
        options,
      );
      expect(overlap.success).toBe(false);
      expect(overlap.reason).toBe("TUTOR_SLOT_OVERLAP");

      const adjacent = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          sessionDate: "2026-09-14",
          startTime: "10:30",
          endTime: "12:00",
        },
        options,
      );
      expect(adjacent.success).toBe(true);

      const slots = await testDb.select().from(schema.tutorSlots);
      expect(slots).toHaveLength(2);
    });

    it("requires a valid dated weekday and enforces the tutor mutation deadline", async () => {
      const { testDb } = await createTestDb();
      await seedTutorIdentity(testDb);

      const missingDate = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
        },
        { actorId: "tutor-1", executor: testDb },
      );
      expect(missingDate.success).toBe(false);
      expect(missingDate.reason).toBe("SESSION_DATE_REQUIRED");

      const mismatch = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          sessionDate: "2026-09-15",
          startTime: "09:00",
          endTime: "10:30",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          now: new Date("2026-09-09T08:00:00.000+07:00"),
        },
      );
      expect(mismatch.success).toBe(false);
      expect(mismatch.reason).toBe("DAY_OF_WEEK_MISMATCH");

      const afterDeadline = await executeAddTutorSlot(
        {
          dayOfWeek: "Senin",
          sessionDate: "2026-09-14",
          startTime: "09:00",
          endTime: "10:30",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          now: new Date("2026-09-11T11:00:00.000Z"),
        },
      );
      expect(afterDeadline.success).toBe(false);
      expect(afterDeadline.reason).toBe("TUTOR_AVAILABILITY_DEADLINE_PASSED");
    });

    it("backfills only booked null-date slots with an unambiguous date", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 0 });

      await testDb.insert(schema.bookings).values({
        id: "bk-legacy-date",
        slotId: "slot-a",
        studentId: "student-1",
        courseId: "crs-calc",
        groupId: "grp-q",
        status: "scheduled",
        sessionDate: "2026-08-31",
        startTime: "09:00",
        endTime: "10:30",
        lastModifiedAt: now,
        bookedAt: now,
      });

      const result = await backfillBookedNullTutorSlotDates(testDb);
      expect(result.updatedCount).toBe(1);
      expect(result.skippedCount).toBe(0);

      const slots = await testDb
        .select({ id: schema.tutorSlots.id, sessionDate: schema.tutorSlots.sessionDate })
        .from(schema.tutorSlots);
      expect(slots.find((slot) => slot.id === "slot-a")?.sessionDate).toBe("2026-08-31");
      expect(slots.find((slot) => slot.id === "slot-b")?.sessionDate).toBeNull();
    });

    it("copies the previous week's availability into fresh dated slots", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 0 });

      await setFixtureSlotDate(testDb, "slot-a", "2026-08-24");
      await setFixtureSlotDate(testDb, "slot-b", "2026-08-26");
      await setFixtureSlotDate(testDb, "slot-c", "2026-08-28");
      await seedFixtureBooking(testDb, {
        id: "bk-source-slot",
        slotId: "slot-c",
        sessionDate: "2026-08-28",
        status: "scheduled",
      }, now);

      await testDb.insert(schema.tutorSlots).values([
        {
          id: "destination-exact",
          tutorId: "tutor-1",
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
          mode: "online",
          sessionDate: "2026-08-31",
          createdAt: now,
        },
        {
          id: "destination-overlap",
          tutorId: "tutor-1",
          dayOfWeek: "Rabu",
          startTime: "09:30",
          endTime: "11:00",
          mode: "offline",
          location: "Ruang 4",
          sessionDate: "2026-09-02",
          createdAt: now,
        },
      ]);

      const result = await copyTutorAvailabilityFromPreviousWeek("2026-08-31", {
        actorId: "tutor-1",
        executor: testDb,
        now: new Date("2026-08-25T08:00:00.000+07:00"),
      });

      expect(result.success).toBe(true);
      expect(result.createdCount).toBe(1);
      expect(result.skippedCount).toBe(2);
      expect(result.conflicts).toEqual([
        expect.objectContaining({
          sourceSlotId: "slot-b",
          destinationDate: "2026-09-02",
          reason: "OVERLAP",
          existingSlotId: "destination-overlap",
        }),
      ]);

      const copied = await testDb
        .select()
        .from(schema.tutorSlots)
        .where(eq(schema.tutorSlots.sessionDate, "2026-09-04"));
      expect(copied).toHaveLength(1);
      expect(copied[0].id).not.toBe("slot-c");
      expect(copied[0].dayOfWeek).toBe("Jumat");
      expect(copied[0].mode).toBe("online");
      expect(copied[0].sessionDate).toBe("2026-09-04");
      expect(
        await testDb.select().from(schema.bookings).where(eq(schema.bookings.slotId, copied[0].id)),
      ).toHaveLength(0);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. executeDeleteTutorSlot
   * ──────────────────────────────────────────────────────────────────────── */
  describe("executeDeleteTutorSlot", () => {
    it("deletes unbooked slot owned by tutor and writes audit", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "tutor-1",
        name: "Tutor Satu",
        email: "tutor1@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.tutorSlots).values({
        id: "slot-free-1",
        tutorId: "tutor-1",
        dayOfWeek: "Senin",
        startTime: "09:00",
        endTime: "10:30",
        createdAt: now,
      });

      const res = await executeDeleteTutorSlot(
        { slotId: "slot-free-1" },
        { actorId: "tutor-1", executor: testDb },
      );

      expect(res.success).toBe(true);

      const remainingSlots = await testDb.select().from(schema.tutorSlots);
      expect(remainingSlots).toHaveLength(0);

      const audits = await testDb.select().from(schema.auditMutasi);
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe("tutor.slot.delete");
      expect(audits[0].outcome).toBe("success");
    });

    it("rejects deletion of booked slot and records rejected audit", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-1",
          name: "Tutor Satu",
          email: "tutor1@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student Satu",
          email: "std1@zyx.test",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.courses).values({
        id: "crs-math",
        title: "Matematika",
        category: "Matematika",
      });
      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok A",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.tutorSlots).values({
        id: "slot-booked-1",
        tutorId: "tutor-1",
        dayOfWeek: "Senin",
        startTime: "09:00",
        endTime: "10:30",
        createdAt: now,
      });

      await testDb.insert(schema.bookings).values({
        id: "booking-1",
        slotId: "slot-booked-1",
        studentId: "student-1",
        courseId: "crs-math",
        groupId: "grp-1",
        status: "scheduled",
        sessionDate: "2026-08-24",
        startTime: "09:00",
        endTime: "10:30",
        lastModifiedAt: now,
        bookedAt: now,
      });

      const res = await executeDeleteTutorSlot(
        { slotId: "slot-booked-1" },
        { actorId: "tutor-1", executor: testDb },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("CANNOT_DELETE_BOOKED_SLOT");

      const remainingSlots = await testDb.select().from(schema.tutorSlots);
      expect(remainingSlots).toHaveLength(1);

      const audits = await testDb.select().from(schema.auditMutasi);
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe("tutor.slot.delete");
      expect(audits[0].outcome).toBe("rejected");
    });

    it("rejects deletion of an unbooked dated slot after the tutor deadline", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();
      await seedTutorIdentity(testDb, now);

      await testDb.insert(schema.tutorSlots).values({
        id: "slot-deadline-1",
        tutorId: "tutor-1",
        dayOfWeek: "Senin",
        startTime: "09:00",
        endTime: "10:30",
        sessionDate: "2026-09-14",
        createdAt: now,
      });

      const res = await executeDeleteTutorSlot(
        { slotId: "slot-deadline-1" },
        {
          actorId: "tutor-1",
          executor: testDb,
          now: new Date("2026-09-11T11:00:00.000Z"),
        },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("TUTOR_AVAILABILITY_DEADLINE_PASSED");
      expect(await testDb.select().from(schema.tutorSlots)).toHaveLength(1);
    });

    it("prevents slot deletion race condition if slot is booked right before deletion transaction executes", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-1",
          name: "Tutor Satu",
          email: "tutor1@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student Satu",
          email: "std1@zyx.test",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.courses).values({
        id: "crs-math",
        title: "Matematika",
        category: "Matematika",
      });
      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok A",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.tutorSlots).values({
        id: "slot-race-1",
        tutorId: "tutor-1",
        dayOfWeek: "Senin",
        startTime: "09:00",
        endTime: "10:30",
        createdAt: now,
      });

      // Wrap executor so that right before transaction executes, a booking is concurrently inserted into DB
      const racingExecutor = new Proxy(testDb, {
        get(target, prop, receiver) {
          if (prop === "transaction") {
            return async (cb: any) => {
              // Concurrently insert booking before transaction executes body
              await (target as any).insert(schema.bookings).values({
                id: "booking-race-1",
                slotId: "slot-race-1",
                studentId: "student-1",
                courseId: "crs-math",
                groupId: "grp-1",
                status: "scheduled",
                sessionDate: "2026-08-24",
                startTime: "09:00",
                endTime: "10:30",
                lastModifiedAt: now,
                bookedAt: now,
              });

              return (target as any).transaction(cb);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      const res = await executeDeleteTutorSlot(
        { slotId: "slot-race-1" },
        { actorId: "tutor-1", executor: racingExecutor as any },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("CANNOT_DELETE_BOOKED_SLOT");

      // Slot must still exist
      const remainingSlots = await testDb.select().from(schema.tutorSlots);
      expect(remainingSlots).toHaveLength(1);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 4. executeMoveTutorSession
   * ──────────────────────────────────────────────────────────────────────── */
  describe("executeMoveTutorSession", () => {
    it("directly moves session to target slot when not locked", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-1",
          name: "Tutor Satu",
          email: "tutor1@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student Satu",
          email: "std1@zyx.test",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.courses).values({
        id: "crs-math",
        title: "Matematika",
        category: "Matematika",
      });
      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok A",
        createdAt: now,
        updatedAt: now,
      });

      // 2026-08-31 is Monday in next week (unlocked)
      // 2026-09-02 is Wednesday in next week (unlocked)
      await testDb.insert(schema.tutorSlots).values([
        {
          id: "slot-old",
          tutorId: "tutor-1",
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
          createdAt: now,
        },
        {
          id: "slot-new",
          tutorId: "tutor-1",
          dayOfWeek: "Rabu",
          startTime: "13:00",
          endTime: "14:30",
          createdAt: now,
        },
      ]);

      await testDb.insert(schema.bookings).values({
        id: "bk-move-1",
        slotId: "slot-old",
        studentId: "student-1",
        courseId: "crs-math",
        groupId: "grp-1",
        status: "scheduled",
        sessionDate: "2026-08-31",
        startTime: "09:00",
        endTime: "10:30",
        lastModifiedAt: now,
        bookedAt: now,
      });

      const res = await executeMoveTutorSession(
        {
          bookingId: "bk-move-1",
          targetSlotId: "slot-new",
          targetSessionDate: "2026-09-02",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          skipNotifications: true,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(true);
      expect(res.movedDirectly).toBe(true);

      const updated = await testDb
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, "bk-move-1"));
      expect(updated[0].slotId).toBe("slot-new");
      expect(updated[0].sessionDate).toBe("2026-09-02");
      expect(updated[0].startTime).toBe("13:00");
    });

    it("rejects move when actor does not own the booking's current slot (no cross-tutor mutation)", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-owner",
          name: "Tutor Owner",
          email: "owner@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "tutor-intruder",
          name: "Tutor Intruder",
          email: "intruder@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student Satu",
          email: "std1@zyx.test",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await testDb.insert(schema.pengguna).values([
        { id: "tutor-owner", status: "active", createdAt: now, updatedAt: now },
        { id: "tutor-intruder", status: "active", createdAt: now, updatedAt: now },
      ]);
      await testDb.insert(schema.penggunaPeran).values([
        { id: "pp-owner", penggunaId: "tutor-owner", peranId: "peran-tutor", source: "seed", createdAt: now },
        { id: "pp-intruder", penggunaId: "tutor-intruder", peranId: "peran-tutor", source: "seed", createdAt: now },
      ]);

      await testDb.insert(schema.courses).values({
        id: "crs-math",
        title: "Matematika",
        category: "Matematika",
      });
      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok A",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.tutorSlots).values([
        {
          id: "slot-owner-curr",
          tutorId: "tutor-owner",
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
          createdAt: now,
        },
        {
          id: "slot-intruder-target",
          tutorId: "tutor-intruder",
          dayOfWeek: "Rabu",
          startTime: "13:00",
          endTime: "14:30",
          createdAt: now,
        },
      ]);

      await testDb.insert(schema.bookings).values({
        id: "bk-owner-1",
        slotId: "slot-owner-curr",
        studentId: "student-1",
        courseId: "crs-math",
        groupId: "grp-1",
        status: "scheduled",
        sessionDate: "2026-08-31",
        startTime: "09:00",
        endTime: "10:30",
        lastModifiedAt: now,
        bookedAt: now,
      });

      // tutor-intruder tries to move tutor-owner's booking
      const res = await executeMoveTutorSession(
        {
          bookingId: "bk-owner-1",
          targetSlotId: "slot-intruder-target",
          targetSessionDate: "2026-09-02",
        },
        { actorId: "tutor-intruder", executor: testDb },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("CURRENT_SLOT_NOT_OWNED_BY_TUTOR");
    });

    it("rejects move when target slot is occupied by an existing booking (respecting DB unique constraint)", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-1",
          name: "Tutor Satu",
          email: "tutor1@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student Satu",
          email: "std1@zyx.test",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.courses).values({
        id: "crs-math",
        title: "Matematika",
        category: "Matematika",
      });
      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok A",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.tutorSlots).values([
        {
          id: "slot-a",
          tutorId: "tutor-1",
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
          createdAt: now,
        },
        {
          id: "slot-b-occupied",
          tutorId: "tutor-1",
          dayOfWeek: "Rabu",
          startTime: "13:00",
          endTime: "14:30",
          createdAt: now,
        },
      ]);

      await testDb.insert(schema.bookings).values([
        {
          id: "bk-1",
          slotId: "slot-a",
          studentId: "student-1",
          courseId: "crs-math",
          groupId: "grp-1",
          status: "scheduled",
          sessionDate: "2026-08-31",
          startTime: "09:00",
          endTime: "10:30",
          lastModifiedAt: now,
          bookedAt: now,
        },
        {
          id: "bk-2-completed",
          slotId: "slot-b-occupied",
          studentId: "student-1",
          courseId: "crs-math",
          groupId: "grp-1",
          status: "completed", // Slot is occupied in DB
          sessionDate: "2026-09-02",
          startTime: "13:00",
          endTime: "14:30",
          lastModifiedAt: now,
          bookedAt: now,
        },
      ]);

      const res = await executeMoveTutorSession(
        {
          bookingId: "bk-1",
          targetSlotId: "slot-b-occupied",
          targetSessionDate: "2026-09-02",
        },
        { actorId: "tutor-1", executor: testDb },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("TARGET_SLOT_OCCUPIED");
    });

    it("rejects moving completed or cancelled sessions", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 1 });

      await seedFixtureBooking(testDb, {
        id: "bk-done",
        slotId: "slot-a",
        sessionDate: "2020-06-01",
        status: "completed",
      }, now);

      const res = await executeMoveTutorSession(
        {
          bookingId: "bk-done",
          targetSlotId: "slot-b",
          targetSessionDate: "2026-08-26",
          reason: "Coba pindahkan sesi selesai",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          skipExternalMeet: true,
          skipNotifications: true,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("BOOKING_TERMINAL_STATE");

      // Booking must remain untouched.
      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-done"));
      expect(bookingRow[0].slotId).toBe("slot-a");
      expect(bookingRow[0].status).toBe("completed");

      // No ticket may have been created as a side effect of the locked path.
      const ticketRows = await testDb.select({ id: schema.bookingRescheduleTickets.id }).from(schema.bookingRescheduleTickets);
      expect(ticketRows.length).toBe(0);
    });

    it("rejects creating duplicate pending reschedule tickets for the same locked session", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 10, used: 1 });

      await seedFixtureBooking(testDb, {
        id: "bk-locked-dup",
        slotId: "slot-a",
        sessionDate: "2026-08-24",
        status: "scheduled",
      }, now);

      // First locked move: creates a pending ticket
      const firstMove = await executeMoveTutorSession(
        {
          bookingId: "bk-locked-dup",
          targetSlotId: "slot-b",
          targetSessionDate: "2026-08-26",
          reason: "Permohonan pertama",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          skipExternalMeet: true,
          skipNotifications: true,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(firstMove.success).toBe(true);
      expect(firstMove.requiresTicket).toBe(true);
      expect(firstMove.ticketId).toBeDefined();

      // Second locked move on the same booking while previous ticket is pending
      const secondMove = await executeMoveTutorSession(
        {
          bookingId: "bk-locked-dup",
          targetSlotId: "slot-c",
          targetSessionDate: "2026-08-28",
          reason: "Permohonan kedua",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          skipExternalMeet: true,
          skipNotifications: true,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(secondMove.success).toBe(false);
      expect(secondMove.reason).toBe("DUPLICATE_PENDING_TICKET");

      // Ensure only 1 ticket was created
      const tickets = await testDb.select().from(schema.bookingRescheduleTickets);
      expect(tickets).toHaveLength(1);
    });

    it("rejects direct move into a full target week (cross-week weekly quota exceeded) and writes rejected audit", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      // Origin week 2026-W36 (Monday 2026-08-31) in slot-a
      await seedFixtureBooking(testDb, {
        id: "bk-move-orig",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);

      // Target week 2026-W37 (Friday 2026-09-11) already has a booking in slot-c, filling weekly quota of 1
      await seedFixtureBooking(testDb, {
        id: "bk-move-tgt-full",
        slotId: "slot-c",
        sessionDate: "2026-09-11",
        status: "scheduled",
      }, now);

      // Attempt to move bk-move-orig to Wednesday 2026-09-09 (slot-b in target week 2026-W37)
      const res = await executeMoveTutorSession(
        {
          bookingId: "bk-move-orig",
          targetSlotId: "slot-b",
          targetSessionDate: "2026-09-09",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          skipExternalMeet: true,
          skipNotifications: true,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("WEEKLY_QUOTA_EXCEEDED");

      // Booking must remain unchanged at origin
      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-move-orig"));
      expect(bookingRow[0].slotId).toBe("slot-a");
      expect(bookingRow[0].sessionDate).toBe("2026-08-31");

      // Rejected audit row must be persisted
      const auditRows = await testDb
        .select()
        .from(schema.auditMutasi)
        .where(eq(schema.auditMutasi.action, "tutor.session.move"));
      const rejectedAudits = auditRows.filter((r) => r.outcome === "rejected" && r.reason === "WEEKLY_QUOTA_EXCEEDED");
      expect(rejectedAudits.length).toBe(1);
    });

    it("allows direct move within the same full week (same-week move preserves weekly count)", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 1 });

      // Origin week 2026-W36 (Monday 2026-08-31)
      await seedFixtureBooking(testDb, {
        id: "bk-same-week",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);

      // Move within the SAME week 2026-W36 to Wednesday 2026-09-02 (slot-b)
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-02");
      const res = await executeMoveTutorSession(
        {
          bookingId: "bk-same-week",
          targetSlotId: "slot-b",
          targetSessionDate: "2026-09-02",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          skipExternalMeet: true,
          skipNotifications: true,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(true);
      expect(res.movedDirectly).toBe(true);

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-same-week"));
      expect(bookingRow[0].slotId).toBe("slot-b");
      expect(bookingRow[0].sessionDate).toBe("2026-09-02");
    });

    it("allows direct move into a target week where a cancelled booking was pre-lock refunded", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      // Origin week 2026-W36 (Monday 2026-08-31) in slot-a
      await seedFixtureBooking(testDb, {
        id: "bk-orig-ref",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);

      // Target week 2026-W37 has a cancelled booking with refund marker on Friday 2026-09-11 in slot-c
      await seedFixtureBooking(testDb, {
        id: "bk-tgt-refunded",
        slotId: "slot-c",
        sessionDate: "2026-09-11",
        status: "cancelled",
      }, now);

      await testDb.insert(schema.bookingAuditLogs).values({
        id: randomUUID(),
        bookingId: "bk-tgt-refunded",
        groupId: "grp-q",
        actorId: "tutor-1",
        action: CANCELLED_QUOTA_REFUND_LOG_ACTION,
        summary: "Refund pre-lock cancellation",
        createdAt: now,
      });

      // Move bk-orig-ref to Wednesday 2026-09-09 (slot-b in target week 2026-W37)
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-09");
      const res = await executeMoveTutorSession(
        {
          bookingId: "bk-orig-ref",
          targetSlotId: "slot-b",
          targetSessionDate: "2026-09-09",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          skipExternalMeet: true,
          skipNotifications: true,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(true);
      expect(res.movedDirectly).toBe(true);

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-orig-ref"));
      expect(bookingRow[0].slotId).toBe("slot-b");
      expect(bookingRow[0].sessionDate).toBe("2026-09-09");
    });

    it("rejects direct move into a target week where a post-lock cancelled booking consumes quota", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      // Origin week 2026-W36 (Monday 2026-08-31) in slot-a
      await seedFixtureBooking(testDb, {
        id: "bk-orig-hangus",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);

      // Target week 2026-W37 has a post-lock cancelled booking (hangus, no refund marker) on Friday 2026-09-11 in slot-c
      await seedFixtureBooking(testDb, {
        id: "bk-tgt-hangus",
        slotId: "slot-c",
        sessionDate: "2026-09-11",
        status: "cancelled",
      }, now);

      // Move bk-orig-hangus to Wednesday 2026-09-09 (slot-b in target week 2026-W37)
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-09");
      const res = await executeMoveTutorSession(
        {
          bookingId: "bk-orig-hangus",
          targetSlotId: "slot-b",
          targetSessionDate: "2026-09-09",
        },
        {
          actorId: "tutor-1",
          executor: testDb,
          skipExternalMeet: true,
          skipNotifications: true,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("WEEKLY_QUOTA_EXCEEDED");

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-orig-hangus"));
      expect(bookingRow[0].slotId).toBe("slot-a");
      expect(bookingRow[0].sessionDate).toBe("2026-08-31");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 5. executeDecideTutorRescheduleTicket
   * ──────────────────────────────────────────────────────────────────────── */
  describe("executeDecideTutorRescheduleTicket", () => {
    it("approves reschedule ticket and updates booking to proposed slot", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-1",
          name: "Tutor Satu",
          email: "tutor1@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student Satu",
          email: "std1@zyx.test",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.courses).values({
        id: "crs-math",
        title: "Matematika",
        category: "Matematika",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-math",
        code: "MA-1101",
        title: "Matematika",
        status: "active",
        legacyCourseId: "crs-math",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-1",
        penggunaId: "tutor-1",
        mataKuliahId: "mk-math",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok A",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.groupCourses).values({
        id: "gc-1",
        groupId: "grp-1",
        courseId: "crs-math",
        createdAt: now,
      });
      await testDb.insert(schema.groupMembers).values({
        id: "gm-1",
        groupId: "grp-1",
        userId: "student-1",
        role: "leader",
        joinedAt: now,
      });

      await testDb.insert(schema.tutorSlots).values([
        {
          id: "slot-curr",
          tutorId: "tutor-1",
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
          createdAt: now,
        },
        {
          id: "slot-proposed",
          tutorId: "tutor-1",
          dayOfWeek: "Jumat",
          startTime: "15:00",
          endTime: "16:30",
          createdAt: now,
        },
      ]);

      await testDb.insert(schema.bookings).values({
        id: "bk-ticket-1",
        slotId: "slot-curr",
        studentId: "student-1",
        courseId: "crs-math",
        groupId: "grp-1",
        status: "scheduled",
        sessionDate: "2026-08-24",
        startTime: "09:00",
        endTime: "10:30",
        lastModifiedAt: now,
        bookedAt: now,
      });

      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "ticket-1",
        bookingId: "bk-ticket-1",
        groupId: "grp-1",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "reschedule",
        status: "pending",
        reason: "Bentrok praktikum",
        proposedSlotId: "slot-proposed",
        proposedDate: "2026-08-28",
        createdAt: now,
        updatedAt: now,
      });

      const res = await executeDecideTutorRescheduleTicket(
        {
          ticketId: "ticket-1",
          decision: "approved",
          decisionNotes: "Disetujui untuk Jumat sore",
        },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );

      expect(res.success).toBe(true);

      const ticketRow = await testDb
        .select()
        .from(schema.bookingRescheduleTickets)
        .where(eq(schema.bookingRescheduleTickets.id, "ticket-1"));
      expect(ticketRow[0].status).toBe("approved");
      expect(ticketRow[0].decisionNotes).toBe("Disetujui untuk Jumat sore");

      const bookingRow = await testDb
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, "bk-ticket-1"));
      expect(bookingRow[0].slotId).toBe("slot-proposed");
      expect(bookingRow[0].sessionDate).toBe("2026-08-28");
      expect(bookingRow[0].startTime).toBe("15:00");
    });

    it("rejects ticket decision when actor does not own the booking's current slot (no cross-tutor decision)", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-owner",
          name: "Tutor Owner",
          email: "owner@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "tutor-other",
          name: "Tutor Other",
          email: "other@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student Satu",
          email: "std1@zyx.test",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await testDb.insert(schema.pengguna).values([
        { id: "tutor-owner", status: "active", createdAt: now, updatedAt: now },
        { id: "tutor-other", status: "active", createdAt: now, updatedAt: now },
      ]);
      await testDb.insert(schema.penggunaPeran).values([
        { id: "pp-owner", penggunaId: "tutor-owner", peranId: "peran-tutor", source: "seed", createdAt: now },
        { id: "pp-other", penggunaId: "tutor-other", peranId: "peran-tutor", source: "seed", createdAt: now },
      ]);

      await testDb.insert(schema.courses).values({
        id: "crs-math",
        title: "Matematika",
        category: "Matematika",
      });
      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok A",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.tutorSlots).values({
        id: "slot-owner-curr",
        tutorId: "tutor-owner",
        dayOfWeek: "Senin",
        startTime: "09:00",
        endTime: "10:30",
        createdAt: now,
      });

      await testDb.insert(schema.bookings).values({
        id: "bk-ticket-owner",
        slotId: "slot-owner-curr",
        studentId: "student-1",
        courseId: "crs-math",
        groupId: "grp-1",
        status: "scheduled",
        sessionDate: "2026-08-24",
        startTime: "09:00",
        endTime: "10:30",
        lastModifiedAt: now,
        bookedAt: now,
      });

      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "ticket-owner-1",
        bookingId: "bk-ticket-owner",
        groupId: "grp-1",
        requestedById: "student-1",
        tutorId: "tutor-owner",
        type: "reschedule",
        status: "pending",
        reason: "Bentrok",
        createdAt: now,
        updatedAt: now,
      });

      // tutor-other tries to decide ticket
      const res = await executeDecideTutorRescheduleTicket(
        { ticketId: "ticket-owner-1", decision: "approved" },
        { actorId: "tutor-other", executor: testDb },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_TICKET_OWNER_MISMATCH");
    });

    it("rejects reschedule approval when proposed slot is not 90 minutes", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-1",
          name: "Tutor Satu",
          email: "tutor1@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student Satu",
          email: "std1@zyx.test",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await testDb.insert(schema.pengguna).values({
        id: "tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "tutor-1",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.courses).values({
        id: "crs-math",
        title: "Matematika",
        category: "Matematika",
      });
      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok A",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.tutorSlots).values([
        {
          id: "slot-curr",
          tutorId: "tutor-1",
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
          createdAt: now,
        },
        {
          id: "slot-proposed-60m",
          tutorId: "tutor-1",
          dayOfWeek: "Jumat",
          startTime: "15:00",
          endTime: "16:00", // 60 mins -> invalid
          createdAt: now,
        },
      ]);

      await testDb.insert(schema.bookings).values({
        id: "bk-ticket-1",
        slotId: "slot-curr",
        studentId: "student-1",
        courseId: "crs-math",
        groupId: "grp-1",
        status: "scheduled",
        sessionDate: "2026-08-24",
        startTime: "09:00",
        endTime: "10:30",
        lastModifiedAt: now,
        bookedAt: now,
      });

      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "ticket-60m",
        bookingId: "bk-ticket-1",
        groupId: "grp-1",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "reschedule",
        status: "pending",
        reason: "Test 60m slot",
        proposedSlotId: "slot-proposed-60m",
        proposedDate: "2026-08-28",
        createdAt: now,
        updatedAt: now,
      });

      const res = await executeDecideTutorRescheduleTicket(
        { ticketId: "ticket-60m", decision: "approved" },
        { actorId: "tutor-1", executor: testDb },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("INVALID_DURATION_NOT_90_MINUTES");
    });

    it("rejects approval when ticket groupId mismatches the booking groupId", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 1 });

      // Second group row so the ticket FK stays valid.
      const otherNow = new Date();
      await testDb.insert(schema.groups).values({
        id: "grp-other",
        name: "Kelompok Lain",
        status: "active",
        createdAt: otherNow,
        updatedAt: otherNow,
      });

      await seedFixtureBooking(testDb, {
        id: "bk-mm",
        slotId: "slot-a",
        sessionDate: "2026-08-24",
        status: "scheduled",
      }, now);

      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "tix-mm",
        bookingId: "bk-mm",
        groupId: "grp-other",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "cancellation",
        status: "pending",
        reason: "Tiket dengan kelompok tidak konsisten",
        createdAt: now,
        updatedAt: now,
      });

      const res = await executeDecideTutorRescheduleTicket(
        { ticketId: "tix-mm", decision: "approved" },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("TICKET_GROUP_MISMATCH");

      // Ticket stays pending and booking untouched.
      const ticketRow = await testDb.select().from(schema.bookingRescheduleTickets).where(eq(schema.bookingRescheduleTickets.id, "tix-mm"));
      expect(ticketRow[0].status).toBe("pending");

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-mm"));
      expect(bookingRow[0].status).toBe("scheduled");
    });

    it("rejects approving tickets for terminal bookings and keeps the ticket pending", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 1 });

      await seedFixtureBooking(testDb, {
        id: "bk-term",
        slotId: "slot-a",
        sessionDate: "2020-06-01",
        status: "completed",
      }, now);

      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "tix-term",
        bookingId: "bk-term",
        groupId: "grp-q",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "reschedule",
        status: "pending",
        reason: "Reschedule sesi selesai",
        proposedSlotId: "slot-b",
        proposedDate: "2026-08-26",
        createdAt: now,
        updatedAt: now,
      });

      const res = await executeDecideTutorRescheduleTicket(
        { ticketId: "tix-term", decision: "approved" },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("BOOKING_TERMINAL_STATE");

      const ticketRow = await testDb.select().from(schema.bookingRescheduleTickets).where(eq(schema.bookingRescheduleTickets.id, "tix-term"));
      expect(ticketRow[0].status).toBe("pending");

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-term"));
      expect(bookingRow[0].status).toBe("completed");
      expect(bookingRow[0].slotId).toBe("slot-a");
    });

    it("fails closed on a second decision attempt after the ticket was decided", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 1 });

      await seedFixtureBooking(testDb, {
        id: "bk-dd",
        slotId: "slot-a",
        sessionDate: "2027-06-07",
        status: "scheduled",
      }, now);

      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "tix-dd",
        bookingId: "bk-dd",
        groupId: "grp-q",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "reschedule",
        status: "pending",
        reason: "Bentrok jadwal",
        proposedSlotId: "slot-b",
        proposedDate: "2027-06-09",
        createdAt: now,
        updatedAt: now,
      });

      const first = await executeDecideTutorRescheduleTicket(
        { ticketId: "tix-dd", decision: "approved" },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );
      expect(first.success).toBe(true);

      const second = await executeDecideTutorRescheduleTicket(
        { ticketId: "tix-dd", decision: "rejected" },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );
      expect(second.success).toBe(false);
      expect(second.reason).toBe("TICKET_ALREADY_DECIDED");

      const auditRows = await testDb
        .select()
        .from(schema.auditMutasi)
        .where(eq(schema.auditMutasi.action, "tutor.ticket.decide"));
      const rejectedRows = auditRows.filter((row) => row.outcome === "rejected" && row.reason === "TICKET_ALREADY_DECIDED");
      expect(rejectedRows.length).toBe(1);
    });

    it("rejects reschedule approval when target week weekly quota is exhausted and keeps ticket pending", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      // Origin week 2026-W35 (Monday 2026-08-24, locked) in slot-a
      await seedFixtureBooking(testDb, {
        id: "bk-tix-origin",
        slotId: "slot-a",
        sessionDate: "2026-08-24",
        status: "scheduled",
      }, now);

      // Target week 2026-W36 (Friday 2026-09-04) already has a booking in slot-c consuming the weekly quota of 1
      await seedFixtureBooking(testDb, {
        id: "bk-tix-target-full",
        slotId: "slot-c",
        sessionDate: "2026-09-04",
        status: "scheduled",
      }, now);

      // Ticket proposing to move bk-tix-origin to Wednesday 2026-09-02 (slot-b in full target week 2026-W36)
      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "tix-resched-full",
        bookingId: "bk-tix-origin",
        groupId: "grp-q",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "reschedule",
        status: "pending",
        reason: "Pindah ke minggu depan",
        proposedSlotId: "slot-b",
        proposedDate: "2026-09-02",
        createdAt: now,
        updatedAt: now,
      });

      const res = await executeDecideTutorRescheduleTicket(
        { ticketId: "tix-resched-full", decision: "approved" },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("WEEKLY_QUOTA_EXCEEDED");

      // Ticket must remain pending
      const ticketRow = await testDb.select().from(schema.bookingRescheduleTickets).where(eq(schema.bookingRescheduleTickets.id, "tix-resched-full"));
      expect(ticketRow[0].status).toBe("pending");

      // Booking must remain unchanged at origin
      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-tix-origin"));
      expect(bookingRow[0].slotId).toBe("slot-a");
      expect(bookingRow[0].sessionDate).toBe("2026-08-24");

      // Rejected audit row must be persisted
      const auditRows = await testDb
        .select()
        .from(schema.auditMutasi)
        .where(eq(schema.auditMutasi.action, "tutor.ticket.decide"));
      const rejectedAudits = auditRows.filter((r) => r.outcome === "rejected" && r.reason === "WEEKLY_QUOTA_EXCEEDED");
      expect(rejectedAudits.length).toBe(1);
    });

    it("allows reschedule approval for same-week move within a full week", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 1 });

      // Origin week 2026-W35 (Monday 2026-08-24)
      await seedFixtureBooking(testDb, {
        id: "bk-tix-same",
        slotId: "slot-a",
        sessionDate: "2026-08-24",
        status: "scheduled",
      }, now);

      // Reschedule ticket proposing Wednesday 2026-08-26 (slot-b in same week)
      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "tix-resched-same",
        bookingId: "bk-tix-same",
        groupId: "grp-q",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "reschedule",
        status: "pending",
        reason: "Pindah hari di minggu yang sama",
        proposedSlotId: "slot-b",
        proposedDate: "2026-08-26",
        createdAt: now,
        updatedAt: now,
      });

      const res = await executeDecideTutorRescheduleTicket(
        { ticketId: "tix-resched-same", decision: "approved" },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );

      expect(res.success).toBe(true);

      const ticketRow = await testDb.select().from(schema.bookingRescheduleTickets).where(eq(schema.bookingRescheduleTickets.id, "tix-resched-same"));
      expect(ticketRow[0].status).toBe("approved");

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-tix-same"));
      expect(bookingRow[0].slotId).toBe("slot-b");
      expect(bookingRow[0].sessionDate).toBe("2026-08-26");
    });

    it("allows reschedule approval into a target week with pre-lock refunded cancellation", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      // Origin booking in 2026-W35 (Monday 2026-08-24) in slot-a
      await seedFixtureBooking(testDb, {
        id: "bk-tix-orig-ref",
        slotId: "slot-a",
        sessionDate: "2026-08-24",
        status: "scheduled",
      }, now);

      // Target week 2026-W36 has a pre-lock refunded cancelled booking on Friday 2026-09-04 in slot-c
      await seedFixtureBooking(testDb, {
        id: "bk-tix-tgt-refunded",
        slotId: "slot-c",
        sessionDate: "2026-09-04",
        status: "cancelled",
      }, now);

      await testDb.insert(schema.bookingAuditLogs).values({
        id: randomUUID(),
        bookingId: "bk-tix-tgt-refunded",
        groupId: "grp-q",
        actorId: "tutor-1",
        action: CANCELLED_QUOTA_REFUND_LOG_ACTION,
        summary: "Refund pre-lock cancellation",
        createdAt: now,
      });

      // Ticket proposing Wednesday 2026-09-02 (slot-b in target week 2026-W36)
      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "tix-resched-ref",
        bookingId: "bk-tix-orig-ref",
        groupId: "grp-q",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "reschedule",
        status: "pending",
        reason: "Pindah ke slot yang kuotanya sudah direfund",
        proposedSlotId: "slot-b",
        proposedDate: "2026-09-02",
        createdAt: now,
        updatedAt: now,
      });

      const res = await executeDecideTutorRescheduleTicket(
        { ticketId: "tix-resched-ref", decision: "approved" },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );

      expect(res.success).toBe(true);

      const ticketRow = await testDb.select().from(schema.bookingRescheduleTickets).where(eq(schema.bookingRescheduleTickets.id, "tix-resched-ref"));
      expect(ticketRow[0].status).toBe("approved");

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-tix-orig-ref"));
      expect(bookingRow[0].slotId).toBe("slot-b");
      expect(bookingRow[0].sessionDate).toBe("2026-09-02");
    });

    it("rejects reschedule approval into a target week with post-lock unrefunded cancellation", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      // Origin booking in 2026-W35 (Monday 2026-08-24) in slot-a
      await seedFixtureBooking(testDb, {
        id: "bk-tix-orig-hangus",
        slotId: "slot-a",
        sessionDate: "2026-08-24",
        status: "scheduled",
      }, now);

      // Target week 2026-W36 has a post-lock unrefunded cancelled booking (hangus) on Friday 2026-09-04 in slot-c
      await seedFixtureBooking(testDb, {
        id: "bk-tix-tgt-hangus",
        slotId: "slot-c",
        sessionDate: "2026-09-04",
        status: "cancelled",
      }, now);

      await testDb.insert(schema.bookingRescheduleTickets).values({
        id: "tix-resched-hangus",
        bookingId: "bk-tix-orig-hangus",
        groupId: "grp-q",
        requestedById: "student-1",
        tutorId: "tutor-1",
        type: "reschedule",
        status: "pending",
        reason: "Pindah ke slot dengan pembatalan hangus",
        proposedSlotId: "slot-b",
        proposedDate: "2026-09-02",
        createdAt: now,
        updatedAt: now,
      });

      const res = await executeDecideTutorRescheduleTicket(
        { ticketId: "tix-resched-hangus", decision: "approved" },
        { actorId: "tutor-1", executor: testDb, skipNotifications: true },
      );

      expect(res.success).toBe(false);
      expect(res.reason).toBe("WEEKLY_QUOTA_EXCEEDED");

      const ticketRow = await testDb.select().from(schema.bookingRescheduleTickets).where(eq(schema.bookingRescheduleTickets.id, "tix-resched-hangus"));
      expect(ticketRow[0].status).toBe("pending");

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-tix-orig-hangus"));
      expect(bookingRow[0].slotId).toBe("slot-a");
      expect(bookingRow[0].sessionDate).toBe("2026-08-24");
    });
  });

  describe("recordTutorFailureAudit and exhaustion behavior", () => {
    it("retries on SQLITE_BUSY and throws structured TUTOR_AUDIT_PERSISTENCE_FAILED error with cause preserved upon exhaustion", async () => {
      let attempts = 0;
      const fakeBusyError = new Error("SQLITE_BUSY: database is locked");
      const failingExecutor = {
        insert: () => ({
          values: async () => {
            attempts++;
            throw fakeBusyError;
          },
        }),
      } as any;

      let thrownError: any = null;
      try {
        await recordTutorFailureAudit(
          {
            actorId: "tutor-1",
            actorRoles: ["tutor"],
            courseId: "course-1",
            entityType: "booking",
            entityId: "session-1",
            entityVersion: 1,
            action: "tutor.session.create",
            outcome: "rejected",
            requestId: "req-1",
            reason: "WEEKLY_QUOTA_EXCEEDED",
            before: null,
            after: null,
          },
          failingExecutor,
        );
      } catch (err: any) {
        thrownError = err;
      }

      expect(attempts).toBe(7);
      expect(thrownError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(thrownError.message).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.cause).toBe(fakeBusyError);
    });

    it("throws structured TUTOR_AUDIT_PERSISTENCE_FAILED immediately on non-busy errors", async () => {
      let attempts = 0;
      const genericError = new Error("FATAL_STORAGE_IO");
      const failingExecutor = {
        insert: () => ({
          values: async () => {
            attempts++;
            throw genericError;
          },
        }),
      } as any;

      let thrownError: any = null;
      try {
        await recordTutorFailureAudit(
          {
            actorId: "tutor-1",
            actorRoles: ["tutor"],
            courseId: "course-1",
            entityType: "booking",
            entityId: "session-1",
            entityVersion: 1,
            action: "tutor.session.create",
            outcome: "rejected",
            requestId: "req-2",
            reason: "WEEKLY_QUOTA_EXCEEDED",
            before: null,
            after: null,
          },
          failingExecutor,
        );
      } catch (err: any) {
        thrownError = err;
      }

      expect(attempts).toBe(1);
      expect(thrownError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(thrownError.message).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.cause).toBe(genericError);
    });

    it("recordUnauthenticatedRejectAudit retries on SQLITE_BUSY and throws structured TUTOR_AUDIT_PERSISTENCE_FAILED error with cause preserved upon exhaustion", async () => {
      let attempts = 0;
      const fakeBusyError = new Error("SQLITE_BUSY: database is locked");
      const failingExecutor = {
        insert: () => ({
          values: async () => {
            attempts++;
            throw fakeBusyError;
          },
        }),
      } as any;

      let thrownError: any = null;
      try {
        await recordUnauthenticatedRejectAudit({
          action: "tutor.slot.create",
          entityType: "tutor_slot",
          entityId: "new_slot",
          courseId: "global",
          requestId: "req-unauth-1",
          reason: "UNAUTHORIZED",
          input: { dayOfWeek: "Senin" },
          executor: failingExecutor,
        });
      } catch (err: any) {
        thrownError = err;
      }

      expect(attempts).toBe(7);
      expect(thrownError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(thrownError.message).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.cause).toBe(fakeBusyError);
    });

    it("recordUnauthenticatedRejectAudit throws structured TUTOR_AUDIT_PERSISTENCE_FAILED immediately on non-busy errors", async () => {
      let attempts = 0;
      const genericError = new Error("FATAL_STORAGE_IO");
      const failingExecutor = {
        insert: () => ({
          values: async () => {
            attempts++;
            throw genericError;
          },
        }),
      } as any;

      let thrownError: any = null;
      try {
        await recordUnauthenticatedRejectAudit({
          action: "tutor.slot.create",
          entityType: "tutor_slot",
          entityId: "new_slot",
          courseId: "global",
          requestId: "req-unauth-2",
          reason: "UNAUTHORIZED",
          input: { dayOfWeek: "Senin" },
          executor: failingExecutor,
        });
      } catch (err: any) {
        thrownError = err;
      }

      expect(attempts).toBe(1);
      expect(thrownError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(thrownError.message).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.cause).toBe(genericError);
    });

    it("propagates audit persistence failure from unauthenticated executeMoveTutorSession calls", async () => {
      const { testDb } = await createTestDb();
      const faultyExecutor = new Proxy(testDb, {
        get(target, prop, receiver) {
          if (prop === "insert") {
            return (table: any) => {
              if (table === schema.auditMutasi) {
                return {
                  values: async () => {
                    throw new Error("SQLITE_BUSY: database is locked");
                  },
                };
              }
              return Reflect.get(target, prop, receiver)(table);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      let actionError: any = null;
      try {
        await executeMoveTutorSession(
          {
            bookingId: "bk-any",
            targetSlotId: "slot-any",
            targetSessionDate: "2026-08-26",
          },
          { actorId: "ghost-tutor", executor: faultyExecutor as any },
        );
      } catch (err: any) {
        actionError = err;
      }

      expect(actionError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(actionError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
    });

    it("propagates audit persistence failure from unauthenticated executeDecideTutorRescheduleTicket calls", async () => {
      const { testDb } = await createTestDb();
      const faultyExecutor = new Proxy(testDb, {
        get(target, prop, receiver) {
          if (prop === "insert") {
            return (table: any) => {
              if (table === schema.auditMutasi) {
                return {
                  values: async () => {
                    throw new Error("SQLITE_BUSY: database is locked");
                  },
                };
              }
              return Reflect.get(target, prop, receiver)(table);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      let actionError: any = null;
      try {
        await executeDecideTutorRescheduleTicket(
          {
            ticketId: "tix-any",
            decision: "approved",
          },
          { actorId: "ghost-tutor", executor: faultyExecutor as any },
        );
      } catch (err: any) {
        actionError = err;
      }

      expect(actionError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(actionError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
    });

    it("propagates audit persistence failure from unauthenticated executeAddTutorSlot calls", async () => {
      const { testDb } = await createTestDb();
      const faultyExecutor = new Proxy(testDb, {
        get(target, prop, receiver) {
          if (prop === "insert") {
            return (table: any) => {
              if (table === schema.auditMutasi) {
                return {
                  values: async () => {
                    throw new Error("SQLITE_BUSY: database is locked");
                  },
                };
              }
              return Reflect.get(target, prop, receiver)(table);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      let actionError: any = null;
      try {
        await executeAddTutorSlot(
          {
            dayOfWeek: "Senin",
            startTime: "09:00",
            endTime: "10:30",
          },
          { actorId: "ghost-tutor", executor: faultyExecutor as any },
        );
      } catch (err: any) {
        actionError = err;
      }

      expect(actionError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(actionError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
    });

    it("propagates audit persistence failure from unauthenticated executeDeleteTutorSlot calls", async () => {
      const { testDb } = await createTestDb();
      const faultyExecutor = new Proxy(testDb, {
        get(target, prop, receiver) {
          if (prop === "insert") {
            return (table: any) => {
              if (table === schema.auditMutasi) {
                return {
                  values: async () => {
                    throw new Error("SQLITE_BUSY: database is locked");
                  },
                };
              }
              return Reflect.get(target, prop, receiver)(table);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      let actionError: any = null;
      try {
        await executeDeleteTutorSlot(
          {
            slotId: "slot-any",
          },
          { actorId: "ghost-tutor", executor: faultyExecutor as any },
        );
      } catch (err: any) {
        actionError = err;
      }

      expect(actionError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(actionError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 7. collaborativeMoveSlot
   * ──────────────────────────────────────────────────────────────────────── */
  describe("collaborativeMoveSlot", () => {
    it("allows collaborative move into another week now that weekly usage is not checked", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      // Origin week 2026-W36 (Monday 2026-08-31) in slot-a
      await seedFixtureBooking(testDb, {
        id: "bk-std-move-orig",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);

      // Target week 2026-W37 already has a booking on Friday 2026-09-11 in slot-c
      await seedFixtureBooking(testDb, {
        id: "bk-std-tgt-full",
        slotId: "slot-c",
        sessionDate: "2026-09-11",
        status: "scheduled",
      }, now);
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-09");

      const res = await collaborativeMoveSlot(
        "bk-std-move-orig",
        "slot-b",
        "2026-09-09",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(true);

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-std-move-orig"));
      expect(bookingRow[0].slotId).toBe("slot-b");
      expect(bookingRow[0].sessionDate).toBe("2026-09-09");
    });

    it("allows collaborative move within the same full week", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 1 });

      await seedFixtureBooking(testDb, {
        id: "bk-std-same-week",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-02");

      const res = await collaborativeMoveSlot(
        "bk-std-same-week",
        "slot-b",
        "2026-09-02",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(true);

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-std-same-week"));
      expect(bookingRow[0].slotId).toBe("slot-b");
      expect(bookingRow[0].sessionDate).toBe("2026-09-02");
    });

    it("allows collaborative move into a target week with pre-lock refunded cancellation", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      await seedFixtureBooking(testDb, {
        id: "bk-std-orig-ref",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);

      // Target week 2026-W37 has a cancelled booking with refund marker on Friday 2026-09-11 in slot-c
      await seedFixtureBooking(testDb, {
        id: "bk-std-tgt-refunded",
        slotId: "slot-c",
        sessionDate: "2026-09-11",
        status: "cancelled",
      }, now);

      await testDb.insert(schema.bookingAuditLogs).values({
        id: randomUUID(),
        bookingId: "bk-std-tgt-refunded",
        groupId: "grp-q",
        actorId: "tutor-1",
        action: CANCELLED_QUOTA_REFUND_LOG_ACTION,
        summary: "Refund pre-lock cancellation",
        createdAt: now,
      });
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-09");

      const res = await collaborativeMoveSlot(
        "bk-std-orig-ref",
        "slot-b",
        "2026-09-09",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(true);

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-std-orig-ref"));
      expect(bookingRow[0].slotId).toBe("slot-b");
      expect(bookingRow[0].sessionDate).toBe("2026-09-09");
    });

    it("allows collaborative move into a target week with post-lock unrefunded cancellation", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 1, total: 15, used: 2 });

      await seedFixtureBooking(testDb, {
        id: "bk-std-orig-hangus",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);

      // Target week 2026-W37 has a post-lock unrefunded cancelled booking (hangus) on Friday 2026-09-11 in slot-c
      await seedFixtureBooking(testDb, {
        id: "bk-std-tgt-hangus",
        slotId: "slot-c",
        sessionDate: "2026-09-11",
        status: "cancelled",
      }, now);
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-09");

      const res = await collaborativeMoveSlot(
        "bk-std-orig-hangus",
        "slot-b",
        "2026-09-09",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(true);

      const bookingRow = await testDb.select().from(schema.bookings).where(eq(schema.bookings.id, "bk-std-orig-hangus"));
      expect(bookingRow[0].slotId).toBe("slot-b");
      expect(bookingRow[0].sessionDate).toBe("2026-09-09");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 8. getTutorAuthContext Spoofing Resistance
   * ──────────────────────────────────────────────────────────────────────── */
  describe("getTutorAuthContext Spoofing Resistance", () => {
    it("resists actorId spoofing when called without executor and throws UNAUTHORIZED when no session", async () => {
      let thrownError: any = null;
      try {
        await getTutorAuthContext("spoofed-tutor-id");
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.message).toBe("UNAUTHORIZED");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 9. Server Action Surface Boundary
   * ──────────────────────────────────────────────────────────────────────── */
  describe("Server Action Surface Boundary", () => {
    it("does not expose internal audit persistence helpers as public server actions", async () => {
      const actionsModule = await import("@/app/(tutor)/tutor/schedule/actions");

      // Internal audit helpers must not be exported from server actions file
      expect((actionsModule as any).recordTutorFailureAudit).toBeUndefined();
      expect((actionsModule as any).recordUnauthenticatedRejectAudit).toBeUndefined();
      expect((actionsModule as any).TutorAuditPersistenceError).toBeUndefined();
      expect((actionsModule as any).isSqliteBusyError).toBeUndefined();
      expect((actionsModule as any).FAILURE_AUDIT_ATTEMPTS).toBeUndefined();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 10. collaborativeBookSlot Quota and TOCTOU Protection
   * ──────────────────────────────────────────────────────────────────────── */
  describe("collaborativeBookSlot Quota and TOCTOU Protection", () => {
    it("does not consume package quota when booking an occupied slot across repeated attempts", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 3 });

      // Pre-occupy slot-a with an existing booking by another group
      await seedFixtureBooking(testDb, {
        id: "bk-existing-occupied",
        slotId: "slot-a",
        sessionDate: "2026-08-31",
        status: "scheduled",
      }, now);

      // Attempt 1: Try booking the occupied slot
      const res1 = await collaborativeBookSlot(
        "slot-a",
        "crs-calc",
        "grp-q",
        "2026-08-31",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res1.success).toBe(false);
      expect(res1.error).toContain("First-Come First-Served");
      expect(res1.reason).toBe("SLOT_TAKEN");

      // Verify used quota remains untouched at 3
      const [groupAfter1] = await testDb
        .select({ used: schema.groups.usedQuotaSessions })
        .from(schema.groups)
        .where(eq(schema.groups.id, "grp-q"));
      expect(groupAfter1.used).toBe(3);

      // Attempt 2: Repeat attempt on the same occupied slot
      const res2 = await collaborativeBookSlot(
        "slot-a",
        "crs-calc",
        "grp-q",
        "2026-08-31",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res2.success).toBe(false);
      expect(res2.error).toContain("First-Come First-Served");
      expect(res2.reason).toBe("SLOT_TAKEN");

      // Verify used quota is still 3
      const [groupAfter2] = await testDb
        .select({ used: schema.groups.usedQuotaSessions })
        .from(schema.groups)
        .where(eq(schema.groups.id, "grp-q"));
      expect(groupAfter2.used).toBe(3);
    });

    it("eliminates TOCTOU by verifying group membership and slot eligibility inside the transaction", async () => {
      const { testDb } = await createTestDb();
      const { now } = await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 1 });
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-02");

      // Intercept transaction to simulate concurrent membership removal right before transaction body executes
      const toctouDb = new Proxy(testDb, {
        get(target, prop, receiver) {
          if (prop === "transaction") {
            return async (cb: any) => {
              // Concurrently remove group member
              await (target as any)
                .delete(schema.groupMembers)
                .where(eq(schema.groupMembers.userId, "student-1"));
              return (target as any).transaction(cb);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      const res = await collaborativeBookSlot(
        "slot-b",
        "crs-calc",
        "grp-q",
        "2026-09-02",
        {
          actorId: "student-1",
          executor: toctouDb as any,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe("Anda bukan anggota dari kelompok belajar ini");

      // Quota must remain untouched
      const [groupRow] = await testDb
        .select({ used: schema.groups.usedQuotaSessions })
        .from(schema.groups)
        .where(eq(schema.groups.id, "grp-q"));
      expect(groupRow.used).toBe(1);

      // No booking was created
      const bookingsCount = await testDb.select().from(schema.bookings);
      expect(bookingsCount).toHaveLength(0);
    });

    it("rejects null-date legacy slots and does not invent a booking date", async () => {
      const { testDb } = await createTestDb();
      await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 0 });

      const result = await collaborativeBookSlot(
        "slot-a",
        "crs-calc",
        "grp-q",
        "2026-08-31",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe("LEGACY_SLOT_NO_DATE");
      expect(await testDb.select().from(schema.bookings)).toHaveLength(0);
    });

    it("uses the slot date as the canonical source and enforces date matching", async () => {
      const { testDb } = await createTestDb();
      await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 0 });
      await setFixtureSlotDate(testDb, "slot-b", "2026-09-02");

      const mismatch = await collaborativeBookSlot(
        "slot-b",
        "crs-calc",
        "grp-q",
        "2026-09-03",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(mismatch.success).toBe(false);
      expect(mismatch.reason).toBe("SLOT_DATE_MISMATCH");

      const booked = await collaborativeBookSlot(
        "slot-b",
        "crs-calc",
        "grp-q",
        "2026-09-02",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-25T08:00:00.000+07:00"),
        },
      );

      expect(booked.success).toBe(true);
      expect(booked.bookingId).toBeDefined();
      const bookingRows = await testDb
        .select({ sessionDate: schema.bookings.sessionDate })
        .from(schema.bookings);
      expect(bookingRows).toEqual([{ sessionDate: "2026-09-02" }]);
    });

    it("allows booking without Saturday lock restrictions", async () => {
      const { testDb } = await createTestDb();
      await seedQuotaFixture(testDb, { weekly: 2, total: 15, used: 0 });
      await setFixtureSlotDate(testDb, "slot-a", "2026-08-31");

      const result = await collaborativeBookSlot(
        "slot-a",
        "crs-calc",
        "grp-q",
        "2026-08-31",
        {
          actorId: "student-1",
          executor: testDb,
          now: new Date("2026-08-30T00:00:00.000+07:00"),
        },
      );

      expect(result.success).toBe(true);
      expect(result.bookingId).toBeDefined();
      expect(await testDb.select().from(schema.bookings)).toHaveLength(1);
    });
  });
});
