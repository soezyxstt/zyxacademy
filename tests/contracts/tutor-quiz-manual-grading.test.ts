import { beforeAll, afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { TUTOR_QUIZ_GRADING_ERRORS } from "@/lib/tutor/quiz-grading";
import { createAssessmentWithLegacyProjection } from "@/lib/asesmen/quiz-canonical-sync";

let mockSession: any = null;

let client: Awaited<ReturnType<typeof createPostgresTestDb>>["client"];
let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"];
const dbProxy = new Proxy({} as typeof testDb, {
  get(_target, key) {
    const value = Reflect.get(testDb, key);
    return typeof value === "function" ? value.bind(testDb) : value;
  },
});
beforeAll(async () => { ({ client, testDb } = await createPostgresTestDb()); }, 60_000);
afterAll(async () => { await client?.close(); });

async function clearTestData() {
  const result = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  if (result.rows.length) await client.exec(`TRUNCATE TABLE ${result.rows.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ")} CASCADE`);
}

mock.module("@/db", () => ({
  db: dbProxy,
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
  await testDb.insert(schema.bab).values({ id: "bab-calc", mataKuliahId: "mk-calc", code: "BAB-01", title: "Turunan", orderIndex: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
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

  await testDb.insert(schema.soal).values({
    id: "q-essay-1", mataKuliahId: "mk-calc", babId: "bab-calc",
    questionType: "essay", prompt: "Jelaskan definisi turunan.",
    difficulty: "medium", cognitiveLevel: "understand", reasoningPattern: "explanation",
    generationHash: "gen-essay-1", creatorId: "usr-tutor-assigned",
  });

  // SoalIde mapping for q-essay-1
  await testDb.insert(schema.soalIde).values({
    id: "si-essay-1",
    soalId: "q-essay-1",
    ideId: "ide-calc-deriv",
    weight: 1.0,
    role: "primary",
  }).onConflictDoNothing();

  // Snapshot questions still require canonical rows, even without Idea links.
  await testDb.insert(schema.soal).values([
    { id: "q-mc-1", questionType: "multiple_choice" as const },
    { id: "q-mc", questionType: "multiple_choice" as const },
    { id: "q-sa", questionType: "short_answer" as const },
    { id: "q-es", questionType: "essay" as const },
    { id: "q-essay-cas", questionType: "essay" as const },
    { id: "q-unmapped-essay", questionType: "essay" as const },
  ].map((question) => ({
    ...question, mataKuliahId: "mk-calc", babId: "bab-calc", prompt: question.id,
    difficulty: "medium" as const, cognitiveLevel: "understand" as const,
    reasoningPattern: "explanation", generationHash: `fixture:${question.id}`,
    creatorId: "usr-tutor-assigned",
  })));

  // Quiz Template in Kalkulus
  await createAssessmentWithLegacyProjection({
    id: "tpl-calc-free-response",
    courseId: "crs-calc",
    title: "Kuis Bab 2 Turunan",
    category: "chapter",
    visibility: "free",
    status: "published",
    selectionRules: { count: 3 },
    creatorId: "usr-tutor-assigned",
  });

  // Quiz Template in Physics
  await createAssessmentWithLegacyProjection({
    id: "tpl-physics-quiz",
    courseId: "crs-physics",
    title: "Kuis Fisika Vektor",
    category: "chapter",
    visibility: "free",
    status: "published",
    selectionRules: { count: 2 },
    creatorId: "usr-tutor-assigned",
  });
}

describe("Tutor Quiz Manual Grading Contracts", () => {
  beforeEach(async () => {
    mockSession = null;
    recomputeCalls.length = 0;
    await clearTestData();
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
        questionsSnapshot: [
          { id: "q-mc-1", question_type: "multiple_choice", prompt: "2+2?", options: ["4", "5"], correct_indices: [0] },
          { id: "q-essay-1", question_type: "essay", prompt: "Jelaskan definisi turunan." },
        ],
        answersSnapshot: {
          "q-mc-1": 0,
          "q-essay-1": "Turunan adalah limit fungsi delta y per delta x.",
        },
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
        questionsSnapshot: [
          { id: "q-phy-1", question_type: "essay", prompt: "Hukum Newton 1" },
        ],
        answersSnapshot: { "q-phy-1": "Jawaban fisika" },
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
        questionsSnapshot: [
          { id: "q-essay-1", question_type: "essay", prompt: "Jelaskan definisi turunan." },
        ],
        answersSnapshot: { "q-essay-1": "Jawaban" },
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
        questionsSnapshot: [
          { id: "q-mc-1", question_type: "multiple_choice", prompt: "2+2?", options: ["4", "5"], correct_indices: [0] },
          { id: "q-essay-1", question_type: "essay", prompt: "Definisi turunan" },
        ],
        answersSnapshot: { "q-mc-1": 1, "q-essay-1": "Jawaban" },
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
        questionsSnapshot: [
          { id: "q-mc", question_type: "multiple_choice", prompt: "Pilihan", options: ["A", "B"], correct_indices: [0] },
          { id: "q-sa", question_type: "short_answer", prompt: "Isian", acceptable_answers: ["tepat"] },
          { id: "q-es", question_type: "essay", prompt: "Esai" },
        ],
        answersSnapshot: {
          "q-mc": 0, // correct (1.0)
          "q-sa": "kurang tepat", // incorrect (0.0)
          "q-es": "Jawaban esai siswa",
        },
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
        questionsSnapshot: [
          { id: "q-essay-cas", question_type: "essay", prompt: "Esai" },
        ],
        answersSnapshot: { "q-essay-cas": "Jawaban" },
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
        questionsSnapshot: [
          { id: "q-essay-1", question_type: "essay", prompt: "Jelaskan definisi turunan." },
        ],
        answersSnapshot: { "q-essay-1": "Jawaban esai" },
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
        questionsSnapshot: [
          { id: "q-unmapped-essay", question_type: "essay", prompt: "Pertanyaan bebas tanpa ide" },
        ],
        answersSnapshot: { "q-unmapped-essay": "Jawaban refleksi" },
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
        questionsSnapshot: [
          { id: "q1", question_type: "essay", prompt: "Esai 1" },
          { id: "q2", question_type: "essay", prompt: "Esai 2" },
        ],
        answersSnapshot: { q1: "Ans 1", q2: "Ans 2" },
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
        questionsSnapshot: [
          { id: "q1", question_type: "essay", prompt: "Esai 1" },
        ],
        answersSnapshot: { q1: "Ans 1" },
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
        questionsSnapshot: [
          { id: "q-mc", question_type: "multiple_choice", prompt: "MC", options: ["A", "B"], correct_indices: [0] },
        ],
        answersSnapshot: { "q-mc": 0 },
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
        questionsSnapshot: [
          { id: "q-mc", question_type: "multiple_choice", prompt: "1+1?", options: ["2", "3"], correct_indices: [0] },
          { id: "q-sa", question_type: "short_answer", prompt: "Ibu kota?", acceptable_answers: ["Jakarta"] },
          { id: "q-es", question_type: "essay", prompt: "Opini anda" },
        ],
        answersSnapshot: {
          "q-mc": 0,
          "q-sa": "Jakarta",
          "q-es": "Saya setuju.",
        },
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
