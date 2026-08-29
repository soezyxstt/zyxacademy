import { describe, expect, it, mock } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

// The DAL declares `import "server-only"` as a server boundary marker. The marker
// package throws outside a react-server condition, so tests stub it as an empty
// module before importing any module that transitively reaches the DAL.
mock.module("server-only", () => ({}));

const {
  clampPageSize,
  queryTutorActivityDetail,
  queryTutorActivityFilterOptions,
  queryTutorActivityLogs,
  queryTutorActivityStats,
  sanitizeSnapshotSafely,
  validateCursor,
} = await import("@/app/(admin)/admin/ops/tutor-activity/dal");

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
    CREATE TABLE IF NOT EXISTS audit_mutasi (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES pengguna(id) ON DELETE SET NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_snapshot TEXT,
      after_snapshot TEXT,
      correlation_id TEXT,
      course_id TEXT,
      outcome TEXT,
      reason TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Seed roles
  const now = new Date("2026-08-15T00:00:00.000Z");
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin", createdAt: now },
    { id: "peran-tutor", code: "tutor", createdAt: now },
    { id: "peran-murid", code: "murid", createdAt: now },
  ]);

  return { client, testDb };
}

async function seedTutorUser(
  testDb: any,
  params: { id: string; name: string; email: string },
) {
  const now = new Date("2026-08-15T00:00:00.000Z");
  await testDb.insert(schema.user).values({
    id: params.id,
    name: params.name,
    email: params.email,
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  });
  await testDb.insert(schema.pengguna).values({
    id: params.id,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await testDb.insert(schema.penggunaPeran).values({
    id: `pp-${params.id}-tutor`,
    penggunaId: params.id,
    peranId: "peran-tutor",
    source: "seed",
    createdAt: now,
  });
}

describe("Tutor Activity Log Query and Pagination Contract", () => {
  it("clamps page size strictly to 25, 50, or 100 with default 25", () => {
    expect(clampPageSize(undefined)).toBe(25);
    expect(clampPageSize(0)).toBe(25);
    expect(clampPageSize(10)).toBe(25);
    expect(clampPageSize(25)).toBe(25);
    expect(clampPageSize(50)).toBe(50);
    expect(clampPageSize(100)).toBe(100);
    expect(clampPageSize(500)).toBe(25);
    expect(clampPageSize(-5)).toBe(25);
  });

  it("maps null database outcome to unclassified, never success", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-08-15T10:00:00.000Z");
      await seedTutorUser(testDb, {
        id: "usr-tutor-1",
        name: "Tutor Satu",
        email: "tutor1@zyx.ac.id",
      });

      await testDb.insert(schema.auditMutasi).values({
        id: "mut-null-1",
        actorId: "usr-tutor-1",
        entityType: "materi",
        entityId: "mat-101",
        action: "materi:upload",
        outcome: null,
        createdAt: now,
      });

      const res = await queryTutorActivityLogs({}, testDb);
      expect(res.items.length).toBe(1);
      expect(res.items[0].outcome).toBe("unclassified");
      expect(res.items[0].outcome).not.toBe("success");
    } finally {
      client.close();
    }
  });

  it("filters accurately by outcome including unclassified, success, rejected, and failed", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const baseTime = new Date("2026-08-15T12:00:00.000Z");
      await seedTutorUser(testDb, {
        id: "usr-tutor-2",
        name: "Tutor Dua",
        email: "tutor2@zyx.ac.id",
      });

      await testDb.insert(schema.auditMutasi).values([
        {
          id: "log-succ",
          actorId: "usr-tutor-2",
          entityType: "artikel",
          entityId: "art-1",
          action: "publish",
          outcome: "success",
          createdAt: new Date(baseTime.getTime() + 1000),
        },
        {
          id: "log-rej",
          actorId: "usr-tutor-2",
          entityType: "artikel",
          entityId: "art-2",
          action: "reject",
          outcome: "rejected",
          createdAt: new Date(baseTime.getTime() + 2000),
        },
        {
          id: "log-fail",
          actorId: "usr-tutor-2",
          entityType: "artikel",
          entityId: "art-3",
          action: "sync",
          outcome: "failed",
          createdAt: new Date(baseTime.getTime() + 3000),
        },
        {
          id: "log-unclass",
          actorId: "usr-tutor-2",
          entityType: "artikel",
          entityId: "art-4",
          action: "draft",
          outcome: null,
          createdAt: new Date(baseTime.getTime() + 4000),
        },
      ]);

      const resUnclass = await queryTutorActivityLogs({ outcome: "unclassified" }, testDb);
      expect(resUnclass.items.length).toBe(1);
      expect(resUnclass.items[0].id).toBe("log-unclass");
      expect(resUnclass.items[0].outcome).toBe("unclassified");

      const resRej = await queryTutorActivityLogs({ outcome: "rejected" }, testDb);
      expect(resRej.items.length).toBe(1);
      expect(resRej.items[0].id).toBe("log-rej");

      const resSucc = await queryTutorActivityLogs({ outcome: "success" }, testDb);
      expect(resSucc.items.length).toBe(1);
      expect(resSucc.items[0].id).toBe("log-succ");

      const resFail = await queryTutorActivityLogs({ outcome: "failed" }, testDb);
      expect(resFail.items.length).toBe(1);
      expect(resFail.items[0].id).toBe("log-fail");

      const stats = await queryTutorActivityStats(testDb);
      expect(stats.total).toBe(4);
      expect(stats.success).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.unclassified).toBe(1);
    } finally {
      client.close();
    }
  });

  it("joins actor attribution through pengguna/user and course title through mata_kuliah and courses deterministically", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-08-15T12:00:00.000Z");

      // Seed actor
      await seedTutorUser(testDb, {
        id: "usr-tutor-99",
        name: "Dr. Budi Santoso",
        email: "budi@zyx.ac.id",
      });

      // Seed canonical course
      await testDb.insert(schema.courses).values({
        id: "crs-phys",
        title: "Fisika Dasar 1",
        category: "Fisika",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-phys-101",
        code: "FI-1101",
        title: "Fisika Dasar I",
        status: "active",
        legacyCourseId: "crs-phys",
        createdAt: now,
        updatedAt: now,
      });

      // Seed audit entries
      await testDb.insert(schema.auditMutasi).values([
        {
          id: "audit-canonical",
          actorId: "usr-tutor-99",
          entityType: "soal",
          entityId: "soal-101",
          action: "soal:create",
          courseId: "mk-phys-101",
          outcome: "success",
          reason: "Penambahan soal UTS",
          correlationId: "req-xyz-001",
          createdAt: now,
        },
        {
          id: "audit-legacy",
          actorId: "usr-tutor-99",
          entityType: "materi",
          entityId: "mat-202",
          action: "materi:publish",
          courseId: "crs-phys",
          outcome: "success",
          reason: "Rilis slide bab 2",
          correlationId: "req-xyz-002",
          createdAt: new Date(now.getTime() + 1000),
        },
      ]);

      const result = await queryTutorActivityLogs({ actorId: "usr-tutor-99" }, testDb);
      expect(result.items.length).toBe(2);

      const canonicalItem = result.items.find((i) => i.id === "audit-canonical");
      expect(canonicalItem?.actorName).toBe("Dr. Budi Santoso");
      expect(canonicalItem?.actorEmail).toBe("budi@zyx.ac.id");
      expect(canonicalItem?.courseTitle).toBe("Fisika Dasar I");
      expect(canonicalItem?.courseCode).toBe("FI-1101");
      expect(canonicalItem?.correlationId).toBe("req-xyz-001");

      const legacyItem = result.items.find((i) => i.id === "audit-legacy");
      expect(legacyItem?.actorName).toBe("Dr. Budi Santoso");
      expect(legacyItem?.courseTitle).toBe("Fisika Dasar 1");
    } finally {
      client.close();
    }
  });

  it("never duplicates rows when multiple course records or mappings exist", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-08-15T12:00:00.000Z");

      await seedTutorUser(testDb, {
        id: "usr-tutor-dup",
        name: "Tutor Multi Course",
        email: "tutor-dup@zyx.ac.id",
      });

      // Insert courses and multiple mataKuliah referencing same legacyCourseId
      await testDb.insert(schema.courses).values({
        id: "crs-multi",
        title: "Kalkulus Lanjut",
        category: "Matematika",
      });
      await testDb.insert(schema.mataKuliah).values([
        {
          id: "mk-calc-a",
          code: "MA-2001",
          title: "Kalkulus II A",
          status: "active",
          legacyCourseId: "crs-multi",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "mk-calc-b",
          code: "MA-2002",
          title: "Kalkulus II B",
          status: "active",
          legacyCourseId: "crs-multi",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      // Seed single mutation referencing the legacy course
      await testDb.insert(schema.auditMutasi).values({
        id: "mut-single-row",
        actorId: "usr-tutor-dup",
        entityType: "materi",
        entityId: "mat-calc",
        action: "materi:update",
        courseId: "crs-multi",
        outcome: "success",
        createdAt: now,
      });

      const res = await queryTutorActivityLogs({ limit: 25 }, testDb);
      // Row must be returned exactly once, never duplicated
      expect(res.items.length).toBe(1);
      expect(res.items[0].id).toBe("mut-single-row");
    } finally {
      client.close();
    }
  });

  it("scopes logs, stats, and filter options strictly to tutor activity, excluding admin/student/system events", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-08-15T12:00:00.000Z");

      // 1. Seed Tutor
      await seedTutorUser(testDb, {
        id: "usr-tutor-sc",
        name: "Tutor Guru",
        email: "guru@zyx.ac.id",
      });

      // 2. Seed Admin
      await testDb.insert(schema.user).values({
        id: "usr-admin-sc",
        name: "Super Admin",
        email: "admin@zyx.ac.id",
        role: "admin",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-admin-sc",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-admin-sc",
        penggunaId: "usr-admin-sc",
        peranId: "peran-admin",
        source: "seed",
        createdAt: now,
      });

      // 3. Seed Student
      await testDb.insert(schema.user).values({
        id: "usr-student-sc",
        name: "Student Murid",
        email: "murid@zyx.ac.id",
        role: "student",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-student-sc",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-student-sc",
        penggunaId: "usr-student-sc",
        peranId: "peran-murid",
        source: "seed",
        createdAt: now,
      });

      // Insert mutations
      await testDb.insert(schema.auditMutasi).values([
        // Tutor mutation (success)
        {
          id: "mut-tutor-succ",
          actorId: "usr-tutor-sc",
          entityType: "soal",
          entityId: "soal-1",
          action: "soal:publish",
          outcome: "success",
          createdAt: new Date(now.getTime() + 1000),
        },
        // Tutor mutation (rejected) -> must be retained!
        {
          id: "mut-tutor-rej",
          actorId: "usr-tutor-sc",
          entityType: "soal",
          entityId: "soal-2",
          action: "soal:review",
          outcome: "rejected",
          reason: "Format belum sesuai",
          createdAt: new Date(now.getTime() + 2000),
        },
        // Explicit tutor mutation with envelope
        {
          id: "mut-tutor-env",
          actorId: null,
          entityType: "materi",
          entityId: "mat-env",
          action: "workflow:tutor_review->changes_requested",
          outcome: "rejected",
          afterSnapshot: {
            auditSchemaVersion: "content-workflow-v1",
            actorRoles: ["tutor"],
          },
          createdAt: new Date(now.getTime() + 3000),
        },
        // Admin-only mutation -> must be excluded!
        {
          id: "mut-admin-only",
          actorId: "usr-admin-sc",
          entityType: "system_config",
          entityId: "cfg-1",
          action: "admin:config:update",
          outcome: "success",
          createdAt: new Date(now.getTime() + 4000),
        },
        // Student-only mutation -> must be excluded!
        {
          id: "mut-student-only",
          actorId: "usr-student-sc",
          entityType: "quiz_attempt",
          entityId: "atm-1",
          action: "student:quiz:submit",
          outcome: "success",
          createdAt: new Date(now.getTime() + 5000),
        },
      ]);

      const logs = await queryTutorActivityLogs({ limit: 50 }, testDb);
      const logIds = logs.items.map((i) => i.id);

      // Tutor events are included
      expect(logIds).toContain("mut-tutor-succ");
      expect(logIds).toContain("mut-tutor-rej");
      expect(logIds).toContain("mut-tutor-env");

      // Admin & Student events are excluded
      expect(logIds).not.toContain("mut-admin-only");
      expect(logIds).not.toContain("mut-student-only");

      // Stats scope check
      const stats = await queryTutorActivityStats(testDb);
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(1);
      expect(stats.rejected).toBe(2);
      expect(stats.failed).toBe(0);

      // Filter options scope check: tutors list must contain ONLY tutors, not admins
      const filterOptions = await queryTutorActivityFilterOptions(testDb);
      const tutorOptionIds = filterOptions.tutors.map((t) => t.id);
      expect(tutorOptionIds).toContain("usr-tutor-sc");
      expect(tutorOptionIds).not.toContain("usr-admin-sc");
      expect(tutorOptionIds).not.toContain("usr-student-sc");

      // Actions in filter options must not include admin or student actions
      expect(filterOptions.actions).not.toContain("admin:config:update");
      expect(filterOptions.actions).not.toContain("student:quiz:submit");
    } finally {
      client.close();
    }
  });

  it("excludes non-tutor events whose snapshots merely contain incidental 'tutor' text", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-08-15T12:00:00.000Z");

      // Non-tutor actor with no tutor peran
      await testDb.insert(schema.user).values({
        id: "usr-admin-inc",
        name: "Admin Incidental",
        email: "admin-inc@zyx.ac.id",
        role: "admin",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-admin-inc",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-admin-inc",
        penggunaId: "usr-admin-inc",
        peranId: "peran-admin",
        source: "seed",
        createdAt: now,
      });

      // Snapshot text contains literal "tutor" but never at $.actorRoles,
      // the actor has no tutor membership, and the action is not tutor-prefixed.
      await testDb.insert(schema.auditMutasi).values({
        id: "mut-incidental-text",
        actorId: "usr-admin-inc",
        entityType: "user_role",
        entityId: "usr-student-55",
        action: "admin:role:request",
        outcome: "success",
        beforeSnapshot: {
          userId: "usr-student-55",
          requestedTargetRoles: ["tutor"],
          note: "Student asked to join the tutor team",
        },
        afterSnapshot: {
          userId: "usr-student-55",
          reviewQueue: ["tutor"],
          status: "under_review",
        },
        createdAt: now,
      });

      const logs = await queryTutorActivityLogs({ limit: 50 }, testDb);
      expect(logs.items.map((i) => i.id)).not.toContain("mut-incidental-text");
      expect(logs.items.length).toBe(0);

      const stats = await queryTutorActivityStats(testDb);
      expect(stats.total).toBe(0);

      const detail = await queryTutorActivityDetail("mut-incidental-text", testDb);
      expect(detail).toBeNull();

      const filterOptions = await queryTutorActivityFilterOptions(testDb);
      expect(filterOptions.actions).not.toContain("admin:role:request");
      expect(filterOptions.entityTypes).not.toContain("user_role");
    } finally {
      client.close();
    }
  });

  it("filters by exact correlation ID and never performs loose LIKE matching", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-08-15T12:00:00.000Z");
      await seedTutorUser(testDb, {
        id: "usr-tutor-corr",
        name: "Tutor Corr",
        email: "corr@zyx.ac.id",
      });

      await testDb.insert(schema.auditMutasi).values([
        {
          id: "mut-exact",
          actorId: "usr-tutor-corr",
          entityType: "materi",
          entityId: "m-1",
          action: "edit",
          correlationId: "req-batch-1",
          createdAt: now,
        },
        {
          id: "mut-similar",
          actorId: "usr-tutor-corr",
          entityType: "materi",
          entityId: "m-2",
          action: "edit",
          correlationId: "req-batch-100",
          createdAt: new Date(now.getTime() + 1000),
        },
      ]);

      const res = await queryTutorActivityLogs({ correlationId: "req-batch-1" }, testDb);
      expect(res.items.length).toBe(1);
      expect(res.items[0].id).toBe("mut-exact");

      const resEmpty = await queryTutorActivityLogs({ correlationId: "req-batch" }, testDb);
      expect(resEmpty.items.length).toBe(0);
    } finally {
      client.close();
    }
  });

  it("converts inclusive UI date range to exclusive end date boundary", async () => {
    const { client, testDb } = await createTestDb();
    try {
      await seedTutorUser(testDb, {
        id: "usr-tutor-dates",
        name: "Tutor Dates",
        email: "dates@zyx.ac.id",
      });

      // 2026-08-10 00:00:00 UTC
      const t1 = new Date("2026-08-10T00:00:00.000Z");
      // 2026-08-10 23:59:59 UTC
      const t2 = new Date("2026-08-10T23:59:59.000Z");
      // 2026-08-11 00:00:00 UTC (start of next day -> should be excluded by exclusive end)
      const t3 = new Date("2026-08-11T00:00:00.000Z");
      // 2026-08-09 23:59:59 UTC (prior day -> should be excluded)
      const t0 = new Date("2026-08-09T23:59:59.000Z");

      await testDb.insert(schema.auditMutasi).values([
        { id: "e-prior", actorId: "usr-tutor-dates", entityType: "e", entityId: "0", action: "a", createdAt: t0 },
        { id: "e-start", actorId: "usr-tutor-dates", entityType: "e", entityId: "1", action: "a", createdAt: t1 },
        { id: "e-end", actorId: "usr-tutor-dates", entityType: "e", entityId: "2", action: "a", createdAt: t2 },
        { id: "e-next", actorId: "usr-tutor-dates", entityType: "e", entityId: "3", action: "a", createdAt: t3 },
      ]);

      const res = await queryTutorActivityLogs({
        startDate: "2026-08-10",
        endDate: "2026-08-10",
      }, testDb);

      const foundIds = res.items.map((i) => i.id).sort();
      expect(foundIds).toEqual(["e-end", "e-start"]);
      expect(foundIds).not.toContain("e-prior");
      expect(foundIds).not.toContain("e-next");
    } finally {
      client.close();
    }
  });

  it("validates and bounds cursor date/id gracefully without crashing", () => {
    // Valid cursor
    const valid = validateCursor({
      createdAt: "2026-08-15T12:00:00.000Z",
      id: "log-123",
    });
    expect(valid).not.toBeNull();
    expect(valid?.id).toBe("log-123");
    expect(valid?.createdAt.toISOString()).toBe("2026-08-15T12:00:00.000Z");

    // Null/undefined cursor
    expect(validateCursor(null)).toBeNull();
    expect(validateCursor(undefined)).toBeNull();
    expect(validateCursor("not-an-object")).toBeNull();

    // Invalid id
    expect(validateCursor({ createdAt: new Date(), id: "" })).toBeNull();
    expect(validateCursor({ createdAt: new Date(), id: "   " })).toBeNull();
    expect(validateCursor({ createdAt: new Date(), id: "x".repeat(300) })).toBeNull();

    // Invalid date
    expect(validateCursor({ createdAt: "invalid-date", id: "log-1" })).toBeNull();
    expect(validateCursor({ createdAt: Number.NaN, id: "log-1" })).toBeNull();
    expect(validateCursor({ createdAt: -1000, id: "log-1" })).toBeNull(); // before 1970
    expect(validateCursor({ createdAt: "2150-01-01", id: "log-1" })).toBeNull(); // far future
  });

  it("paginates stably using keyset pagination (createdAt desc, id desc)", async () => {
    const { client, testDb } = await createTestDb();
    try {
      await seedTutorUser(testDb, {
        id: "usr-tutor-page",
        name: "Tutor Pagination",
        email: "page@zyx.ac.id",
      });

      const baseTime = new Date("2026-08-20T10:00:00.000Z").getTime();
      const entries = [];
      for (let i = 1; i <= 30; i++) {
        entries.push({
          id: `log-item-${i.toString().padStart(3, "0")}`,
          actorId: "usr-tutor-page",
          entityType: "soal",
          entityId: `soal-${i}`,
          action: "update",
          outcome: "success" as const,
          createdAt: new Date(baseTime + i * 1000),
        });
      }

      await testDb.insert(schema.auditMutasi).values(entries);

      // Page 1 with limit 25
      const page1 = await queryTutorActivityLogs({ limit: 25 }, testDb);
      expect(page1.items.length).toBe(25);
      expect(page1.hasNextPage).toBe(true);
      expect(page1.nextCursor).not.toBeNull();
      expect(page1.items[0].id).toBe("log-item-030");
      expect(page1.items[24].id).toBe("log-item-006");

      // Page 2 using nextCursor
      const page2 = await queryTutorActivityLogs({
        limit: 25,
        cursor: page1.nextCursor!,
      }, testDb);

      expect(page2.items.length).toBe(5);
      expect(page2.hasNextPage).toBe(false);
      expect(page2.nextCursor).toBeNull();
      expect(page2.items[0].id).toBe("log-item-005");
      expect(page2.items[4].id).toBe("log-item-001");
    } finally {
      client.close();
    }
  });

  it("retrieves single tutor activity detail record accurately", async () => {
    const { client, testDb } = await createTestDb();
    try {
      const now = new Date("2026-08-15T12:00:00.000Z");
      await seedTutorUser(testDb, {
        id: "usr-tutor-det",
        name: "Dr. Detail",
        email: "detail@zyx.ac.id",
      });

      await testDb.insert(schema.auditMutasi).values({
        id: "mut-detail-target",
        actorId: "usr-tutor-det",
        entityType: "materi",
        entityId: "mat-detail-1",
        action: "materi:edit",
        outcome: "rejected",
        reason: "Catatan rumus kurang jelas",
        correlationId: "req-det-999",
        createdAt: now,
      });

      const detail = await queryTutorActivityDetail("mut-detail-target", testDb);
      expect(detail).not.toBeNull();
      expect(detail?.id).toBe("mut-detail-target");
      expect(detail?.actorName).toBe("Dr. Detail");
      expect(detail?.outcome).toBe("rejected");
      expect(detail?.reason).toBe("Catatan rumus kurang jelas");
      expect(detail?.correlationId).toBe("req-det-999");

      const notFound = await queryTutorActivityDetail("non-existent-id", testDb);
      expect(notFound).toBeNull();
    } finally {
      client.close();
    }
  });

  it("safely re-sanitizes snapshot data removing sensitive keys and payload excesses", () => {
    const sensitiveSnapshot = {
      user: "tutor1",
      password: "my-plain-password",
      apiKey: "sk-live-123456",
      token: "secret-bearer-jwt",
      cookie: "session=xyz",
      details: {
        note: "Reviewed question 10",
        nestedSecret: "should-be-redacted",
      },
    };

    const sanitized = sanitizeSnapshotSafely(sensitiveSnapshot);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.user).toBe("tutor1");
    expect(sanitized?.password).toBe("[REDACTED]");
    expect(sanitized?.apiKey).toBe("[REDACTED]");
    expect(sanitized?.token).toBe("[REDACTED]");
    expect(sanitized?.cookie).toBe("[REDACTED]");
    expect(sanitized?.details).toEqual({
      note: "Reviewed question 10",
      nestedSecret: "[REDACTED]",
    });
  });
});
