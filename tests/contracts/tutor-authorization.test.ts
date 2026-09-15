import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import {
  checkTutorCourseAccess,
  listTutorAccessibleCourses,
  requireTutorCourseAccess,
  resolveTutorCourseAccess,
} from "@/lib/auth/tutor-access";
import { resolveActorRoles } from "@/lib/tutor/assessment-policy";
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
      is_demo INTEGER NOT NULL DEFAULT 0,
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

  // Seed standard peran
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]);

  return { client, testDb };
}

describe("Canonical Tutor Course Access and Fallback", () => {
  it("resolves canonical tutor access using active penugasan_tutor and canonical course id", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-1",
        name: "Tutor Satu",
        email: "tutor1@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-1",
        penggunaId: "usr-tutor-1",
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
        penggunaId: "usr-tutor-1",
        mataKuliahId: "mk-calc",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Query by canonical mata_kuliah ID
      const resultCanonical = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-1", courseId: "mk-calc" },
        testDb,
      );
      expect(resultCanonical.hasAccess).toBe(true);
      expect(resultCanonical.source).toBe("canonical_assignment");
      expect(resultCanonical.isCompatibilityFallback).toBe(false);
      expect(resultCanonical.courseId).toBe("mk-calc");
      expect(resultCanonical.legacyCourseId).toBe("crs-calc");

      // Query by legacy course ID
      const resultLegacy = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-1", courseId: "crs-calc" },
        testDb,
      );
      expect(resultLegacy.hasAccess).toBe(true);
      expect(resultLegacy.source).toBe("canonical_assignment");
      expect(resultLegacy.isCompatibilityFallback).toBe(false);
      expect(resultLegacy.courseId).toBe("mk-calc");
      expect(resultLegacy.legacyCourseId).toBe("crs-calc");
    } finally {
      client.close();
    }
  });

  it("denies admin override by default when allowAdmin is omitted or false, and permits only when explicitly true", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-admin-1",
        name: "Admin Satu",
        email: "admin1@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "admin",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-admin-1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-admin",
        penggunaId: "usr-admin-1",
        peranId: "peran-admin",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.mataKuliah).values([
        {
          id: "mk-physics",
          code: "FI-1101",
          title: "Fisika Dasar 1",
          status: "active",
          legacyCourseId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "mk-archived",
          code: "FI-9999",
          title: "Fisika Lama",
          status: "archived",
          legacyCourseId: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // 1. Omitted allowAdmin option: defaults to false (denied)
      const resultOmitted = await checkTutorCourseAccess(
        "usr-admin-1",
        "mk-physics",
        undefined,
        testDb,
      );
      expect(resultOmitted.hasAccess).toBe(false);
      expect(resultOmitted.reason).toBe("ROLE_NOT_AUTHORIZED");

      const resultOmittedInput = await resolveTutorCourseAccess(
        { penggunaId: "usr-admin-1", courseId: "mk-physics" },
        testDb,
      );
      expect(resultOmittedInput.hasAccess).toBe(false);
      expect(resultOmittedInput.reason).toBe("ROLE_NOT_AUTHORIZED");

      // 2. Explicit allowAdmin: false (denied)
      const resultBlocked = await checkTutorCourseAccess(
        "usr-admin-1",
        "mk-physics",
        { allowAdmin: false },
        testDb,
      );
      expect(resultBlocked.hasAccess).toBe(false);
      expect(resultBlocked.reason).toBe("ROLE_NOT_AUTHORIZED");

      // 3. Explicit allowAdmin: true (permitted)
      const resultAdmin = await checkTutorCourseAccess(
        "usr-admin-1",
        "mk-physics",
        { allowAdmin: true },
        testDb,
      );
      expect(resultAdmin.hasAccess).toBe(true);
      expect(resultAdmin.source).toBe("admin_override");
      expect(resultAdmin.isCompatibilityFallback).toBe(false);
      expect(resultAdmin.courseId).toBe("mk-physics");

      // 4. listTutorAccessibleCourses with omitted allowAdmin returns empty for pure admin
      const adminListDefault = await listTutorAccessibleCourses("usr-admin-1", {}, testDb);
      expect(adminListDefault).toEqual([]);

      // 5. listTutorAccessibleCourses with allowAdmin: true returns active courses only (excludes archived)
      const adminListOptIn = await listTutorAccessibleCourses(
        "usr-admin-1",
        { allowAdmin: true },
        testDb,
      );
      expect(adminListOptIn.length).toBe(1);
      expect(adminListOptIn[0].courseId).toBe("mk-physics");
      expect(adminListOptIn[0].source).toBe("admin_override");
    } finally {
      client.close();
    }
  });

  it("uses tutor_courses strictly as an explicitly reported compatibility fallback", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-legacy",
        name: "Legacy Tutor",
        email: "legacytutor@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-legacy",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-legacy",
        penggunaId: "usr-tutor-legacy",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.courses).values({
        id: "crs-chem",
        title: "Kimia Dasar 1",
        category: "Kimia",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-chem",
        code: "KI-1101",
        title: "Kimia Dasar 1",
        status: "active",
        legacyCourseId: "crs-chem",
        createdAt: now,
        updatedAt: now,
      });
      // Legacy tutor_courses assignment only (no penugasan_tutor)
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-1",
        tutorId: "usr-tutor-legacy",
        courseId: "crs-chem",
        createdAt: now,
      });

      const result = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-legacy", courseId: "crs-chem" },
        testDb,
      );
      expect(result.hasAccess).toBe(true);
      expect(result.source).toBe("compatibility_fallback");
      expect(result.isCompatibilityFallback).toBe(true);
      expect(result.courseId).toBe("mk-chem");
      expect(result.legacyCourseId).toBe("crs-chem");

      // When canonical assignment is added, it takes precedence
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-chem",
        penggunaId: "usr-tutor-legacy",
        mataKuliahId: "mk-chem",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      const resultPrecedence = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-legacy", courseId: "crs-chem" },
        testDb,
      );
      expect(resultPrecedence.hasAccess).toBe(true);
      expect(resultPrecedence.source).toBe("canonical_assignment");
      expect(resultPrecedence.isCompatibilityFallback).toBe(false);
    } finally {
      client.close();
    }
  });

  it("fails closed on inactive canonical courses, inactive pengguna, unauthorized role, revoked assignment, or missing course", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      // Active tutor
      await testDb.insert(schema.user).values({
        id: "usr-tutor-valid",
        name: "Valid Tutor",
        email: "validtutor@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-valid",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-tutor-valid",
        penggunaId: "usr-tutor-valid",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      // Suspended pengguna
      await testDb.insert(schema.user).values({
        id: "usr-suspended",
        name: "Suspended User",
        email: "suspended@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-suspended",
        status: "suspended",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-susp",
        penggunaId: "usr-suspended",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      // Murid only
      await testDb.insert(schema.user).values({
        id: "usr-murid",
        name: "Murid User",
        email: "murid@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-murid",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-murid",
        penggunaId: "usr-murid",
        peranId: "peran-murid",
        source: "seed",
        createdAt: now,
      });

      // Tutor with revoked assignment
      await testDb.insert(schema.user).values({
        id: "usr-revoked",
        name: "Revoked Tutor",
        email: "revoked@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-revoked",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-revoked",
        penggunaId: "usr-revoked",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      // Active course
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-bio",
        code: "BI-1101",
        title: "Biologi Dasar",
        status: "active",
        legacyCourseId: null,
        createdAt: now,
        updatedAt: now,
      });

      // Inactive (archived) canonical course
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-archived-course",
        code: "BI-9999",
        title: "Biologi Arsip",
        status: "archived",
        legacyCourseId: null,
        createdAt: now,
        updatedAt: now,
      });

      // Inactive (draft) canonical course
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-draft-course",
        code: "BI-8888",
        title: "Biologi Rancangan",
        status: "draft",
        legacyCourseId: null,
        createdAt: now,
        updatedAt: now,
      });

      // Active assignment to archived course
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-archived",
        penggunaId: "usr-tutor-valid",
        mataKuliahId: "mk-archived-course",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Revoked assignment to active course
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-revoked",
        penggunaId: "usr-revoked",
        mataKuliahId: "mk-bio",
        status: "revoked",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // 1. Inactive canonical course fails closed with COURSE_INACTIVE
      const resArchivedCourse = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-valid", courseId: "mk-archived-course" },
        testDb,
      );
      expect(resArchivedCourse.hasAccess).toBe(false);
      expect(resArchivedCourse.reason).toBe("COURSE_INACTIVE");

      const resDraftCourse = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-valid", courseId: "mk-draft-course" },
        testDb,
      );
      expect(resDraftCourse.hasAccess).toBe(false);
      expect(resDraftCourse.reason).toBe("COURSE_INACTIVE");

      await expect(
        requireTutorCourseAccess("usr-tutor-valid", "mk-archived-course", {}, testDb),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED: COURSE_INACTIVE");

      // 2. Suspended pengguna
      const resSuspended = await resolveTutorCourseAccess(
        { penggunaId: "usr-suspended", courseId: "mk-bio" },
        testDb,
      );
      expect(resSuspended.hasAccess).toBe(false);
      expect(resSuspended.reason).toBe("PENGGUNA_INACTIVE");

      // 3. Missing pengguna
      const resMissingUser = await resolveTutorCourseAccess(
        { penggunaId: "usr-non-existent", courseId: "mk-bio" },
        testDb,
      );
      expect(resMissingUser.hasAccess).toBe(false);
      expect(resMissingUser.reason).toBe("PENGGUNA_NOT_FOUND");

      // 4. Murid only
      const resMurid = await resolveTutorCourseAccess(
        { penggunaId: "usr-murid", courseId: "mk-bio" },
        testDb,
      );
      expect(resMurid.hasAccess).toBe(false);
      expect(resMurid.reason).toBe("ROLE_NOT_AUTHORIZED");

      // 5. Revoked assignment
      const resRevoked = await resolveTutorCourseAccess(
        { penggunaId: "usr-revoked", courseId: "mk-bio" },
        testDb,
      );
      expect(resRevoked.hasAccess).toBe(false);
      expect(resRevoked.reason).toBe("NO_ACTIVE_ASSIGNMENT");

      // 6. Missing course
      const resMissingCourse = await resolveTutorCourseAccess(
        { penggunaId: "usr-revoked", courseId: "mk-ghost" },
        testDb,
      );
      expect(resMissingCourse.hasAccess).toBe(false);
      expect(resMissingCourse.reason).toBe("COURSE_NOT_FOUND");

      // 7. requireTutorCourseAccess throws on unauthorized role
      await expect(
        requireTutorCourseAccess("usr-murid", "mk-bio", {}, testDb),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED: ROLE_NOT_AUTHORIZED");
    } finally {
      client.close();
    }
  });

  it("lists accessible courses excluding inactive canonical courses and handles batched legacy fallback", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-multi",
        name: "Multi Tutor",
        email: "multi@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-multi",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-multi",
        penggunaId: "usr-tutor-multi",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.courses).values([
        { id: "crs-1", title: "Course 1", category: "Matematika" },
        { id: "crs-2", title: "Course 2", category: "Matematika" },
        { id: "crs-3", title: "Course 3 (Archived)", category: "Matematika" },
        { id: "crs-4", title: "Course 4 (Legacy Only)", category: "Matematika" },
      ]);
      await testDb.insert(schema.mataKuliah).values([
        { id: "mk-1", code: "MK-1", title: "Course 1", status: "active", legacyCourseId: "crs-1", createdAt: now, updatedAt: now },
        { id: "mk-2", code: "MK-2", title: "Course 2", status: "active", legacyCourseId: "crs-2", createdAt: now, updatedAt: now },
        { id: "mk-3", code: "MK-3", title: "Course 3", status: "archived", legacyCourseId: "crs-3", createdAt: now, updatedAt: now },
      ]);

      // 1. mk-1 via active penugasan_tutor (active course -> included)
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-multi-1",
        penggunaId: "usr-tutor-multi",
        mataKuliahId: "mk-1",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // 2. mk-3 via active penugasan_tutor to ARCHIVED course -> must be excluded
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-multi-3",
        penggunaId: "usr-tutor-multi",
        mataKuliahId: "mk-3",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // 3. crs-2 via tutor_courses fallback (active mk-2 -> included)
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-multi-2",
        tutorId: "usr-tutor-multi",
        courseId: "crs-2",
        createdAt: now,
      });

      // 4. crs-3 via tutor_courses fallback (archived mk-3 -> must be excluded)
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-multi-3",
        tutorId: "usr-tutor-multi",
        courseId: "crs-3",
        createdAt: now,
      });

      // 5. crs-4 via tutor_courses fallback (unmapped legacy course -> MUST BE OMITTED)
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-multi-4",
        tutorId: "usr-tutor-multi",
        courseId: "crs-4",
        createdAt: now,
      });

      const list = await listTutorAccessibleCourses("usr-tutor-multi", {}, testDb);
      // Expected: mk-1 (canonical), mk-2 (fallback mapped)
      // crs-4 is omitted because no active canonical course exists
      // mk-3 and crs-3 excluded because mk-3 is archived
      expect(list.length).toBe(2);

      const item1 = list.find((c) => c.courseId === "mk-1");
      expect(item1).toBeDefined();
      expect(item1?.source).toBe("canonical_assignment");
      expect(item1?.isCompatibilityFallback).toBe(false);
      expect(item1?.legacyCourseId).toBe("crs-1");

      const item2 = list.find((c) => c.courseId === "mk-2");
      expect(item2).toBeDefined();
      expect(item2?.source).toBe("compatibility_fallback");
      expect(item2?.isCompatibilityFallback).toBe(true);
      expect(item2?.legacyCourseId).toBe("crs-2");

      // Unmapped legacy course crs-4 is omitted
      const item4 = list.find((c) => c.courseId === "crs-4");
      expect(item4).toBeUndefined();

      const item3 = list.find((c) => c.courseId === "mk-3" || c.courseId === "crs-3");
      expect(item3).toBeUndefined();
    } finally {
      client.close();
    }
  });

  it("resolves exact canonical course ID deterministically winning over a colliding legacyCourseId", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-collision",
        name: "Collision Tutor",
        email: "collision@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-collision",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-collision",
        penggunaId: "usr-tutor-collision",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      // Course A: id is 'mk-alpha', legacyCourseId is 'crs-alpha'
      // Course B: id is 'mk-beta', legacyCourseId is 'mk-alpha' (collides with Course A's canonical id!)
      await testDb.insert(schema.courses).values([
        { id: "crs-alpha", title: "Alpha Course", category: "Matematika" },
        { id: "crs-beta", title: "Beta Course", category: "Matematika" },
        { id: "mk-alpha", title: "Colliding Legacy Course", category: "Matematika" },
      ]);
      await testDb.insert(schema.mataKuliah).values([
        {
          id: "mk-alpha",
          code: "MA-100",
          title: "Alpha Course",
          status: "active",
          legacyCourseId: "crs-alpha",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "mk-beta",
          code: "MA-200",
          title: "Beta Course",
          status: "active",
          legacyCourseId: "mk-alpha", // Colliding legacyCourseId
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Assign tutor canonically to mk-alpha
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-collision-alpha",
        penggunaId: "usr-tutor-collision",
        mataKuliahId: "mk-alpha",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Resolving 'mk-alpha' MUST resolve Course A (exact id match), NOT Course B
      const result = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-collision", courseId: "mk-alpha" },
        testDb,
      );
      expect(result.hasAccess).toBe(true);
      expect(result.courseId).toBe("mk-alpha");
      expect(result.legacyCourseId).toBe("crs-alpha");
      expect(result.source).toBe("canonical_assignment");
      expect(result.isCompatibilityFallback).toBe(false);

      // In listTutorAccessibleCourses when legacy assignment has 'mk-alpha', exact canonical id wins
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-collision-alpha",
        tutorId: "usr-tutor-collision",
        courseId: "mk-alpha",
        createdAt: now,
      });

      const list = await listTutorAccessibleCourses("usr-tutor-collision", {}, testDb);
      const alphaItem = list.find((c) => c.courseId === "mk-alpha");
      expect(alphaItem).toBeDefined();
      expect(alphaItem?.legacyCourseId).toBe("crs-alpha");
      expect(alphaItem?.source).toBe("canonical_assignment");

      const betaItem = list.find((c) => c.courseId === "mk-beta");
      expect(betaItem).toBeDefined();
      expect(betaItem?.courseId).toBe("mk-beta");
      expect(betaItem?.legacyCourseId).toBe("mk-alpha");
      expect(betaItem?.source).toBe("compatibility_fallback");
    } finally {
      client.close();
    }
  });

  it("omits unmapped legacy fallback courses from listTutorAccessibleCourses when no active canonical course exists", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-unmapped",
        name: "Unmapped Tutor",
        email: "unmapped@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-unmapped",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-unmapped",
        penggunaId: "usr-tutor-unmapped",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      // Legacy course crs-ghost exists in courses table but has NO active row in mata_kuliah
      await testDb.insert(schema.courses).values({
        id: "crs-ghost",
        title: "Ghost Course",
        category: "Fisika",
      });

      await testDb.insert(schema.tutorCourses).values({
        id: "tc-ghost",
        tutorId: "usr-tutor-unmapped",
        courseId: "crs-ghost",
        createdAt: now,
      });

      const list = await listTutorAccessibleCourses("usr-tutor-unmapped", {}, testDb);
      expect(list).toEqual([]);
    } finally {
      client.close();
    }
  });

  it("denies access and blocks legacy tutor_courses fallback when a canonical penugasan_tutor row exists with non-active status", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-nonactive-canonical",
        name: "Nonactive Tutor",
        email: "nonactive@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-nonactive-canonical",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-nonactive-can",
        penggunaId: "usr-tutor-nonactive-canonical",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      // Active canonical course 1: mk-stats (mapped to crs-stats)
      // Active canonical course 2: mk-algebra (mapped to crs-algebra)
      await testDb.insert(schema.courses).values([
        { id: "crs-stats", title: "Statistika Dasar", category: "Matematika" },
        { id: "crs-algebra", title: "Aljabar Linear", category: "Matematika" },
      ]);
      await testDb.insert(schema.mataKuliah).values([
        {
          id: "mk-stats",
          code: "ST-1101",
          title: "Statistika Dasar",
          status: "active",
          legacyCourseId: "crs-stats",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "mk-algebra",
          code: "AL-1101",
          title: "Aljabar Linear",
          status: "active",
          legacyCourseId: "crs-algebra",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Non-active (revoked) canonical assignment for mk-stats
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-stats-revoked",
        penggunaId: "usr-tutor-nonactive-canonical",
        mataKuliahId: "mk-stats",
        status: "revoked",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Legacy tutor_courses rows exist for BOTH crs-stats and crs-algebra
      await testDb.insert(schema.tutorCourses).values([
        {
          id: "tc-stats-old",
          tutorId: "usr-tutor-nonactive-canonical",
          courseId: "crs-stats",
          createdAt: now,
        },
        {
          id: "tc-algebra-old",
          tutorId: "usr-tutor-nonactive-canonical",
          courseId: "crs-algebra",
          createdAt: now,
        },
      ]);

      // 1. resolveTutorCourseAccess for mk-stats must be DENIED because canonical row exists with status 'revoked'
      // Old tutor_courses fallback MUST NOT be used
      const resStatsById = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-nonactive-canonical", courseId: "mk-stats" },
        testDb,
      );
      expect(resStatsById.hasAccess).toBe(false);
      expect(resStatsById.reason).toBe("NO_ACTIVE_ASSIGNMENT");
      expect(resStatsById.isCompatibilityFallback).toBe(false);
      expect(resStatsById.source).toBeNull();

      // Querying by legacy course ID 'crs-stats' also denies access
      const resStatsByLegacy = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-nonactive-canonical", courseId: "crs-stats" },
        testDb,
      );
      expect(resStatsByLegacy.hasAccess).toBe(false);
      expect(resStatsByLegacy.reason).toBe("NO_ACTIVE_ASSIGNMENT");

      // requireTutorCourseAccess throws
      await expect(
        requireTutorCourseAccess("usr-tutor-nonactive-canonical", "mk-stats", {}, testDb),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED: NO_ACTIVE_ASSIGNMENT");

      // 2. resolveTutorCourseAccess for mk-algebra HAS access via compatibility_fallback
      // because there is ZERO canonical penugasan_tutor row for mk-algebra
      const resAlgebra = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-nonactive-canonical", courseId: "mk-algebra" },
        testDb,
      );
      expect(resAlgebra.hasAccess).toBe(true);
      expect(resAlgebra.source).toBe("compatibility_fallback");
      expect(resAlgebra.isCompatibilityFallback).toBe(true);
      expect(resAlgebra.courseId).toBe("mk-algebra");

      // 3. listTutorAccessibleCourses returns ONLY mk-algebra and excludes mk-stats
      const list = await listTutorAccessibleCourses("usr-tutor-nonactive-canonical", {}, testDb);
      expect(list.length).toBe(1);
      expect(list[0].courseId).toBe("mk-algebra");
      expect(list[0].source).toBe("compatibility_fallback");
      expect(list.find((c) => c.courseId === "mk-stats")).toBeUndefined();
    } finally {
      client.close();
    }
  });

  it("requires active assignmentScope = 'course' for whole-course access; chapter and content scopes do not grant course access or appear in whole-course list, but still block fallback", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values([
        { id: "usr-scope-course", name: "Course Tutor", email: "c@zyx.test", createdAt: now, updatedAt: now, role: "teacher" },
        { id: "usr-scope-chapter", name: "Chapter Tutor", email: "ch@zyx.test", createdAt: now, updatedAt: now, role: "teacher" },
        { id: "usr-scope-content", name: "Content Tutor", email: "co@zyx.test", createdAt: now, updatedAt: now, role: "teacher" },
      ]);
      await testDb.insert(schema.pengguna).values([
        { id: "usr-scope-course", status: "active", createdAt: now, updatedAt: now },
        { id: "usr-scope-chapter", status: "active", createdAt: now, updatedAt: now },
        { id: "usr-scope-content", status: "active", createdAt: now, updatedAt: now },
      ]);
      await testDb.insert(schema.penggunaPeran).values([
        { id: "pp-sc-1", penggunaId: "usr-scope-course", peranId: "peran-tutor", source: "seed", createdAt: now },
        { id: "pp-sc-2", penggunaId: "usr-scope-chapter", peranId: "peran-tutor", source: "seed", createdAt: now },
        { id: "pp-sc-3", penggunaId: "usr-scope-content", peranId: "peran-tutor", source: "seed", createdAt: now },
      ]);
      await testDb.insert(schema.courses).values({
        id: "crs-geo",
        title: "Geologi Dasar",
        category: "Teknik Geologi",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-geo",
        code: "GL-1101",
        title: "Geologi Dasar",
        status: "active",
        legacyCourseId: "crs-geo",
        createdAt: now,
        updatedAt: now,
      });

      // Active course-level assignment
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-course-scope",
        penggunaId: "usr-scope-course",
        mataKuliahId: "mk-geo",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // Active chapter-level assignment
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-chapter-scope",
        penggunaId: "usr-scope-chapter",
        mataKuliahId: "mk-geo",
        status: "active",
        assignmentScope: "chapter",
        createdAt: now,
        updatedAt: now,
      });

      // Active content-level assignment
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-content-scope",
        penggunaId: "usr-scope-content",
        mataKuliahId: "mk-geo",
        status: "active",
        assignmentScope: "content",
        createdAt: now,
        updatedAt: now,
      });

      // Legacy assignments in tutor_courses for all three tutors
      await testDb.insert(schema.tutorCourses).values([
        { id: "tc-sc-1", tutorId: "usr-scope-course", courseId: "crs-geo", createdAt: now },
        { id: "tc-sc-2", tutorId: "usr-scope-chapter", courseId: "crs-geo", createdAt: now },
        { id: "tc-sc-3", tutorId: "usr-scope-content", courseId: "crs-geo", createdAt: now },
      ]);

      // 1. Course-level tutor has full course access
      const resCourse = await resolveTutorCourseAccess(
        { penggunaId: "usr-scope-course", courseId: "mk-geo" },
        testDb,
      );
      expect(resCourse.hasAccess).toBe(true);
      expect(resCourse.source).toBe("canonical_assignment");

      const listCourse = await listTutorAccessibleCourses("usr-scope-course", {}, testDb);
      expect(listCourse.length).toBe(1);
      expect(listCourse[0].courseId).toBe("mk-geo");

      // 2. Chapter-level tutor is DENIED course access and legacy fallback is blocked
      const resChapter = await resolveTutorCourseAccess(
        { penggunaId: "usr-scope-chapter", courseId: "mk-geo" },
        testDb,
      );
      expect(resChapter.hasAccess).toBe(false);
      expect(resChapter.reason).toBe("NO_ACTIVE_ASSIGNMENT");

      await expect(
        requireTutorCourseAccess("usr-scope-chapter", "mk-geo", {}, testDb),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED: NO_ACTIVE_ASSIGNMENT");

      const listChapter = await listTutorAccessibleCourses("usr-scope-chapter", {}, testDb);
      expect(listChapter).toEqual([]);

      // 3. Content-level tutor is DENIED course access and legacy fallback is blocked
      const resContent = await resolveTutorCourseAccess(
        { penggunaId: "usr-scope-content", courseId: "mk-geo" },
        testDb,
      );
      expect(resContent.hasAccess).toBe(false);
      expect(resContent.reason).toBe("NO_ACTIVE_ASSIGNMENT");

      const listContent = await listTutorAccessibleCourses("usr-scope-content", {}, testDb);
      expect(listContent).toEqual([]);
    } finally {
      client.close();
    }
  });

  it("fails closed on duplicate active legacyCourseId mappings in resolution and omits them in list fallback", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-dup",
        name: "Dup Tutor",
        email: "duptutor@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-dup",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-dup",
        penggunaId: "usr-tutor-dup",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.courses).values({
        id: "crs-shared-legacy",
        title: "Shared Legacy Course",
        category: "Fisika",
      });

      // Two distinct active canonical courses mapped to the exact same legacy course
      await testDb.insert(schema.mataKuliah).values([
        {
          id: "mk-dup-a",
          code: "FI-1001",
          title: "Fisika A",
          status: "active",
          legacyCourseId: "crs-shared-legacy",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "mk-dup-b",
          code: "FI-1002",
          title: "Fisika B",
          status: "active",
          legacyCourseId: "crs-shared-legacy",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Assign tutor in legacy tutor_courses table to crs-shared-legacy
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-shared-dup",
        tutorId: "usr-tutor-dup",
        courseId: "crs-shared-legacy",
        createdAt: now,
      });

      // 1. Resolution by ambiguous legacy ID crs-shared-legacy fails closed
      const resByLegacy = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-dup", courseId: "crs-shared-legacy" },
        testDb,
      );
      expect(resByLegacy.hasAccess).toBe(false);
      expect(resByLegacy.reason).toBe("COURSE_NOT_FOUND");

      await expect(
        requireTutorCourseAccess("usr-tutor-dup", "crs-shared-legacy", {}, testDb),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED: COURSE_NOT_FOUND");

      // 2. In listTutorAccessibleCourses, duplicate active mapping is omitted (not silently overwritten)
      const list = await listTutorAccessibleCourses("usr-tutor-dup", {}, testDb);
      expect(list).toEqual([]);

      // 3. Exact canonical ID resolution still works for each course specifically
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-dup-a",
        penggunaId: "usr-tutor-dup",
        mataKuliahId: "mk-dup-a",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      const resCanonicalA = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-dup", courseId: "mk-dup-a" },
        testDb,
      );
      expect(resCanonicalA.hasAccess).toBe(true);
      expect(resCanonicalA.courseId).toBe("mk-dup-a");
      expect(resCanonicalA.source).toBe("canonical_assignment");

      const listWithA = await listTutorAccessibleCourses("usr-tutor-dup", {}, testDb);
      expect(listWithA.length).toBe(1);
      expect(listWithA[0].courseId).toBe("mk-dup-a");
    } finally {
      client.close();
    }
  });

  it("queries tutor_courses fallback only by verified mapped legacy course ID and prevents colliding ID authorization", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-collision-test",
        name: "Collision Test Tutor",
        email: "collisiontest@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-collision-test",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-col-test",
        penggunaId: "usr-tutor-collision-test",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });

      // Canonical course mk-astro with verified mapped legacyCourseId crs-astro-legacy
      await testDb.insert(schema.courses).values([
        { id: "crs-astro-legacy", title: "Astronomi Dasar", category: "Astronomi" },
        { id: "mk-astro", title: "Legacy Course Named mk-astro", category: "Astronomi" },
      ]);
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-astro",
        code: "AS-1101",
        title: "Astronomi Dasar",
        status: "active",
        legacyCourseId: "crs-astro-legacy",
        createdAt: now,
        updatedAt: now,
      });

      // Tutor is assigned in tutor_courses to 'mk-astro' (the colliding legacy course ID, NOT 'crs-astro-legacy')
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-colliding",
        tutorId: "usr-tutor-collision-test",
        courseId: "mk-astro",
        createdAt: now,
      });

      // 1. Resolving canonical course 'mk-astro' must NOT authorize tutor through the colliding legacy assignment
      const resCanonical = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-collision-test", courseId: "mk-astro" },
        testDb,
      );
      expect(resCanonical.hasAccess).toBe(false);
      expect(resCanonical.reason).toBe("NO_ACTIVE_ASSIGNMENT");

      // 2. Resolving by legacy course ID 'crs-astro-legacy' also denies because tutor is assigned to 'mk-astro', not 'crs-astro-legacy'
      const resLegacy = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-collision-test", courseId: "crs-astro-legacy" },
        testDb,
      );
      expect(resLegacy.hasAccess).toBe(false);
      expect(resLegacy.reason).toBe("NO_ACTIVE_ASSIGNMENT");

      // 3. Now assign tutor to the verified mapped legacy ID 'crs-astro-legacy'
      await testDb.insert(schema.tutorCourses).values({
        id: "tc-verified-legacy",
        tutorId: "usr-tutor-collision-test",
        courseId: "crs-astro-legacy",
        createdAt: now,
      });

      const resAuthorized = await resolveTutorCourseAccess(
        { penggunaId: "usr-tutor-collision-test", courseId: "mk-astro" },
        testDb,
      );
      expect(resAuthorized.hasAccess).toBe(true);
      expect(resAuthorized.source).toBe("compatibility_fallback");
      expect(resAuthorized.isCompatibilityFallback).toBe(true);
      expect(resAuthorized.courseId).toBe("mk-astro");
      expect(resAuthorized.legacyCourseId).toBe("crs-astro-legacy");
    } finally {
      client.close();
    }
  });

  describe("Actor Role Resolution and Attribution", () => {
    it("ignores stale session roles when DB roles are present so murid role cannot be overridden", async () => {
      const { client, testDb } = await createTestDb();
      try {
        const now = new Date();
        await testDb.insert(schema.user).values({
          id: "usr-murid-stale-sess",
          name: "Murid User",
          email: "murid_stale@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "student",
        });
        await testDb.insert(schema.pengguna).values({
          id: "usr-murid-stale-sess",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await testDb.insert(schema.penggunaPeran).values({
          id: "pp-murid-stale",
          penggunaId: "usr-murid-stale-sess",
          peranId: "peran-murid",
          source: "seed",
          createdAt: now,
        });

        // 1. Stale teacher session role passed alongside DB murid role
        const resultTeacherStale = await resolveActorRoles(
          "usr-murid-stale-sess",
          "teacher",
          testDb,
        );
        expect(resultTeacherStale.roles).toEqual(["murid"]);
        expect(resultTeacherStale.isTutor).toBe(false);
        expect(resultTeacherStale.isAdmin).toBe(false);

        // 2. Stale admin session role passed alongside DB murid role
        const resultAdminStale = await resolveActorRoles(
          "usr-murid-stale-sess",
          "admin",
          testDb,
        );
        expect(resultAdminStale.roles).toEqual(["murid"]);
        expect(resultAdminStale.isTutor).toBe(false);
        expect(resultAdminStale.isAdmin).toBe(false);
      } finally {
        client.close();
      }
    });

    it("uses sessionRole fallback only when DB roles are empty", async () => {
      const { client, testDb } = await createTestDb();
      try {
        const now = new Date();
        await testDb.insert(schema.user).values({
          id: "usr-legacy-only",
          name: "Legacy User Without DB Roles",
          email: "legacy_only@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        });

        // Fallback for teacher session role
        const resultTeacher = await resolveActorRoles(
          "usr-legacy-only",
          "teacher",
          testDb,
        );
        expect(resultTeacher.roles).toEqual(["tutor"]);
        expect(resultTeacher.isTutor).toBe(true);
        expect(resultTeacher.isAdmin).toBe(false);

        // Fallback for admin session role
        const resultAdmin = await resolveActorRoles(
          "usr-legacy-only",
          "admin",
          testDb,
        );
        expect(resultAdmin.roles).toEqual(["admin"]);
        expect(resultAdmin.isTutor).toBe(false);
        expect(resultAdmin.isAdmin).toBe(true);
      } finally {
        client.close();
      }
    });

    it("does not default unknown or unauthenticated actors to tutor role", async () => {
      const { client, testDb } = await createTestDb();
      try {
        // Unknown actor with no DB roles and no session role
        const resultUnknown = await resolveActorRoles(
          "usr-unknown-actor-999",
          undefined,
          testDb,
        );
        expect(resultUnknown.roles).toEqual([]);
        expect(resultUnknown.isTutor).toBe(false);
        expect(resultUnknown.isAdmin).toBe(false);

        // Empty user ID
        const resultEmpty = await resolveActorRoles("", undefined, testDb);
        expect(resultEmpty.roles).toEqual([]);
        expect(resultEmpty.isTutor).toBe(false);
        expect(resultEmpty.isAdmin).toBe(false);
      } finally {
        client.close();
      }
    });
  });
});
