import { afterAll, beforeAll, describe, expect, it, mock, beforeEach } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { TUTOR_CAPABILITY_ERRORS } from "@/lib/tutor/assessment-policy";
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

mock.module("@/lib/notifications/send", () => ({
  notifyQuizPublishedBestEffort: async () => {},
}));

import {
  saveTutorMaterialAction,
  deleteTutorMaterialAction,
  saveTryoutAction,
  deleteTryoutAction,
  saveTryoutQuestionAction,
  importQuestionBankToTryoutAction,
  deleteTryoutQuestionAction,
  saveQuizTemplateAction,
  deleteQuizTemplateAction,
  toggleQuizTemplateStatusAction,
  saveQuestionBankAction,
  deleteQuestionBankAction,
} from "@/app/actions/tutor-management";

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

  // Course 1 (assigned to tutor 1)
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
}

describe("Tutor Capability Boundary Server Actions", () => {
  beforeEach(async () => {
    await clearTestData();
    await seedBaseData();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 1. Materials Authoring Rejection & Audit
   * ──────────────────────────────────────────────────────────────────────── */
  it("rejects tutor saveTutorMaterialAction and writes rejected audit record", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    await expect(
      saveTutorMaterialAction(
        "mk-calc",
        null,
        "Materi Turunan",
        "Ringkasan turunan fungsi",
        "# Bab 1\nPenjelasan turunan",
      ),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.MATERIALS_AUTHORING_DISABLED);

    const audits = await testDb.select().from(schema.auditMutasi);
    const materialAudit = audits.find((a) => a.entityType === "material" && a.action === "material:create");
    expect(materialAudit).toBeDefined();
    expect(materialAudit?.outcome).toBe("rejected");
    expect(materialAudit?.actorId).toBe("usr-tutor-1");
    expect(materialAudit?.courseId).toBe("mk-calc");
    expect(materialAudit?.reason).toBe(TUTOR_CAPABILITY_ERRORS.MATERIALS_AUTHORING_DISABLED);
  });

  it("rejects tutor deleteTutorMaterialAction and writes rejected audit record", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    await expect(
      deleteTutorMaterialAction("mk-calc", "mat-123"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.MATERIALS_AUTHORING_DISABLED);

    const audits = await testDb.select().from(schema.auditMutasi);
    const deleteAudit = audits.find((a) => a.entityType === "material" && a.action === "material:delete");
    expect(deleteAudit).toBeDefined();
    expect(deleteAudit?.outcome).toBe("rejected");
    expect(deleteAudit?.actorId).toBe("usr-tutor-1");
    expect(deleteAudit?.reason).toBe(TUTOR_CAPABILITY_ERRORS.MATERIALS_AUTHORING_DISABLED);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. Tryout Authoring Rejection & Audit
   * ──────────────────────────────────────────────────────────────────────── */
  it("rejects tutor tryout authoring actions and records rejected audits", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // 1. saveTryoutAction
    await expect(
      saveTryoutAction("mk-calc", null, {
        title: "Tryout Mandiri",
        status: "draft",
        timeLimitMinutes: 90,
        maxAttempts: 1,
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);

    // 2. deleteTryoutAction
    await expect(
      deleteTryoutAction("mk-calc", "exam-123"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);

    // 3. saveTryoutQuestionAction
    await expect(
      saveTryoutQuestionAction("mk-calc", "exam-123", null, {
        type: "multiple_choice",
        order: 1,
        prompt: "Berapa turunan sin(x)?",
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);

    // 4. importQuestionBankToTryoutAction
    await expect(
      importQuestionBankToTryoutAction("mk-calc", "exam-123", ["qbk-1"]),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);

    // 5. deleteTryoutQuestionAction
    await expect(
      deleteTryoutQuestionAction("mk-calc", "que-123"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);

    const audits = await testDb.select().from(schema.auditMutasi);
    const rejectedTryoutAudits = audits.filter((a) => a.reason === TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);
    expect(rejectedTryoutAudits.length).toBe(5);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 3. Simulation and Tryout Category Rejection for Quizzes
   * ──────────────────────────────────────────────────────────────────────── */
  it("rejects tutor quiz mutations attempting category simulation or assessmentType tryout", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // Simulation category
    await expect(
      saveQuizTemplateAction("mk-calc", null, {
        title: "Kuis Simulasi",
        category: "simulation",
        visibility: "free",
        timeLimitSeconds: 1800,
        maxAttempts: 1,
        selectionRules: { count: 10 },
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);

    // Tryout assessmentType
    await expect(
      saveQuizTemplateAction("mk-calc", null, {
        title: "Kuis Tipe Tryout",
        category: "chapter",
        visibility: "free",
        timeLimitSeconds: 1800,
        maxAttempts: 1,
        selectionRules: { count: 10, assessmentType: "tryout" },
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN);

    const audits = await testDb.select().from(schema.auditMutasi);
    const simAudit = audits.find((a) => a.reason === TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);
    expect(simAudit).toBeDefined();
    expect(simAudit?.outcome).toBe("rejected");

    const tryoutAudit = audits.find((a) => a.reason === TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN);
    expect(tryoutAudit).toBeDefined();
    expect(tryoutAudit?.outcome).toBe("rejected");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 4. Unassigned Course Mutation Rejection
   * ──────────────────────────────────────────────────────────────────────── */
  it("rejects tutor quiz template mutations for unassigned courses", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // Course mk-physics is unassigned for usr-tutor-1
    await expect(
      saveQuizTemplateAction("mk-physics", null, {
        title: "Kuis Fisika",
        category: "daily",
        visibility: "free",
        timeLimitSeconds: 600,
        maxAttempts: 1,
        selectionRules: { count: 5 },
      }),
    ).rejects.toThrow("TUTOR_ACCESS_DENIED: NO_ACTIVE_ASSIGNMENT");

    const audits = await testDb.select().from(schema.auditMutasi);
    const unassignedAudit = audits.find((a) => a.courseId === "mk-physics" && a.outcome === "rejected");
    expect(unassignedAudit).toBeDefined();
    expect(unassignedAudit?.reason).toContain("NO_ACTIVE_ASSIGNMENT");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 5. Cross-Course Quiz Template and Question Bank Mutation Rejection
   * ──────────────────────────────────────────────────────────────────────── */
  it("prevents cross-course quiz template and question bank mutations", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };
    const now = new Date();

    // Insert template belonging to physics course
    await testDb.insert(schema.quizTemplates).values({
      id: "tpl-physics-1",
      courseId: "crs-physics",
      title: "Kuis Fisika 1",
      category: "daily",
      visibility: "free",
      status: "draft",
      selectionRules: { count: 5 },
      createdAt: now,
      updatedAt: now,
    });

    // Tutor tries to update tpl-physics-1 by pretending it's in mk-calc
    await expect(
      saveQuizTemplateAction("mk-calc", "tpl-physics-1", {
        title: "Kuis Fisika Dimutasi",
        category: "daily",
        visibility: "free",
        timeLimitSeconds: 600,
        maxAttempts: 1,
        selectionRules: { count: 5 },
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);

    // Tutor tries to delete tpl-physics-1 via mk-calc
    await expect(
      deleteQuizTemplateAction("mk-calc", "tpl-physics-1"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);

    // Insert question bank item belonging to physics course
    await testDb.insert(schema.aiQuestionBank).values({
      id: "qbk-physics-1",
      courseId: "crs-physics",
      prompt: "Kecepatan cahaya?",
      options: ["3e8 m/s", "100 m/s"],
      correctIndices: [0],
      difficulty: "easy",
      questionType: "multiple_choice",
      explanation: "3e8 m/s",
      tags: ["fisika"],
      status: "active",
      reviewStatus: "published",
      createdAt: now,
    });

    // Tutor tries to update/delete physics question bank item via mk-calc
    await expect(
      saveQuestionBankAction("mk-calc", "qbk-physics-1", {
        prompt: "Kecepatan cahaya diubah?",
        options: ["3e8 m/s", "100 m/s"],
        correctIndices: [0],
        difficulty: "easy",
        questionType: "multiple_choice",
        explanation: "3e8 m/s",
        tags: ["fisika"],
      }),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);

    await expect(
      deleteQuestionBankAction("mk-calc", "qbk-physics-1"),
    ).rejects.toThrow(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 6. Permitted Quiz & Question Bank Authoring on Assigned Course
   * ──────────────────────────────────────────────────────────────────────── */
  it("allows tutor quiz template and question bank creation in assigned course with success audit", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // 1. Create quiz template
    const createQuizRes = await saveQuizTemplateAction("mk-calc", null, {
      title: "Kuis Harian Turunan",
      category: "daily",
      visibility: "free",
      timeLimitSeconds: 900,
      maxAttempts: 2,
      selectionRules: { count: 5 },
      status: "published",
    });

    expect(createQuizRes.success).toBe(true);
    expect(createQuizRes.id).toBeDefined();

    // 2. Create question bank item
    const createQbkRes = await saveQuestionBankAction("mk-calc", null, {
      prompt: "Turunan dari x^2?",
      options: ["2x", "x", "x^3", "2"],
      correctIndices: [0],
      difficulty: "easy",
      questionType: "multiple_choice",
      explanation: "d/dx(x^2) = 2x",
      tags: ["kalkulus", "turunan"],
    });

    expect(createQbkRes.success).toBe(true);
    expect(createQbkRes.id).toBeDefined();

    const audits = await testDb.select().from(schema.auditMutasi);
    const quizAudit = audits.find((a) => a.entityType === "quiz_template" && a.action === "quiz:create");
    expect(quizAudit).toBeDefined();
    expect(quizAudit?.outcome).toBe("success");
    expect(quizAudit?.courseId).toBe("mk-calc");

    const qbkAudit = audits.find((a) => a.entityType === "question_bank" && a.action === "question_bank:create");
    expect(qbkAudit).toBeDefined();
    expect(qbkAudit?.outcome).toBe("success");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 7. Admin Override Permissions
   * ──────────────────────────────────────────────────────────────────────── */
  it("allows admin override for material, tryout, and simulation authoring", async () => {
    mockSession = { user: { id: "usr-admin-1", role: "admin" } };

    // 1. Admin material save
    const matRes = await saveTutorMaterialAction(
      "mk-calc",
      null,
      "Materi Admin",
      "Ringkasan admin",
      "# Materi Admin",
    );
    expect(matRes.success).toBe(true);
    const [material] = await testDb.select().from(schema.aiMaterialInstances).where(eq(schema.aiMaterialInstances.id, matRes.id));
    expect(material.courseId).toBe("crs-calc");

    // 2. Admin tryout save
    const tryoutRes = await saveTryoutAction("mk-calc", null, {
      title: "Tryout Admin",
      status: "published",
      timeLimitMinutes: 120,
      maxAttempts: 1,
    });
    expect(tryoutRes.success).toBe(true);
    const [exam] = await testDb.select().from(schema.exams).where(eq(schema.exams.id, tryoutRes.id));
    expect(exam.courseId).toBe("crs-calc");

    // 3. Admin simulation quiz template save
    const simRes = await saveQuizTemplateAction("mk-calc", null, {
      title: "Simulasi Admin",
      category: "simulation",
      visibility: "paid",
      timeLimitSeconds: 3600,
      maxAttempts: 1,
      selectionRules: { count: 20 },
      status: "published",
    });
    expect(simRes.success).toBe(true);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 8. Admin Tryout Authoring Transactional Mutation Audits
   * ──────────────────────────────────────────────────────────────────────── */
  it("records transactional audits for admin tryout authoring lifecycle mutations", async () => {
    mockSession = { user: { id: "usr-admin-1", role: "admin" } };

    // 1. Create Tryout
    const tryoutRes = await saveTryoutAction("mk-calc", null, {
      title: "Tryout Mandiri",
      status: "published",
      timeLimitMinutes: 90,
      maxAttempts: 2,
    });
    expect(tryoutRes.success).toBe(true);
    const examId = tryoutRes.id;

    // 2. Add question to tryout
    const queRes = await saveTryoutQuestionAction("mk-calc", examId, null, {
      type: "multiple_choice",
      order: 1,
      prompt: "Berapakah limit x->0 sin(x)/x?",
      options: ["0", "1", "tak terhingga"],
      correctIndex: 1,
    });
    expect(queRes.success).toBe(true);
    const questionId = queRes.id;

    // 3. Create question in bank and import it to tryout
    const qbkRes = await saveQuestionBankAction("mk-calc", null, {
      prompt: "Turunan e^x?",
      options: ["e^x", "xe^(x-1)", "ln(x)"],
      correctIndices: [0],
      difficulty: "easy",
      questionType: "multiple_choice",
      explanation: "d/dx(e^x) = e^x",
      tags: ["kalkulus"],
    });
    expect(qbkRes.success).toBe(true);
    const qbkId = qbkRes.id;

    const importRes = await importQuestionBankToTryoutAction("mk-calc", examId, [qbkId]);
    expect(importRes.success).toBe(true);
    expect(importRes.imported).toBe(1);

    // 4. Delete single question
    const delQueRes = await deleteTryoutQuestionAction("mk-calc", questionId);
    expect(delQueRes.success).toBe(true);

    // 5. Delete entire tryout
    const delTryoutRes = await deleteTryoutAction("mk-calc", examId);
    expect(delTryoutRes.success).toBe(true);

    // Verify all transactional audit entries exist
    const audits = await testDb.select().from(schema.auditMutasi);

    const tryoutCreateAudit = audits.find(
      (a) => a.entityType === "exam" && a.entityId === examId && a.action === "tryout:create",
    );
    expect(tryoutCreateAudit).toBeDefined();
    expect(tryoutCreateAudit?.outcome).toBe("success");

    const queCreateAudit = audits.find(
      (a) => a.entityType === "question" && a.entityId === questionId && a.action === "tryout_question:create",
    );
    expect(queCreateAudit).toBeDefined();
    expect(queCreateAudit?.outcome).toBe("success");

    const importAudit = audits.find(
      (a) => a.entityType === "question" && a.entityId === examId && a.action === "tryout_question:import",
    );
    expect(importAudit).toBeDefined();
    expect(importAudit?.outcome).toBe("success");

    const queDeleteAudit = audits.find(
      (a) => a.entityType === "question" && a.entityId === questionId && a.action === "tryout_question:delete",
    );
    expect(queDeleteAudit).toBeDefined();
    expect(queDeleteAudit?.outcome).toBe("success");

    const tryoutDeleteAudit = audits.find(
      (a) => a.entityType === "exam" && a.entityId === examId && a.action === "tryout:delete",
    );
    expect(tryoutDeleteAudit).toBeDefined();
    expect(tryoutDeleteAudit?.outcome).toBe("success");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 9. Legacy FK Resolution vs Canonical Entity Preservation
   * ──────────────────────────────────────────────────────────────────────── */
  it("resolves and writes legacy courseId for legacy tables while canonical entities retain canonical ID", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // 1. Save question bank using canonical course ID "mk-calc"
    const qbkRes = await saveQuestionBankAction("mk-calc", null, {
      prompt: "Integral 2x dx?",
      options: ["x^2 + C", "2x^2 + C", "x + C"],
      correctIndices: [0],
      difficulty: "easy",
      questionType: "multiple_choice",
      explanation: "x^2 + C",
      tags: ["integral"],
    });

    const [savedQbk] = await testDb
      .select()
      .from(schema.aiQuestionBank)
      .where(eq(schema.aiQuestionBank.id, qbkRes.id))
      .limit(1);

    // ai_question_bank.course_id should store legacyCourseId ("crs-calc")
    expect(savedQbk.courseId).toBe("crs-calc");

    // 2. Save quiz template using canonical course ID "mk-calc"
    const quizRes = await saveQuizTemplateAction("mk-calc", null, {
      title: "Kuis Integral",
      category: "chapter",
      visibility: "free",
      timeLimitSeconds: 600,
      maxAttempts: 1,
      selectionRules: { count: 5 },
      status: "published",
    });

    const [savedTemplate] = await testDb
      .select()
      .from(schema.quizTemplates)
      .where(eq(schema.quizTemplates.id, quizRes.id))
      .limit(1);

    // quiz_templates.course_id should store legacyCourseId ("crs-calc")
    expect(savedTemplate.courseId).toBe("crs-calc");

    // Canonical asesmen and blueprint should store canonical course ID ("mk-calc")
    const [savedAsesmen] = await testDb
      .select()
      .from(schema.asesmen)
      .where(eq(schema.asesmen.id, quizRes.id))
      .limit(1);
    expect(savedAsesmen).toBeDefined();
    expect(savedAsesmen.mataKuliahId).toBe("mk-calc");

    const [savedBlueprint] = await testDb
      .select()
      .from(schema.blueprintAsesmen)
      .where(eq(schema.blueprintAsesmen.id, savedAsesmen.blueprintAsesmenId))
      .limit(1);
    expect(savedBlueprint).toBeDefined();
    expect(savedBlueprint.mataKuliahId).toBe("mk-calc");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 11. Rejected Mutation Audits for Validation and Missing Entity Failures
   * ──────────────────────────────────────────────────────────────────────── */
  it("records rejected audit on validation failure in saveQuizTemplateAction and saveQuestionBankAction", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // 1. Validation failure on quiz template creation (empty title)
    await expect(
      saveQuizTemplateAction("mk-calc", null, {
        title: "",
        category: "daily",
        visibility: "free",
        timeLimitSeconds: 600,
        maxAttempts: 1,
        selectionRules: { count: 5 },
      }),
    ).rejects.toThrow("Validasi gagal");

    // 2. Validation failure on question bank creation (empty prompt)
    await expect(
      saveQuestionBankAction("mk-calc", null, {
        prompt: "",
        options: ["A", "B"],
        correctIndices: [0],
        difficulty: "easy",
        questionType: "multiple_choice",
        explanation: "Test",
        tags: [],
      }),
    ).rejects.toThrow("Validasi gagal");

    const audits = await testDb.select().from(schema.auditMutasi);
    const quizValAudit = audits.find(
      (a) => a.entityType === "quiz_template" && a.action === "quiz:create" && a.outcome === "rejected",
    );
    expect(quizValAudit).toBeDefined();
    expect(quizValAudit?.actorId).toBe("usr-tutor-1");
    expect(quizValAudit?.courseId).toBe("mk-calc");
    expect(quizValAudit?.reason).toContain("Validasi gagal");

    const qbkValAudit = audits.find(
      (a) => a.entityType === "question_bank" && a.action === "question_bank:create" && a.outcome === "rejected",
    );
    expect(qbkValAudit).toBeDefined();
    expect(qbkValAudit?.actorId).toBe("usr-tutor-1");
    expect(qbkValAudit?.courseId).toBe("mk-calc");
    expect(qbkValAudit?.reason).toContain("Validasi gagal");
  });

  it("records rejected audit on missing entities in update, delete, and toggle actions", async () => {
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" } };

    // 1. Update non-existent quiz template
    await expect(
      saveQuizTemplateAction("mk-calc", "tpl-nonexistent-999", {
        title: "Kuis Update Hilang",
        category: "daily",
        visibility: "free",
        timeLimitSeconds: 600,
        maxAttempts: 1,
        selectionRules: { count: 5 },
      }),
    ).rejects.toThrow("Template kuis tidak ditemukan.");

    // 2. Delete non-existent quiz template
    await expect(
      deleteQuizTemplateAction("mk-calc", "tpl-nonexistent-888"),
    ).rejects.toThrow("Template kuis tidak ditemukan.");

    // 3. Toggle non-existent quiz template
    await expect(
      toggleQuizTemplateStatusAction("mk-calc", "tpl-nonexistent-777", "published"),
    ).rejects.toThrow("Template kuis tidak ditemukan.");

    // 4. Update non-existent question bank item
    await expect(
      saveQuestionBankAction("mk-calc", "qbk-nonexistent-666", {
        prompt: "Soal hilang?",
        options: ["Ya", "Tidak"],
        correctIndices: [0],
        difficulty: "easy",
        questionType: "multiple_choice",
        explanation: "Hilang",
        tags: ["test"],
      }),
    ).rejects.toThrow("Soal bank tidak ditemukan.");

    // 5. Delete non-existent question bank item
    await expect(
      deleteQuestionBankAction("mk-calc", "qbk-nonexistent-555"),
    ).rejects.toThrow("Soal bank tidak ditemukan.");

    const audits = await testDb.select().from(schema.auditMutasi);
    const rejectedAudits = audits.filter((a) => a.outcome === "rejected");

    expect(rejectedAudits.some((a) => a.entityId === "tpl-nonexistent-999" && a.reason === "QUIZ_TEMPLATE_NOT_FOUND")).toBe(true);
    expect(rejectedAudits.some((a) => a.entityId === "tpl-nonexistent-888" && a.reason === "QUIZ_TEMPLATE_NOT_FOUND")).toBe(true);
    expect(rejectedAudits.some((a) => a.entityId === "tpl-nonexistent-777" && a.reason === "QUIZ_TEMPLATE_NOT_FOUND")).toBe(true);
    expect(rejectedAudits.some((a) => a.entityId === "qbk-nonexistent-666" && a.reason === "QUESTION_BANK_NOT_FOUND")).toBe(true);
    expect(rejectedAudits.some((a) => a.entityId === "qbk-nonexistent-555" && a.reason === "QUESTION_BANK_NOT_FOUND")).toBe(true);
  });

  it("rejects tutor capabilities for DB murid even when session claims teacher role", async () => {
    const now = new Date();
    await testDb.insert(schema.user).values({
      id: "usr-student-override-attempt",
      name: "Murid Impersonator",
      email: "impersonator@zyx.test",
      role: "student",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    await testDb.insert(schema.pengguna).values({
      id: "usr-student-override-attempt",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    await testDb.insert(schema.penggunaPeran).values({
      id: "pp-student-impersonator",
      penggunaId: "usr-student-override-attempt",
      peranId: "peran-murid",
      source: "seed",
      createdAt: now,
    }).onConflictDoNothing();

    // Session claims role 'teacher' while DB has 'murid'
    mockSession = { user: { id: "usr-student-override-attempt", role: "teacher" } };

    await expect(
      saveQuizTemplateAction("mk-calc", null, {
        title: "Kuis Disusupi Murid",
        category: "daily",
        visibility: "free",
        timeLimitSeconds: 600,
        maxAttempts: 1,
        selectionRules: { count: 5 },
      }),
    ).rejects.toThrow("TUTOR_ACCESS_DENIED: ROLE_NOT_AUTHORIZED");

    const audits = await testDb.select().from(schema.auditMutasi);
    const rejectedAudit = audits.find(
      (a) => a.actorId === "usr-student-override-attempt" && a.outcome === "rejected",
    );
    expect(rejectedAudit).toBeDefined();
    expect(rejectedAudit?.reason).toContain("ROLE_NOT_AUTHORIZED");
  });
});
