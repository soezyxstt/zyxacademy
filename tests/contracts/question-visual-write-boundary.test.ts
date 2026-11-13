import { beforeEach, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { buildInteractiveDocumentAdmissionKey, buildInteractiveDocumentAssetKey } from "@/lib/storage/keys";

mock.module("server-only", () => ({}));
const objects = new Map<string, Uint8Array>();
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key),
  upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { objects.set(options.key, bytes); },
  download: async (key: string) => objects.get(key)!,
} }));
const offload = mock(async (question: unknown) => question);
mock.module("@/lib/question-images", () => ({ offloadQuestionItemImages: offload, offloadBase64ImagesToR2: offload }));
let rows: unknown[][] = [];
let writes: unknown[] = [];
const db: any = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => rows.shift() ?? [] }) }) }),
  transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  insert: () => ({ values: async (values: unknown) => { writes.push(values); } }),
  delete: () => ({ where: async () => {} }),
  update: () => { throw new Error("unexpected write"); },
};
mock.module("@/db", () => ({ db }));
const { createCanonicalQuestion, updateCanonicalQuestion, createCanonicalQuestionBatch } = await import("@/lib/question-authoring");
const spec = { id: "x", kind: "interactive_document", version: 1, label: "X", description: "X", documentSha256: "a".repeat(64), documentBytes: 10, printSha256: "b".repeat(64), printBytes: 10, height: 400, staticFallback: { type: "text", summary: "X", content: "X" }, printCaption: "X" };
const question = { prompt: `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``, options: ["A", "B"], correctIndices: [0], acceptableAnswers: [], explanation: "Jawaban A", difficulty: "easy" as const, questionType: "multiple_choice" as const, cognitiveLevel: "understand" as const, reasoningPattern: "reason", tags: [] };
const course = { id: "course", legacyCourseId: "legacy", status: "active" };
const identity = { id: "admin", status: "active" };

beforeEach(() => { rows = []; writes = []; objects.clear(); offload.mockClear(); });

test("manual create and update reject unbound hashes before image offload or writes", async () => {
  rows = [[course], [{ id: "legacy" }], [identity]];
  await expect(createCanonicalQuestion({ ...question, courseId: "course", ideaLinks: [], reviewStatus: "generated" }, "admin")).rejects.toThrow("visualAssets");
  rows = [[course], [{ id: "legacy" }], [identity], [{ courseId: "course", origin: "zyx_original" }]];
  await expect(updateCanonicalQuestion({ ...question, courseId: "course", ideaLinks: [], reviewStatus: "generated" }, "admin", "q1")).rejects.toThrow("visualAssets");
  expect(offload).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
  expect(objects.size).toBe(0);
});

test("batch create rejects unbound hashes before image offload or writes", async () => {
  rows = [[course], [{ id: "legacy" }], [identity], [course], [{ id: "legacy" }]];
  await expect(createCanonicalQuestionBatch({ courseId: "course", creatorId: "admin", reviewStatus: "generated", items: [{ question }] })).rejects.toThrow("visualAssets");
  expect(offload).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
  expect(objects.size).toBe(0);
});

test("create, update and batch cannot reveal an unbound visual by trimming an option", async () => {
  const indented = { ...question, prompt: "Pilih gambar", options: [`    ${question.prompt}`, "B"] };
  rows = [[course], [{ id: "legacy" }], [identity]];
  await expect(createCanonicalQuestion({ ...indented, courseId: "course", ideaLinks: [], reviewStatus: "generated" }, "admin")).rejects.toThrow("visualAssets");
  rows = [[course], [{ id: "legacy" }], [identity], [{ courseId: "course", origin: "zyx_original" }]];
  await expect(updateCanonicalQuestion({ ...indented, courseId: "course", ideaLinks: [], reviewStatus: "generated" }, "admin", "q1")).rejects.toThrow("visualAssets");
  rows = [[course], [{ id: "legacy" }], [identity], [course], [{ id: "legacy" }]];
  await expect(createCanonicalQuestionBatch({ courseId: "course", creatorId: "admin", reviewStatus: "generated", items: [{ question: indented }] })).rejects.toThrow("visualAssets");
  expect(offload).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
});

test("authorized batch stages verified assets and persists only metadata", async () => {
  const html = Buffer.from("<!doctype html><button>Tekan</button>");
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
  const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const visual = { ...spec, documentSha256: hash(html), documentBytes: html.length, printSha256: hash(png), printBytes: png.length };
  const entry = (bytes: Buffer, ext: string) => ({ path: `visuals/${hash(bytes)}.${ext}`, sha256: hash(bytes), bytes: bytes.length, base64: bytes.toString("base64") });
  rows = [[course], [{ id: "legacy" }], [identity], [course], [{ id: "legacy" }], [identity], [course], [{ id: "legacy" }], [], []];
  const result = await createCanonicalQuestionBatch({ courseId: "course", creatorId: "admin", reviewStatus: "generated", items: [{ question: { ...question, prompt: `\`\`\`zyx-visual\n${JSON.stringify(visual)}\n\`\`\`` } }], visualAssets: [entry(html, "html"), entry(png, "png")] });
  expect(result[0].reviewStatus).toBe("generated");
  expect(objects.size).toBe(4);
  expect(objects.get(buildInteractiveDocumentAssetKey(visual.documentSha256, "document"))).toEqual(html);
  expect(objects.get(buildInteractiveDocumentAssetKey(visual.printSha256, "print"))).toEqual(png);
  expect(objects.get(buildInteractiveDocumentAdmissionKey(visual.printSha256))).toEqual(Buffer.from(JSON.stringify({ version: 1, sha256: visual.printSha256, bytes: visual.printBytes })));
  expect(JSON.stringify(writes)).toContain(visual.documentSha256);
  expect(JSON.stringify(writes)).not.toContain(html.toString("base64"));
});
