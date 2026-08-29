import { describe, expect, it, mock, beforeEach } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { TUTOR_CAPABILITY_ERRORS } from "@/lib/tutor/assessment-policy";

let mockSession: any = null;

const client = createClient({ url: "file::memory:?cache=shared" });
const testDb = drizzle(client, { schema });

mock.module("@/db", () => ({
  db: testDb,
}));

mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => mockSession,
    },
  },
}));

mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

mock.module("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

mock.module("@/lib/notifications/send", () => ({
  notifyQuizPublishedBestEffort: async () => {},
}));

import {
  saveQuizTemplateAction,
  deleteQuizTemplateAction,
  toggleQuizTemplateStatusAction,
} from "@/app/actions/tutor-management";

async function setupTables() {
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
    CREATE TABLE IF NOT EXISTS quiz_templates (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'daily',
      visibility TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'draft',
      time_limit_seconds INTEGER,
      max_attempts INTEGER,
      selection_rules TEXT NOT NULL,
      open_at INTEGER,
      close_at INTEGER,
      manual_status TEXT NOT NULL DEFAULT 'open',
      show_discussion INTEGER NOT NULL DEFAULT 1,
      spreadsheet_id TEXT,
      spreadsheet_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ai_question_bank (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      source_section_id TEXT,
      origin TEXT NOT NULL DEFAULT 'zyx_original',
      source_event_name TEXT,
      source_reference_id TEXT,
      knowledge_object_id TEXT,
      source_mtd_id TEXT,
      source_mtd_version INTEGER,
      generation_hash TEXT,
      generation_run_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      is_stale INTEGER NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      question_type TEXT NOT NULL DEFAULT 'multiple_choice',
      tags TEXT NOT NULL DEFAULT '[]',
      prompt TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_indices TEXT NOT NULL,
      acceptable_answers TEXT,
      distractor_map TEXT DEFAULT '[]',
      explanation TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'generated',
      quality_score REAL,
      use_count INTEGER NOT NULL DEFAULT 0,
      styled_after_assessment_object_id TEXT,
      pattern TEXT,
      reasoning_type TEXT,
      application_level TEXT,
      estimated_steps INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS blueprint_asesmen (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      title TEXT NOT NULL,
      assessment_type TEXT NOT NULL,
      blueprint TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      generation_hash TEXT NOT NULL,
      creator_id TEXT NOT NULL REFERENCES pengguna(id),
      curator_id TEXT REFERENCES pengguna(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS asesmen (
      id TEXT PRIMARY KEY,
      blueprint_asesmen_id TEXT NOT NULL REFERENCES blueprint_asesmen(id),
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      title TEXT NOT NULL,
      assessment_type TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      generation_hash TEXT NOT NULL,
      creator_id TEXT NOT NULL REFERENCES pengguna(id),
      curator_id TEXT REFERENCES pengguna(id),
      published_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS bab (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      legacy_chapter_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS cakupan_asesmen (
      id TEXT PRIMARY KEY,
      asesmen_id TEXT NOT NULL REFERENCES asesmen(id),
      bab_id TEXT NOT NULL REFERENCES bab(id),
      order_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS soal (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT NOT NULL REFERENCES mata_kuliah(id),
      bab_id TEXT REFERENCES bab(id),
      prompt_markdown TEXT NOT NULL,
      question_type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      options_snapshot TEXT,
      correct_answer_payload TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      generation_hash TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS item_asesmen (
      id TEXT PRIMARY KEY,
      asesmen_id TEXT NOT NULL REFERENCES asesmen(id),
      soal_id TEXT NOT NULL REFERENCES soal(id),
      order_index INTEGER NOT NULL,
      rendered_question_snapshot TEXT NOT NULL,
      option_order_snapshot TEXT NOT NULL,
      grading_policy_snapshot TEXT NOT NULL,
      content_version INTEGER NOT NULL DEFAULT 1,
      generation_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
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
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

const SHARED_PURGE_TABLES = [
  "audit_mutasi",
  "item_asesmen",
  "cakupan_asesmen",
  "soal",
  "bab",
  "asesmen",
  "blueprint_asesmen",
  "quiz_templates",
  "ai_question_bank",
  "ai_material_instance_chunks",
  "ai_material_instance_sections",
  "ai_material_instances",
  "submissions",
  "questions",
  "exams",
  "enrollments",
  "penugasan_tutor",
  "tutor_courses",
  "mata_kuliah",
  "courses",
  "pengguna_peran",
  "pengguna",
  "peran",
  "user",
] as const;

async function purgeSharedTables() {
  const existing = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table'`,
  );
  const present = new Set(existing.rows.map((row) => String(row.name)));
  for (const table of SHARED_PURGE_TABLES) {
    if (!present.has(table)) continue;
    await client.execute(`DELETE FROM ${table}`);
  }
}

async function clearAllData() {
  await purgeSharedTables();
}

async function seedBaseData() {
  const now = new Date();
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]).onConflictDoNothing();

  // Tutor 1
  await testDb.insert(schema.user).values({
    id: "usr-tutor-1",
    name: "Tutor Satu",
    email: "tutor1@zyx.test",
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.pengguna).values({
    id: "usr-tutor-1",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-tutor-1",
    penggunaId: "usr-tutor-1",
    peranId: "peran-tutor",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Tutor 2 (for assigned course 1 as well)
  await testDb.insert(schema.user).values({
    id: "usr-tutor-2",
    name: "Tutor Dua",
    email: "tutor2@zyx.test",
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.pengguna).values({
    id: "usr-tutor-2",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-tutor-2",
    penggunaId: "usr-tutor-2",
    peranId: "peran-tutor",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Course 1 (assigned to tutor 1 and tutor 2)
  await testDb.insert(schema.courses).values({
    id: "crs-calc",
    title: "Kalkulus 1",
    category: "Matematika",
  }).onConflictDoNothing();

  await testDb.insert(schema.mataKuliah).values({
    id: "mk-calc",
    code: "MA-1101",
    title: "Kalkulus 1",
    status: "active",
    legacyCourseId: "crs-calc",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.penugasanTutor).values([
    {
      id: "pt-tutor-1",
      penggunaId: "usr-tutor-1",
      mataKuliahId: "mk-calc",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "pt-tutor-2",
      penggunaId: "usr-tutor-2",
      mataKuliahId: "mk-calc",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    },
  ]).onConflictDoNothing();

  // Course 2 (unassigned)
  await testDb.insert(schema.courses).values({
    id: "crs-physics",
    title: "Fisika Dasar 1",
    category: "Fisika",
  }).onConflictDoNothing();

  await testDb.insert(schema.mataKuliah).values({
    id: "mk-physics",
    code: "FI-1101",
    title: "Fisika Dasar 1",
    status: "active",
    legacyCourseId: "crs-physics",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

describe("Native Tutor Quiz Authoring Workflow Contracts", () => {
  beforeEach(async () => {
    await setupTables();
    await clearAllData();
    await seedBaseData();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 1. Native Tutor Quiz Creation (Allowed Categories)
   * ──────────────────────────────────────────────────────────────────────── */
  it("allows tutor to natively create daily, weekly, chapter, and premium quizzes with audit logging", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    const categories: Array<"daily" | "weekly" | "chapter" | "premium"> = [
      "daily",
      "weekly",
      "chapter",
      "premium",
    ];

    for (const cat of categories) {
      const res = await saveQuizTemplateAction("mk-calc", null, {
        title: `Kuis Kategori ${cat}`,
        category: cat,
        visibility: "free",
        timeLimitSeconds: 1200,
        maxAttempts: 2,
        selectionRules: { count: 5, tags: [cat] },
        status: "published",
      });

      expect(res.success).toBe(true);
      expect(res.id).toBeDefined();

      // Verify canonical asesmen and blueprint are written with tutor as creator
      const [asesmenRow] = await testDb
        .select()
        .from(schema.asesmen)
        .where(eq(schema.asesmen.id, res.id))
        .limit(1);

      expect(asesmenRow).toBeDefined();
      expect(asesmenRow.creatorId).toBe("usr-tutor-1");
      expect(asesmenRow.assessmentType).toBe("quiz");
      expect(asesmenRow.status).toBe("published");

      // Verify legacy quiz_templates projection
      const [templateRow] = await testDb
        .select()
        .from(schema.quizTemplates)
        .where(eq(schema.quizTemplates.id, res.id))
        .limit(1);

      expect(templateRow).toBeDefined();
      expect(templateRow.title).toBe(`Kuis Kategori ${cat}`);
      expect(templateRow.category).toBe(cat);
    }

    // Verify audit logs
    const audits = await testDb.select().from(schema.auditMutasi);
    const successAudits = audits.filter((a) => a.entityType === "quiz_template" && a.action === "quiz:create");
    expect(successAudits.length).toBe(4);
    for (const audit of successAudits) {
      expect(audit.outcome).toBe("success");
      expect(audit.actorId).toBe("usr-tutor-1");
      expect(audit.courseId).toBe("mk-calc");
      // Verify raw questions are not exposed in audit afterSnapshot
      const envelope = typeof audit.afterSnapshot === "string" ? JSON.parse(audit.afterSnapshot) : (audit.afterSnapshot || {});
      const payload = envelope?.snapshot || envelope;
      expect(payload.title).toBeDefined();
      expect(payload.category).toBeDefined();
      expect(payload.questions).toBeUndefined();
    }
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. Native Tutor Quiz Update & Creator Immutability
   * ──────────────────────────────────────────────────────────────────────── */
  it("allows tutor to update quiz without overwriting canonical creatorId", async () => {
    // Step 1: Tutor 1 creates the quiz
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
    const createRes = await saveQuizTemplateAction("mk-calc", null, {
      title: "Kuis Aljabar Asli",
      category: "weekly",
      visibility: "free",
      timeLimitSeconds: 1800,
      maxAttempts: 1,
      selectionRules: { count: 10 },
      status: "draft",
    });

    const quizId = createRes.id;

    // Step 2: Tutor 2 edits the quiz
    mockSession = { user: { id: "usr-tutor-2", role: "teacher" } };
    const updateRes = await saveQuizTemplateAction("mk-calc", quizId, {
      title: "Kuis Aljabar Direvisi Tutor 2",
      category: "chapter",
      visibility: "free",
      timeLimitSeconds: 2400,
      maxAttempts: 3,
      selectionRules: { count: 8 },
      status: "published",
    });

    expect(updateRes.success).toBe(true);

    // Verify canonical creatorId remains Tutor 1
    const [asesmenRow] = await testDb
      .select()
      .from(schema.asesmen)
      .where(eq(schema.asesmen.id, quizId))
      .limit(1);

    expect(asesmenRow.creatorId).toBe("usr-tutor-1");
    expect(asesmenRow.title).toBe("Kuis Aljabar Direvisi Tutor 2");

    // Verify audit log has Tutor 2 as actor
    const audits = await testDb.select().from(schema.auditMutasi);
    const updateAudit = audits.find((a) => a.entityType === "quiz_template" && a.action === "quiz:update");
    expect(updateAudit).toBeDefined();
    expect(updateAudit?.actorId).toBe("usr-tutor-2");
    expect(updateAudit?.outcome).toBe("success");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 3. Native Publish / Draft Toggle
   * ──────────────────────────────────────────────────────────────────────── */
  it("allows tutor to toggle quiz status between draft and published natively", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    const createRes = await saveQuizTemplateAction("mk-calc", null, {
      title: "Kuis Status Toggle",
      category: "daily",
      visibility: "free",
      timeLimitSeconds: 600,
      maxAttempts: 1,
      selectionRules: { count: 5 },
      status: "draft",
    });

    // Toggle to published
    const publishRes = await toggleQuizTemplateStatusAction("mk-calc", createRes.id, "published");
    expect(publishRes.success).toBe(true);
    expect(publishRes.status).toBe("published");

    let [tpl] = await testDb.select().from(schema.quizTemplates).where(eq(schema.quizTemplates.id, createRes.id));
    expect(tpl.status).toBe("published");

    // Toggle back to draft
    const draftRes = await toggleQuizTemplateStatusAction("mk-calc", createRes.id, "draft");
    expect(draftRes.success).toBe(true);
    expect(draftRes.status).toBe("draft");

    [tpl] = await testDb.select().from(schema.quizTemplates).where(eq(schema.quizTemplates.id, createRes.id));
    expect(tpl.status).toBe("draft");

    // Verify audit records for toggle
    const audits = await testDb.select().from(schema.auditMutasi);
    const toggleAudits = audits.filter((a) => a.action === "quiz:toggle_status");
    expect(toggleAudits.length).toBe(2);
    expect(toggleAudits[0].outcome).toBe("success");
    expect(toggleAudits[1].outcome).toBe("success");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 4. Native Tutor Quiz Deletion
   * ──────────────────────────────────────────────────────────────────────── */
  it("allows tutor to delete quiz template natively and records audit", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    const createRes = await saveQuizTemplateAction("mk-calc", null, {
      title: "Kuis Akan Dihapus",
      category: "daily",
      visibility: "free",
      timeLimitSeconds: 600,
      maxAttempts: 1,
      selectionRules: { count: 5 },
    });

    const deleteRes = await deleteQuizTemplateAction("mk-calc", createRes.id);
    expect(deleteRes.success).toBe(true);

    const [tpl] = await testDb.select().from(schema.quizTemplates).where(eq(schema.quizTemplates.id, createRes.id));
    expect(tpl).toBeUndefined();

    const [asesmenRow] = await testDb.select().from(schema.asesmen).where(eq(schema.asesmen.id, createRes.id));
    expect(asesmenRow).toBeUndefined();

    const audits = await testDb.select().from(schema.auditMutasi);
    const delAudit = audits.find((a) => a.action === "quiz:delete" && a.outcome === "success");
    expect(delAudit).toBeDefined();
    expect(delAudit?.actorId).toBe("usr-tutor-1");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 5. Rejection of Simulation / Tryout Authoring by Tutor
   * ──────────────────────────────────────────────────────────────────────── */
  it("strictly rejects tutor attempting simulation category or tryout scope", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // Simulation category creation rejected
    await expect(
      saveQuizTemplateAction("mk-calc", null, {
        title: "Kuis Simulasi Ditolak",
        category: "simulation",
        visibility: "free",
        timeLimitSeconds: 3600,
        maxAttempts: 1,
        selectionRules: { count: 20 },
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);

    // Tryout assessmentType creation rejected
    await expect(
      saveQuizTemplateAction("mk-calc", null, {
        title: "Kuis Tryout Ditolak",
        category: "chapter",
        visibility: "free",
        timeLimitSeconds: 3600,
        maxAttempts: 1,
        selectionRules: { count: 20, assessmentType: "tryout" },
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 6. Rejection of Mutation on Existing Simulation Quiz
   * ──────────────────────────────────────────────────────────────────────── */
  it("rejects tutor mutation and toggle status on existing simulation template", async () => {
    const now = new Date();
    // Insert existing simulation template
    await testDb.insert(schema.quizTemplates).values({
      id: "tpl-sim-course1",
      courseId: "mk-calc",
      title: "Simulasi Ujian Kalkulus",
      category: "simulation",
      visibility: "paid",
      status: "published",
      selectionRules: JSON.stringify({ count: 25, assessmentType: "tryout" }),
      createdAt: now,
      updatedAt: now,
    });

    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // Edit simulation rejected
    await expect(
      saveQuizTemplateAction("mk-calc", "tpl-sim-course1", {
        title: "Simulasi Diubah Tutor",
        category: "simulation",
        visibility: "free",
        timeLimitSeconds: 1800,
        maxAttempts: 1,
        selectionRules: { count: 20 },
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);

    // Toggle status on simulation rejected
    await expect(
      toggleQuizTemplateStatusAction("mk-calc", "tpl-sim-course1", "draft"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);

    // Delete simulation rejected
    await expect(
      deleteQuizTemplateAction("mk-calc", "tpl-sim-course1"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 7. Canonical Tryout Derivation From Selection Rules (Admin Path)
   * ──────────────────────────────────────────────────────────────────────── */
  it("derives canonical tryout assessmentType from selection rules regardless of category", async () => {
    const now = new Date();
    await testDb.insert(schema.user).values({
      id: "usr-admin-1",
      name: "Admin Satu",
      email: "admin1@zyx.test",
      role: "admin",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    await testDb.insert(schema.pengguna).values({
      id: "usr-admin-1",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-admin-native",
      penggunaId: "usr-admin-1",
      peranId: "peran-admin",
      source: "seed",
      createdAt: now,
    }).onConflictDoNothing();

    mockSession = { user: { id: "usr-admin-1", role: "admin" } };

    const res = await saveQuizTemplateAction("mk-calc", null, {
      title: "Simulasi Bab Bertipe Tryout",
      category: "chapter",
      visibility: "paid",
      timeLimitSeconds: 5400,
      maxAttempts: 1,
      selectionRules: { count: 20, assessmentType: "tryout" },
      status: "published",
    });

    expect(res.success).toBe(true);

    const [asesmenRow] = await testDb
      .select()
      .from(schema.asesmen)
      .where(eq(schema.asesmen.id, res.id))
      .limit(1);
    expect(asesmenRow).toBeDefined();
    expect(asesmenRow.assessmentType).toBe("tryout");

    const [blueprintRow] = await testDb
      .select()
      .from(schema.blueprintAsesmen)
      .where(eq(schema.blueprintAsesmen.mataKuliahId, "mk-calc"))
      .limit(1);
    expect(blueprintRow).toBeDefined();
    expect(blueprintRow.assessmentType).toBe("tryout");
  });
});
