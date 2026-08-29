import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { getTutorCourseParticipants } from "@/lib/tutor/participant-read-model";

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
      legacy_course_id TEXT,
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
      course_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL,
      enrolled_at INTEGER,
      expires_at INTEGER NOT NULL
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
      course_id TEXT NOT NULL,
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

  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]);

  return { client, testDb };
}

describe("Course-scoped tutor participants read model", () => {
  it("enforces canonical tutor assignment and rejects unauthorized access", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();

      // Setup course
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-kalkulus",
        code: "MA-1101",
        title: "Kalkulus 1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // User without assignment
      await testDb.insert(schema.user).values({
        id: "usr-stranger",
        name: "Stranger User",
        email: "stranger@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-stranger",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // Reject unauthorized user
      await expect(
        getTutorCourseParticipants("usr-stranger", "mk-kalkulus", { allowAdmin: false }, testDb),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED");
    } finally {
      client.close();
    }
  });

  it("returns active participants and active groups linked to the course", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      const futureDate = new Date(Date.now() + 30 * 86_400_000);
      const pastDate = new Date(Date.now() - 30 * 86_400_000);

      // Course & legacy course
      await testDb.insert(schema.courses).values({
        id: "crs-calc",
        title: "Kalkulus 1",
        category: "Matematika",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-kalkulus",
        code: "MA-1101",
        title: "Kalkulus 1",
        status: "active",
        legacyCourseId: "crs-calc",
        createdAt: now,
        updatedAt: now,
      });

      // Tutor
      await testDb.insert(schema.user).values({
        id: "usr-tutor",
        name: "Tutor Kalkulus",
        email: "tutor.kalkulus@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-tutor",
        penggunaId: "usr-tutor",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-kalkulus",
        penggunaId: "usr-tutor",
        mataKuliahId: "mk-kalkulus",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Student 1: Direct Active Enrollment
      await testDb.insert(schema.user).values({
        id: "std-1",
        name: "Alice Active",
        email: "alice@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "std-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.enrollments).values({
        id: "enr-1",
        userId: "std-1",
        courseId: "mk-kalkulus",
        enrolledAt: now,
        expiresAt: futureDate,
      });

      // Student 2: Direct Expired Enrollment (must be excluded)
      await testDb.insert(schema.user).values({
        id: "std-2",
        name: "Bob Expired",
        email: "bob@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "std-2",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.enrollments).values({
        id: "enr-2",
        userId: "std-2",
        courseId: "mk-kalkulus",
        enrolledAt: pastDate,
        expiresAt: pastDate,
      });

      // Student 3: Inactive User (must be excluded)
      await testDb.insert(schema.user).values({
        id: "std-3",
        name: "Charlie Inactive",
        email: "charlie@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "std-3",
        status: "suspended",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.enrollments).values({
        id: "enr-3",
        userId: "std-3",
        courseId: "mk-kalkulus",
        enrolledAt: now,
        expiresAt: futureDate,
      });

      // Student 4: Group Member (Leader)
      await testDb.insert(schema.user).values({
        id: "std-4",
        name: "David Leader",
        email: "david@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "std-4",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // Student 5: Both Direct Enrollment and Group Member
      await testDb.insert(schema.user).values({
        id: "std-5",
        name: "Eva Both",
        email: "eva@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "std-5",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.enrollments).values({
        id: "enr-5",
        userId: "std-5",
        courseId: "mk-kalkulus",
        enrolledAt: now,
        expiresAt: futureDate,
      });

      // Group 1: Active Group linked to course
      await testDb.insert(schema.groups).values({
        id: "grp-alpha",
        name: "Kelompok Alpha",
        packageType: "reguler_15",
        packageName: "Paket Reguler (15 Sesi)",
        totalQuotaSessions: 15,
        usedQuotaSessions: 3,
        weeklyQuotaSessions: 2,
        academicYear: "2026/2027",
        semester: "Ganjil",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.groupCourses).values({
        id: "gc-1",
        groupId: "grp-alpha",
        courseId: "mk-kalkulus",
        createdAt: now,
      });
      await testDb.insert(schema.groupMembers).values([
        {
          id: "gm-1",
          groupId: "grp-alpha",
          userId: "std-4",
          role: "leader",
          joinedAt: now,
        },
        {
          id: "gm-2",
          groupId: "grp-alpha",
          userId: "std-5",
          role: "member",
          joinedAt: now,
        },
      ]);

      // Group 2: Inactive Group (must be excluded)
      await testDb.insert(schema.groups).values({
        id: "grp-inactive",
        name: "Kelompok Nonaktif",
        packageType: "reguler_15",
        packageName: "Paket Reguler (15 Sesi)",
        totalQuotaSessions: 15,
        usedQuotaSessions: 15,
        weeklyQuotaSessions: 2,
        academicYear: "2026/2027",
        semester: "Ganjil",
        status: "inactive",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.groupCourses).values({
        id: "gc-2",
        groupId: "grp-inactive",
        courseId: "mk-kalkulus",
        createdAt: now,
      });

      // Fetch participants payload
      const result = await getTutorCourseParticipants(
        "usr-tutor",
        "mk-kalkulus",
        { allowAdmin: false },
        testDb,
      );

      // Verify course metadata
      expect(result.course.title).toBe("Kalkulus 1");
      expect(result.course.code).toBe("MA-1101");
      expect(result.course.accessSource).toBe("canonical_assignment");

      // Verify summary counts
      expect(result.summary.totalParticipants).toBe(3); // Alice, David, Eva
      expect(result.summary.directEnrollmentsCount).toBe(2); // Alice, Eva
      expect(result.summary.groupParticipantsCount).toBe(2); // David, Eva
      expect(result.summary.activeGroupsCount).toBe(1); // Kelompok Alpha

      // Verify participants list
      const names = result.participants.map((p) => p.name);
      expect(names).toEqual(["Alice Active", "David Leader", "Eva Both"]);

      const alice = result.participants.find((p) => p.userId === "std-1");
      expect(alice?.enrollmentType).toBe("direct");
      expect(alice?.groups.length).toBe(0);

      const david = result.participants.find((p) => p.userId === "std-4");
      expect(david?.enrollmentType).toBe("group");
      expect(david?.groups.length).toBe(1);
      expect(david?.groups[0].name).toBe("Kelompok Alpha");
      expect(david?.groups[0].role).toBe("leader");

      const eva = result.participants.find((p) => p.userId === "std-5");
      expect(eva?.enrollmentType).toBe("both");
      expect(eva?.groups.length).toBe(1);
      expect(eva?.groups[0].name).toBe("Kelompok Alpha");
      expect(eva?.groups[0].role).toBe("member");

      // Verify groups list
      expect(result.groups.length).toBe(1);
      const alpha = result.groups[0];
      expect(alpha.name).toBe("Kelompok Alpha");
      expect(alpha.membersCount).toBe(2);
      expect(alpha.representative?.userId).toBe("std-4");
      expect(alpha.representative?.role).toBe("leader");
    } finally {
      client.close();
    }
  });

  it("strictly scopes participants to the requested course", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      const futureDate = new Date(Date.now() + 30 * 86_400_000);

      // Course 1 & Course 2
      await testDb.insert(schema.mataKuliah).values([
        {
          id: "mk-fisika",
          code: "FI-1101",
          title: "Fisika Dasar 1",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "mk-kimia",
          code: "KI-1101",
          title: "Kimia Dasar 1",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Tutor assigned only to Fisika
      await testDb.insert(schema.user).values({
        id: "usr-tutor-fi",
        name: "Tutor Fisika",
        email: "tutor.fi@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-fi",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-tutor-fi",
        penggunaId: "usr-tutor-fi",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-fi",
        penggunaId: "usr-tutor-fi",
        mataKuliahId: "mk-fisika",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Participant in Kimia only
      await testDb.insert(schema.user).values({
        id: "std-kimia",
        name: "Kimia Student",
        email: "kimia.student@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "std-kimia",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.enrollments).values({
        id: "enr-ki",
        userId: "std-kimia",
        courseId: "mk-kimia",
        enrolledAt: now,
        expiresAt: futureDate,
      });

      // Fetch participants for Fisika
      const result = await getTutorCourseParticipants(
        "usr-tutor-fi",
        "mk-fisika",
        { allowAdmin: false },
        testDb,
      );

      expect(result.summary.totalParticipants).toBe(0);
      expect(result.participants.length).toBe(0);
      expect(result.groups.length).toBe(0);
    } finally {
      client.close();
    }
  });

  it("deduplicates direct active enrollments by user for both participant list and summary KPI", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      const futureDate1 = new Date(Date.now() + 15 * 86_400_000);
      const futureDate2 = new Date(Date.now() + 30 * 86_400_000);

      await testDb.insert(schema.mataKuliah).values({
        id: "mk-kalkulus",
        code: "MA-1101",
        title: "Kalkulus 1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.user).values({
        id: "usr-tutor",
        name: "Tutor Kalkulus",
        email: "tutor@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-tutor",
        penggunaId: "usr-tutor",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-kalkulus",
        penggunaId: "usr-tutor",
        mataKuliahId: "mk-kalkulus",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Student with multiple active direct enrollment rows
      await testDb.insert(schema.user).values({
        id: "std-multi-enr",
        name: "Student Multi",
        email: "multi@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "std-multi-enr",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.enrollments).values([
        {
          id: "enr-1",
          userId: "std-multi-enr",
          courseId: "mk-kalkulus",
          enrolledAt: now,
          expiresAt: futureDate1,
        },
        {
          id: "enr-2",
          userId: "std-multi-enr",
          courseId: "mk-kalkulus",
          enrolledAt: now,
          expiresAt: futureDate2,
        },
      ]);

      const result = await getTutorCourseParticipants(
        "usr-tutor",
        "mk-kalkulus",
        { allowAdmin: false },
        testDb,
      );

      // Verify deduplication: directEnrollmentsCount is 1, not 2
      expect(result.summary.directEnrollmentsCount).toBe(1);
      expect(result.summary.totalParticipants).toBe(1);
      expect(result.participants.length).toBe(1);
      expect(result.participants[0].userId).toBe("std-multi-enr");
      expect(result.participants[0].enrollmentType).toBe("direct");
      expect(Math.floor((result.participants[0].expiresAt?.getTime() ?? 0) / 1000)).toBe(
        Math.floor(futureDate2.getTime() / 1000),
      );
    } finally {
      client.close();
    }
  });

  it("deduplicates group memberships by (groupId, userId) for member count, representative, and badges", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      const earlierDate = new Date(Date.now() - 5 * 86_400_000);

      await testDb.insert(schema.mataKuliah).values({
        id: "mk-kalkulus",
        code: "MA-1101",
        title: "Kalkulus 1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.user).values({
        id: "usr-tutor",
        name: "Tutor Kalkulus",
        email: "tutor@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-tutor",
        penggunaId: "usr-tutor",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-kalkulus",
        penggunaId: "usr-tutor",
        mataKuliahId: "mk-kalkulus",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Group student
      await testDb.insert(schema.user).values({
        id: "std-grp-user",
        name: "Group Member",
        email: "grp@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "std-grp-user",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.groups).values({
        id: "grp-1",
        name: "Kelompok Beta",
        packageType: "reguler_15",
        packageName: "Paket Reguler (15 Sesi)",
        totalQuotaSessions: 15,
        usedQuotaSessions: 2,
        weeklyQuotaSessions: 2,
        academicYear: "2026/2027",
        semester: "Ganjil",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.groupCourses).values({
        id: "gc-1",
        groupId: "grp-1",
        courseId: "mk-kalkulus",
        createdAt: now,
      });

      // Duplicate group member rows for same user in same group (one member, one leader)
      await testDb.insert(schema.groupMembers).values([
        {
          id: "gm-dup-1",
          groupId: "grp-1",
          userId: "std-grp-user",
          role: "member",
          joinedAt: now,
        },
        {
          id: "gm-dup-2",
          groupId: "grp-1",
          userId: "std-grp-user",
          role: "leader",
          joinedAt: earlierDate,
        },
      ]);

      const result = await getTutorCourseParticipants(
        "usr-tutor",
        "mk-kalkulus",
        { allowAdmin: false },
        testDb,
      );

      // Verify group member count is deduplicated to 1
      expect(result.summary.groupParticipantsCount).toBe(1);
      expect(result.summary.totalParticipants).toBe(1);
      expect(result.groups.length).toBe(1);
      expect(result.groups[0].membersCount).toBe(1);
      expect(result.groups[0].members.length).toBe(1);
      expect(result.groups[0].members[0].role).toBe("leader");
      expect(result.groups[0].representative?.userId).toBe("std-grp-user");
      expect(result.groups[0].representative?.role).toBe("leader");

      // Verify participant badges/groups array has exactly 1 entry for this group
      expect(result.participants.length).toBe(1);
      expect(result.participants[0].groups.length).toBe(1);
      expect(result.participants[0].groups[0].name).toBe("Kelompok Beta");
      expect(result.participants[0].groups[0].role).toBe("leader");
    } finally {
      client.close();
    }
  });
});
