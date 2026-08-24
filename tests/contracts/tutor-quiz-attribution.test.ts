import { describe, expect, it, mock, beforeEach } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

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
  getTutorQuizzesWithAttribution,
  getTutorQuizWithAttribution,
  getTutorQuestionBank,
} from "@/lib/tutor/quiz-read-model";
import {
  saveQuizTemplateAction,
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

async function seedAttributionData() {
  const now = new Date();
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]).onConflictDoNothing();

  // Tutor Alpha
  await testDb.insert(schema.user).values({
    id: "usr-tutor-alpha",
    name: "Dr. Alpha S.Si",
    email: "alpha@zyx.test",
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.pengguna).values({
    id: "usr-tutor-alpha",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-tutor-alpha",
    penggunaId: "usr-tutor-alpha",
    peranId: "peran-tutor",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Tutor Beta
  await testDb.insert(schema.user).values({
    id: "usr-tutor-beta",
    name: "Beta M.Pd",
    email: "beta@zyx.test",
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.pengguna).values({
    id: "usr-tutor-beta",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-tutor-beta",
    penggunaId: "usr-tutor-beta",
    peranId: "peran-tutor",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Course 1 (Kalkulus)
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
      id: "pt-tutor-alpha",
      penggunaId: "usr-tutor-alpha",
      mataKuliahId: "mk-calc",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "pt-tutor-beta",
      penggunaId: "usr-tutor-beta",
      mataKuliahId: "mk-calc",
      status: "active",
      assignmentScope: "course",
      createdAt: now,
      updatedAt: now,
    },
  ]).onConflictDoNothing();

  // Course 2 (Fisika)
  await testDb.insert(schema.courses).values({
    id: "crs-phys",
    title: "Fisika 1",
    category: "Fisika",
  }).onConflictDoNothing();

  await testDb.insert(schema.mataKuliah).values({
    id: "mk-phys",
    code: "FI-1101",
    title: "Fisika 1",
    status: "active",
    legacyCourseId: "crs-phys",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

describe("Canonical Creator Attribution Contracts", () => {
  beforeEach(async () => {
    await setupTables();
    await clearAllData();
    await seedAttributionData();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 1. Creator Attribution Read Model Join
   * ──────────────────────────────────────────────────────────────────────── */
  it("joins asesmen.creatorId through pengguna and user to return creator identity", async () => {
    mockSession = { user: { id: "usr-tutor-alpha", role: "teacher" } };

    const createRes = await saveQuizTemplateAction("mk-calc", null, {
      title: "Kuis Integral Lipat Dua",
      category: "chapter",
      visibility: "free",
      timeLimitSeconds: 1800,
      maxAttempts: 1,
      selectionRules: { count: 5 },
      status: "published",
    });

    const quizzes = await getTutorQuizzesWithAttribution("mk-calc", testDb);
    expect(quizzes.length).toBe(1);

    const quiz = quizzes[0];
    expect(quiz.id).toBe(createRes.id);
    expect(quiz.title).toBe("Kuis Integral Lipat Dua");
    expect(quiz.creatorId).toBe("usr-tutor-alpha");
    expect(quiz.creatorName).toBe("Dr. Alpha S.Si");
    expect(quiz.creatorEmail).toBe("alpha@zyx.test");
    expect(quiz.creatorRole).toBe("teacher");
    expect(quiz.assessmentType).toBe("quiz");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. Creator Immutability on Edits
   * ──────────────────────────────────────────────────────────────────────── */
  it("preserves original creator identity when another tutor edits the quiz", async () => {
    // Step 1: Tutor Alpha creates quiz
    mockSession = { user: { id: "usr-tutor-alpha", role: "teacher" } };
    const createRes = await saveQuizTemplateAction("mk-calc", null, {
      title: "Kuis Awal Alpha",
      category: "weekly",
      visibility: "free",
      timeLimitSeconds: 1200,
      maxAttempts: 2,
      selectionRules: { count: 10 },
      status: "draft",
    });

    // Step 2: Tutor Beta edits the quiz
    mockSession = { user: { id: "usr-tutor-beta", role: "teacher" } };
    await saveQuizTemplateAction("mk-calc", createRes.id, {
      title: "Kuis Diedit oleh Beta",
      category: "weekly",
      visibility: "free",
      timeLimitSeconds: 1500,
      maxAttempts: 2,
      selectionRules: { count: 10 },
      status: "published",
    });

    // Step 3: Fetch detail via read model
    const detail = await getTutorQuizWithAttribution("mk-calc", createRes.id, testDb);
    expect(detail).not.toBeNull();
    expect(detail?.title).toBe("Kuis Diedit oleh Beta");
    // Creator is still Alpha (immutable!)
    expect(detail?.creatorId).toBe("usr-tutor-alpha");
    expect(detail?.creatorName).toBe("Dr. Alpha S.Si");
    expect(detail?.creatorEmail).toBe("alpha@zyx.test");

    // Also check list query
    const list = await getTutorQuizzesWithAttribution("mk-calc", testDb);
    expect(list[0].creatorName).toBe("Dr. Alpha S.Si");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 3. Graceful Fallback for Legacy / Un-synced Quiz Templates
   * ──────────────────────────────────────────────────────────────────────── */
  it("returns graceful fallback attribution for legacy quiz templates without asesmen row", async () => {
    const now = new Date();
    // Insert raw legacy quiz_template directly
    await testDb.insert(schema.quizTemplates).values({
      id: "tpl-legacy-101",
      courseId: "mk-calc",
      title: "Kuis Warisan Lama",
      category: "daily",
      visibility: "free",
      status: "published",
      selectionRules: JSON.stringify({ count: 5 }),
      createdAt: now,
      updatedAt: now,
    });

    const quizzes = await getTutorQuizzesWithAttribution("mk-calc", testDb);
    const legacyQuiz = quizzes.find((q) => q.id === "tpl-legacy-101");

    expect(legacyQuiz).toBeDefined();
    expect(legacyQuiz?.title).toBe("Kuis Warisan Lama");
    expect(legacyQuiz?.creatorId).toBeNull();
    expect(legacyQuiz?.creatorName).toBe("Sistem");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 4. Course Isolation
   * ──────────────────────────────────────────────────────────────────────── */
  it("isolates quizzes strictly per course in read model", async () => {
    mockSession = { user: { id: "usr-tutor-alpha", role: "teacher" } };

    const calcQuiz = await saveQuizTemplateAction("mk-calc", null, {
      title: "Kuis Kalkulus Spesifik",
      category: "daily",
      visibility: "free",
      timeLimitSeconds: 600,
      maxAttempts: 1,
      selectionRules: { count: 5 },
    });

    // Query course 2 (Physics)
    const physQuizzes = await getTutorQuizzesWithAttribution("mk-phys", testDb);
    expect(physQuizzes.length).toBe(0);

    const crossDetail = await getTutorQuizWithAttribution("mk-phys", calcQuiz.id, testDb);
    expect(crossDetail).toBeNull();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 5. Canonical and Legacy Course ID Bridging in Read Model
   * ──────────────────────────────────────────────────────────────────────── */
  it("bridges canonical and legacy courseId in all read model functions", async () => {
    const now = new Date();
    // Insert quiz template with legacy course_id
    await testDb.insert(schema.quizTemplates).values({
      id: "tpl-legacy-bridge",
      courseId: "crs-calc",
      title: "Kuis Bridge Model",
      category: "daily",
      visibility: "free",
      status: "published",
      selectionRules: JSON.stringify({ count: 5 }),
      createdAt: now,
      updatedAt: now,
    });

    // Insert question bank item with legacy course_id
    await testDb.insert(schema.aiQuestionBank).values({
      id: "qbk-legacy-bridge",
      courseId: "crs-calc",
      prompt: "Berapakah 2 + 2?",
      options: JSON.stringify(["3", "4", "5"]),
      correctIndices: JSON.stringify([1]),
      difficulty: "easy",
      questionType: "multiple_choice",
      explanation: "2 + 2 = 4",
      tags: JSON.stringify(["dasar"]),
      status: "active",
      reviewStatus: "published",
      createdAt: now,
    });

    // Querying with canonical ID "mk-calc" returns the item with legacy courseId "crs-calc"
    const quizzesByCanonical = await getTutorQuizzesWithAttribution("mk-calc", testDb);
    expect(quizzesByCanonical.some((q) => q.id === "tpl-legacy-bridge")).toBe(true);

    const quizDetailByCanonical = await getTutorQuizWithAttribution("mk-calc", "tpl-legacy-bridge", testDb);
    expect(quizDetailByCanonical).not.toBeNull();
    expect(quizDetailByCanonical?.title).toBe("Kuis Bridge Model");

    const qbkByCanonical = await getTutorQuestionBank("mk-calc", testDb);
    expect(qbkByCanonical.some((q: { id: string }) => q.id === "qbk-legacy-bridge")).toBe(true);

    // Querying with legacy ID "crs-calc" also returns the items
    const quizzesByLegacy = await getTutorQuizzesWithAttribution("crs-calc", testDb);
    expect(quizzesByLegacy.some((q) => q.id === "tpl-legacy-bridge")).toBe(true);

    const quizDetailByLegacy = await getTutorQuizWithAttribution("crs-calc", "tpl-legacy-bridge", testDb);
    expect(quizDetailByLegacy).not.toBeNull();
    expect(quizDetailByLegacy?.title).toBe("Kuis Bridge Model");

    const qbkByLegacy = await getTutorQuestionBank("crs-calc", testDb);
    expect(qbkByLegacy.some((q: { id: string }) => q.id === "qbk-legacy-bridge")).toBe(true);
  });
});
