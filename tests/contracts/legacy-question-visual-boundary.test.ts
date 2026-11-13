import { expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/lib/storage", () => ({ storage: {} }));
let writes = 0;
const db = { insert: () => ({ values: async () => { writes++; } }) };
mock.module("@/db", () => ({ db }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "tutor", role: "teacher" } }) } } }));
mock.module("@/lib/auth/tutor-access", () => ({ requireTutorCourseAccess: async () => ({ courseId: "course", legacyCourseId: "course" }) }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
const { executeCreateQuestion } = await import("@/lib/admin-ops-ai/domain-assessment");
const { saveQuestionBankAction, saveTryoutQuestionAction } = await import("@/app/actions/tutor-management");
const spec = { id: "x", kind: "interactive_document", version: 1, label: "X", description: "X", documentSha256: "a".repeat(64), documentBytes: 10, printSha256: "b".repeat(64), printBytes: 10, height: 400, staticFallback: { type: "text", summary: "X", content: "X" }, printCaption: "X" };
const prompt = `\`\`\`zyx-visual\n${JSON.stringify(spec).replace("interactive_document", "interactive\\u005fdocument")}`;

test("legacy writers reject unbound assets before database mutation", async () => {
  const input = { prompt, options: ["A", "B"], explanation: "Jawaban", difficulty: "easy" as const, questionType: "multiple_choice" as const, correctIndices: [0], tags: [] };
  await expect(executeCreateQuestion({ ...input, courseId: "course", correctAnswer: "A" })).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  await expect(saveQuestionBankAction("course", null, input)).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  await expect(saveTryoutQuestionAction("course", "exam", null, { type: "multiple_choice", order: 0, prompt, options: input.options })).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  expect(writes).toBe(0);
  await executeCreateQuestion({ courseId: "course", prompt: "Soal biasa", options: ["A", "B"], correctAnswer: "A" });
  expect(writes).toBe(1);
});
