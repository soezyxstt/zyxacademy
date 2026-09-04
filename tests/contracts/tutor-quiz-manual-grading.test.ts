import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/db/schema";
import { TUTOR_QUIZ_GRADING_ERRORS } from "@/lib/tutor/quiz-grading";

let mockSession: any = null;

const testDirectory = mkdtempSync(join(tmpdir(), "zyx-tutor-quiz-grading-"));
const client = createClient({ url: `file:${join(testDirectory, "test.db")}` });
const testDb = drizzle(client, { schema });

afterAll(() => {
  client.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

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

const recomputeCalls: any[] = [];
mock.module("@/lib/pemahaman/evidence", () => ({
  requestIdeaMasteryRecompute: async (input: any) => {
    recomputeCalls.push(input);
  },
}));

import {
  getCoursePendingQuizAttempts,
  getQuizAttemptDetailsForGrading,
} from "@/lib/tutor/quiz-grading";
import { gradeQuizAttemptAction } from "@/app/actions/tutor-quiz-grading";

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
    CREATE TABLE IF NOT EXISTS bab (
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
      status TEXT NOT NULL DEFAULT 'published',
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
    CREATE TABLE IF NOT EXISTS student_quiz_attempts (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES user(id),
      template_id TEXT NOT NULL REFERENCES quiz_templates(id),
      score INTEGER,
      duration_seconds INTEGER,
      status TEXT NOT NULL DEFAULT 'completed',
      grading_status TEXT NOT NULL DEFAULT 'not_required',
      questions_snapshot TEXT NOT NULL,
      answers_snapshot TEXT,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      submitted_at INTEGER,
      strong_areas TEXT,
      weak_areas TEXT,
      recommended_next_steps TEXT,
      mastery_before TEXT
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS asesmen (
      id TEXT PRIMARY KEY,
      blueprint_asesmen_id TEXT,
      mata_kuliah_id TEXT,
      title TEXT,
      assessment_type TEXT,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'published',
      generation_hash TEXT,
      creator_id TEXT,
      curator_id TEXT,
      published_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS percobaan_asesmen (
      id TEXT PRIMARY KEY,
      asesmen_id TEXT NOT NULL,
      pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
      status TEXT NOT NULL DEFAULT 'in_progress',
      rendered_question_snapshot TEXT NOT NULL,
      option_order_snapshot TEXT NOT NULL,
      grading_policy_snapshot TEXT NOT NULL,
      content_version INTEGER NOT NULL DEFAULT 1,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      submitted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS item_asesmen (
      id TEXT PRIMARY KEY,
      asesmen_id TEXT NOT NULL,
      soal_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      rendered_question_snapshot TEXT NOT NULL,
      option_order_snapshot TEXT NOT NULL,
      grading_policy_snapshot TEXT NOT NULL,
      content_version INTEGER NOT NULL DEFAULT 1,
      generation_hash TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS jawaban_murid (
      id TEXT PRIMARY KEY,
      percobaan_asesmen_id TEXT NOT NULL REFERENCES percobaan_asesmen(id),
      item_asesmen_id TEXT NOT NULL REFERENCES item_asesmen(id),
      rendered_question_snapshot TEXT NOT NULL,
      option_order_snapshot TEXT NOT NULL,
      response_snapshot TEXT NOT NULL,
      grading_policy_snapshot TEXT NOT NULL,
      content_version INTEGER NOT NULL DEFAULT 1,
      score REAL,
      status TEXT NOT NULL DEFAULT 'ungraded',
      reviewer_id TEXT REFERENCES pengguna(id),
      review_notes TEXT,
      reviewed_at INTEGER,
      review_revision INTEGER NOT NULL DEFAULT 0,
      answered_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ide (
      id TEXT PRIMARY KEY,
      mata_kuliah_id TEXT,
      bab_id TEXT,
      concept_id TEXT,
      stable_key TEXT,
      code TEXT,
      canonical_statement TEXT,
      concise_explanation TEXT,
      latex TEXT,
      knowledge_kind TEXT DEFAULT 'other',
      instructional_role TEXT DEFAULT 'core',
      difficulty_metadata TEXT DEFAULT '{}',
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'published',
      source_policy TEXT DEFAULT 'source_grounded',
      schema_version TEXT DEFAULT '1.0',
      semantic_hash TEXT,
      generation_hash TEXT,
      creator_id TEXT,
      curator_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS soal_ide (
      id TEXT PRIMARY KEY,
      soal_id TEXT NOT NULL,
      ide_id TEXT NOT NULL REFERENCES ide(id),
      weight REAL NOT NULL,
      role TEXT NOT NULL DEFAULT 'primary',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS bukti_ide_jawaban (
      id TEXT PRIMARY KEY,
      jawaban_murid_id TEXT NOT NULL REFERENCES jawaban_murid(id),
      ide_id TEXT NOT NULL REFERENCES ide(id),
      score_contribution REAL NOT NULL,
      weight REAL NOT NULL,
      confidence INTEGER NOT NULL,
      evidence_source TEXT NOT NULL,
      rubric_version TEXT NOT NULL,
      derivation_status TEXT NOT NULL,
      ambiguous INTEGER NOT NULL DEFAULT 0,
      affects_mastery INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_mutasi (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES pengguna(id),
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

const ALL_TABLES = [
  "audit_mutasi",
  "bukti_ide_jawaban",
  "soal_ide",
  "ide",
  "jawaban_murid",
  "item_asesmen",
  "percobaan_asesmen",
  "asesmen",
  "student_quiz_attempts",
  "quiz_templates",
  "penugasan_tutor",
  "tutor_courses",
  "bab",
  "mata_kuliah",
  "courses",
  "pengguna_peran",
  "pengguna",
  "peran",
  "user",
];

async function purgeTables() {
  for (const t of ALL_TABLES) {
    try {
      await client.execute(`DELETE FROM ${t}`);
    } catch {}
  }
}

async function seedTestData() {
  const now = new Date();

  // Roles
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]).onConflictDoNothing();

  // Assigned Tutor
  await testDb.insert(schema.user).values({
    id: "usr-tutor-assigned",
    name: "Tutor Kalkulus",
    email: "tutor.calc@zyx.test",
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await testDb.insert(schema.pengguna).values({
    id: "usr-tutor-assigned",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-tutor-assigned",
    penggunaId: "usr-tutor-assigned",
    peranId: "peran-tutor",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Unassigned Tutor
  await testDb.insert(schema.user).values({
    id: "usr-tutor-unassigned",
    name: "Tutor Lain",
    email: "tutor.other@zyx.test",
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await testDb.insert(schema.pengguna).values({
    id: "usr-tutor-unassigned",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-tutor-unassigned",
    penggunaId: "usr-tutor-unassigned",
    peranId: "peran-tutor",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Admin
  await testDb.insert(schema.user).values({
    id: "usr-admin",
    name: "Admin User",
    email: "admin@zyx.test",
    role: "admin",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await testDb.insert(schema.pengguna).values({
    id: "usr-admin",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await testDb.insert(schema.penggunaPeran).values({
    id: "pp-admin",
    penggunaId: "usr-admin",
    peranId: "peran-admin",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Student
  await testDb.insert(schema.user).values({
    id: "usr-student",
    name: "Murid Hebat",
    email: "student@zyx.test",
    role: "student",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await testDb.insert(schema.pengguna).values({
    id: "usr-student",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Course 1: Kalkulus
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
  await client.execute({
    sql: `INSERT OR IGNORE INTO bab
          (id, mata_kuliah_id, code, title, order_index, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: ["bab-calc", "mk-calc", "BAB-01", "Turunan", 0, now, now],
  });
  await testDb.insert(schema.penugasanTutor).values({
    id: "pt-calc",
    penggunaId: "usr-tutor-assigned",
    mataKuliahId: "mk-calc",
    status: "active",
    assignmentScope: "course",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Course 2: Fisika (unassigned)
  await testDb.insert(schema.courses).values({
    id: "crs-physics",
    title: "Fisika 1",
    category: "Fisika",
  }).onConflictDoNothing();
  await testDb.insert(schema.mataKuliah).values({
    id: "mk-physics",
    code: "FI-1101",
    title: "Fisika 1",
    status: "active",
    legacyCourseId: "crs-physics",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Idea for Kalkulus
  await testDb.insert(schema.ide).values({
    id: "ide-calc-deriv",
    mataKuliahId: "mk-calc",
    babId: "bab-calc",
    stableKey: "IDE-01",
    code: "IDE-01",
    canonicalStatement: "Turunan menyatakan laju perubahan sesaat.",
    conciseExplanation: "Penjelasan konsep turunan.",
    semanticHash: "sem-deriv",
    generationHash: "gen-deriv",
    creatorId: "usr-tutor-assigned",
    status: "published",
    version: 1,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // SoalIde mapping for q-essay-1
  await testDb.insert(schema.soalIde).values({
    id: "si-essay-1",
    soalId: "q-essay-1",
    ideId: "ide-calc-deriv",
    weight: 1.0,
    role: "primary",
  }).onConflictDoNothing();

  // Quiz Template in Kalkulus
  await testDb.insert(schema.quizTemplates).values({
    id: "tpl-calc-free-response",
    courseId: "mk-calc",
    title: "Kuis Bab 2 Turunan",
    category: "chapter",
    visibility: "free",
    status: "published",
    selectionRules: JSON.stringify({ count: 3 }),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Quiz Template in Physics
  await testDb.insert(schema.quizTemplates).values({
    id: "tpl-physics-quiz",
    courseId: "mk-physics",
    title: "Kuis Fisika Vektor",
    category: "chapter",
    visibility: "free",
    status: "published",
    selectionRules: JSON.stringify({ count: 2 }),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
}

describe("Tutor Quiz Manual Grading Contracts", () => {
  beforeEach(async () => {
    mockSession = null;
    recomputeCalls.length = 0;
    await setupTables();
    await purgeTables();
    await seedTestData();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 1. Authorization and Access Restrictions
   * ──────────────────────────────────────────────────────────────────────── */
  describe("Authorization & Access Scoping", () => {
    it("rejects grading attempt by unassigned tutor", async () => {
      mockSession = { user: { id: "usr-tutor-unassigned", role: "teacher" } };

      await expect(
        gradeQuizAttemptAction({
          courseId: "mk-calc",
          attemptId: "att-calc-pending-1",
          items: [{ questionId: "q-essay-1", score: 85, expectedRevision: 0 }],
        }),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED: NO_ACTIVE_ASSIGNMENT");
    });

    it("rejects grading attempt by admin when allowAdmin is false", async () => {
      mockSession = { user: { id: "usr-admin", role: "admin" } };

      await expect(
        gradeQuizAttemptAction({
          courseId: "mk-calc",
          attemptId: "att-calc-pending-1",
          items: [{ questionId: "q-essay-1", score: 85, expectedRevision: 0 }],
        }),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED");
    });

    it("allows grading attempt by assigned tutor", async () => {
      const now = new Date();
      // Setup pending attempt
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-calc-pending-1",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-mc-1", question_type: "multiple_choice", prompt: "2+2?", options: ["4", "5"], correct_indices: [0] },
          { id: "q-essay-1", question_type: "essay", prompt: "Jelaskan definisi turunan." },
        ]),
        answersSnapshot: JSON.stringify({
          "q-mc-1": 0,
          "q-essay-1": "Turunan adalah limit fungsi delta y per delta x.",
        }),
        startedAt: now,
        submittedAt: now,
      });

      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      const res = await gradeQuizAttemptAction({
        courseId: "mk-calc",
        attemptId: "att-calc-pending-1",
        items: [{ questionId: "q-essay-1", score: 90, expectedRevision: 0, reviewNotes: "Bagus sekali." }],
      });

      expect(res.success).toBe(true);
      expect(res.gradingStatus).toBe("graded");
      expect(res.score).toBe(95); // (100 + 90) / 2 = 95%
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. Course / Template / Attempt Mismatches
   * ──────────────────────────────────────────────────────────────────────── */
  describe("Course, Template, and Attempt Mismatch Guards", () => {
    beforeEach(async () => {
      const now = new Date();
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-physics-1",
        studentId: "usr-student",
        templateId: "tpl-physics-quiz",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-phy-1", question_type: "essay", prompt: "Hukum Newton 1" },
        ]),
        answersSnapshot: JSON.stringify({ "q-phy-1": "Jawaban fisika" }),
        startedAt: now,
        submittedAt: now,
      });
    });

    it("rejects grading attempt belonging to another course claimed under current course", async () => {
      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      await expect(
        gradeQuizAttemptAction({
          courseId: "mk-calc",
          attemptId: "att-physics-1",
          items: [{ questionId: "q-phy-1", score: 80, expectedRevision: 0 }],
        }),
      ).rejects.toThrow(TUTOR_QUIZ_GRADING_ERRORS.COURSE_MISMATCH);
    });

    it("rejects grading non-existent attempt", async () => {
      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      await expect(
        gradeQuizAttemptAction({
          courseId: "mk-calc",
          attemptId: "att-ghost-404",
          items: [{ questionId: "q-essay-1", score: 80, expectedRevision: 0 }],
        }),
      ).rejects.toThrow(TUTOR_QUIZ_GRADING_ERRORS.ATTEMPT_NOT_FOUND);
    });

    it("rejects grading question not present in attempt snapshot", async () => {
      const now = new Date();
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-calc-valid",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-essay-1", question_type: "essay", prompt: "Jelaskan definisi turunan." },
        ]),
        answersSnapshot: JSON.stringify({ "q-essay-1": "Jawaban" }),
        startedAt: now,
        submittedAt: now,
      });

      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      await expect(
        gradeQuizAttemptAction({
          courseId: "mk-calc",
          attemptId: "att-calc-valid",
          items: [{ questionId: "q-foreign-999", score: 75, expectedRevision: 0 }],
        }),
      ).rejects.toThrow(TUTOR_QUIZ_GRADING_ERRORS.QUESTION_NOT_IN_ATTEMPT);
    });

    it("rejects manual override of objective multiple choice questions", async () => {
      const now = new Date();
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-calc-mc",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-mc-1", question_type: "multiple_choice", prompt: "2+2?", options: ["4", "5"], correct_indices: [0] },
          { id: "q-essay-1", question_type: "essay", prompt: "Definisi turunan" },
        ]),
        answersSnapshot: JSON.stringify({ "q-mc-1": 1, "q-essay-1": "Jawaban" }),
        startedAt: now,
        submittedAt: now,
      });

      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      await expect(
        gradeQuizAttemptAction({
          courseId: "mk-calc",
          attemptId: "att-calc-mc",
          items: [{ questionId: "q-mc-1", score: 100, expectedRevision: 0 }],
        }),
      ).rejects.toThrow(TUTOR_QUIZ_GRADING_ERRORS.OBJECTIVE_OVERRIDE_FORBIDDEN);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 3. Partial vs Final Save & Score Recomputation
   * ──────────────────────────────────────────────────────────────────────── */
  describe("Partial vs Final Save & Score Recomputation", () => {
    beforeEach(async () => {
      const now = new Date();
      // 3 questions: 1 multiple_choice (correct), 1 short_answer (incorrect), 1 essay (unscored)
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-multi-question",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-mc", question_type: "multiple_choice", prompt: "Pilihan", options: ["A", "B"], correct_indices: [0] },
          { id: "q-sa", question_type: "short_answer", prompt: "Isian", acceptable_answers: ["tepat"] },
          { id: "q-es", question_type: "essay", prompt: "Esai" },
        ]),
        answersSnapshot: JSON.stringify({
          "q-mc": 0, // correct (1.0)
          "q-sa": "kurang tepat", // incorrect (0.0)
          "q-es": "Jawaban esai siswa",
        }),
        startedAt: now,
        submittedAt: now,
      });
    });

    it("partial save when short-answer overridden but essay remains unreviewed keeps status pending and score null", async () => {
      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      // Override short answer to 100%, without grading essay
      const res = await gradeQuizAttemptAction({
        courseId: "mk-calc",
        attemptId: "att-multi-question",
        items: [{ questionId: "q-sa", score: 100, expectedRevision: 0, reviewNotes: "Jawaban ekuivalen diterima." }],
      });

      expect(res.success).toBe(true);
      expect(res.gradingStatus).toBe("pending");
      expect(res.score).toBeNull();

      const [attemptInDb] = await testDb
        .select()
        .from(schema.studentQuizAttempts)
        .where(eq(schema.studentQuizAttempts.id, "att-multi-question"))
        .limit(1);

      expect(attemptInDb.gradingStatus).toBe("pending");
      expect(attemptInDb.score).toBeNull();
    });

    it("finalizes attempt with equal question weights when all essays are reviewed", async () => {
      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      // Grade essay with 80% (q-mc is 100%, q-sa is 0%, q-es is 80% -> average is (1 + 0 + 0.8)/3 = 60%)
      const res = await gradeQuizAttemptAction({
        courseId: "mk-calc",
        attemptId: "att-multi-question",
        items: [{ questionId: "q-es", score: 80, expectedRevision: 0, reviewNotes: "Argumen cukup kuat." }],
      });

      expect(res.success).toBe(true);
      expect(res.gradingStatus).toBe("graded");
      expect(res.score).toBe(60);

      const [attemptInDb] = await testDb
        .select()
        .from(schema.studentQuizAttempts)
        .where(eq(schema.studentQuizAttempts.id, "att-multi-question"))
        .limit(1);

      expect(attemptInDb.gradingStatus).toBe("graded");
      expect(attemptInDb.score).toBe(60);
    });

    it("allows short-answer override alongside essay review in same finalization", async () => {
      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      // Override q-sa to 100% and grade q-es to 80% -> average is (1 + 1 + 0.8)/3 = 93%
      const res = await gradeQuizAttemptAction({
        courseId: "mk-calc",
        attemptId: "att-multi-question",
        items: [
          { questionId: "q-sa", score: 100, expectedRevision: 0, reviewNotes: "Diterima" },
          { questionId: "q-es", score: 80, expectedRevision: 0, reviewNotes: "Bagus" },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.gradingStatus).toBe("graded");
      expect(res.score).toBe(93);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 4. CAS Concurrency Guard
   * ──────────────────────────────────────────────────────────────────────── */
  describe("Optimistic Concurrency Protection (CAS)", () => {
    it("rejects grading when expected revision mismatches current review revision", async () => {
      const now = new Date();
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-cas-test",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-essay-cas", question_type: "essay", prompt: "Esai" },
        ]),
        answersSnapshot: JSON.stringify({ "q-essay-cas": "Jawaban" }),
        startedAt: now,
        submittedAt: now,
      });

      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      // First review succeeds and bumps revision to 1
      const res1 = await gradeQuizAttemptAction({
        courseId: "mk-calc",
        attemptId: "att-cas-test",
        items: [{ questionId: "q-essay-cas", score: 70, expectedRevision: 0 }],
      });
      expect(res1.success).toBe(true);

      // Concurrent reviewer passes stale revision 0
      await expect(
        gradeQuizAttemptAction({
          courseId: "mk-calc",
          attemptId: "att-cas-test",
          items: [{ questionId: "q-essay-cas", score: 90, expectedRevision: 0 }],
        }),
      ).rejects.toThrow(TUTOR_QUIZ_GRADING_ERRORS.CAS_CONFLICT);

      // Passing updated revision 1 succeeds
      const res2 = await gradeQuizAttemptAction({
        courseId: "mk-calc",
        attemptId: "att-cas-test",
        items: [{ questionId: "q-essay-cas", score: 90, expectedRevision: 1 }],
      });
      expect(res2.success).toBe(true);
      expect(res2.score).toBe(90);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 5. Canonical Evidence & Mastery Trigger Boundary
   * ──────────────────────────────────────────────────────────────────────── */
  describe("Canonical Evidence & Recomputation Trigger", () => {
    it("creates reviewed bukti_ide_jawaban only after human review and triggers recompute", async () => {
      const now = new Date();
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-evidence-test",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-essay-1", question_type: "essay", prompt: "Jelaskan definisi turunan." },
        ]),
        answersSnapshot: JSON.stringify({ "q-essay-1": "Jawaban esai" }),
        startedAt: now,
        submittedAt: now,
      });

      // Initially, no evidence exists for this attempt
      const evidenceBefore = await testDb.select().from(schema.buktiIdeJawaban);
      expect(evidenceBefore.length).toBe(0);

      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      await gradeQuizAttemptAction({
        courseId: "mk-calc",
        attemptId: "att-evidence-test",
        items: [{ questionId: "q-essay-1", score: 85, expectedRevision: 0 }],
      });

      // Evidence should now exist with reviewed derivationStatus
      const evidenceAfter = await testDb.select().from(schema.buktiIdeJawaban);
      expect(evidenceAfter.length).toBe(1);
      expect(evidenceAfter[0].ideId).toBe("ide-calc-deriv");
      expect(evidenceAfter[0].derivationStatus).toBe("reviewed");
      expect(evidenceAfter[0].ambiguous).toBe(false);
      expect(evidenceAfter[0].affectsMastery).toBe(true);
      expect(evidenceAfter[0].scoreContribution).toBe(0.85);

      // Recompute must be triggered
      expect(recomputeCalls.length).toBe(1);
      expect(recomputeCalls[0].penggunaId).toBe("usr-student");
      expect(recomputeCalls[0].ideId).toBe("ide-calc-deriv");
    });

    it("preserves grade without error or invented evidence when question has no canonical Idea mapping", async () => {
      const now = new Date();
      // q-unmapped has no entry in soal_ide
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-unmapped-test",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-unmapped-essay", question_type: "essay", prompt: "Pertanyaan bebas tanpa ide" },
        ]),
        answersSnapshot: JSON.stringify({ "q-unmapped-essay": "Jawaban refleksi" }),
        startedAt: now,
        submittedAt: now,
      });

      mockSession = { user: { id: "usr-tutor-assigned", role: "teacher" } };

      const res = await gradeQuizAttemptAction({
        courseId: "mk-calc",
        attemptId: "att-unmapped-test",
        items: [{ questionId: "q-unmapped-essay", score: 95, expectedRevision: 0 }],
      });

      expect(res.success).toBe(true);
      expect(res.gradingStatus).toBe("graded");
      expect(res.score).toBe(95);

      // No evidence should be invented
      const evidence = await testDb.select().from(schema.buktiIdeJawaban);
      expect(evidence.length).toBe(0);
      expect(recomputeCalls.length).toBe(0);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 6. Queue Retrieval & Legacy Defaults
   * ──────────────────────────────────────────────────────────────────────── */
  describe("Queue Retrieval & Legacy Defaults", () => {
    it("returns pending attempts in course queue and excludes graded or not_required attempts", async () => {
      const now = new Date();

      // 1. Pending attempt with 2 essays
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-pending-queue-1",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q1", question_type: "essay", prompt: "Esai 1" },
          { id: "q2", question_type: "essay", prompt: "Esai 2" },
        ]),
        answersSnapshot: JSON.stringify({ q1: "Ans 1", q2: "Ans 2" }),
        startedAt: now,
        submittedAt: now,
      });

      // 2. Graded attempt
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-graded-queue-2",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "graded",
        score: 85,
        questionsSnapshot: JSON.stringify([
          { id: "q1", question_type: "essay", prompt: "Esai 1" },
        ]),
        answersSnapshot: JSON.stringify({ q1: "Ans 1" }),
        startedAt: now,
        submittedAt: now,
      });

      // 3. Legacy attempt without essays (not_required)
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-not-required-queue-3",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "not_required",
        score: 100,
        questionsSnapshot: JSON.stringify([
          { id: "q-mc", question_type: "multiple_choice", prompt: "MC", options: ["A", "B"], correct_indices: [0] },
        ]),
        answersSnapshot: JSON.stringify({ "q-mc": 0 }),
        startedAt: now,
        submittedAt: now,
      });

      const queue = await getCoursePendingQuizAttempts("mk-calc", "usr-tutor-assigned");
      expect(queue.length).toBe(1);
      expect(queue[0].id).toBe("att-pending-queue-1");
      expect(queue[0].essayCount).toBe(2);
      expect(queue[0].remainingEssayCount).toBe(2);
    });

    it("fetches detailed attempt view for grading", async () => {
      const now = new Date();
      await testDb.insert(schema.studentQuizAttempts).values({
        id: "att-detail-view",
        studentId: "usr-student",
        templateId: "tpl-calc-free-response",
        status: "completed",
        gradingStatus: "pending",
        score: null,
        questionsSnapshot: JSON.stringify([
          { id: "q-mc", question_type: "multiple_choice", prompt: "1+1?", options: ["2", "3"], correct_indices: [0] },
          { id: "q-sa", question_type: "short_answer", prompt: "Ibu kota?", acceptable_answers: ["Jakarta"] },
          { id: "q-es", question_type: "essay", prompt: "Opini anda" },
        ]),
        answersSnapshot: JSON.stringify({
          "q-mc": 0,
          "q-sa": "Jakarta",
          "q-es": "Saya setuju.",
        }),
        startedAt: now,
        submittedAt: now,
      });

      const details = await getQuizAttemptDetailsForGrading("mk-calc", "att-detail-view", "usr-tutor-assigned");
      expect(details).not.toBeNull();
      expect(details?.attemptId).toBe("att-detail-view");
      expect(details?.questions.length).toBe(3);

      const mc = details?.questions.find((q) => q.id === "q-mc");
      expect(mc?.isFreeResponse).toBe(false);
      expect(mc?.isDeterministicCorrect).toBe(true);

      const sa = details?.questions.find((q) => q.id === "q-sa");
      expect(sa?.isShortAnswer).toBe(true);
      expect(sa?.isDeterministicCorrect).toBe(true);

      const es = details?.questions.find((q) => q.id === "q-es");
      expect(es?.isEssay).toBe(true);
      expect(es?.currentScore).toBeNull();
    });
  });
});
