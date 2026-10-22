import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  canAccessCourseContent,
  hasChapterScopeWithin,
  resolveCourseAccess as resolveCourseAccessAt,
  selectFreeChapters,
} from "@/lib/student/course-access";

// Enrollment fixtures expire in October 2026, so resolve at their fixed study date.
const resolveCourseAccess: typeof resolveCourseAccessAt = (input, executor) =>
  resolveCourseAccessAt({ now: new Date("2026-09-14T00:00:00.000Z"), ...input }, executor);

async function createTestDb() {
  const client = createClient({ url: ":memory:" });
  const testDb = drizzle(client, { schema });

  await client.executeMultiple(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT DEFAULT 'student',
      last_activity_at INTEGER,
      faculty TEXT,
      major TEXT,
      entry_year INTEGER
    );
    CREATE TABLE courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Matematika',
      description TEXT
    );
    CREATE TABLE mata_kuliah (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_demo INTEGER NOT NULL DEFAULT 0,
      legacy_course_id TEXT REFERENCES courses(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX mata_kuliah_single_demo_idx ON mata_kuliah(is_demo) WHERE is_demo = 1;
    CREATE TABLE pengguna (
      id TEXT PRIMARY KEY REFERENCES user(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE peran (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE pengguna_peran (
      id TEXT PRIMARY KEY,
      pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
      peran_id TEXT NOT NULL REFERENCES peran(id),
      source TEXT NOT NULL,
      audit_actor_pengguna_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      enrolled_at INTEGER,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE bab (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      legacy_chapter_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id),
      title TEXT NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      asset_gen_status TEXT NOT NULL DEFAULT 'idle',
      asset_gen_flashcards_total INTEGER NOT NULL DEFAULT 0,
      asset_gen_flashcards_current INTEGER NOT NULL DEFAULT 0,
      asset_gen_questions_total INTEGER NOT NULL DEFAULT 0,
      asset_gen_questions_current INTEGER NOT NULL DEFAULT 0,
      asset_gen_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE pendaftaran_murid (
      id TEXT PRIMARY KEY,
      pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      status TEXT NOT NULL DEFAULT 'active',
      start_at INTEGER,
      end_at INTEGER,
      legacy_enrollment_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE penugasan_tutor (
      id TEXT PRIMARY KEY,
      pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      status TEXT NOT NULL DEFAULT 'active',
      assignment_scope TEXT NOT NULL DEFAULT 'course',
      legacy_tutor_course_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE tutor_courses (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      created_at INTEGER NOT NULL
    );
  `);

  await testDb.insert(schema.peran).values([
    { id: "role-admin", code: "admin" },
    { id: "role-tutor", code: "tutor" },
    { id: "role-murid", code: "murid" },
  ]);
  return { client, testDb };
}

async function insertUser(
  testDb: ReturnType<typeof drizzle<typeof schema>>,
  input: {
    id: string;
    role?: "admin" | "teacher" | "student";
    status?: "active" | "suspended";
    peran?: "admin" | "tutor" | "murid" | readonly ("admin" | "tutor" | "murid")[];
  },
) {
  const now = new Date("2026-09-14T00:00:00.000Z");
  await testDb.insert(schema.user).values({
    id: input.id,
    name: input.id,
    email: `${input.id}@zyx.test`,
    createdAt: now,
    updatedAt: now,
    role: input.role ?? "student",
  });
  await testDb.insert(schema.pengguna).values({
    id: input.id,
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
  });
  if (input.peran) {
    const roles = Array.isArray(input.peran) ? input.peran : [input.peran];
    await testDb.insert(schema.penggunaPeran).values(roles.map((code) => ({
      id: `membership-${input.id}-${code}`,
      penggunaId: input.id,
      peranId: `role-${code}`,
      source: "test",
      createdAt: now,
    })));
  }
}

describe("student course access policy", () => {
  it("selects the first chapter and fails closed for missing or foreign scope", () => {
    const rows = [
      { id: "bab-3", canonicalId: "bab-3", legacyId: null, title: "Tiga", orderIndex: 3, source: "canonical" as const },
      { id: "bab-2", canonicalId: "bab-2", legacyId: null, title: "Dua", orderIndex: 2, source: "canonical" as const },
      { id: "bab-1", canonicalId: "bab-1", legacyId: null, title: "Satu", orderIndex: 1, source: "canonical" as const },
    ];
    const free = selectFreeChapters(rows);
    expect(free.map((chapter) => chapter.id)).toEqual(["bab-1"]);
    expect(hasChapterScopeWithin(undefined, ["bab-1"])).toBe(false);
    expect(hasChapterScopeWithin([], ["bab-1"])).toBe(false);
    expect(hasChapterScopeWithin(["bab-1", "bab-unknown"], ["bab-1"])).toBe(false);
    expect(hasChapterScopeWithin(["bab-1"], ["bab-1"])).toBe(true);
  });

  it("keeps anonymous access static while granting Free the first chapter of every active course", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-09-14T00:00:00.000Z");
      await testDb.insert(schema.courses).values({ id: "legacy-demo", title: "Demo", category: "Matematika" });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-demo",
        code: "DEMO-101",
        title: "Demo",
        status: "active",
        isDemo: true,
        legacyCourseId: "legacy-demo",
        createdAt: now,
        updatedAt: now,
      });
      await expect(testDb.insert(schema.mataKuliah).values({
        id: "mk-second-demo",
        code: "DEMO-102",
        title: "Demo Kedua",
        status: "active",
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      }).execute()).rejects.toThrow();
      await testDb.insert(schema.courses).values({ id: "legacy-other", title: "Other Course", category: "Fisika" });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-other",
        code: "OTHER-101",
        title: "Other Course",
        status: "active",
        isDemo: false,
        legacyCourseId: "legacy-other",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.bab).values([
        { id: "bab-demo-2", mataKuliahId: "mk-demo", code: "02", title: "Dua", orderIndex: 2, status: "active", legacyChapterId: "chapter-demo-2", createdAt: now, updatedAt: now },
        { id: "bab-demo-1", mataKuliahId: "mk-demo", code: "01", title: "Satu", orderIndex: 1, status: "active", legacyChapterId: "chapter-demo-1", createdAt: now, updatedAt: now },
        { id: "bab-demo-3", mataKuliahId: "mk-demo", code: "03", title: "Tiga", orderIndex: 3, status: "active", legacyChapterId: "chapter-demo-3", createdAt: now, updatedAt: now },
        { id: "bab-other-1", mataKuliahId: "mk-other", code: "01", title: "Satu", orderIndex: 1, status: "active", createdAt: now, updatedAt: now },
        { id: "bab-other-2", mataKuliahId: "mk-other", code: "02", title: "Dua", orderIndex: 2, status: "active", createdAt: now, updatedAt: now },
        { id: "bab-other-3", mataKuliahId: "mk-other", code: "03", title: "Tiga", orderIndex: 3, status: "active", createdAt: now, updatedAt: now },
      ]);
      await insertUser(testDb, { id: "free-user" });

      const anonymous = await resolveCourseAccess({ courseId: "mk-demo" }, testDb);
      expect(anonymous.tier).toBe("anonymous");
      expect(anonymous.hasCourseAccess).toBe(true);
      expect(anonymous.capabilities.canReadArticle).toBe(false);
      expect(canAccessCourseContent(anonymous, "article", ["bab-demo-1"])).toBe(false);

      const free = await resolveCourseAccess({ courseId: "legacy-demo", userId: "free-user", roleHint: "student" }, testDb);
      expect(free.tier).toBe("free");
      expect(free.courseId).toBe("mk-demo");
      expect(free.publicCourseId).toBe("legacy-demo");
      expect(free.freeChapterIds).toEqual(expect.arrayContaining(["bab-demo-1", "chapter-demo-1"]));
      expect(free.freeChapterIds).not.toContain("bab-demo-2");
      expect(free.freeChapterIds).not.toContain("chapter-demo-2");
      expect(free.freeChapterIds).not.toContain("bab-demo-3");
      expect(free.capabilities.zyraDailyQuestionLimit).toBe(5);
      expect(canAccessCourseContent(free, "article", ["bab-demo-1"])).toBe(true);
      expect(canAccessCourseContent(free, "diktat", ["bab-demo-1"])).toBe(true);
      expect(canAccessCourseContent(free, "quiz", ["chapter-demo-1"])).toBe(true);
      expect(canAccessCourseContent(free, "quiz", ["chapter-demo-2"])).toBe(false);
      expect(canAccessCourseContent(free, "article", ["bab-demo-2"])).toBe(false);
      expect(canAccessCourseContent(free, "article", ["bab-demo-3"])).toBe(false);
      expect(canAccessCourseContent(free, "article")).toBe(false);
      expect(canAccessCourseContent(free, "diktat-download", ["bab-demo-1"])).toBe(false);

      const anonymousOther = await resolveCourseAccess({ courseId: "mk-other" }, testDb);
      expect(anonymousOther.isDemo).toBe(false);
      expect(anonymousOther.hasCourseAccess).toBe(false);

      const freeOther = await resolveCourseAccess({ courseId: "mk-other", userId: "free-user" }, testDb);
      expect(freeOther.tier).toBe("free");
      expect(freeOther.hasCourseAccess).toBe(true);
      expect(freeOther.freeChapters.map((chapter) => chapter.id)).toEqual(["bab-other-1"]);
      expect(canAccessCourseContent(freeOther, "article", ["bab-other-1"])).toBe(true);
      expect(canAccessCourseContent(freeOther, "diktat", ["bab-other-1"])).toBe(true);
      expect(canAccessCourseContent(freeOther, "article", ["bab-other-2"])).toBe(false);
      expect(canAccessCourseContent(freeOther, "article", ["bab-other-3"])).toBe(false);
    } finally {
      client.close();
    }
  });

  it("falls back to legacy chapters only when the canonical course has no active chapters", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-09-14T00:00:00.000Z");
      await testDb.insert(schema.courses).values({ id: "legacy-chapter-course", title: "Legacy Chapter Demo", category: "Fisika" });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-legacy-chapter",
        code: "LEGACY-101",
        title: "Legacy Chapter Demo",
        status: "active",
        isDemo: true,
        legacyCourseId: "legacy-chapter-course",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.chapters).values([
        { id: "legacy-chapter-2", courseId: "legacy-chapter-course", title: "Dua", orderIndex: 2, status: "published", createdAt: now, updatedAt: now },
        { id: "legacy-chapter-1", courseId: "legacy-chapter-course", title: "Satu", orderIndex: 1, status: "published", createdAt: now, updatedAt: now },
        { id: "legacy-chapter-3", courseId: "legacy-chapter-course", title: "Tiga", orderIndex: 3, status: "published", createdAt: now, updatedAt: now },
        { id: "legacy-chapter-draft", courseId: "legacy-chapter-course", title: "Draft", orderIndex: 0, status: "draft", createdAt: now, updatedAt: now },
      ]);
      await insertUser(testDb, { id: "legacy-free-user" });

      const access = await resolveCourseAccess({ courseId: "mk-legacy-chapter", userId: "legacy-free-user" }, testDb);
      expect(access.freeChapters.map((chapter) => chapter.id)).toEqual(["legacy-chapter-1"]);
      expect(access.scopedChapterIds).toEqual(["legacy-chapter-1", "legacy-chapter-2", "legacy-chapter-3"]);
      expect(canAccessCourseContent(access, "article", ["legacy-chapter-1"])).toBe(true);
      expect(canAccessCourseContent(access, "article", ["legacy-chapter-2"])).toBe(false);
      expect(canAccessCourseContent(access, "article", ["legacy-chapter-3"])).toBe(false);
    } finally {
      client.close();
    }
  });

  it("provisions a canonical identity before granting Free access to a legacy auth account", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-09-14T00:00:00.000Z");
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-auth-only",
        code: "AUTH-ONLY-101",
        title: "Auth Only",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.bab).values({
        id: "bab-auth-only-1",
        mataKuliahId: "mk-auth-only",
        code: "01",
        title: "Satu",
        orderIndex: 1,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.user).values({
        id: "auth-only-user",
        name: "Auth Only",
        email: "auth-only@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });

      const access = await resolveCourseAccess({ courseId: "mk-auth-only", userId: "auth-only-user" }, testDb);
      const [identity] = await testDb
        .select({ id: schema.pengguna.id, status: schema.pengguna.status })
        .from(schema.pengguna)
        .where(eq(schema.pengguna.id, "auth-only-user"));

      expect(access.tier).toBe("free");
      expect(identity).toEqual({ id: "auth-only-user", status: "active" });
    } finally {
      client.close();
    }
  });

  it("preserves a legacy staff role when provisioning the canonical identity", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-09-14T00:00:00.000Z");
      await testDb.insert(schema.courses).values({
        id: "legacy-staff-course",
        title: "Legacy Staff",
        category: "Matematika",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-legacy-staff",
        code: "LEGACY-STAFF-101",
        title: "Legacy Staff",
        status: "active",
        legacyCourseId: "legacy-staff-course",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.bab).values({
        id: "bab-legacy-staff-1",
        mataKuliahId: "mk-legacy-staff",
        code: "01",
        title: "Satu",
        orderIndex: 1,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.user).values([
        {
          id: "legacy-admin-user",
          name: "Legacy Admin",
          email: "legacy-admin@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "admin",
        },
        {
          id: "legacy-tutor-user",
          name: "Legacy Tutor",
          email: "legacy-tutor@zyx.test",
          createdAt: now,
          updatedAt: now,
          role: "teacher",
        },
      ]);
      await testDb.insert(schema.tutorCourses).values({
        id: "legacy-tutor-assignment",
        tutorId: "legacy-tutor-user",
        courseId: "legacy-staff-course",
        createdAt: now,
      });

      const admin = await resolveCourseAccess({ courseId: "mk-legacy-staff", userId: "legacy-admin-user" }, testDb);
      expect(admin.tier).toBe("staff");
      expect(admin.roles).toEqual(["admin"]);

      const tutor = await resolveCourseAccess({ courseId: "mk-legacy-staff", userId: "legacy-tutor-user" }, testDb);
      expect(tutor.tier).toBe("staff");
      expect(tutor.roles).toEqual(["tutor"]);

      // A prior request may have committed the identity before its role
      // membership. The next access resolution must repair that partial row.
      await testDb.insert(schema.user).values({
        id: "roleless-legacy-admin",
        name: "Roleless Legacy Admin",
        email: "roleless-legacy-admin@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "admin",
      });
      await testDb.insert(schema.pengguna).values({
        id: "roleless-legacy-admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const repairedAdmin = await resolveCourseAccess({ courseId: "mk-legacy-staff", userId: "roleless-legacy-admin" }, testDb);
      expect(repairedAdmin.tier).toBe("staff");
      expect(repairedAdmin.roles).toEqual(["admin"]);
    } finally {
      client.close();
    }
  });

  it("preserves canonical and legacy enrollment semantics and grants staff separately", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-09-14T00:00:00.000Z");
      const future = new Date("2026-10-01T00:00:00.000Z");
      await testDb.insert(schema.courses).values([
        { id: "legacy-paid", title: "Paid", category: "Kimia" },
        { id: "legacy-staff", title: "Staff", category: "Biologi" },
      ]);
      await testDb.insert(schema.mataKuliah).values([
        { id: "mk-paid", code: "PAID-101", title: "Paid", status: "active", legacyCourseId: "legacy-paid", createdAt: now, updatedAt: now },
        { id: "mk-staff", code: "STAFF-101", title: "Staff", status: "active", legacyCourseId: "legacy-staff", createdAt: now, updatedAt: now },
      ]);
      await testDb.insert(schema.bab).values([
        { id: "bab-paid-1", mataKuliahId: "mk-paid", code: "01", title: "Satu", orderIndex: 1, status: "active", createdAt: now, updatedAt: now },
        { id: "bab-staff-1", mataKuliahId: "mk-staff", code: "01", title: "Satu", orderIndex: 1, status: "active", createdAt: now, updatedAt: now },
        { id: "bab-staff-3", mataKuliahId: "mk-staff", code: "03", title: "Tiga", orderIndex: 3, status: "active", createdAt: now, updatedAt: now },
      ]);
      await insertUser(testDb, { id: "enrolled-user" });
      await insertUser(testDb, { id: "legacy-enrolled-user" });
      await insertUser(testDb, { id: "admin-user", peran: "admin", role: "admin" });
      await insertUser(testDb, { id: "tutor-user", peran: "tutor", role: "teacher" });
      await insertUser(testDb, { id: "unassigned-tutor", peran: "tutor", role: "teacher" });
      await insertUser(testDb, { id: "role-hint-admin", role: "student" });
      await testDb.insert(schema.user).values({
        id: "suspended-user",
        name: "suspended-user",
        email: "suspended-user@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "student",
      });
      await testDb.insert(schema.pendaftaranMurid).values({
        id: "canonical-enrollment",
        penggunaId: "enrolled-user",
        mataKuliahId: "mk-paid",
        status: "active",
        endAt: future,
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.enrollments).values({
        id: "legacy-enrollment",
        userId: "legacy-enrolled-user",
        courseId: "legacy-paid",
        enrolledAt: now,
        expiresAt: future,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "staff-assignment",
        penggunaId: "tutor-user",
        mataKuliahId: "mk-staff",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.pendaftaranMurid).values({
        id: "unassigned-tutor-enrollment",
        penggunaId: "unassigned-tutor",
        mataKuliahId: "mk-staff",
        status: "active",
        endAt: future,
        createdAt: now,
        updatedAt: now,
      });

      const canonicalEnrolled = await resolveCourseAccess({ courseId: "mk-paid", userId: "enrolled-user" }, testDb);
      expect(canonicalEnrolled.tier).toBe("enrolled");
      expect(canonicalEnrolled.isEnrolled).toBe(true);
      expect(canAccessCourseContent(canonicalEnrolled, "article", ["bab-paid-1"])).toBe(true);
      expect(canonicalEnrolled.capabilities.canDownloadDiktat).toBe(true);

      const legacyEnrolled = await resolveCourseAccess({ courseId: "legacy-paid", userId: "legacy-enrolled-user" }, testDb);
      expect(legacyEnrolled.tier).toBe("enrolled");
      expect(legacyEnrolled.isEnrolled).toBe(true);

      const admin = await resolveCourseAccess({ courseId: "mk-staff", userId: "admin-user" }, testDb);
      expect(admin.tier).toBe("staff");
      expect(admin.hasCourseAccess).toBe(true);
      expect(admin.capabilities.canDownloadDiktat).toBe(true);
      expect(canAccessCourseContent(admin, "article", ["bab-staff-3"])).toBe(true);

      const tutor = await resolveCourseAccess({ courseId: "mk-staff", userId: "tutor-user" }, testDb);
      expect(tutor.tier).toBe("staff");
      expect(tutor.capabilities.canDownloadDiktat).toBe(false);

      const unassignedTutor = await resolveCourseAccess({ courseId: "mk-staff", userId: "unassigned-tutor" }, testDb);
      expect(unassignedTutor.isEnrolled).toBe(true);
      expect(unassignedTutor.hasCourseAccess).toBe(false);
      expect(unassignedTutor.tier).toBe("anonymous");

      const roleHintAdmin = await resolveCourseAccess({ courseId: "mk-staff", userId: "role-hint-admin", roleHint: "admin" }, testDb);
      expect(roleHintAdmin.tier).not.toBe("staff");
      expect(roleHintAdmin.hasCourseAccess).toBe(true);

      await testDb.insert(schema.pengguna).values({
        id: "suspended-user",
        status: "suspended",
        createdAt: now,
        updatedAt: now,
      });
      const suspended = await resolveCourseAccess({ courseId: "mk-staff", userId: "suspended-user" }, testDb);
      expect(suspended.reason).toBe("USER_INACTIVE");
      expect(suspended.hasCourseAccess).toBe(false);
    } finally {
      client.close();
    }
  });

  it("fails closed when a canonical ID collides with an unrelated legacy course ID", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-09-14T00:00:00.000Z");
      const future = new Date("2026-10-01T00:00:00.000Z");
      await testDb.insert(schema.courses).values({
        id: "shared-course-id",
        title: "Legacy Course",
        category: "Matematika",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "shared-course-id",
        code: "CANONICAL-101",
        title: "Canonical Course",
        status: "active",
        isDemo: false,
        createdAt: now,
        updatedAt: now,
      });
      await insertUser(testDb, { id: "collision-user" });
      await testDb.insert(schema.enrollments).values({
        id: "collision-legacy-enrollment",
        userId: "collision-user",
        courseId: "shared-course-id",
        enrolledAt: now,
        expiresAt: future,
      });

      const access = await resolveCourseAccess({
        courseId: "shared-course-id",
        userId: "collision-user",
      }, testDb);

      expect(access.reason).toBe("COURSE_MAPPING_AMBIGUOUS");
      expect(access.hasCourseAccess).toBe(false);
      expect(access.isEnrolled).toBe(false);
    } finally {
      client.close();
    }
  });

  it("keeps the murid lane for a tutor who also has the murid role", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-09-14T00:00:00.000Z");
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-multi-role",
        code: "MULTI-101",
        title: "Multi Role",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.bab).values({
        id: "bab-multi-role-1",
        mataKuliahId: "mk-multi-role",
        code: "01",
        title: "Satu",
        orderIndex: 1,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await insertUser(testDb, {
        id: "multi-role-user",
        role: "teacher",
        peran: ["tutor", "murid"],
      });

      const withoutAssignment = await resolveCourseAccess({
        courseId: "mk-multi-role",
        userId: "multi-role-user",
      }, testDb);
      expect(withoutAssignment.roles).toEqual(["tutor", "murid"]);
      expect(withoutAssignment.tier).toBe("free");
      expect(withoutAssignment.hasCourseAccess).toBe(true);

      await testDb.insert(schema.penugasanTutor).values({
        id: "multi-role-assignment",
        penggunaId: "multi-role-user",
        mataKuliahId: "mk-multi-role",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });
      const withAssignment = await resolveCourseAccess({
        courseId: "mk-multi-role",
        userId: "multi-role-user",
      }, testDb);
      expect(withAssignment.tier).toBe("staff");
      expect(withAssignment.hasCourseAccess).toBe(true);
    } finally {
      client.close();
    }
  });
});
