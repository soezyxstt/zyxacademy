import { afterAll, beforeAll, describe, expect, it, mock, beforeEach } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { POST as createQuizTemplate } from "@/app/api/quiz/templates/route";
import { DELETE as deleteQuizTemplate, PATCH as updateQuizTemplate } from "@/app/api/quiz/templates/[id]/route";
import { TUTOR_CAPABILITY_ERRORS } from "@/lib/tutor/assessment-policy";

let mockSession: any = null;

let client: Awaited<ReturnType<typeof createPostgresTestDb>>["client"];
let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>["testDb"];
let beforeNextWrite: (() => Promise<void>) | undefined;
const dbProxy = new Proxy({} as typeof testDb, {
  get(_target, key) {
    const value = Reflect.get(testDb, key);
    if (key === "transaction" && beforeNextWrite) {
      return async (...args: Parameters<typeof testDb.transaction>) => {
        const beforeWrite = beforeNextWrite;
        beforeNextWrite = undefined;
        await beforeWrite?.();
        return Reflect.apply(value, testDb, args);
      };
    }
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

const publishedNotifications: unknown[] = [];
mock.module("@/lib/notifications/send", () => ({
  notifyQuizPublishedBestEffort: async (event: unknown) => { publishedNotifications.push(event); },
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
    publishedNotifications.length = 0;
    beforeNextWrite = undefined;
  });

  it("replays guarded native quiz creates and edits with locked revision and course scope", async () => {
    const origin = "http://localhost:3000";
    function request(method: "POST" | "PATCH" | "DELETE", resource: string, requestId: string, body: unknown) {
      return new NextRequest(`${origin}/api/quiz/templates${resource}`, {
        method, body: JSON.stringify(body), headers: {
          "content-type": "application/json", origin, "idempotency-key": requestId,
        },
      });
    }
    const liveSession = "session-native-quiz";
    await testDb.insert(schema.session).values({
      id: liveSession, userId: "usr-tutor-1", token: liveSession, expiresAt: new Date(Date.now() + 60_000),
    });
    mockSession = { user: { id: "usr-tutor-1", role: "teacher" }, session: { id: liveSession } };
    const createKey = "academic-create-quiz-1";
    const createBody = {
      courseId: "mk-calc", title: "Kuis native", category: "weekly", status: "draft",
      openAt: "2026-11-20T08:00:00.000Z", closeAt: "2026-11-20T09:00:00.000Z",
      selectionRules: { count: 1, difficulty_proportions: { easy: 1, medium: 0, hard: 0 }, tags: ["turunan"], seed: 7 },
    };
    const created = await createQuizTemplate(request("POST", "", createKey, createBody));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.requestId).toBe(createKey);
    const { templateId } = createdBody;
    expect(await (await createQuizTemplate(request("POST", "", createKey, createBody))).json()).toEqual(createdBody);
    expect((await createQuizTemplate(request("POST", "", createKey, { ...createBody, title: "Isi berbeda" }))).status).toBe(409);
    expect((await createQuizTemplate(request("POST", "", "academic-create-tag-conflict", createBody))).status).toBe(409);
    expect((await createQuizTemplate(request("POST", "", "academic-create-wrong-course", { ...createBody, courseId: "mk-physics" }))).status).toBe(403);
    expect((await createQuizTemplate(request("POST", "", "academic-create-simulation", { ...createBody, category: "simulation" }))).status).toBe(403);
    expect((await createQuizTemplate(request("POST", "", "academic-create-invalid", { ...createBody, maxAttempts: -1 }))).status).toBe(400);
    expect((await createQuizTemplate(request("POST", "", "academic-create-foreign-question", {
      ...createBody, selectionRules: { count: 1, fixedQuestionIds: ["missing-question"] },
    }))).status).toBe(400);

    const [original] = await testDb.select().from(schema.quizTemplates).where(eq(schema.quizTemplates.id, templateId));
    expect(original?.title).toBe("Kuis native");
    const context = { params: Promise.resolve({ id: templateId }) };
    const patchKey = "academic-edit-quiz-1";
    const patchBody = {
      expectedRevision: original.updatedAt.getTime(), expectedCourseId: "mk-calc",
      title: "Kuis native revisi", status: "published",
      selectionRules: { count: 1, difficulty_proportions: { easy: 1, medium: 0, hard: 0 }, tags: ["turunan"] },
    };
    const patch = (key: string, body: unknown) => updateQuizTemplate(request("PATCH", `/${templateId}`, key, body), context);
    expect((await patch("academic-edit-invalid-date", {
      expectedRevision: patchBody.expectedRevision, expectedCourseId: "mk-calc", openAt: "2026-11-20T10:00:00.000Z",
    })).status).toBe(400);
    expect((await patch("academic-edit-missing-revision", { title: "Lama" })).status).toBe(400);
    expect((await patch("academic-edit-outside-course", { ...patchBody, expectedCourseId: "mk-physics" })).status).toBe(404);
    expect((await patch(patchKey, patchBody)).status).toBe(200);
    expect(await (await patch(patchKey, patchBody)).json()).toEqual({ requestId: patchKey, templateId, success: true });
    expect((await patch(patchKey, { ...patchBody, title: "Isi berbeda" })).status).toBe(409);
    expect((await patch("academic-edit-stale-revision", patchBody)).status).toBe(409);
    const [saved] = await testDb.select().from(schema.quizTemplates).where(eq(schema.quizTemplates.id, templateId));
    expect(saved.title).toBe("Kuis native revisi");
    expect(saved.status).toBe("published");
    expect(saved.updatedAt.getTime()).toBeGreaterThan(original.updatedAt.getTime());
    expect(saved.selectionRules).toMatchObject({ seed: 7, tags: ["turunan"] });
    const demote = { expectedRevision: saved.updatedAt.getTime(), expectedCourseId: "mk-calc", status: "draft" };
    expect((await patch("academic-quiz-to-draft", demote)).status).toBe(200);
    expect((await patch("academic-quiz-to-draft", demote)).status).toBe(200);
    const [draft] = await testDb.select().from(schema.quizTemplates).where(eq(schema.quizTemplates.id, templateId));
    expect(draft.status).toBe("draft");
    expect(draft.selectionRules).toMatchObject({ seed: 7 });
    expect(draft.openAt).toEqual(saved.openAt);
    expect(publishedNotifications.length).toBe(1);

    await testDb.update(schema.session).set({ expiresAt: new Date(0) }).where(eq(schema.session.id, liveSession));
    expect((await patch(patchKey, patchBody)).status).toBe(401);
    await testDb.update(schema.session).set({ expiresAt: new Date(Date.now() + 60_000) }).where(eq(schema.session.id, liveSession));
    beforeNextWrite = async () => {
      await testDb.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "pt-tutor-1"));
    };
    expect((await createQuizTemplate(request("POST", "", createKey, createBody))).status).toBe(403);
    expect((await patch(patchKey, patchBody)).status).toBe(403);

    await testDb.update(schema.penugasanTutor).set({ status: "active" }).where(eq(schema.penugasanTutor.id, "pt-tutor-1"));
    await testDb.insert(schema.studentQuizAttempts).values({
      id: "native-quiz-delete-cascade", studentId: "usr-tutor-2", templateId, status: "completed",
      questionsSnapshot: [], answersSnapshot: {}, submittedAt: new Date(),
    });
    const remove = (key: string, body: unknown) => deleteQuizTemplate(request("DELETE", `/${templateId}`, key, body), context);
    const deleteKey = "academic-delete-quiz-1";
    const target = { expectedRevision: draft.updatedAt.getTime(), expectedCourseId: "mk-calc" };
    expect((await remove(deleteKey, { ...target, expectedRevision: saved.updatedAt.getTime() })).status).toBe(409);
    expect((await remove(deleteKey, { ...target, expectedCourseId: "mk-physics" })).status).toBe(403);
    const deleted = await remove(deleteKey, target);
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ success: true, requestId: deleteKey, templateId });
    expect((await remove(deleteKey, target)).status).toBe(200);
    expect((await remove(deleteKey, { ...target, expectedRevision: target.expectedRevision + 1 })).status).toBe(409);
    expect(await testDb.select().from(schema.quizTemplates).where(eq(schema.quizTemplates.id, templateId))).toHaveLength(0);
    expect(await testDb.select().from(schema.studentQuizAttempts).where(eq(schema.studentQuizAttempts.templateId, templateId))).toHaveLength(0);
    await testDb.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "pt-tutor-1"));
    expect((await remove(deleteKey, target)).status).toBe(403);
  });

  it("allows a locked Admin session to create a simulation and rejects foreign-origin retry", async () => {
    const id = "admin-native-quiz";
    const sessionId = "admin-native-quiz-session";
    const at = new Date();
    await testDb.insert(schema.user).values({ id, name: "Admin", email: "admin@quiz.test", role: "admin", createdAt: at, updatedAt: at });
    await testDb.insert(schema.pengguna).values({ id, status: "active", createdAt: at, updatedAt: at });
    await testDb.insert(schema.penggunaPeran).values({ id: "pp-admin-native", penggunaId: id, peranId: "peran-admin", source: "seed", createdAt: at });
    await testDb.insert(schema.session).values({ id: sessionId, userId: id, token: sessionId, expiresAt: new Date(Date.now() + 60_000) });
    mockSession = { user: { id, role: "admin" }, session: { id: sessionId } };
    const body = {
      courseId: "mk-physics", title: "Simulasi fisika", category: "simulation",
      selectionRules: { count: 1, difficulty_proportions: { easy: 1, medium: 0, hard: 0 } },
    };
    const request = (origin: string) => new NextRequest("http://localhost:3000/api/quiz/templates", {
      method: "POST", body: JSON.stringify(body), headers: {
        "content-type": "application/json", origin, "idempotency-key": "academic-admin-simulation",
      },
    });
    expect((await createQuizTemplate(request("https://example.test"))).status).toBe(403);
    const created = await createQuizTemplate(request("http://localhost:3000"));
    expect(created.status).toBe(201);
    const { templateId } = await created.json();
    const [canonical] = await testDb.select().from(schema.asesmen).where(eq(schema.asesmen.id, templateId));
    expect(canonical.assessmentType).toBe("tryout");
    expect(canonical.creatorId).toBe(id);
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
