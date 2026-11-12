import { beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const objects = new Map<string, Uint8Array>();
beforeEach(() => objects.clear());
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key),
  upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { objects.set(options.key, bytes); },
  download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("missing"); return bytes; },
} }));
const { stageQuestionVisualBinding, verifyQuestionVisualBinding } = await import("@/lib/materials/question-visual-binding");
const spec = { id: "visual", kind: "interactive_document" as const, version: 1 as const, label: "Visual", description: "Visual", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text" as const, summary: "Ringkasan", content: "Isi" }, printCaption: "Awal" };
const fence = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
const question = { prompt: fence, options: ["A", "B"], explanation: "Pembahasan" };
const pair = { spec, document: new Uint8Array([1]), print: new Uint8Array([2]) };

test("stages a binding for an option detected only after persistence trims it", async () => {
  const indented = { prompt: "Pilih visual", options: [`    ${fence}`, "B"], explanation: "Pembahasan" };
  await stageQuestionVisualBinding("course", indented, [pair]);
  expect(await verifyQuestionVisualBinding("course", { ...indented, options: indented.options.map(option => option.trim()) })).toBe(true);
});

test("proof binds final server content and course while retaining revisions and accepting shuffled options", async () => {
  expect(await verifyQuestionVisualBinding("course", question)).toBe(false);
  await expect(stageQuestionVisualBinding("course", question, [])).rejects.toThrow("UNVERIFIED");
  await stageQuestionVisualBinding("course", question, [pair]);
  expect(await verifyQuestionVisualBinding("course", { ...question, options: ["B", "A"] })).toBe(true);
  expect(await verifyQuestionVisualBinding("other", question)).toBe(false);
  expect(await verifyQuestionVisualBinding("course", { ...question, explanation: "changed" })).toBe(false);
  const revised = { ...question, prompt: `${fence}\nBaru` };
  await stageQuestionVisualBinding("course", revised, [pair]);
  expect(await verifyQuestionVisualBinding("course", question)).toBe(true);
  expect(await verifyQuestionVisualBinding("course", revised)).toBe(true);
  objects.set([...objects.keys()][0], new Uint8Array([1]));
  expect(await verifyQuestionVisualBinding("course", question)).toBe(false);
});
