import { afterAll, beforeAll, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

let fixture: Awaited<ReturnType<typeof createPostgresTestDb>>;
const delegate = new Proxy({} as typeof fixture.testDb, {
  get(_target, key) {
    const value = Reflect.get(fixture.testDb, key);
    return typeof value === "function" ? value.bind(fixture.testDb) : value;
  },
});
mock.module("@/db", () => ({ db: delegate }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));

import { handleAdminTryoutDraftCommand } from "@/lib/native/academic/assessment/tryout-draft-command";
import { changeTryoutDraftQuestionsFromNative, saveTryoutDraftFromNative } from "@/lib/native/academic/assessment/tryout-draft-service";
import { tryoutMetadataRevision, tryoutQuestionSetRevision } from "@/lib/tutor/tryout-authoring";

const admin = { user: { id: "draft-admin" }, session: { id: "draft-admin-session" } };
const tutor = { user: { id: "draft-tutor" }, session: { id: "draft-tutor-session" } };
const origin = "http://localhost:3000";
const base = {
  courseId: "mk-bio", title: "Draf tryout biologi", timeLimitMinutes: 90, maxAttempts: 2,
  openAt: "2026-11-28T09:00:00.000+07:00", closeAt: "2026-11-29T09:00:00.000+07:00", expectedRevision: null,
};
const activeUntil = () => new Date(Date.now() + 600_000);

beforeAll(async () => {
  fixture = await createPostgresTestDb();
  const db = fixture.testDb;
  const now = new Date();
  await db.insert(schema.user).values([
    { id: admin.user.id, role: "admin", email: "tryout-admin@example.test", name: "Admin", createdAt: now, updatedAt: now },
    { id: tutor.user.id, role: "teacher", email: "tryout-tutor@example.test", name: "Tutor", createdAt: now, updatedAt: now },
  ]);
  await db.insert(schema.pengguna).values([{ id: admin.user.id, status: "active" }, { id: tutor.user.id, status: "active" }]);
  await db.insert(schema.peran).values([{ id: "p-tryout-admin", code: "admin" }, { id: "p-tryout-tutor", code: "tutor" }]).onConflictDoNothing();
  const roles = await db.select().from(schema.peran);
  await db.insert(schema.penggunaPeran).values([
    { id: "draft-admin-role", penggunaId: admin.user.id, peranId: roles.find((role) => role.code === "admin")!.id, source: "seed" },
    { id: "draft-tutor-role", penggunaId: tutor.user.id, peranId: roles.find((role) => role.code === "tutor")!.id, source: "seed" },
  ]);
  await db.insert(schema.session).values([admin, tutor].map((viewer) => ({
    id: viewer.session.id, token: viewer.session.id, expiresAt: activeUntil(), userId: viewer.user.id,
  })));
  await db.insert(schema.courses).values([
    { id: "bio", title: "Biologi", category: "Biologi" },
    { id: "fisika", title: "Fisika", category: "Fisika" },
  ]);
  await db.insert(schema.mataKuliah).values([
    { id: "mk-bio", code: "BI-01", title: "Biologi", legacyCourseId: "bio", status: "active" },
    { id: "mk-fisika", code: "FI-01", title: "Fisika", legacyCourseId: "fisika", status: "active" },
  ]);
}, 60_000);
afterAll(async () => { await fixture?.client.close(); });

function command(method: "POST" | "PATCH", key: string, body: unknown, options: {
  slug?: string; examId?: string; questions?: boolean; viewer?: typeof admin | null; admitAdmin?: boolean; requestOrigin?: string;
} = {}) {
  const parts = ["admin", options.slug ?? "bio", "tryouts", ...(options.examId ? [options.examId] : []), ...(options.questions ? ["questions"] : [])];
  const request = new Request(`${origin}/api/native/academic-assessment/${parts.join("/")}`, {
    method, body: JSON.stringify(body), headers: {
      "content-type": "application/json", origin: options.requestOrigin ?? origin, "idempotency-key": key,
    },
  });
  return handleAdminTryoutDraftCommand(request, parts, origin, {
    session: async () => options.viewer === undefined ? admin : options.viewer,
    hasAdmin: async (id) => options.admitAdmin ?? (id === admin.user.id),
    save: saveTryoutDraftFromNative,
    changeQuestions: changeTryoutDraftQuestionsFromNative,
  });
}

it("creates only draft tryouts and replays the same request across a compatible course alias", async () => {
  const key = "admin-native-create-tryout";
  expect((await command("POST", key, base, { requestOrigin: "https://other.test" })).status).toBe(403);
  expect((await command("POST", key, { ...base, status: "published" })).status).toBe(422);
  expect((await command("POST", key, { ...base, closeAt: base.openAt })).status).toBe(422);
  expect((await command("POST", key, { ...base, maxAttempts: 0 })).status).toBe(422);
  expect((await command("POST", key, base, { viewer: null })).status).toBe(401);
  expect((await command("POST", key, base, { viewer: tutor, admitAdmin: true })).status).toBe(403);
  expect((await command("POST", key, { ...base, courseId: "mk-fisika" })).status).toBe(409);

  const response = await command("POST", key, base);
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const receipt = await response.json();
  expect((await (await command("POST", key, base, { slug: "mk-bio" })).json())).toEqual(receipt);
  expect((await command("POST", key, { ...base, title: "Judul lain" })).status).toBe(409);
  const [exam] = await fixture.testDb.select().from(schema.exams).where(eq(schema.exams.id, receipt.examId));
  expect(exam).toMatchObject({ courseId: "bio", type: "tryout", status: "draft", title: base.title });
  expect(exam.openAt?.toISOString()).toBe("2026-11-28T02:00:00.000Z");
  expect(receipt).toMatchObject({ requestId: key, revision: tryoutMetadataRevision(exam) });
  const audits = await fixture.testDb.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.entityId, exam.id));
  expect(audits).toHaveLength(1);
});

it("imports and removes only eligible bank snapshots in the scoped draft and replays successful commands", async () => {
  const db = fixture.testDb;
  const [exam, another, published] = await db.insert(schema.exams).values([
    { id: "draft-bank", courseId: "bio", type: "tryout", title: "Draf impor", status: "draft" },
    { id: "other-bank", courseId: "fisika", type: "tryout", title: "Draf lain", status: "draft" },
    { id: "published-bank", courseId: "bio", type: "tryout", title: "Terbit", status: "published" },
  ]).returning();
  const [manual] = await db.insert(schema.questions).values({
    id: "manual-bank-test", examId: exam.id, type: "essay", content: { prompt: "Soal langsung" }, order: 3,
  }).returning();
  const bank = { courseId: "bio", prompt: "Pertanyaan", options: ["A", "B"], correctIndices: [1], explanation: "Alasan", reviewStatus: "published" } as const;
  await db.insert(schema.aiQuestionBank).values([
    { ...bank, id: "bank-ordinary" },
    { ...bank, id: "bank-example", origin: "itb_example", sourceEventName: "Ujian", sourceReferenceId: "ref-snapshot" },
    { ...bank, id: "bank-history", origin: "historical_reference", quizEligible: true },
    { ...bank, id: "bank-private", reviewStatus: "generated" },
    { ...bank, id: "bank-outside", courseId: "fisika" },
  ]);
  const request = (requestId: string, body: unknown, examId = exam.id, slug = "bio") =>
    command("POST", requestId, body, { examId, slug, questions: true });
  const path = { examId: exam.id, questions: true };
  const key = "native-bank-import-one";
  const initial = { action: "import", courseId: "mk-bio", expectedRevision: tryoutQuestionSetRevision(exam, [manual]), bankIds: ["bank-example", "bank-ordinary"] };
  expect((await command("POST", key, initial, { ...path, viewer: tutor, admitAdmin: true })).status).toBe(403);
  expect((await command("POST", key, initial, { ...path, requestOrigin: "https://different.test" })).status).toBe(403);
  expect((await request(key, initial, another.id)).status).toBe(404);
  expect((await request(key, { ...initial, expectedRevision: tryoutQuestionSetRevision(published, []) }, published.id)).status).toBe(409);
  expect((await request(key, { ...initial, bankIds: ["bank-ordinary", "bank-ordinary"] })).status).toBe(422);
  for (const id of ["bank-history", "bank-private", "bank-outside", "missing"]) {
    expect(await (await request(key, { ...initial, bankIds: ["bank-ordinary", id] })).json()).toEqual({ error: "TRYOUT_BANK_CHANGED" });
  }
  expect(await db.select().from(schema.questions).where(eq(schema.questions.examId, exam.id))).toEqual([manual]);

  const response = await request(key, initial);
  expect(response.status).toBe(200);
  const receipt = await response.json();
  const actual = await db.select().from(schema.questions).where(eq(schema.questions.examId, exam.id)).orderBy(schema.questions.order);
  expect(receipt).toEqual({ requestId: key, examId: exam.id, revision: tryoutQuestionSetRevision(exam, actual), imported: 2, skipped: 0 });
  expect(actual.map((item) => item.order)).toEqual([3, 4, 5]);
  expect(actual[1].content).toMatchObject({ bankQuestionId: "bank-example", correctIndex: 1, sourceEventName: "Ujian", sourceReferenceId: "ref-snapshot" });
  expect(await (await request(key, initial, exam.id, "mk-bio")).json()).toEqual(receipt);
  expect(await (await request(key, { ...initial, bankIds: ["bank-ordinary"] })).json()).toEqual({ error: "REQUEST_CONFLICT" });
  expect(await (await request("native-bank-new-stale", initial)).json()).toEqual({ error: "REVISION_CONFLICT" });

  const repeat = await request("native-bank-duplicate", { ...initial, expectedRevision: receipt.revision });
  expect(await repeat.json()).toMatchObject({ imported: 0, skipped: 2, revision: receipt.revision });
  const remove = { action: "remove", courseId: "mk-bio", expectedRevision: receipt.revision, questionId: actual[1].id };
  expect((await request("native-bank-remove-manual", { ...remove, questionId: manual.id })).status).toBe(404);
  expect(await (await request(key, remove)).json()).toEqual({ error: "REQUEST_CONFLICT" });
  const removed = await request("native-bank-remove", remove);
  expect(removed.status).toBe(200);
  const removedReceipt = await removed.json();
  expect(await (await request("native-bank-remove", remove)).json()).toEqual(removedReceipt);
  const remaining = await db.select().from(schema.questions).where(eq(schema.questions.examId, exam.id)).orderBy(schema.questions.order);
  expect(remaining.map((row) => row.id)).toEqual([manual.id, actual[2].id]);
  expect(removedReceipt.revision).toBe(tryoutQuestionSetRevision(exam, remaining));
  const audits = await db.select().from(schema.auditMutasi).where(eq(schema.auditMutasi.entityId, exam.id));
  expect(audits).toHaveLength(3);

  await db.insert(schema.submissions).values({ id: "tryout-existing-attempt", userId: tutor.user.id, examId: exam.id });
  const blocked = await request("tryout-after-submission", { ...remove, expectedRevision: removedReceipt.revision, questionId: remaining[1].id });
  expect(await blocked.json()).toEqual({ error: "TRYOUT_HAS_SUBMISSIONS" });
  expect(await db.select().from(schema.questions).where(eq(schema.questions.examId, exam.id)).orderBy(schema.questions.order)).toEqual(remaining);
});

it("edits only the locked course draft and preserves settings through replay and conflicts", async () => {
  const db = fixture.testDb;
  const [prior] = await db.insert(schema.exams).values({
    id: "draft-edit", courseId: "bio", type: "tryout", title: "Draf lama", status: "draft",
    settings: { timeLimitMinutes: 90, maxAttempts: 2, randomization: { perAttempt: true } },
  }).returning();
  await db.insert(schema.exams).values([
    { id: "ended-tryout", courseId: "bio", type: "tryout", title: "Tryout selesai", status: "ended" },
    { id: "different-course", courseId: "fisika", type: "tryout", title: "Tryout lain", status: "draft" },
    { id: "old-quiz", courseId: "bio", type: "quiz", title: "Kuis", status: "draft" },
  ]);
  const key = "admin-native-update-tryout";
  const draft = { ...base, title: "Draf baru", expectedRevision: tryoutMetadataRevision(prior) };
  const edit = (requestId: string, data = draft, examId = prior.id) => command("PATCH", requestId, data, { examId });
  expect((await edit(key, draft, "different-course")).status).toBe(404);
  expect((await edit(key, draft, "old-quiz")).status).toBe(404);
  expect((await edit(key, draft, "ended-tryout")).status).toBe(409);
  expect((await command("PATCH", key, base, { examId: prior.id })).status).toBe(422);

  const updated = await edit(key);
  expect(updated.status).toBe(200);
  const receipt = await updated.json();
  expect(await (await edit(key)).json()).toEqual(receipt);
  expect((await edit(key, { ...draft, title: "Percobaan lain" })).status).toBe(409);
  expect((await edit("admin-native-stale-revision")).status).toBe(409);
  const [saved] = await db.select().from(schema.exams).where(eq(schema.exams.id, prior.id));
  expect(receipt).toMatchObject({ examId: prior.id, revision: tryoutMetadataRevision(saved) });
  expect(saved.title).toBe("Draf baru");
  expect(saved.status).toBe("draft");
  expect(saved.settings).toMatchObject({ randomization: { perAttempt: true } });

  await db.update(schema.session).set({ expiresAt: new Date(0) }).where(eq(schema.session.id, admin.session.id));
  try {
    expect((await edit(key)).status).toBe(401);
  } finally {
    await db.update(schema.session).set({ expiresAt: activeUntil() }).where(eq(schema.session.id, admin.session.id));
  }
  const [membership] = await db.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.id, "draft-admin-role")).returning();
  try {
    expect((await edit(key)).status).toBe(403);
  } finally {
    await db.insert(schema.penggunaPeran).values(membership);
  }
});
