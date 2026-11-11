import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { getTutorDashboardReadModel } from "@/lib/schedule/tutor-dashboard-read-model";
import { getTutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";

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

  // Seed standard peran
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]);

  return { client, testDb };
}

describe("Tutor Schedule Read-Model Contracts", () => {
  it("returns assigned active courses and derives canonical compatibility source", async () => {
    const { testDb } = await createTestDb();
    const now = new Date();

    // 1. Setup tutor
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

    // 2. Setup courses: 1 active canonical, 1 archived canonical
    await testDb.insert(schema.courses).values([
      { id: "crs-calc", title: "Kalkulus 1", category: "Matematika" },
      { id: "crs-phys", title: "Fisika 1", category: "Fisika" },
    ]);
    await testDb.insert(schema.mataKuliah).values([
      {
        id: "mk-calc",
        code: "MA-1101",
        title: "Kalkulus 1",
        status: "active",
        legacyCourseId: "crs-calc",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "mk-phys",
        code: "FI-1101",
        title: "Fisika 1",
        status: "archived",
        legacyCourseId: "crs-phys",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Assignments: 1 active, 1 archived
    await testDb.insert(schema.penugasanTutor).values([
      {
        id: "pt-1",
        penggunaId: "tutor-1",
        mataKuliahId: "mk-calc",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pt-2",
        penggunaId: "tutor-1",
        mataKuliahId: "mk-phys",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await getTutorScheduleReadModel("tutor-1", testDb);

    const dashboard = await getTutorDashboardReadModel("tutor-1", "2025-01-01", { startIso: "2025-01-01", endIso: "2025-12-31" }, testDb);
    expect(dashboard.assignedActiveCourses).toEqual(result.assignedActiveCourses);
    expect(dashboard.eligibleGroups.map((group) => group.id).sort()).toEqual(result.eligibleGroups.map((group) => group.id).sort());
    for (const group of dashboard.eligibleGroups) {
      expect(group.matchedCourseIds.sort()).toEqual(result.eligibleGroups.find((item) => item.id === group.id)!.matchedCourseIds.sort());
    }
    expect(dashboard.sessionsThisWeek).toBe(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && booking.sessionDate <= "2025-12-31" && booking.status !== "cancelled").length);
    expect(dashboard.pendingTicketCount).toBe(result.ownedTickets.filter((ticket) => ticket.status === "pending").length);
    expect(dashboard.pendingTickets.map((ticket) => ticket.id)).toEqual(result.ownedTickets.filter((ticket) => ticket.status === "pending").slice(0, 5).map((ticket) => ticket.id));
    expect(dashboard.upcomingSessions.map((booking) => booking.id)).toEqual(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && !["cancelled", "completed"].includes(booking.status)).sort((a, b) => `${a.sessionDate}-${a.startTime || "00:00"}`.localeCompare(`${b.sessionDate}-${b.startTime || "00:00"}`)).slice(0, 5).map((booking) => booking.id));


    expect(result.tutor.id).toBe("tutor-1");
    expect(result.tutor.name).toBe("Tutor Satu");
    expect(result.assignedActiveCourses).toHaveLength(1);
    expect(result.assignedActiveCourses[0].courseId).toBe("mk-calc");
    expect(result.assignedActiveCourses[0].code).toBe("MA-1101");
    expect(result.assignedActiveCourses[0].title).toBe("Kalkulus 1");
    expect(result.assignedActiveCourses[0].source).toBe("canonical_assignment");
    expect(result.assignedActiveCourses[0].isCompatibilityFallback).toBe(false);
    expect(result.compatibilitySource).toBe("canonical");
  });

  it("handles legacy fallback assignments and sets compatibility source to legacy_fallback", async () => {
    const { testDb } = await createTestDb();
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "tutor-legacy",
      name: "Tutor Legacy",
      email: "tutor.leg@zyx.test",
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
      id: "crs-chem",
      title: "Kimia Dasar",
      category: "Kimia",
    });

    await testDb.insert(schema.tutorCourses).values({
      id: "tc-chem",
      tutorId: "tutor-legacy",
      courseId: "crs-chem",
      createdAt: now,
    });

    const result = await getTutorScheduleReadModel("tutor-legacy", testDb);

    const dashboard = await getTutorDashboardReadModel("tutor-legacy", "2025-01-01", { startIso: "2025-01-01", endIso: "2025-12-31" }, testDb);
    expect(dashboard.assignedActiveCourses).toEqual(result.assignedActiveCourses);
    expect(dashboard.eligibleGroups.map((group) => group.id).sort()).toEqual(result.eligibleGroups.map((group) => group.id).sort());
    for (const group of dashboard.eligibleGroups) {
      expect(group.matchedCourseIds.sort()).toEqual(result.eligibleGroups.find((item) => item.id === group.id)!.matchedCourseIds.sort());
    }
    expect(dashboard.sessionsThisWeek).toBe(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && booking.sessionDate <= "2025-12-31" && booking.status !== "cancelled").length);
    expect(dashboard.pendingTicketCount).toBe(result.ownedTickets.filter((ticket) => ticket.status === "pending").length);
    expect(dashboard.pendingTickets.map((ticket) => ticket.id)).toEqual(result.ownedTickets.filter((ticket) => ticket.status === "pending").slice(0, 5).map((ticket) => ticket.id));
    expect(dashboard.upcomingSessions.map((booking) => booking.id)).toEqual(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && !["cancelled", "completed"].includes(booking.status)).sort((a, b) => `${a.sessionDate}-${a.startTime || "00:00"}`.localeCompare(`${b.sessionDate}-${b.startTime || "00:00"}`)).slice(0, 5).map((booking) => booking.id));


    expect(result.assignedActiveCourses).toHaveLength(1);
    expect(result.assignedActiveCourses[0].courseId).toBe("crs-chem");
    expect(result.assignedActiveCourses[0].source).toBe("compatibility_fallback");
    expect(result.assignedActiveCourses[0].isCompatibilityFallback).toBe(true);
    expect(result.compatibilitySource).toBe("legacy_fallback");
  });

  it("canonical assignment row (even suspended) blocks legacy tutor_courses fallback", async () => {
    const { testDb } = await createTestDb();
    const now = new Date();

    await testDb.insert(schema.user).values({
      id: "tutor-inactive-canon",
      name: "Tutor Inactive Canon",
      email: "tutor.inact@zyx.test",
      createdAt: now,
      updatedAt: now,
      role: "teacher",
    });
    await testDb.insert(schema.pengguna).values({
      id: "tutor-inactive-canon",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-inact",
      penggunaId: "tutor-inactive-canon",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    await testDb.insert(schema.courses).values({
      id: "crs-bio",
      title: "Biologi Dasar",
      category: "Biologi",
    });
    await testDb.insert(schema.mataKuliah).values({
      id: "mk-bio",
      code: "BI-1101",
      title: "Biologi Dasar",
      status: "active",
      legacyCourseId: "crs-bio",
      createdAt: now,
      updatedAt: now,
    });

    // Suspended canonical assignment
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-inact-1",
      penggunaId: "tutor-inactive-canon",
      mataKuliahId: "mk-bio",
      status: "suspended",
      createdAt: now,
      updatedAt: now,
    });

    // Legacy row in tutor_courses
    await testDb.insert(schema.tutorCourses).values({
      id: "tc-bio",
      tutorId: "tutor-inactive-canon",
      courseId: "crs-bio",
      createdAt: now,
    });

    const result = await getTutorScheduleReadModel("tutor-inactive-canon", testDb);

    const dashboard = await getTutorDashboardReadModel("tutor-inactive-canon", "2025-01-01", { startIso: "2025-01-01", endIso: "2025-12-31" }, testDb);
    expect(dashboard.assignedActiveCourses).toEqual(result.assignedActiveCourses);
    expect(dashboard.eligibleGroups.map((group) => group.id).sort()).toEqual(result.eligibleGroups.map((group) => group.id).sort());
    for (const group of dashboard.eligibleGroups) {
      expect(group.matchedCourseIds.sort()).toEqual(result.eligibleGroups.find((item) => item.id === group.id)!.matchedCourseIds.sort());
    }
    expect(dashboard.sessionsThisWeek).toBe(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && booking.sessionDate <= "2025-12-31" && booking.status !== "cancelled").length);
    expect(dashboard.pendingTicketCount).toBe(result.ownedTickets.filter((ticket) => ticket.status === "pending").length);
    expect(dashboard.pendingTickets.map((ticket) => ticket.id)).toEqual(result.ownedTickets.filter((ticket) => ticket.status === "pending").slice(0, 5).map((ticket) => ticket.id));
    expect(dashboard.upcomingSessions.map((booking) => booking.id)).toEqual(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && !["cancelled", "completed"].includes(booking.status)).sort((a, b) => `${a.sessionDate}-${a.startTime || "00:00"}`.localeCompare(`${b.sessionDate}-${b.startTime || "00:00"}`)).slice(0, 5).map((booking) => booking.id));


    // Canonical row exists, so fallback is blocked. Suspended canonical row means 0 assigned active courses.
    expect(result.assignedActiveCourses).toHaveLength(0);
    expect(result.compatibilitySource).toBe("canonical");
  });

  it("returns eligible active groups with deterministic representative", async () => {
    const { testDb } = await createTestDb();
    const now = new Date();

    // 1. Tutor & student users
    await testDb.insert(schema.user).values([
      {
        id: "tutor-group-test",
        name: "Tutor Group",
        email: "tutor.grp@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      },
      {
        id: "student-leader",
        name: "Ketua Kelompok",
        email: "ketua@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      },
      {
        id: "student-member",
        name: "Anggota Kelompok",
        email: "anggota@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      },
    ]);
    await testDb.insert(schema.pengguna).values({
      id: "tutor-group-test",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-grp-tutor",
      penggunaId: "tutor-group-test",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    });

    // 2. Courses
    await testDb.insert(schema.courses).values([
      { id: "crs-prog", title: "Pemrograman Dasar", category: "Teknik Informatika" },
      { id: "crs-other", title: "Mata Kuliah Lain", category: "Matematika" },
    ]);
    await testDb.insert(schema.mataKuliah).values({
      id: "mk-prog",
      code: "IF-1101",
      title: "Pemrograman Dasar",
      status: "active",
      legacyCourseId: "crs-prog",
      createdAt: now,
      updatedAt: now,
    });

    // Tutor assignment to mk-prog
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-prog",
      penggunaId: "tutor-group-test",
      mataKuliahId: "mk-prog",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // 3. Groups: 1 active eligible group, 1 inactive group, 1 group with other course
    await testDb.insert(schema.groups).values([
      {
        id: "grp-eligible",
        name: "Kelompok Coding",
        status: "active",
        weeklyQuotaSessions: 2,
        totalQuotaSessions: 15,
        usedQuotaSessions: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "grp-inactive",
        name: "Kelompok Pasif",
        status: "inactive",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "grp-other-course",
        name: "Kelompok Lain",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Group courses join
    await testDb.insert(schema.groupCourses).values([
      { id: "gc-1", groupId: "grp-eligible", courseId: "crs-prog", createdAt: now },
      { id: "gc-2", groupId: "grp-inactive", courseId: "crs-prog", createdAt: now },
      { id: "gc-3", groupId: "grp-other-course", courseId: "crs-other", createdAt: now },
    ]);

    // Group members for grp-eligible
    await testDb.insert(schema.groupMembers).values([
      {
        id: "gm-member",
        groupId: "grp-eligible",
        userId: "student-member",
        role: "member",
        joinedAt: new Date(1700000000000),
      },
      {
        id: "gm-leader",
        groupId: "grp-eligible",
        userId: "student-leader",
        role: "leader",
        joinedAt: new Date(1700000050000),
      },
    ]);

    const result = await getTutorScheduleReadModel("tutor-group-test", testDb);

    const dashboard = await getTutorDashboardReadModel("tutor-group-test", "2025-01-01", { startIso: "2025-01-01", endIso: "2025-12-31" }, testDb);
    expect(dashboard.assignedActiveCourses).toEqual(result.assignedActiveCourses);
    expect(dashboard.eligibleGroups.map((group) => group.id).sort()).toEqual(result.eligibleGroups.map((group) => group.id).sort());
    for (const group of dashboard.eligibleGroups) {
      expect(group.matchedCourseIds.sort()).toEqual(result.eligibleGroups.find((item) => item.id === group.id)!.matchedCourseIds.sort());
    }
    expect(dashboard.sessionsThisWeek).toBe(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && booking.sessionDate <= "2025-12-31" && booking.status !== "cancelled").length);
    expect(dashboard.pendingTicketCount).toBe(result.ownedTickets.filter((ticket) => ticket.status === "pending").length);
    expect(dashboard.pendingTickets.map((ticket) => ticket.id)).toEqual(result.ownedTickets.filter((ticket) => ticket.status === "pending").slice(0, 5).map((ticket) => ticket.id));
    expect(dashboard.upcomingSessions.map((booking) => booking.id)).toEqual(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && !["cancelled", "completed"].includes(booking.status)).sort((a, b) => `${a.sessionDate}-${a.startTime || "00:00"}`.localeCompare(`${b.sessionDate}-${b.startTime || "00:00"}`)).slice(0, 5).map((booking) => booking.id));


    expect(result.eligibleGroups).toHaveLength(1);
    expect(result.eligibleGroups[0].id).toBe("grp-eligible");
    expect(result.eligibleGroups[0].name).toBe("Kelompok Coding");
    expect(result.eligibleGroups[0].membersCount).toBe(2);
    expect(result.eligibleGroups[0].representative?.userId).toBe("student-leader");
    expect(result.eligibleGroups[0].representative?.role).toBe("leader");
    expect(result.eligibleGroups[0].representative?.name).toBe("Ketua Kelompok");
  });

  it("returns owned slots, bookings, tickets, and published academic schedules with strict ownership isolation", async () => {
    const { testDb } = await createTestDb();
    const now = new Date();

    // 1. Tutors and students
    await testDb.insert(schema.user).values([
      {
        id: "tutor-main",
        name: "Tutor Utama",
        email: "tutor.main@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      },
      {
        id: "tutor-other",
        name: "Tutor Lain",
        email: "tutor.other@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      },
      {
        id: "student-1",
        name: "Student Satu",
        email: "student1@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      },
    ]);
    await testDb.insert(schema.pengguna).values([
      { id: "tutor-main", status: "active", createdAt: now, updatedAt: now },
      { id: "tutor-other", status: "active", createdAt: now, updatedAt: now },
    ]);
    await testDb.insert(schema.penggunaPeran).values([
      { id: "pp-m", penggunaId: "tutor-main", peranId: "peran-tutor", source: "seed", createdAt: now },
      { id: "pp-o", penggunaId: "tutor-other", peranId: "peran-tutor", source: "seed", createdAt: now },
    ]);

    // 2. Course & Group
    await testDb.insert(schema.courses).values([
      {
        id: "crs-stat",
        title: "Statistika",
        category: "Matematika",
      },
      {
        id: "crs-unrelated",
        title: "Biologi Umum",
        category: "Biologi",
      },
    ]);
    await testDb.insert(schema.mataKuliah).values({
      id: "mk-stat",
      code: "MA-2081",
      title: "Statistika",
      status: "active",
      legacyCourseId: "crs-stat",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(schema.penugasanTutor).values({
      id: "pt-stat",
      penggunaId: "tutor-main",
      mataKuliahId: "mk-stat",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await testDb.insert(schema.groups).values({
      id: "grp-stat-1",
      name: "Kelompok Statistika",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // 3. Slots: 1 slot for tutor-main (booked), 1 slot for tutor-main (free), 1 slot for tutor-other
    await testDb.insert(schema.tutorSlots).values([
      {
        id: "slot-main-booked",
        tutorId: "tutor-main",
        dayOfWeek: "Senin",
        startTime: "09:00",
        endTime: "10:30",
        mode: "online",
        createdAt: now,
      },
      {
        id: "slot-main-free",
        tutorId: "tutor-main",
        dayOfWeek: "Rabu",
        startTime: "13:00",
        endTime: "14:30",
        mode: "offline",
        location: "Ruang 101",
        createdAt: now,
      },
      {
        id: "slot-other",
        tutorId: "tutor-other",
        dayOfWeek: "Jumat",
        startTime: "15:00",
        endTime: "16:30",
        mode: "online",
        createdAt: now,
      },
    ]);

    // 4. Bookings: 1 for tutor-main, 1 for tutor-other
    await testDb.insert(schema.bookings).values([
      {
        id: "booking-main-1",
        slotId: "slot-main-booked",
        studentId: "student-1",
        courseId: "crs-stat",
        groupId: "grp-stat-1",
        status: "scheduled",
        sessionDate: "2026-08-24",
        startTime: "09:00",
        endTime: "10:30",
        mode: "online",
        topic: "Regresi Linear",
        preSessionAttachments: [
          {
            id: "legacy-pre",
            name: "Catatan lama.pdf",
            url: "https://legacy.test/pre.pdf",
            uploadedBy: "student-1",
            uploadedByName: "Student Satu",
            uploadedAt: now.toISOString(),
          },
        ],
        postSessionLinkUrl: "https://legacy.test/post",
        postSessionLinkTitle: "Link lama",
        lastModifiedAt: now,
        bookedAt: now,
      },
      {
        id: "booking-main-cancelled",
        slotId: "slot-main-booked",
        studentId: "student-1",
        courseId: "crs-stat",
        groupId: "grp-stat-1",
        status: "cancelled",
        postSessionLinkUrl: "https://legacy.test/cancelled",
        lastModifiedAt: now,
        bookedAt: new Date(now.getTime() - 60_000),
      },
      {
        id: "booking-other-1",
        slotId: "slot-other",
        studentId: "student-1",
        courseId: "crs-unrelated",
        groupId: "grp-stat-1",
        status: "scheduled",
        sessionDate: "2026-08-28",
        startTime: "15:00",
        endTime: "16:30",
        mode: "online",
        topic: "Topik Lain",
        lastModifiedAt: now,
        bookedAt: now,
      },
    ]);

    await testDb.insert(schema.bookingResources).values([
      {
        id: "resource-pre",
        bookingId: "booking-main-1",
        phase: "pre",
        kind: "file",
        label: "Soal terbaru.pdf",
        url: "https://files.test/pre.pdf",
        fileName: "Soal terbaru.pdf",
        mimeType: "application/pdf",
        sizeBytes: 120,
        createdById: "student-1",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "resource-post",
        bookingId: "booking-main-1",
        phase: "post",
        kind: "link",
        label: "Ringkasan terbaru",
        url: "https://notes.test/post",
        createdById: "tutor-main",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 5. Reschedule tickets: 1 for tutor-main, 1 for tutor-other
    await testDb.insert(schema.bookingRescheduleTickets).values([
      {
        id: "ticket-1",
        bookingId: "booking-main-1",
        groupId: "grp-stat-1",
        requestedById: "student-1",
        tutorId: "tutor-main",
        type: "reschedule",
        status: "pending",
        reason: "Ada bentrok kuis praktikum",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "ticket-other",
        bookingId: "booking-other-1",
        groupId: "grp-stat-1",
        requestedById: "student-1",
        tutorId: "tutor-other",
        type: "cancellation",
        status: "pending",
        reason: "Tiket tutor lain",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 6. Academic schedules: 1 published for mk-stat, 1 draft for mk-stat, 1 published for other course
    await testDb.insert(schema.academicSchedules).values([
      {
        id: "sched-pub-stat",
        type: "official_exam",
        title: "UTS Statistika",
        courseId: "crs-stat",
        startDate: now,
        status: "published",
        createdById: "tutor-main",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "sched-draft-stat",
        type: "quiz",
        title: "Draft Kuis Statistika",
        courseId: "crs-stat",
        startDate: now,
        status: "draft",
        createdById: "tutor-main",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "sched-other-course",
        type: "official_exam",
        title: "UTS Biologi",
        courseId: "crs-unrelated",
        startDate: now,
        status: "published",
        createdById: "tutor-other",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await getTutorScheduleReadModel("tutor-main", testDb);

    const dashboard = await getTutorDashboardReadModel("tutor-main", "2025-01-01", { startIso: "2025-01-01", endIso: "2025-12-31" }, testDb);
    expect(dashboard.assignedActiveCourses).toEqual(result.assignedActiveCourses);
    expect(dashboard.eligibleGroups.map((group) => group.id).sort()).toEqual(result.eligibleGroups.map((group) => group.id).sort());
    for (const group of dashboard.eligibleGroups) {
      expect(group.matchedCourseIds.sort()).toEqual(result.eligibleGroups.find((item) => item.id === group.id)!.matchedCourseIds.sort());
    }
    expect(dashboard.sessionsThisWeek).toBe(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && booking.sessionDate <= "2025-12-31" && booking.status !== "cancelled").length);
    expect(dashboard.pendingTicketCount).toBe(result.ownedTickets.filter((ticket) => ticket.status === "pending").length);
    expect(dashboard.pendingTickets.map((ticket) => ticket.id)).toEqual(result.ownedTickets.filter((ticket) => ticket.status === "pending").slice(0, 5).map((ticket) => ticket.id));
    expect(dashboard.upcomingSessions.map((booking) => booking.id)).toEqual(result.ownedBookings.filter((booking) => booking.sessionDate && booking.sessionDate >= "2025-01-01" && !["cancelled", "completed"].includes(booking.status)).sort((a, b) => `${a.sessionDate}-${a.startTime || "00:00"}`.localeCompare(`${b.sessionDate}-${b.startTime || "00:00"}`)).slice(0, 5).map((booking) => booking.id));


    // Verify ownedSlots
    expect(result.ownedSlots).toHaveLength(2);
    const bookedSlot = result.ownedSlots.find((s) => s.id === "slot-main-booked");
    const freeSlot = result.ownedSlots.find((s) => s.id === "slot-main-free");
    expect(bookedSlot).toBeDefined();
    expect(bookedSlot?.booking?.id).toBe("booking-main-1");
    expect(bookedSlot?.booking?.topic).toBe("Regresi Linear");
    expect(bookedSlot?.booking?.preSessionResources.map((resource) => resource.url)).toEqual([
      "https://files.test/pre.pdf",
      "https://legacy.test/pre.pdf",
    ]);
    expect(bookedSlot?.booking?.postSessionResources.map((resource) => resource.url)).toEqual([
      "https://notes.test/post",
      "https://legacy.test/post",
    ]);
    expect(freeSlot).toBeDefined();
    expect(freeSlot?.booking).toBeNull();
    expect(result.ownedSlots.some((s) => s.id === "slot-other")).toBe(false);

    // Verify ownedBookings
    expect(result.ownedBookings).toHaveLength(2);
    const cancelled = result.ownedBookings.find((booking) => booking.id === "booking-main-cancelled");
    expect(cancelled?.resources.map((resource) => resource.url)).toEqual(["https://legacy.test/cancelled"]);
    expect(result.ownedBookings[0].id).toBe("booking-main-1");
    expect(result.ownedBookings[0].student?.name).toBe("Student Satu");
    expect(result.ownedBookings[0].group?.name).toBe("Kelompok Statistika");
    expect(result.ownedBookings[0].resources).toHaveLength(4);
    expect(result.ownedBookings[0].preSessionResources).toHaveLength(2);
    expect(result.ownedBookings[0].postSessionResources).toHaveLength(2);

    // Verify ownedTickets
    expect(result.ownedTickets).toHaveLength(1);
    expect(result.ownedTickets[0].id).toBe("ticket-1");
    expect(result.ownedTickets[0].reason).toBe("Ada bentrok kuis praktikum");

    // Verify ownedSchedules
    expect(result.ownedSchedules).toHaveLength(1);
    expect(result.ownedSchedules[0].id).toBe("sched-pub-stat");
    expect(result.ownedSchedules[0].title).toBe("UTS Statistika");

    await testDb.insert(schema.academicSchedules).values([
      { id: "range-owned", type: "quiz", title: "In range", courseId: "crs-stat", startDate: new Date("2030-01-09T05:00:00Z"), status: "published", createdById: "tutor-main", createdAt: now, updatedAt: now },
      { id: "range-unrelated", type: "quiz", title: "Other course", courseId: "crs-unrelated", startDate: new Date("2030-01-09T05:00:00Z"), status: "published", createdById: "tutor-other", createdAt: now, updatedAt: now },
      { id: "range-before", type: "quiz", title: "Before range", courseId: "crs-stat", startDate: new Date("2030-01-01T05:00:00Z"), status: "published", createdById: "tutor-main", createdAt: now, updatedAt: now },
      { id: "range-after", type: "quiz", title: "After range", courseId: "crs-stat", startDate: new Date("2030-02-01T05:00:00Z"), status: "published", createdById: "tutor-main", createdAt: now, updatedAt: now },
      { id: "range-overlap", type: "quiz", title: "Overlaps range", courseId: "crs-stat", startDate: new Date("2030-01-01T05:00:00Z"), endDate: new Date("2030-01-10T05:00:00Z"), status: "published", createdById: "tutor-main", createdAt: now, updatedAt: now },
    ]);
    const ranged = await getTutorScheduleReadModel({ tutorId: "tutor-main", fromDate: "2030-01-07", toDate: "2030-01-13" }, testDb);
    expect(ranged.ownedSchedules.map((schedule) => schedule.id).sort()).toEqual(["range-overlap", "range-owned"]);

  });
});
