import { afterAll, beforeAll, describe, expect, it, mock, beforeEach } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
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
  saveQuizTemplateAction,
  deleteQuizTemplateAction,
  toggleQuizTemplateStatusAction,
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
    await clearTestData();
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
      courseId: "crs-calc",
      title: "Simulasi Ujian Kalkulus",
      category: "simulation",
      visibility: "paid",
      status: "published",
      selectionRules: { count: 25, assessmentType: "tryout" },
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
