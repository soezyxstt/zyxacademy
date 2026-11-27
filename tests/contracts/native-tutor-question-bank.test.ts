import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb: database } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: database }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));

const { handleTutorQuestionBankCommand } = await import("@/lib/native/academic/assessment/question-bank-command");
const { writeNativeTutorQuestionBank } = await import("@/lib/native/academic/assessment/question-bank-service");
const { questionBankRevision } = await import("@/lib/tutor/question-bank-write");

const origin = "http://localhost:3000";
const tutor = { user: { id: "bank-native-tutor" }, session: { id: "bank-native-session" } };
const otherSession = { user: tutor.user, session: { id: "bank-another-session" } };
const admin = { user: { id: "bank-native-admin" }, session: { id: "bank-admin-session" } };
const input = {
  prompt: "Pilih jawaban benar", questionType: "multiple_choice", options: ["A", "B"], correctIndices: [0],
  difficulty: "easy", tags: ["konsep"], explanation: "Pembahasan",
} as const;
const courseId = "bank-mk";
const freshSessionTime = () => new Date(Date.now() + 600_000);

beforeAll(async () => {
  await database.insert(schema.user).values([
    { id: tutor.user.id, email: "native-bank-tutor@example.test", name: "Tutor", role: "teacher" },
    { id: admin.user.id, email: "native-bank-admin@example.test", name: "Admin", role: "admin" },
  ]);
  await database.insert(schema.pengguna).values([tutor, admin].map(viewer => ({ id: viewer.user.id })));
  await database.insert(schema.peran).values([{ id: "bank-p-tutor", code: "tutor" }, { id: "bank-p-admin", code: "admin" }]).onConflictDoNothing();
  const roles = await database.select().from(schema.peran);
  await database.insert(schema.penggunaPeran).values([tutor, admin].map((viewer, index) => ({
    id: `bank-membership-${index}`, penggunaId: viewer.user.id,
    peranId: roles.find(role => role.code === (index === 0 ? "tutor" : "admin"))!.id, source: "fixture",
  })));
  await database.insert(schema.session).values([tutor, otherSession, admin].map(viewer => ({
    id: viewer.session.id, userId: viewer.user.id, token: viewer.session.id, expiresAt: freshSessionTime(),
  })));
  await database.insert(schema.courses).values([
    { id: "bank-course", title: "Bank Course", category: "Fisika" },
    { id: "bank-outside", title: "Other Course", category: "Fisika" },
  ]);
  await database.insert(schema.mataKuliah).values([
    { id: courseId, legacyCourseId: "bank-course", code: "NATIVEBANK", title: "Bank Course", status: "active" },
    { id: "bank-other-mk", legacyCourseId: "bank-outside", code: "NATIVEOUTSIDE", title: "Other Course", status: "active" },
  ]);
  await database.insert(schema.penugasanTutor).values({
    id: "bank-assignment", penggunaId: tutor.user.id, mataKuliahId: courseId, assignmentScope: "course", status: "active",
  });
  const common = { prompt: "Protected", explanation: "", options: ["A", "B"], correctIndices: [1], reviewStatus: "published" } as const;
  await database.insert(schema.aiQuestionBank).values([
    { ...common, id: "bank-historical", courseId: "bank-course", origin: "historical_reference" },
    { ...common, id: "bank-reference-itb", courseId: "bank-course", origin: "itb_example" },
    { ...common, id: "bank-outside-row", courseId: "bank-outside" },
  ]);
}, 60_000);
afterAll(async () => { await client.close(); });

function command(method: "POST" | "PATCH" | "DELETE", key: string, payload: unknown,
  options: { questionId?: string; course?: string; viewer?: typeof tutor | null; origin?: string } = {}) {
  const parts = ["tutor", options.course ?? "bank-course", "bank", ...(options.questionId ? [options.questionId] : [])];
  const request = new Request(`${origin}/api/native/academic-assessment/${parts.join("/")}`, {
    method, body: JSON.stringify(payload),
    headers: { origin: options.origin ?? origin, "Content-Type": "application/json", "Idempotency-Key": key },
  });
  return handleTutorQuestionBankCommand(request, parts, origin, {
    session: async () => options.viewer === undefined ? tutor : options.viewer,
    write: writeNativeTutorQuestionBank,
  });
}

test("creates, edits, and deletes within the assigned course with durable session-bound receipts", async () => {
  const createKey = "native-bank-create-assigned";
  const newQuestion = { courseId, input };
  const created = await command("POST", createKey, newQuestion);
  expect(created.status).toBe(201);
  expect(created.headers.get("cache-control")).toBe("private, no-store");
  const first = await created.json();
  const questionId = first.questionId;
  const readRow = async () => (await database.select().from(schema.aiQuestionBank).where(eq(schema.aiQuestionBank.id, questionId)))[0];
  const row = await readRow();
  expect(row).toMatchObject({ courseId: "bank-course", status: "active", origin: "zyx_original", reviewStatus: "published" });
  expect(first).toEqual({ questionId, requestId: createKey, revision: questionBankRevision(row) });
  expect(await (await command("POST", createKey, newQuestion, { course: courseId })).json()).toEqual(first);
  expect(await (await command("POST", createKey, newQuestion, { viewer: otherSession })).json()).toEqual({ error: "REQUEST_CONFLICT" });
  await database.update(schema.aiQuestionBank).set({ useCount: 9, qualityScore: 0.8 }).where(eq(schema.aiQuestionBank.id, questionId));

  const editKey = "native-bank-edit-assigned";
  const edit = { courseId, expectedRevision: first.revision, input: { ...input, prompt: "Pertanyaan yang berubah" } };
  const edited = await command("PATCH", editKey, edit, { questionId });
  expect(edited.status).toBe(200);
  const second = await edited.json();
  expect(second.revision).toBe(questionBankRevision(await readRow()));
  expect(second.revision).not.toBe(first.revision);
  expect(await (await command("PATCH", "native-bank-stale-edit", edit, { questionId })).json()).toEqual({ error: "REVISION_CONFLICT" });
  expect(await (await command("PATCH", editKey, edit, { questionId: "bank-historical" })).json()).toEqual({ error: "REQUEST_CONFLICT" });

  const deleteKey = "native-bank-delete-assigned";
  const deletion = { courseId, expectedRevision: second.revision };
  const deleted = await command("DELETE", deleteKey, deletion, { questionId });
  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({ questionId, requestId: deleteKey, revision: null });
  expect(await (await command("DELETE", deleteKey, deletion, { questionId })).json()).toEqual({ questionId, requestId: deleteKey, revision: null });
  expect(await (await command("PATCH", editKey, edit, { questionId })).json()).toEqual(second);
  expect(await readRow()).toBeUndefined();
  const receiptAudits = await database.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.entityId, questionId));
  expect(receiptAudits.map(row => row.action).sort()).toEqual(["question_bank:create", "question_bank:delete", "question_bank:update"]);
});

test("denies missing sessions, wrong roles, wrong courses, stale assignments, visual edits and reference mutations", async () => {
  const key = "native-bank-denied-write";
  const draft = { courseId, input };
  expect((await command("POST", key, draft, { viewer: null })).status).toBe(401);
  expect((await command("POST", key, draft, { viewer: admin })).status).toBe(403);
  expect((await command("POST", key, draft, { origin: "https://wrong.example.test" })).status).toBe(403);
  expect((await command("POST", key, draft, { course: "bank-outside" })).status).toBe(403);
  expect((await command("POST", key, { ...draft, courseId: "bank-other-mk" })).status).toBe(409);
  expect((await command("POST", key, { courseId, input: { ...input, correctIndices: [7] } })).status).toBe(422);
  expect(await (await command("POST", key, { courseId, input: { ...input, prompt: "<!--__ZYX_V4_" } })).json())
    .toEqual({ error: "BANK_QUESTION_VISUAL_UNSUPPORTED" });

  for (const questionId of ["bank-historical", "bank-reference-itb", "bank-outside-row"]) {
    const [row] = await database.select().from(schema.aiQuestionBank).where(eq(schema.aiQuestionBank.id, questionId));
    const expectedRevision = questionBankRevision(row);
    const expectedStatus = questionId === "bank-outside-row" ? 404 : 403;
    expect((await command("PATCH", key, { ...draft, expectedRevision }, { questionId })).status).toBe(expectedStatus);
    expect((await command("DELETE", key, { courseId, expectedRevision }, { questionId })).status).toBe(expectedStatus);
  }

  await database.update(schema.session).set({ expiresAt: new Date(0) }).where(eq(schema.session.id, tutor.session.id));
  try {
    expect((await command("POST", key, draft)).status).toBe(401);
  } finally {
    await database.update(schema.session).set({ expiresAt: freshSessionTime() }).where(eq(schema.session.id, tutor.session.id));
  }
  await database.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "bank-assignment"));
  try {
    expect((await command("POST", key, draft)).status).toBe(403);
  } finally {
    await database.update(schema.penugasanTutor).set({ status: "active" }).where(eq(schema.penugasanTutor.id, "bank-assignment"));
  }
});
