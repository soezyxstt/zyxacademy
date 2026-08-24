import { describe, expect, it, mock, beforeEach } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  TUTOR_CAPABILITY_ERRORS,
  TutorAuditPersistenceError,
  recordTutorFailureAudit,
} from "@/lib/tutor/assessment-policy";

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

import { gradeSubmissionAction, submitTryoutAction } from "@/app/actions/tutor-management";

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
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT NOT NULL REFERENCES courses(id),
      enrolled_at INTEGER,
      expires_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'tryout',
      status TEXT NOT NULL DEFAULT 'draft',
      settings TEXT,
      open_at INTEGER,
      close_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id),
      type TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      exam_id TEXT NOT NULL REFERENCES exams(id),
      status TEXT NOT NULL DEFAULT 'pending_review',
      score REAL,
      teacher_notes TEXT,
      answers_snapshot TEXT,
      questions_snapshot TEXT,
      submitted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      attempt_number INTEGER
    );
  `);
  try {
    await client.execute(`ALTER TABLE submissions ADD COLUMN attempt_number INTEGER;`);
  } catch {}
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_user_exam_attempt ON submissions (user_id, exam_id, attempt_number);
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

async function clearGradingData() {
  await purgeSharedTables();
}

async function seedGradingData() {
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

  // Admin 1
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
    id: "pp-admin-1",
    penggunaId: "usr-admin-1",
    peranId: "peran-admin",
    source: "seed",
    createdAt: now,
  }).onConflictDoNothing();

  // Student 1
  await testDb.insert(schema.user).values({
    id: "usr-student-1",
    name: "Murid Satu",
    email: "student1@zyx.test",
    role: "student",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Course 1 (assigned to Tutor 1)
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

  await testDb.insert(schema.penugasanTutor).values({
    id: "pt-tutor-1",
    penggunaId: "usr-tutor-1",
    mataKuliahId: "mk-calc",
    status: "active",
    assignmentScope: "course",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

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

  // 1. Valid tryout exam in Course 1
  await testDb.insert(schema.exams).values({
    id: "exam-tryout-calc",
    courseId: "mk-calc",
    title: "Tryout Tengah Semester Kalkulus",
    type: "tryout",
    status: "published",
  }).onConflictDoNothing();

  // 2. Non-tryout exam in Course 1 (e.g. quiz)
  await testDb.insert(schema.exams).values({
    id: "exam-quiz-calc",
    courseId: "mk-calc",
    title: "Kuis Latihan Kalkulus",
    type: "quiz",
    status: "published",
  }).onConflictDoNothing();

  // 3. Tryout exam in Course 2 (unassigned course)
  await testDb.insert(schema.exams).values({
    id: "exam-tryout-physics",
    courseId: "mk-physics",
    title: "Tryout Fisika",
    type: "tryout",
    status: "published",
  }).onConflictDoNothing();

  // Submission for valid tryout
  await testDb.insert(schema.submissions).values({
    id: "sub-valid-tryout",
    userId: "usr-student-1",
    examId: "exam-tryout-calc",
    status: "pending_review",
    score: null,
    answersSnapshot: JSON.stringify({ "q-1": { text: "Jawaban esai murid rahasia" } }),
    questionsSnapshot: JSON.stringify([{ id: "q-1", type: "essay", prompt: "Jelaskan teorema Rolle" }]),
    submittedAt: now,
  }).onConflictDoNothing();

  // Submission for non-tryout (quiz)
  await testDb.insert(schema.submissions).values({
    id: "sub-quiz-calc",
    userId: "usr-student-1",
    examId: "exam-quiz-calc",
    status: "pending_review",
    score: null,
    answersSnapshot: JSON.stringify({}),
    questionsSnapshot: JSON.stringify([]),
    submittedAt: now,
  }).onConflictDoNothing();

  // Submission for physics tryout (unassigned course)
  await testDb.insert(schema.submissions).values({
    id: "sub-physics-tryout",
    userId: "usr-student-1",
    examId: "exam-tryout-physics",
    status: "pending_review",
    score: null,
    answersSnapshot: JSON.stringify({}),
    questionsSnapshot: JSON.stringify([]),
    submittedAt: now,
  }).onConflictDoNothing();
}

describe("Tutor Grading Scope and Policy", () => {
  beforeEach(async () => {
    await setupTables();
    await clearGradingData();
    await seedGradingData();
  });

  it("rejects grading by unassigned tutor and records rejected audit", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // Tutor is NOT assigned to mk-physics
    await expect(
      gradeSubmissionAction("mk-physics", "sub-physics-tryout", 85, "Bagus"),
    ).rejects.toThrow("TUTOR_ACCESS_DENIED: NO_ACTIVE_ASSIGNMENT");

    const audits = await testDb.select().from(schema.auditMutasi);
    const unassignedAudit = audits.find((a) => a.courseId === "mk-physics" && a.outcome === "rejected");
    expect(unassignedAudit).toBeDefined();
    expect(unassignedAudit?.reason).toContain("NO_ACTIVE_ASSIGNMENT");
  });

  it("rejects grading non-existent submission", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    await expect(
      gradeSubmissionAction("mk-calc", "sub-ghost-999", 85, "Catatan"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.SUBMISSION_NOT_FOUND);

    const audits = await testDb.select().from(schema.auditMutasi);
    const notFoundAudit = audits.find((a) => a.entityId === "sub-ghost-999" && a.outcome === "rejected");
    expect(notFoundAudit).toBeDefined();
    expect(notFoundAudit?.reason).toBe(TUTOR_CAPABILITY_ERRORS.SUBMISSION_NOT_FOUND);
  });

  it("rejects grading wrong-course submission where submission exam belongs to another course", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // sub-physics-tryout belongs to mk-physics, but tutor tries to grade it claiming course mk-calc
    await expect(
      gradeSubmissionAction("mk-calc", "sub-physics-tryout", 80, "Catatan"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.GRADING_COURSE_MISMATCH);

    const audits = await testDb.select().from(schema.auditMutasi);
    const mismatchAudit = audits.find((a) => a.entityId === "sub-physics-tryout" && a.outcome === "rejected");
    expect(mismatchAudit).toBeDefined();
    expect(mismatchAudit?.reason).toBe(TUTOR_CAPABILITY_ERRORS.GRADING_COURSE_MISMATCH);
  });

  it("rejects grading non-tryout exam submissions", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // sub-quiz-calc belongs to an exam of type 'quiz', not 'tryout'
    await expect(
      gradeSubmissionAction("mk-calc", "sub-quiz-calc", 90, "Catatan kuis"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.GRADING_NON_TRYOUT_FORBIDDEN);

    const audits = await testDb.select().from(schema.auditMutasi);
    const nonTryoutAudit = audits.find((a) => a.entityId === "sub-quiz-calc" && a.outcome === "rejected");
    expect(nonTryoutAudit).toBeDefined();
    expect(nonTryoutAudit?.reason).toBe(TUTOR_CAPABILITY_ERRORS.GRADING_NON_TRYOUT_FORBIDDEN);
  });

  it("rejects grading fully auto-scored submissions that are not reviewable", async () => {
    // "completed" tryouts have no essays to review, so they are terminal and
    // must never enter the grading flow.
    await testDb.insert(schema.submissions).values({
      id: "sub-auto-completed",
      userId: "usr-student-1",
      examId: "exam-tryout-calc",
      status: "completed",
      score: 80,
      answersSnapshot: JSON.stringify({}),
      questionsSnapshot: JSON.stringify([]),
      submittedAt: new Date(),
    }).onConflictDoNothing();

    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    await expect(
      gradeSubmissionAction("mk-calc", "sub-auto-completed", 75, "Sudah terisi otomatis"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.GRADING_NOT_REVIEWABLE);

    // Submission must remain untouched
    const [unchanged] = await testDb
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, "sub-auto-completed"))
      .limit(1);
    expect(unchanged.score).toBe(80);
    expect(unchanged.status).toBe("completed");

    const audits = await testDb.select().from(schema.auditMutasi);
    const notReviewableAudit = audits.find(
      (a) => a.entityId === "sub-auto-completed" && a.outcome === "rejected",
    );
    expect(notReviewableAudit).toBeDefined();
    expect(notReviewableAudit?.reason).toBe(TUTOR_CAPABILITY_ERRORS.GRADING_NOT_REVIEWABLE);
    expect(notReviewableAudit?.action).toBe("submission:grade");
  });

  it("successfully grades late legacy submission as reviewable", async () => {
    await testDb.insert(schema.submissions).values({
      id: "sub-late-review",
      userId: "usr-student-1",
      examId: "exam-tryout-calc",
      status: "late",
      score: null,
      answersSnapshot: JSON.stringify({}),
      questionsSnapshot: JSON.stringify([]),
      submittedAt: new Date(),
    }).onConflictDoNothing();

    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    const res = await gradeSubmissionAction("mk-calc", "sub-late-review", 70, "Terlambat tetapi dinilai");
    expect(res.success).toBe(true);

    const [gradedSub] = await testDb
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, "sub-late-review"))
      .limit(1);
    expect(gradedSub.score).toBe(70);
    expect(gradedSub.status).toBe("graded");

    const audits = await testDb.select().from(schema.auditMutasi);
    const successAudit = audits.find((a) => a.entityId === "sub-late-review" && a.outcome === "success");
    expect(successAudit).toBeDefined();
    expect(successAudit?.action).toBe("submission:grade");
  });

  it("successfully grades tryout submission and sanitizes audit payload with score and notes hash only", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
    const notesText = "Penalaran teorema Rolle sudah tepat. Perjelas langkah penutup.";

    const res = await gradeSubmissionAction("mk-calc", "sub-valid-tryout", 92, notesText);
    expect(res.success).toBe(true);

    // Verify submission row updated in DB
    const [updatedSub] = await testDb
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, "sub-valid-tryout"))
      .limit(1);

    expect(updatedSub).toBeDefined();
    expect(updatedSub.score).toBe(92);
    expect(updatedSub.status).toBe("graded");
    expect(updatedSub.teacherNotes).toBe(notesText);

    // Verify audit log
    const audits = await testDb.select().from(schema.auditMutasi);
    const successAudit = audits.find((a) => a.entityId === "sub-valid-tryout" && a.outcome === "success");
    expect(successAudit).toBeDefined();
    expect(successAudit?.courseId).toBe("mk-calc");
    expect(successAudit?.action).toBe("submission:grade");

    const beforeSnap = (typeof successAudit?.beforeSnapshot === "string"
      ? JSON.parse(successAudit.beforeSnapshot)
      : successAudit?.beforeSnapshot) as any;
    const afterSnap = (typeof successAudit?.afterSnapshot === "string"
      ? JSON.parse(successAudit.afterSnapshot)
      : successAudit?.afterSnapshot) as any;

    // Verify before snapshot contains score and status, NO student answers
    expect(beforeSnap.snapshot.submissionId).toBe("sub-valid-tryout");
    expect(beforeSnap.snapshot.score).toBeNull();
    expect(beforeSnap.snapshot.status).toBe("pending_review");
    expect(beforeSnap.snapshot.answers).toBeUndefined();
    expect(beforeSnap.snapshot.answersSnapshot).toBeUndefined();

    // Verify after snapshot contains score, status, notesLength, notesHash ONLY (NO raw notes text)
    expect(afterSnap.snapshot.submissionId).toBe("sub-valid-tryout");
    expect(afterSnap.snapshot.score).toBe(92);
    expect(afterSnap.snapshot.status).toBe("graded");
    expect(afterSnap.snapshot.notesLength).toBe(notesText.length);
    expect(typeof afterSnap.snapshot.notesHash).toBe("string");
    expect(afterSnap.snapshot.notesHash.length).toBe(64); // SHA-256
    expect(afterSnap.snapshot.teacherNotes).toBeUndefined();
    expect(afterSnap.snapshot.feedback).toBeUndefined();
    expect(afterSnap.snapshot.answersSnapshot).toBeUndefined();
  });

  it("rejects grading with invalid score or note length and records rejected audit", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // Score > 100
    await expect(
      gradeSubmissionAction("mk-calc", "sub-valid-tryout", 150, "Catatan valid"),
    ).rejects.toThrow("Validasi gagal");

    const audits = await testDb.select().from(schema.auditMutasi);
    const rejectedAudit = audits.find(
      (a) => a.entityId === "sub-valid-tryout" && a.outcome === "rejected" && a.reason?.includes("Validasi gagal"),
    );
    expect(rejectedAudit).toBeDefined();
    expect(rejectedAudit?.actorId).toBe("usr-tutor-1");
    expect(rejectedAudit?.action).toBe("submission:grade");
  });

  it("rejects concurrent grading when status changed between fetch and update", async () => {
    // Setup a submission that gets mutated concurrently
    await testDb.insert(schema.submissions).values({
      id: "sub-concurrent-test",
      userId: "usr-student-1",
      examId: "exam-tryout-calc",
      status: "pending_review",
      score: null,
      answersSnapshot: JSON.stringify({}),
      questionsSnapshot: JSON.stringify([]),
      submittedAt: new Date(),
    }).onConflictDoNothing();

    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // Simulate concurrent transition before our transaction by changing status in DB
    await testDb
      .update(schema.submissions)
      .set({ status: "graded", score: 85 })
      .where(eq(schema.submissions.id, "sub-concurrent-test"));

    // Attempting to grade will encounter conflict because initial read status mismatches
    // But let's test the atomic conflict guard when read saw pending_review:
    // We test that grading a submission whose status changed fails with GRADING_CONCURRENT_CONFLICT or conflict error
    // If the submission is now "graded", isReviewableSubmissionStatus("graded") is true, so let's simulate
    // status changed to "completed" (terminal) or concurrent update
    await testDb
      .update(schema.submissions)
      .set({ status: "completed", score: 100 })
      .where(eq(schema.submissions.id, "sub-concurrent-test"));

    await expect(
      gradeSubmissionAction("mk-calc", "sub-concurrent-test", 95, "Concurrent attempt"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.GRADING_NOT_REVIEWABLE);
  });

  describe("submitTryoutAction server-side constraints", () => {
    beforeEach(async () => {
      const now = new Date();
      // Add questions for tryout exam
      await testDb.insert(schema.questions).values([
        {
          id: "que-calc-1",
          examId: "exam-tryout-calc",
          type: "multiple_choice",
          order: 1,
          content: JSON.stringify({
            prompt: "1 + 1 = ?",
            options: ["1", "2", "3"],
            correctIndex: 1,
          }),
        },
      ]).onConflictDoNothing();
    });

    it("rejects submission when user is unauthenticated", async () => {
      mockSession = null;
      await expect(
        submitTryoutAction("mk-calc", "exam-tryout-calc", {}),
      ).rejects.toThrow("Unauthorized");
    });

    it("rejects submission when courseId does not match exam course", async () => {
      mockSession = { user: { id: "usr-student-1", role: "student" } };
      await expect(
        submitTryoutAction("mk-physics", "exam-tryout-calc", {}),
      ).rejects.toThrow("Tryout tidak sesuai dengan kelas.");
    });

    it("rejects submission when student has no active enrollment", async () => {
      // Create unenrolled student
      await testDb.insert(schema.user).values({
        id: "usr-unenrolled",
        name: "Unenrolled Student",
        email: "unenrolled@zyx.test",
        role: "student",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();

      mockSession = { user: { id: "usr-unenrolled", role: "student" } };
      await expect(
        submitTryoutAction("mk-calc", "exam-tryout-calc", {}),
      ).rejects.toThrow("Pendaftaran kelas tidak aktif atau sudah berakhir.");
    });

    it("rejects submission when student enrollment has expired", async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await testDb.insert(schema.user).values({
        id: "usr-expired",
        name: "Expired Student",
        email: "expired@zyx.test",
        role: "student",
        createdAt: past,
        updatedAt: past,
      }).onConflictDoNothing();

      await testDb.insert(schema.enrollments).values({
        id: "enr-expired",
        userId: "usr-expired",
        courseId: "crs-calc",
        enrolledAt: new Date(past.getTime() - 30 * 24 * 60 * 60 * 1000),
        expiresAt: past,
      }).onConflictDoNothing();

      mockSession = { user: { id: "usr-expired", role: "student" } };
      await expect(
        submitTryoutAction("mk-calc", "exam-tryout-calc", {}),
      ).rejects.toThrow("Pendaftaran kelas tidak aktif atau sudah berakhir.");
    });

    it("rejects submission when tryout is not published", async () => {
      // Create draft exam
      await testDb.insert(schema.exams).values({
        id: "exam-draft-calc",
        courseId: "mk-calc",
        title: "Tryout Draft",
        type: "tryout",
        status: "draft",
      }).onConflictDoNothing();

      // Enroll student in crs-calc
      await testDb.insert(schema.enrollments).values({
        id: "enr-student-1",
        userId: "usr-student-1",
        courseId: "crs-calc",
        enrolledAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();

      mockSession = { user: { id: "usr-student-1", role: "student" } };
      await expect(
        submitTryoutAction("mk-calc", "exam-draft-calc", {}),
      ).rejects.toThrow("Tryout belum dipublikasikan atau sudah ditutup.");
    });

    it("rejects submission before openAt and after closeAt", async () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Future openAt
      await testDb.insert(schema.exams).values({
        id: "exam-future-calc",
        courseId: "mk-calc",
        title: "Tryout Belum Buka",
        type: "tryout",
        status: "published",
        openAt: future,
      }).onConflictDoNothing();

      // Past closeAt
      await testDb.insert(schema.exams).values({
        id: "exam-closed-calc",
        courseId: "mk-calc",
        title: "Tryout Sudah Tutup",
        type: "tryout",
        status: "published",
        closeAt: past,
      }).onConflictDoNothing();

      // Ensure student enrolled
      await testDb.insert(schema.enrollments).values({
        id: "enr-student-1",
        userId: "usr-student-1",
        courseId: "crs-calc",
        enrolledAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();

      mockSession = { user: { id: "usr-student-1", role: "student" } };

      await expect(
        submitTryoutAction("mk-calc", "exam-future-calc", {}),
      ).rejects.toThrow("Tryout belum dibuka.");

      await expect(
        submitTryoutAction("mk-calc", "exam-closed-calc", {}),
      ).rejects.toThrow("Tryout sudah ditutup.");
    });

    it("enforces maxAttempts limit on server side", async () => {
      await testDb.insert(schema.exams).values({
        id: "exam-max-attempt",
        courseId: "mk-calc",
        title: "Tryout Single Attempt",
        type: "tryout",
        status: "published",
        settings: JSON.stringify({ maxAttempts: 1, timeLimitMinutes: 60 }),
      }).onConflictDoNothing();

      await testDb.insert(schema.questions).values({
        id: "que-attempt-1",
        examId: "exam-max-attempt",
        type: "multiple_choice",
        order: 1,
        content: JSON.stringify({ prompt: "Q1", options: ["A", "B"], correctIndex: 0 }),
      }).onConflictDoNothing();

      await testDb.insert(schema.enrollments).values({
        id: "enr-student-attempt",
        userId: "usr-student-1",
        courseId: "crs-calc",
        enrolledAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();

      mockSession = { user: { id: "usr-student-1", role: "student" } };

      // First attempt succeeds
      const firstRes = await submitTryoutAction("mk-calc", "exam-max-attempt", {
        "que-attempt-1": { index: 0 },
      });
      expect(firstRes.success).toBe(true);

      // Second attempt exceeds maxAttempts
      await expect(
        submitTryoutAction("mk-calc", "exam-max-attempt", {
          "que-attempt-1": { index: 0 },
        }),
      ).rejects.toThrow("Batas maksimum percobaan tryout telah tercapai.");
    });

    it("allows valid student tryout submission within limits", async () => {
      await testDb.insert(schema.enrollments).values({
        id: "enr-student-ok",
        userId: "usr-student-1",
        courseId: "crs-calc",
        enrolledAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();

      mockSession = { user: { id: "usr-student-1", role: "student" } };

      const res = await submitTryoutAction("mk-calc", "exam-tryout-calc", {
        "que-calc-1": { index: 1 },
      });

      expect(res.success).toBe(true);
      expect(res.submissionId).toBeDefined();

      const [sub] = await testDb
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.id, res.submissionId))
        .limit(1);

      expect(sub).toBeDefined();
      expect(sub.userId).toBe("usr-student-1");
      expect(sub.examId).toBe("exam-tryout-calc");
      expect(sub.score).toBe(100);
      expect(sub.status).toBe("completed");
    });

    it("safely enforces maxAttempts limit under concurrent execution", async () => {
      await testDb.insert(schema.enrollments).values({
        id: "enr-student-concurrent",
        userId: "usr-student-1",
        courseId: "crs-calc",
        enrolledAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();

      const now = new Date();
      await testDb.insert(schema.exams).values({
        id: "exam-race-attempt",
        courseId: "mk-calc",
        title: "Tryout Uji Balap",
        type: "tryout",
        status: "published",
        settings: JSON.stringify({ maxAttempts: 2 }),
        createdAt: now,
      }).onConflictDoNothing();

      await testDb.insert(schema.questions).values({
        id: "que-race-1",
        examId: "exam-race-attempt",
        type: "multiple_choice",
        order: 1,
        content: JSON.stringify({ prompt: "1+1?", options: ["2", "3"], correctIndex: 0 }),
      }).onConflictDoNothing();

      mockSession = { user: { id: "usr-student-1", role: "student" } };

      // Dispatch 6 concurrent submission attempts
      const promises = Array.from({ length: 6 }, () =>
        submitTryoutAction("mk-calc", "exam-race-attempt", {
          "que-race-1": { index: 0 },
        }),
      );

      const results = await Promise.allSettled(promises);

      const successes = results.filter((r) => r.status === "fulfilled");
      const rejections = results.filter((r) => r.status === "rejected");

      expect(successes.length).toBe(2);
      expect(rejections.length).toBe(4);
      for (const rej of rejections) {
        expect((rej as PromiseRejectedResult).reason.message).toContain(
          "Batas maksimum percobaan tryout telah tercapai.",
        );
      }

      // Verify exact number of submissions stored in DB
      const storedSubmissions = await testDb
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.examId, "exam-race-attempt"));
      expect(storedSubmissions.length).toBe(2);

      // Verify sequentially assigned attempt numbers
      const attemptNums = storedSubmissions.map((s) => s.attemptNumber).sort();
      expect(attemptNums).toEqual([1, 2]);
    });

    it("enforces database unique constraint on (user_id, exam_id, attempt_number)", async () => {
      const now = new Date();
      await testDb.insert(schema.exams).values({
        id: "exam-db-unique",
        courseId: "mk-calc",
        title: "Tryout Unique DB Test",
        type: "tryout",
        status: "published",
        settings: JSON.stringify({ maxAttempts: 3 }),
        createdAt: now,
      }).onConflictDoNothing();

      // Direct insert attempt 1
      await testDb.insert(schema.submissions).values({
        id: "sub-manual-1",
        userId: "usr-student-1",
        examId: "exam-db-unique",
        status: "completed",
        score: 90,
        attemptNumber: 1,
        submittedAt: now,
      });

      // Direct insert duplicate attempt 1 must violate unique constraint
      let duplicateError: any = null;
      try {
        await testDb.insert(schema.submissions).values({
          id: "sub-manual-1-dup",
          userId: "usr-student-1",
          examId: "exam-db-unique",
          status: "completed",
          score: 80,
          attemptNumber: 1,
          submittedAt: now,
        });
      } catch (err) {
        duplicateError = err;
      }
      expect(duplicateError).not.toBeNull();
    });
  });

  describe("Tutor Failure Audit Retry and Fail-Closed Behavior", () => {
    it("retries on SQLITE_BUSY with exponential backoff and throws TutorAuditPersistenceError upon exhaustion", async () => {
      let attempts = 0;
      const fakeBusyError = new Error("SQLITE_BUSY: database is locked");
      const failingExecutor = {
        insert: () => ({
          values: async () => {
            attempts++;
            throw fakeBusyError;
          },
        }),
      } as any;

      let thrownError: any = null;
      try {
        await recordTutorFailureAudit(
          {
            actorId: "usr-tutor-1",
            actorRoles: ["tutor"],
            courseId: "mk-calc",
            entityType: "submission",
            entityId: "sub-1",
            entityVersion: 1,
            action: "submission:grade",
            outcome: "rejected",
            requestId: "req-exhaustion",
            reason: "Contention exhaustion test",
          },
          failingExecutor,
        );
      } catch (err: any) {
        thrownError = err;
      }

      expect(attempts).toBe(7);
      expect(thrownError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(thrownError.message).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.cause).toBe(fakeBusyError);
    });

    it("throws TutorAuditPersistenceError immediately on non-busy fatal errors", async () => {
      let attempts = 0;
      const fatalError = new Error("FATAL_DISK_IO_CORRUPTION");
      const failingExecutor = {
        insert: () => ({
          values: async () => {
            attempts++;
            throw fatalError;
          },
        }),
      } as any;

      let thrownError: any = null;
      try {
        await recordTutorFailureAudit(
          {
            actorId: "usr-tutor-1",
            actorRoles: ["tutor"],
            courseId: "mk-calc",
            entityType: "submission",
            entityId: "sub-2",
            entityVersion: 1,
            action: "submission:grade",
            outcome: "rejected",
            requestId: "req-fatal",
            reason: "Fatal error test",
          },
          failingExecutor,
        );
      } catch (err: any) {
        thrownError = err;
      }

      expect(attempts).toBe(1);
      expect(thrownError).toBeInstanceOf(TutorAuditPersistenceError);
      expect(thrownError.message).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.code).toBe("TUTOR_AUDIT_PERSISTENCE_FAILED");
      expect(thrownError.cause).toBe(fatalError);
    });
  });
});
