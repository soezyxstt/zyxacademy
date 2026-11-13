import { beforeEach, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { QuestionAuthoringInput } from "@/lib/question-authoring-contract";

mock.module("server-only", () => ({}));
const objects = new Map<string, Uint8Array>();
const downloads: string[] = [];
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key),
  upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { objects.set(options.key, bytes); },
  download: async (key: string) => { downloads.push(key); const value = objects.get(key); if (!value) throw new Error("missing"); return value; },
} }));
const offload = mock(async (question: any) => question);
mock.module("@/lib/question-images", () => ({ offloadQuestionItemImages: offload, offloadBase64ImagesToR2: offload }));
let rows: any[][] = [];
let writes: unknown[] = [];
const db: any = {
  select: () => ({ from: () => ({ where: () => ({ limit: () => {
    const result: any = Promise.resolve(rows.shift() ?? []);
    result.for = () => result;
    return result;
  } }) }) }),
  transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  insert: () => ({ values: async (values: unknown) => { writes.push(values); } }),
  delete: () => ({ where: async () => {} }),
  update: () => ({ set: (values: unknown) => ({ where: async () => { writes.push(values); } }) }),
};
mock.module("@/db", () => ({ db }));
const { updateCanonicalQuestion } = await import("@/lib/question-authoring");
const { stageQuestionVisualBinding, verifyQuestionVisualBinding } = await import("@/lib/materials/question-visual-binding");
const { stageInteractiveDocumentAssets } = await import("@/lib/materials/interactive-document-assets");
const { buildInteractiveDocumentAdmissionKey, buildInteractiveDocumentAssetKey } = await import("@/lib/storage/keys");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const html = Buffer.from("<!doctype html><button>Tekan</button>");
const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
const makeSpec = (document = html, print = png) => ({ id: "x", kind: "interactive_document" as const, version: 1 as const, label: "X", description: "X", documentSha256: hash(document), documentBytes: document.length, printSha256: hash(print), printBytes: print.length, height: 400, staticFallback: { type: "text" as const, summary: "X", content: "X" }, printCaption: "X" });
const fence = (spec: ReturnType<typeof makeSpec>) => `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
const makeQuestion = (spec = makeSpec()): QuestionAuthoringInput => ({ prompt: fence(spec), options: ["A", "B"], correctIndices: [0], acceptableAnswers: [], explanation: "Jawaban A", difficulty: "easy", questionType: "multiple_choice", cognitiveLevel: "understand", reasoningPattern: "reason", tags: [], courseId: "course", ideaLinks: [], reviewStatus: "generated" });
const originalRow = (question = makeQuestion()) => ({ courseId: "course", chapterId: question.chapterId ?? null, origin: "zyx_original", status: "draft", updatedAt: new Date("2026-01-01T00:00:00Z"), version: 1, prompt: question.prompt, options: question.options.map(text => ({ text })) });
const course = { id: "course", legacyCourseId: "legacy", status: "active" };
const identity = { id: "admin", status: "active" };
const inputRows = (row = originalRow(), solution = "Jawaban A") => { rows = [[course], [{ id: "legacy" }], [identity], [row], [{ content: solution }]]; };
const successRows = () => rows.push([identity], [{ id: "q1" }], [originalRow()], [{ ...originalRow(), id: "q1", creatorId: "admin", status: "draft", generationHash: "old" }], [{ id: "q1", origin: "zyx_original", courseId: "legacy", reviewStatus: "generated", generationHash: "old" }]);
const stage = async (question = makeQuestion(), spec = makeSpec(), document = html, print = png) => {
  const pairs = [{ spec, document, print }];
  await stageInteractiveDocumentAssets(pairs);
  await stageQuestionVisualBinding("legacy", question, pairs);
  downloads.length = 0;
};
const update = (question = makeQuestion(), assets?: any) => updateCanonicalQuestion(question, "admin", "q1", assets);
const assetReads = () => downloads.filter(key => key.includes("interactive-documents/") && !key.includes("/admission-v1/"));

beforeEach(() => { objects.clear(); downloads.length = 0; rows = []; writes = []; offload.mockReset(); offload.mockImplementation(async question => question); });

test("metadata and prose edits reuse bound original assets and bind the final fields", async () => {
  await stage();
  inputRows(); successRows();
  await update({ ...makeQuestion(), tags: ["metadata"] });
  expect(writes.length).toBeGreaterThan(0);
  writes = [];
  const edited = { ...makeQuestion(), prompt: `Soal baru\n\n${fence(makeSpec())}`, explanation: "Pembahasan baru", tags: ["review"] };
  inputRows(); successRows();
  const result = await update(edited);
  expect(result.version).toBe(2);
  expect(await verifyQuestionVisualBinding("legacy", edited)).toBe(true);
  expect(assetReads().length).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(writes)).toContain("Pembahasan baru");
});

test("unbound, forged original and changed references cannot fetch stored assets", async () => {
  await stage();
  const bindingKey = [...objects.keys()].find(key => key.includes("question-visual-bindings/"))!;
  const binding = objects.get(bindingKey)!;
  objects.set(bindingKey, Buffer.from("forged"));
  inputRows();
  await expect(update()).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  expect(assetReads()).toHaveLength(0);
  objects.set(bindingKey, binding); downloads.length = 0;
  inputRows(originalRow({ ...makeQuestion(), prompt: `Forged\n\n${fence(makeSpec())}` }));
  await expect(update()).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  expect(assetReads()).toHaveLength(0);
  const altered = makeSpec(Buffer.from("other document"));
  inputRows(); downloads.length = 0;
  await expect(update(makeQuestion(altered))).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  expect(assetReads()).toHaveLength(0);
  inputRows(); downloads.length = 0;
  await expect(update(makeQuestion({ ...makeSpec(), label: "Different metadata" }))).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  expect(assetReads()).toHaveLength(0);
  objects.clear(); inputRows(); downloads.length = 0;
  await expect(update()).rejects.toThrow("QUESTION_VISUAL_ASSETS_REQUIRED");
  expect(assetReads()).toHaveLength(0);
  expect(writes).toHaveLength(0);
});

test("retains a rendered visual whose kind uses a JSON unicode escape", async () => {
  const question = { ...makeQuestion(), prompt: fence(makeSpec()).replace("interactive_document", "interactive\\u005fdocument") };
  await stage(question);
  inputRows(originalRow(question)); successRows();
  await update(question);
  expect(await verifyQuestionVisualBinding("legacy", question)).toBe(true);
});

test("course and origin are checked before reading bindings or assets", async () => {
  await stage();
  for (const row of [{ ...originalRow(), courseId: "other" }, { ...originalRow(), origin: "historical_reference" }]) {
    inputRows(row); downloads.length = 0;
    await expect(update()).rejects.toThrow("mata kuliah ini");
    expect(downloads).toHaveLength(0);
  }
});

test("corrupt stored bytes and invalid UTF-8 or PNG fail even with matching binding and hash", async () => {
  await stage();
  objects.set(buildInteractiveDocumentAssetKey(makeSpec().documentSha256, "document"), Buffer.alloc(html.length));
  inputRows();
  await expect(update()).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
  for (const [document, print] of [[Buffer.from([0xff, 0xfe]), png], [html, Buffer.from("bad png bytes")]] as const) {
    objects.clear();
    const spec = makeSpec(document, print), question = makeQuestion(spec);
    objects.set(buildInteractiveDocumentAssetKey(spec.documentSha256, "document"), document);
    objects.set(buildInteractiveDocumentAssetKey(spec.printSha256, "print"), print);
    await stageQuestionVisualBinding("legacy", question, [{ spec, document, print }]);
    inputRows(originalRow(question));
    await expect(update(question)).rejects.toThrow();
  }
  expect(writes).toHaveLength(0);
});

test("retained edits fail closed when the PNG admission receipt is missing", async () => {
  await stage();
  objects.delete(buildInteractiveDocumentAdmissionKey(makeSpec().printSha256));
  inputRows();
  await expect(update()).rejects.toThrow();
  expect(writes).toHaveLength(0);
});

test("disclosure is checked after normalization and a changed stored version cannot be overwritten", async () => {
  await stage(); inputRows();
  const disclosed = { ...makeQuestion(), explanation: fence(makeSpec()) };
  await expect(update(disclosed)).rejects.toThrow("QUESTION_VISUAL_DISCLOSURE");
  inputRows();
  offload.mockImplementationOnce(async question => ({ ...question, explanation: fence(makeSpec()) }));
  await expect(update()).rejects.toThrow("QUESTION_VISUAL_DISCLOSURE");
  inputRows(); rows.push([identity], [{ id: "q1" }], [{ ...originalRow(), version: 2 }]);
  await expect(update()).rejects.toMatchObject({ code: "QUESTION_AUTHORING_CONFLICT" });
  expect(writes).toHaveLength(0);
});

test("fresh explicit assets permit a changed reference", async () => {
  const document = Buffer.from("<!doctype html><p>New</p>"), spec = makeSpec(document), question = makeQuestion(spec);
  const entry = (bytes: Buffer, ext: string) => ({ path: `visuals/${hash(bytes)}.${ext}`, sha256: hash(bytes), bytes: bytes.length, base64: bytes.toString("base64") });
  inputRows(); rows.pop(); rows.push([identity], [{ ...originalRow(), id: "q1", creatorId: "admin", status: "draft", generationHash: "old" }], [{ id: "q1", origin: "zyx_original", courseId: "legacy", reviewStatus: "generated", generationHash: "old" }]);
  await update(question, [entry(document, "html"), entry(png, "png")]);
  expect(await verifyQuestionVisualBinding("legacy", question)).toBe(true);
});


test("MCP scope is checked before any retained asset read and under the final lock", async () => {
  await stage();
  const expected = { courseId: "course", chapterId: null };
  for (const changed of [{ chapterId: "other" }, { courseId: "other" }, { origin: "historical_reference" }, { status: "published" }, { status: "retired" }]) {
    inputRows({ ...originalRow(), ...changed }); downloads.length = 0;
    await expect(updateCanonicalQuestion(makeQuestion(), "admin", "q1", undefined, expected)).rejects.toThrow();
    expect(downloads).toHaveLength(0);
  }
  for (const changed of [{ chapterId: "other" }, { courseId: "other" }, { origin: "historical_reference" }, { status: "published" }, { status: "retired" }]) {
    inputRows(); rows.push([identity], [{ id: "q1" }], [{ ...originalRow(), ...changed }]);
    await expect(updateCanonicalQuestion(makeQuestion(), "admin", "q1", undefined, expected)).rejects.toThrow();
    expect(writes).toHaveLength(0);
  }
});

test("same-version bulk publication conflicts with a retained Admin edit", async () => {
  await stage(); inputRows();
  rows.push([identity], [{ id: "q1" }], [{ ...originalRow(), status: "published" }]);
  await expect(update()).rejects.toMatchObject({ code: "QUESTION_AUTHORING_CONFLICT" });
  expect(writes).toHaveLength(0);
});

test("retained edits detect a changed timestamp even when status returns to its baseline", async () => {
  await stage(); inputRows();
  rows.push([identity], [{ id: "q1" }], [{ ...originalRow(), updatedAt: new Date("2026-01-01T00:00:01Z") }]);
  await expect(update()).rejects.toMatchObject({ code: "QUESTION_AUTHORING_CONFLICT" });
  expect(writes).toHaveLength(0);
});

test("fresh envelope MCP update rechecks scope under the final lock", async () => {
  const entry = (bytes: Buffer, ext: string) => ({ path: `visuals/${hash(bytes)}.${ext}`, sha256: hash(bytes), bytes: bytes.length, base64: bytes.toString("base64") });
  const assets = [entry(html, "html"), entry(png, "png")];
  for (const changed of [{ chapterId: "other" }, { courseId: "other" }, { origin: "historical_reference" }, { status: "published" }, { status: "retired" }]) {
    inputRows(); rows.pop();
    rows.push([identity], [{ id: "q1" }], [{ ...originalRow(), ...changed }]);
    await expect(updateCanonicalQuestion(makeQuestion(), "admin", "q1", assets, { courseId: "course", chapterId: null })).rejects.toThrow();
    expect(writes).toHaveLength(0);
  }
});

test("Admin can intentionally change chapter and status while retaining a visual", async () => {
  await stage();
  const question = { ...makeQuestion(), chapterId: "chapter-1", reviewStatus: "published" as const };
  rows = [[course], [{ id: "legacy" }], [{ id: "chapter-1", legacyChapterId: "legacy-chapter", courseId: "course", status: "active" }], [identity], [originalRow()], [{ content: "Jawaban A" }]];
  successRows();
  await update(question);
  expect(JSON.stringify(writes)).toContain('"babId":"chapter-1"');
  expect(JSON.stringify(writes)).toContain('"status":"published"');
});

test("visual count is rejected before downloads and repeated references read each asset once", async () => {
  await stage();
  const repeated = (count: number) => ({ ...makeQuestion(), prompt: Array(count).fill(fence(makeSpec())).join("\n\n") });
  inputRows(); downloads.length = 0;
  await expect(update(repeated(9))).rejects.toThrow("INTERACTIVE_DOCUMENT_COUNT_LIMIT");
  expect(downloads).toHaveLength(0);
  inputRows(); successRows(); downloads.length = 0;
  await update(repeated(8));
  // Each asset is read once for retention and once more for staging verification.
  expect(assetReads()).toHaveLength(4);
  expect(new Set(assetReads()).size).toBe(2);
});
