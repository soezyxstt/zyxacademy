import { beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const objects = new Map<string, Uint8Array>();
let downloads = 0;
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key),
  upload: async (bytes: Uint8Array, _name: string, _type: string, { key }: { key: string }) => { objects.set(key, bytes); },
  download: async (key: string) => { downloads++; const bytes = objects.get(key); if (!bytes) throw new Error("missing"); return bytes; },
} }));

const { aiQuestionBank, exams, mataKuliah, questions } = await import("@/db/schema");
let examCourse = "legacy-course";
let bankRows: Record<string, unknown>[] = [];
let transactions = 0;
let inserted: Record<string, unknown>[] = [];
const db = {
  select: () => ({ from: (table: unknown) => ({ where: () => {
    if (table === exams) return { limit: async () => [{ id: "exam", courseId: examCourse, type: "tryout" }] };
    if (table === mataKuliah) return { limit: async () => [{ id: "canonical-course", legacyCourseId: "legacy-course" }] };
    if (table === aiQuestionBank) return Promise.resolve(bankRows);
    if (table === questions) return Promise.resolve([]);
    throw new Error("Unexpected table");
  } }) }),
  transaction: async (callback: (tx: unknown) => Promise<void>) => {
    transactions++;
    await callback({ insert: () => ({ values: async (rows: Record<string, unknown>[]) => { inserted = rows; } }) });
  },
};
mock.module("@/db", () => ({ db }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "admin", role: "admin" } }) } } }));
mock.module("@/lib/tutor/assessment-policy", () => ({
  TUTOR_CAPABILITY_ERRORS: {},
  REVIEWABLE_SUBMISSION_STATUSES: [],
  FAILURE_AUDIT_ATTEMPTS: 6,
  TutorAuditPersistenceError: class extends Error {},
  resolveActorRoles: async () => ({ roles: ["admin"], isAdmin: true }),
  isReviewableSubmissionStatus: () => false,
  parseSelectionRulesInput: () => ({}),
  resolveEffectiveAssessmentType: () => null,
  assertTutorQuizCapability: () => {},
  checkCourseMatch: () => true,
  hashTeacherNote: () => ({}),
  buildGradingSnapshots: () => ({}),
  isSqliteBusyError: () => false,
  isUniqueConstraintError: () => false,
  recordTutorMutationAuditSafe: async () => {},
  recordTutorFailureAudit: async () => {},
}));
mock.module("@/lib/audit/mutasi", () => ({ recordTutorMutationAudit: async () => {} }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { stageQuestionVisualBinding } = await import("@/lib/materials/question-visual-binding");
const { importQuestionBankToTryoutAction } = await import("@/app/actions/tutor-management");
const spec = { id: "visual", kind: "interactive_document" as const, version: 1 as const, label: "Visual", description: "Visual", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text" as const, summary: "Ringkasan", content: "Isi" }, printCaption: "Awal" };
const fence = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
const pair = { spec, document: new Uint8Array([1]), print: new Uint8Array([2]) };
const question = { prompt: fence, options: ["A", "B"], explanation: "Pembahasan" };
const row = { id: "bank", ...question, questionType: "multiple_choice", correctIndices: [0], origin: "zyx_original", reviewStatus: "published" };

beforeEach(() => {
  objects.clear();
  downloads = 0;
  transactions = 0;
  inserted = [];
  examCourse = "legacy-course";
  bankRows = [{ ...row }];
});

test("imports the exact published bank snapshot using its existing legacy course receipt", async () => {
  await stageQuestionVisualBinding("legacy-course", question, [pair]);
  const keys = [...objects.keys()];
  expect(await importQuestionBankToTryoutAction("canonical-course", "exam", ["bank"])).toEqual({ success: true, imported: 1, skipped: 0 });
  expect(transactions).toBe(1);
  expect(inserted).toHaveLength(1);
  expect(inserted[0].content).toMatchObject({ bankQuestionId: "bank", ...question });
  expect([...objects.keys()]).toEqual(keys);
});

test.each(["unbound", "prompt", "explanation", "course"])("rejects %s before the transaction", async (change) => {
  if (change !== "unbound") await stageQuestionVisualBinding("legacy-course", question, [pair]);
  if (change === "prompt") bankRows = [{ ...row, prompt: `${fence}\nDiubah` }];
  if (change === "explanation") bankRows = [{ ...row, explanation: "Diubah" }];
  if (change === "course") examCourse = "canonical-course";
  await expect(importQuestionBankToTryoutAction("canonical-course", "exam", ["bank"]))
    .rejects.toThrow("Aset visual soal belum terverifikasi untuk mata kuliah tryout.");
  expect(transactions).toBe(0);
  expect(inserted).toHaveLength(0);
});

test.each(["options", "explanation"])("detects an unbound visual in %s", async (field) => {
  bankRows = [{ ...row, prompt: "Soal biasa", [field]: field === "options" ? [fence, "B"] : fence }];
  await expect(importQuestionBankToTryoutAction("canonical-course", "exam", ["bank"]))
    .rejects.toThrow("Aset visual soal belum terverifikasi untuk mata kuliah tryout.");
  expect(transactions).toBe(0);
});

test("imports an ordinary question without a receipt", async () => {
  bankRows = [{ ...row, prompt: "Soal biasa" }];
  expect(await importQuestionBankToTryoutAction("canonical-course", "exam", ["bank"])).toEqual({ success: true, imported: 1, skipped: 0 });
  expect(transactions).toBe(1);
  expect(downloads).toBe(0);
});
