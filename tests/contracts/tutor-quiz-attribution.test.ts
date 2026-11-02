import { afterAll, beforeAll, describe, expect, it, mock, beforeEach } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

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
  getTutorQuizzesWithAttribution,
  getTutorQuizWithAttribution,
  getTutorQuestionBank,
} from "@/lib/tutor/quiz-read-model";
import {
  saveQuizTemplateAction,
} from "@/app/actions/tutor-management";

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
    await clearTestData();
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
      courseId: "crs-calc",
      title: "Kuis Warisan Lama",
      category: "daily",
      visibility: "free",
      status: "published",
      selectionRules: { count: 5 },
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
      selectionRules: { count: 5 },
      createdAt: now,
      updatedAt: now,
    });

    // Insert question bank item with legacy course_id
    await testDb.insert(schema.aiQuestionBank).values({
      id: "qbk-legacy-bridge",
      courseId: "crs-calc",
      prompt: "Berapakah 2 + 2?",
      options: ["3", "4", "5"],
      correctIndices: [1],
      difficulty: "easy",
      questionType: "multiple_choice",
      explanation: "2 + 2 = 4",
      tags: ["dasar"],
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
