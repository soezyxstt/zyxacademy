import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { getTutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";

async function createTestDb() {
  const client = createClient({ url: ":memory:" });
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
    CREATE TABLE IF NOT EXISTS booking_ticket_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES booking_reschedule_tickets(id),
      sender_id TEXT NOT NULL REFERENCES user(id),
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS academic_schedules (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'official_exam',
      title TEXT NOT NULL,
      course_id TEXT REFERENCES courses(id),
      description TEXT,
      start_date INTEGER NOT NULL,
      end_date INTEGER,
      location TEXT,
      created_by_id TEXT REFERENCES user(id),
      status TEXT NOT NULL DEFAULT 'published',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

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
        lastModifiedAt: now,
        bookedAt: now,
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

    // Verify ownedSlots
    expect(result.ownedSlots).toHaveLength(2);
    const bookedSlot = result.ownedSlots.find((s) => s.id === "slot-main-booked");
    const freeSlot = result.ownedSlots.find((s) => s.id === "slot-main-free");
    expect(bookedSlot).toBeDefined();
    expect(bookedSlot?.booking?.id).toBe("booking-main-1");
    expect(bookedSlot?.booking?.topic).toBe("Regresi Linear");
    expect(freeSlot).toBeDefined();
    expect(freeSlot?.booking).toBeNull();
    expect(result.ownedSlots.some((s) => s.id === "slot-other")).toBe(false);

    // Verify ownedBookings
    expect(result.ownedBookings).toHaveLength(1);
    expect(result.ownedBookings[0].id).toBe("booking-main-1");
    expect(result.ownedBookings[0].student?.name).toBe("Student Satu");
    expect(result.ownedBookings[0].group?.name).toBe("Kelompok Statistika");

    // Verify ownedTickets
    expect(result.ownedTickets).toHaveLength(1);
    expect(result.ownedTickets[0].id).toBe("ticket-1");
    expect(result.ownedTickets[0].reason).toBe("Ada bentrok kuis praktikum");

    // Verify ownedSchedules
    expect(result.ownedSchedules).toHaveLength(1);
    expect(result.ownedSchedules[0].id).toBe("sched-pub-stat");
    expect(result.ownedSchedules[0].title).toBe("UTS Statistika");
  });
});
