import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import {
  checkActiveGroupCourseEligibility,
  checkCanDeleteTutorSlot,
  checkCanonicalTutorAssignment,
  checkTutorSlotOwnership,
  getDeterministicGroupRepresentative,
  getIndonesianDayFromDate,
  isExactNinetyMinuteDuration,
  resolveCourseCanonicalAndLegacy,
  validateSlotDeletionPolicy,
  validateSlotDuration,
  validateSlotOwnership,
  validateSlotWeekdayDate,
} from "@/lib/schedule/tutor-policy";

const clients: Array<Awaited<ReturnType<typeof createPostgresTestDb>>["client"]> = [];
beforeAll(async () => {
  const { client } = await createPostgresTestDb();
  await client.close();
}, 60_000);
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function createTestDb() {
  const { client, testDb } = await createPostgresTestDb();
  clients.push(client);

  // Seed roles
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]);

  return { client, testDb };
}

describe("Tutor Schedule Policy Contracts", () => {
  /* ────────────────────────────────────────────────────────────────────────
   * 1. Weekday and Date Consistency
   * ──────────────────────────────────────────────────────────────────────── */
  describe("validateSlotWeekdayDate", () => {
    it("validates correct date and Indonesian weekday matches", () => {
      // 2026-08-24 is Monday (Senin)
      const resSenin = validateSlotWeekdayDate("2026-08-24", "Senin");
      expect(resSenin.isValid).toBe(true);
      expect(resSenin.actualDayOfWeek).toBe("Senin");

      // 2026-08-25 is Tuesday (Selasa)
      const resSelasa = validateSlotWeekdayDate("2026-08-25", "Selasa");
      expect(resSelasa.isValid).toBe(true);
      expect(resSelasa.actualDayOfWeek).toBe("Selasa");

      // 2026-08-26 is Wednesday (Rabu)
      const resRabu = validateSlotWeekdayDate("2026-08-26", "Rabu");
      expect(resRabu.isValid).toBe(true);
      expect(resRabu.actualDayOfWeek).toBe("Rabu");

      // 2026-08-30 is Sunday (Minggu)
      const resMinggu = validateSlotWeekdayDate("2026-08-30", "Minggu");
      expect(resMinggu.isValid).toBe(true);
      expect(resMinggu.actualDayOfWeek).toBe("Minggu");
    });

    it("rejects weekday and date mismatches", () => {
      // 2026-08-24 is Senin, but expected Selasa
      const resMismatch = validateSlotWeekdayDate("2026-08-24", "Selasa");
      expect(resMismatch.isValid).toBe(false);
      expect(resMismatch.actualDayOfWeek).toBe("Senin");
      expect(resMismatch.expectedDayOfWeek).toBe("Selasa");
      expect(resMismatch.reason).toBe("DAY_OF_WEEK_MISMATCH");
    });

    it("rejects invalid calendar dates with rollover", () => {
      const res1 = validateSlotWeekdayDate("2026-02-31", "Selasa");
      expect(res1.isValid).toBe(false);
      expect(res1.reason).toBe("INVALID_CALENDAR_DATE");

      const res2 = validateSlotWeekdayDate("2026-04-31", "Jumat");
      expect(res2.isValid).toBe(false);
      expect(res2.reason).toBe("INVALID_CALENDAR_DATE");

      const res3 = validateSlotWeekdayDate("2026-13-01", "Senin");
      expect(res3.isValid).toBe(false);
      expect(res3.reason).toBe("INVALID_CALENDAR_DATE");
    });

    it("rejects invalid date format", () => {
      const res = validateSlotWeekdayDate("2026/08/24", "Senin");
      expect(res.isValid).toBe(false);
      expect(res.reason).toBe("INVALID_DATE_FORMAT");
    });

    it("rejects invalid day name", () => {
      const res = validateSlotWeekdayDate("2026-08-24", "Monday");
      expect(res.isValid).toBe(false);
      expect(res.reason).toBe("INVALID_DAY_OF_WEEK");
    });

    it("getIndonesianDayFromDate returns exact day for Date object and string", () => {
      expect(getIndonesianDayFromDate("2026-08-24")).toBe("Senin");
      expect(getIndonesianDayFromDate("2026-08-28")).toBe("Jumat");
      expect(getIndonesianDayFromDate("2026-08-29")).toBe("Sabtu");
      expect(getIndonesianDayFromDate("2026-08-30")).toBe("Minggu");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. Exact 90-Minute Duration Validation
   * ──────────────────────────────────────────────────────────────────────── */
  describe("validateSlotDuration and isExactNinetyMinuteDuration", () => {
    it("accepts exactly 90-minute intervals", () => {
      const res1 = validateSlotDuration("09:00", "10:30");
      expect(res1.isValid).toBe(true);
      expect(res1.durationMinutes).toBe(90);

      const res2 = validateSlotDuration("13:15", "14:45");
      expect(res2.isValid).toBe(true);
      expect(res2.durationMinutes).toBe(90);

      expect(isExactNinetyMinuteDuration("09:00", "10:30")).toBe(true);
      expect(isExactNinetyMinuteDuration("19:00", "20:30")).toBe(true);
    });

    it("rejects durations shorter or longer than 90 minutes", () => {
      const resShort = validateSlotDuration("09:00", "10:00");
      expect(resShort.isValid).toBe(false);
      expect(resShort.durationMinutes).toBe(60);
      expect(resShort.reason).toBe("INVALID_DURATION_NOT_90_MINUTES");

      const resLong = validateSlotDuration("09:00", "11:00");
      expect(resLong.isValid).toBe(false);
      expect(resLong.durationMinutes).toBe(120);
      expect(resLong.reason).toBe("INVALID_DURATION_NOT_90_MINUTES");

      expect(isExactNinetyMinuteDuration("09:00", "10:00")).toBe(false);
    });

    it("rejects invalid time string formats", () => {
      const resInvalid1 = validateSlotDuration("9:0", "10:30");
      expect(resInvalid1.isValid).toBe(false);
      expect(resInvalid1.durationMinutes).toBeNull();
      expect(resInvalid1.reason).toBe("INVALID_TIME_FORMAT");

      const resInvalid2 = validateSlotDuration("24:00", "01:30");
      expect(resInvalid2.isValid).toBe(false);
      expect(resInvalid2.durationMinutes).toBeNull();
      expect(resInvalid2.reason).toBe("INVALID_TIME_FORMAT");

      const resInvalid3 = validateSlotDuration("09:00", "abc");
      expect(resInvalid3.isValid).toBe(false);
      expect(resInvalid3.durationMinutes).toBeNull();
      expect(resInvalid3.reason).toBe("INVALID_TIME_FORMAT");

      expect(isExactNinetyMinuteDuration("invalid", "10:30")).toBe(false);
      expect(isExactNinetyMinuteDuration("09:00", "24:00")).toBe(false);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 3. Deterministic Active Group Representative
   * ──────────────────────────────────────────────────────────────────────── */
  describe("getDeterministicGroupRepresentative", () => {
    it("prioritizes member with role leader", () => {
      const rep = getDeterministicGroupRepresentative([
        {
          userId: "usr-member-1",
          role: "member",
          joinedAt: new Date(1700000000000),
          user: { name: "Member One" },
        },
        {
          userId: "usr-leader-1",
          role: "leader",
          joinedAt: new Date(1700000050000),
          user: { name: "Leader One" },
        },
      ]);

      expect(rep).not.toBeNull();
      expect(rep?.userId).toBe("usr-leader-1");
      expect(rep?.role).toBe("leader");
      expect(rep?.name).toBe("Leader One");
    });

    it("breaks ties by earliest joinedAt when roles are identical", () => {
      const rep = getDeterministicGroupRepresentative([
        {
          userId: "usr-2",
          role: "member",
          joinedAt: new Date(1700000090000),
        },
        {
          userId: "usr-1",
          role: "member",
          joinedAt: new Date(1700000010000),
        },
      ]);

      expect(rep).not.toBeNull();
      expect(rep?.userId).toBe("usr-1");
    });

    it("breaks ties by lexicographical userId when joinedAt is identical", () => {
      const rep = getDeterministicGroupRepresentative([
        {
          userId: "usr-b",
          role: "member",
          joinedAt: new Date(1700000000000),
        },
        {
          userId: "usr-a",
          role: "member",
          joinedAt: new Date(1700000000000),
        },
      ]);

      expect(rep).not.toBeNull();
      expect(rep?.userId).toBe("usr-a");
    });

    it("returns null for empty member lists", () => {
      expect(getDeterministicGroupRepresentative([])).toBeNull();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 4. Tutor Slot Ownership Validation
   * ──────────────────────────────────────────────────────────────────────── */
  describe("validateSlotOwnership and checkTutorSlotOwnership", () => {
    it("validates slot ownership successfully when tutorId matches", () => {
      const res = validateSlotOwnership(
        { id: "slot-1", tutorId: "tutor-123" },
        "tutor-123",
      );
      expect(res.isOwner).toBe(true);
      expect(res.slotId).toBe("slot-1");
      expect(res.tutorId).toBe("tutor-123");
    });

    it("rejects slot ownership when tutorId differs", () => {
      const res = validateSlotOwnership(
        { id: "slot-1", tutorId: "other-tutor" },
        "tutor-123",
      );
      expect(res.isOwner).toBe(false);
      expect(res.reason).toBe("SLOT_NOT_OWNED_BY_TUTOR");
    });

    it("handles non-existent slot object", () => {
      const res = validateSlotOwnership(null, "tutor-123");
      expect(res.isOwner).toBe(false);
      expect(res.reason).toBe("SLOT_NOT_FOUND");
    });

    it("checks slot ownership in DB", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "tutor-alpha",
        name: "Tutor Alpha",
        email: "tutor.alpha@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });

      await testDb.insert(schema.tutorSlots).values({
        id: "slot-db-1",
        tutorId: "tutor-alpha",
        dayOfWeek: "Senin",
        startTime: "09:00",
        endTime: "10:30",
        mode: "online",
        createdAt: now,
      });

      const resSuccess = await checkTutorSlotOwnership(
        "slot-db-1",
        "tutor-alpha",
        testDb,
      );
      expect(resSuccess.isOwner).toBe(true);
      expect(resSuccess.slot?.id).toBe("slot-db-1");

      const resForeign = await checkTutorSlotOwnership(
        "slot-db-1",
        "tutor-other",
        testDb,
      );
      expect(resForeign.isOwner).toBe(false);
      expect(resForeign.reason).toBe("SLOT_NOT_OWNED_BY_TUTOR");

      const resNotFound = await checkTutorSlotOwnership(
        "slot-nonexistent",
        "tutor-alpha",
        testDb,
      );
      expect(resNotFound.isOwner).toBe(false);
      expect(resNotFound.reason).toBe("SLOT_NOT_FOUND");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 5. Booked-Slot Deletion Rejection Policy
   * ──────────────────────────────────────────────────────────────────────── */
  describe("validateSlotDeletionPolicy and checkCanDeleteTutorSlot", () => {
    it("allows deletion of unbooked owned slot", () => {
      const res = validateSlotDeletionPolicy({
        slot: { id: "slot-free", tutorId: "tutor-1" },
        tutorId: "tutor-1",
        existingBooking: null,
      });
      expect(res.canDelete).toBe(true);
      expect(res.slotId).toBe("slot-free");
    });

    it("rejects deletion of booked slot", () => {
      const res = validateSlotDeletionPolicy({
        slot: { id: "slot-booked", tutorId: "tutor-1" },
        tutorId: "tutor-1",
        existingBooking: { id: "booking-99", status: "scheduled" },
      });
      expect(res.canDelete).toBe(false);
      expect(res.reason).toBe("CANNOT_DELETE_BOOKED_SLOT");
      expect(res.bookingId).toBe("booking-99");
    });

    it("rejects deletion when slot is not owned by tutor", () => {
      const res = validateSlotDeletionPolicy({
        slot: { id: "slot-other", tutorId: "other-tutor" },
        tutorId: "tutor-1",
      });
      expect(res.canDelete).toBe(false);
      expect(res.reason).toBe("SLOT_NOT_OWNED_BY_TUTOR");
    });

    it("checks slot deletion policy against DB", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values([
        {
          id: "tutor-1",
          name: "Tutor One",
          email: "tutor1@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
        {
          id: "student-1",
          name: "Student One",
          email: "student1@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "student",
        },
      ]);

      await testDb.insert(schema.courses).values({
        id: "crs-1",
        title: "Kalkulus 1",
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
          id: "slot-free-db",
          tutorId: "tutor-1",
          dayOfWeek: "Senin",
          startTime: "09:00",
          endTime: "10:30",
          createdAt: now,
        },
        {
          id: "slot-booked-db",
          tutorId: "tutor-1",
          dayOfWeek: "Selasa",
          startTime: "13:00",
          endTime: "14:30",
          createdAt: now,
        },
      ]);

      await testDb.insert(schema.bookings).values({
        id: "booking-db-1",
        slotId: "slot-booked-db",
        studentId: "student-1",
        courseId: "crs-1",
        groupId: "grp-1",
        status: "scheduled",
        lastModifiedAt: now,
        bookedAt: now,
      });

      // Free slot should be deletable
      const resFree = await checkCanDeleteTutorSlot(
        "slot-free-db",
        "tutor-1",
        testDb,
      );
      expect(resFree.canDelete).toBe(true);

      // Booked slot should reject deletion
      const resBooked = await checkCanDeleteTutorSlot(
        "slot-booked-db",
        "tutor-1",
        testDb,
      );
      expect(resBooked.canDelete).toBe(false);
      expect(resBooked.reason).toBe("CANNOT_DELETE_BOOKED_SLOT");
      expect(resBooked.bookingId).toBe("booking-db-1");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 6. Canonical-to-Legacy Course Resolution
   * ──────────────────────────────────────────────────────────────────────── */
  describe("resolveCourseCanonicalAndLegacy", () => {
    it("resolves canonical course by id, code, and legacy course id", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.courses).values({
        id: "crs-fisika-1",
        title: "Fisika Dasar 1",
        category: "Fisika",
      });

      await testDb.insert(schema.mataKuliah).values({
        id: "mk-fi-1101",
        code: "FI-1101",
        title: "Fisika Dasar 1",
        status: "active",
        legacyCourseId: "crs-fisika-1",
        createdAt: now,
        updatedAt: now,
      });

      // Query by canonical ID
      const resById = await resolveCourseCanonicalAndLegacy(
        "mk-fi-1101",
        testDb,
      );
      expect(resById.found).toBe(true);
      expect(resById.canonicalCourseId).toBe("mk-fi-1101");
      expect(resById.code).toBe("FI-1101");
      expect(resById.legacyCourseId).toBe("crs-fisika-1");
      expect(resById.isActive).toBe(true);
      expect(resById.isCompatibilityFallback).toBe(false);

      // Query by code
      const resByCode = await resolveCourseCanonicalAndLegacy(
        "FI-1101",
        testDb,
      );
      expect(resByCode.found).toBe(true);
      expect(resByCode.canonicalCourseId).toBe("mk-fi-1101");

      // Query by legacyCourseId
      const resByLegacyId = await resolveCourseCanonicalAndLegacy(
        "crs-fisika-1",
        testDb,
      );
      expect(resByLegacyId.found).toBe(true);
      expect(resByLegacyId.canonicalCourseId).toBe("mk-fi-1101");
    });

    it("resolves standalone legacy course as compatibility fallback", async () => {
      const { testDb } = await createTestDb();

      await testDb.insert(schema.courses).values({
        id: "crs-kimia-legacy",
        title: "Kimia Dasar",
        category: "Kimia",
      });

      const res = await resolveCourseCanonicalAndLegacy(
        "crs-kimia-legacy",
        testDb,
      );
      expect(res.found).toBe(true);
      expect(res.canonicalCourseId).toBe("crs-kimia-legacy");
      expect(res.legacyCourseId).toBe("crs-kimia-legacy");
      expect(res.isCompatibilityFallback).toBe(true);
      expect(res.isActive).toBe(true);
    });

    it("identifies inactive canonical courses", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.mataKuliah).values({
        id: "mk-archived",
        code: "AR-9999",
        title: "Arsip Course",
        status: "archived",
        createdAt: now,
        updatedAt: now,
      });

      const res = await resolveCourseCanonicalAndLegacy("mk-archived", testDb);
      expect(res.found).toBe(true);
      expect(res.isActive).toBe(false);
      expect(res.status).toBe("archived");
      expect(res.reason).toBe("COURSE_INACTIVE");
    });

    it("returns not found for non-existent courses", async () => {
      const { testDb } = await createTestDb();
      const res = await resolveCourseCanonicalAndLegacy(
        "course-does-not-exist",
        testDb,
      );
      expect(res.found).toBe(false);
      expect(res.reason).toBe("COURSE_NOT_FOUND");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 7. Canonical Tutor Assignment
   * ──────────────────────────────────────────────────────────────────────── */
  describe("checkCanonicalTutorAssignment", () => {
    it("validates canonical tutor assignment", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "tutor-main",
        name: "Tutor Main",
        email: "tutor.main@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "tutor-main",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-main",
        penggunaId: "tutor-main",
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
        title: "Matematika 1A",
        status: "active",
        legacyCourseId: "crs-math",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-1",
        penggunaId: "tutor-main",
        mataKuliahId: "mk-math",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      const res = await checkCanonicalTutorAssignment(
        "tutor-main",
        "mk-math",
        {},
        testDb,
      );
      expect(res.isAssigned).toBe(true);
      expect(res.source).toBe("canonical_assignment");
      expect(res.isCompatibilityFallback).toBe(false);
      expect(res.courseId).toBe("mk-math");
      expect(res.legacyCourseId).toBe("crs-math");
    });

    it("falls back to legacy tutorCourses table", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "tutor-legacy",
        name: "Tutor Legacy",
        email: "tutor.legacy@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "tutor-legacy",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-leg",
        penggunaId: "tutor-legacy",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.courses).values({
        id: "crs-legacy-bio",
        title: "Biologi",
        category: "Biologi",
      });
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-bio",
        tutorId: "tutor-legacy",
        courseId: "crs-legacy-bio",
        createdAt: now,
      });

      const res = await checkCanonicalTutorAssignment(
        "tutor-legacy",
        "crs-legacy-bio",
        {},
        testDb,
      );
      expect(res.isAssigned).toBe(true);
      expect(res.source).toBe("compatibility_fallback");
      expect(res.isCompatibilityFallback).toBe(true);
    });

    it("rejects when tutor is unassigned", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "tutor-free",
        name: "Tutor Free",
        email: "tutor.free@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "tutor-free",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-free",
        penggunaId: "tutor-free",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.courses).values({
        id: "crs-unassigned",
        title: "Unassigned Course",
        category: "Matematika",
      });

      const res = await checkCanonicalTutorAssignment(
        "tutor-free",
        "crs-unassigned",
        {},
        testDb,
      );
      expect(res.isAssigned).toBe(false);
      expect(res.reason).toBe("NO_ACTIVE_ASSIGNMENT");
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 8. Active Group/Course Eligibility
   * ──────────────────────────────────────────────────────────────────────── */
  describe("checkActiveGroupCourseEligibility", () => {
    it("validates active group enrolled in course with members", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "user-leader-1",
        name: "Budi Santoso",
        email: "budi@zyx.test",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.courses).values({
        id: "crs-alg",
        title: "Aljabar Linear",
        category: "Matematika",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-alg",
        code: "MA-1201",
        title: "Aljabar Linear",
        status: "active",
        legacyCourseId: "crs-alg",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.groups).values({
        id: "grp-alpha",
        name: "Kelompok Alpha",
        status: "active",
        weeklyQuotaSessions: 2,
        totalQuotaSessions: 15,
        usedQuotaSessions: 1,
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.groupCourses).values({
        id: "gc-1",
        groupId: "grp-alpha",
        courseId: "crs-alg",
        createdAt: now,
      });

      await testDb.insert(schema.groupMembers).values({
        id: "gm-1",
        groupId: "grp-alpha",
        userId: "user-leader-1",
        role: "leader",
        joinedAt: now,
      });

      const res = await checkActiveGroupCourseEligibility(
        "grp-alpha",
        "mk-alg",
        testDb,
      );
      expect(res.isEligible).toBe(true);
      expect(res.groupId).toBe("grp-alpha");
      expect(res.groupName).toBe("Kelompok Alpha");
      expect(res.courseId).toBe("mk-alg");
      expect(res.representative?.userId).toBe("user-leader-1");
      expect(res.representative?.role).toBe("leader");
      expect(res.membersCount).toBe(1);
    });

    it("rejects inactive groups", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.courses).values({
        id: "crs-algo",
        title: "Algoritma",
        category: "Teknik Informatika",
      });

      await testDb.insert(schema.groups).values({
        id: "grp-inactive",
        name: "Kelompok Nonaktif",
        status: "inactive",
        createdAt: now,
        updatedAt: now,
      });

      const res = await checkActiveGroupCourseEligibility(
        "grp-inactive",
        "crs-algo",
        testDb,
      );
      expect(res.isEligible).toBe(false);
      expect(res.reason).toBe("GROUP_NOT_ACTIVE");
    });

    it("rejects when course is not enrolled by the group", async () => {
      const { testDb } = await createTestDb();
      const now = new Date();

      await testDb.insert(schema.courses).values([
        { id: "crs-math", title: "Matematika", category: "Matematika" },
        { id: "crs-physics", title: "Fisika", category: "Fisika" },
      ]);

      await testDb.insert(schema.groups).values({
        id: "grp-math-only",
        name: "Kelompok Matematika",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.groupCourses).values({
        id: "gc-math",
        groupId: "grp-math-only",
        courseId: "crs-math",
        createdAt: now,
      });

      const res = await checkActiveGroupCourseEligibility(
        "grp-math-only",
        "crs-physics",
        testDb,
      );
      expect(res.isEligible).toBe(false);
      expect(res.reason).toBe("GROUP_COURSE_NOT_ENROLLED");
    });
  });
});
