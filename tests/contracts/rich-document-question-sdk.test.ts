import { expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdir, writeFile } from "node:fs/promises";

process.env.BETTER_AUTH_SECRET = "local-test-secret-at-least-thirty-two-characters";
mock.module("server-only", () => ({}));
const objects = new Map<string, Uint8Array>();
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key),
  upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { objects.set(options.key, Uint8Array.from(bytes)); },
  download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("missing object"); return bytes; },
} }));
mock.module("@/lib/question-images", () => ({ offloadQuestionItemImages: async (value: unknown) => value, offloadBase64ImagesToR2: async (value: unknown) => value }));

const schema = await import("@/db/schema");
const canonical = new Map<string, any>();
const projections = new Map<string, any>();
const writes: any[] = [];
const locks: unknown[] = [];
let currentId: string | undefined;
const course = { id: "course", legacyCourseId: "legacy-course", status: "active", code: "C", title: "Course" };
const chapter = { id: "chapter", legacyChapterId: "legacy-chapter", courseId: "course", status: "active", code: "B", title: "Chapter", orderIndex: 1 };
let idea = { id: "published-idea", code: "I", courseId: "course", chapterId: "chapter", status: "published" };
function selected(table: unknown) {
  if (table === schema.mataKuliah) return [course];
  if (table === schema.courses) return [{ id: "legacy-course" }];
  if (table === schema.bab) return [chapter];
  if (table === schema.ide) return [idea];
  if (table === schema.pengguna) return [{ id: "admin", status: "active" }];
  if (table === schema.soal) return currentId && canonical.has(currentId) ? [canonical.get(currentId)] : [];
  if (table === schema.aiQuestionBank) return currentId && projections.has(currentId) ? [projections.get(currentId)] : [];
  throw new Error("UNEXPECTED_DB_SELECT");
}
const db: any = {
  select: () => ({ from: (table: unknown) => {
    const query: any = { where: () => query, orderBy: async () => selected(table), limit: () => query, for: (mode: string) => { expect(mode).toBe("update"); locks.push(table); return query; }, then: (resolve: any, reject: any) => Promise.resolve(selected(table)).then(resolve, reject) };
    return query;
  } }),
  transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  insert: (table: unknown) => ({ values: async (value: any) => {
    writes.push(value);
    if (table === schema.soal) canonical.set(value.id, { ...value, courseId: value.mataKuliahId, chapterId: value.babId });
    if (table === schema.aiQuestionBank) projections.set(value.id, value);
  } }),
  update: (table: unknown) => ({ set: (value: any) => ({ where: async () => {
    writes.push(value);
    if (!currentId) throw new Error("MISSING_CURRENT_ID");
    if (table === schema.soal) canonical.set(currentId, { ...canonical.get(currentId), ...value, courseId: value.mataKuliahId, chapterId: value.babId });
    else if (table === schema.aiQuestionBank) projections.set(currentId, { ...projections.get(currentId), ...value });
    else throw new Error("UNEXPECTED_DB_UPDATE");
  } }) }),
  delete: () => ({ where: async () => {} }),
};
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));

const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
const { RECOMMENDED_PLUGIN_VERSION } = await import("@/lib/authoring/mcp-playbook");
const { readRichDocumentPair, questionEnvelope } = await import("../visual/fixtures/rich-document-packages");
const { makeQuestion, questionCases } = await import("../visual/fixtures/rich-document-questions");
const { readInteractiveDocumentAsset } = await import("@/lib/materials/interactive-document-assets");
const { verifyQuestionVisualBinding } = await import("@/lib/materials/question-visual-binding");
const { authorizeAttemptDocument, interactiveDocumentsInMarkdown } = await import("@/lib/materials/interactive-document-authorization");

test("actual case questions pass local SDK authoring and retain scoped immutable asset bindings", async () => {
  const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:read", "authoring:stage"] };
  const server = createAuthoringMcpServer(principal);
  const client = new Client({ name: "local-question-sdk", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    if (response.isError) throw new Error(`${name}: ${JSON.stringify(response.structuredContent)}`);
    return response.structuredContent as any;
  };
  const records: unknown[] = [];
  try {
    const bootstrap = await call("workflow.get_playbook", { skill: "zyx-question-authoring-mcp", stage: "quiz", bootstrapProtocol: 1, pluginVersion: RECOMMENDED_PLUGIN_VERSION, clientCapabilities: { independentSubagents: false, localArtifactFiles: true, pdfRendering: false } });
    expect(bootstrap.ok).toBe(true);
    const bootstrapToken = bootstrap.bootstrapToken;
    const courseKey = (await call("catalog.list_courses", {})).choices[0].key;
    const chapterKey = (await call("catalog.list_chapters", { courseKey })).choices[0].key;
    const runToken = (await call("workflow.start", { workflow: "quiz_bank", courseKey, chapterKey, bootstrapToken })).runToken;
    const contract = await call("workflow.get_contract", { runToken, bootstrapToken });
    expect(contract.outputs.quizDraft).toBeDefined();
    const negativePair = await readRichDocumentPair("museum");
    const negativeQuestion = makeQuestion("museum", negativePair, "prompt");
    const negativeDraft = { schemaVersion: "question-bank-draft.v2", draftId: "negative", questions: [negativeQuestion] };
    const negativeEnvelope = await questionEnvelope(negativeDraft, [negativePair]);
    const initialWrites = writes.length, initialObjects = objects.size;
    for (const visualAssets of [[], [{ ...negativeEnvelope.visualAssets[0], base64: Buffer.alloc(negativePair.document.length).toString("base64") }, negativeEnvelope.visualAssets[1]]]) {
      const response = await call("assessment.submit_quiz_draft", { runToken, bootstrapToken, draftJson: negativeEnvelope.draftJson, visualAssets });
      expect(response.staged).toBe(false);
      expect(response.issues[0].code).toBe("QUESTION_AUTHORING_VISUAL_ASSETS_INVALID");
      expect(writes.length).toBe(initialWrites);
      expect(objects.size).toBe(initialObjects);
    }
    const reused = { ...negativeDraft, questions: [{ ...negativeQuestion, explanation: negativeQuestion.prompt }] };
    const reusedResult = await call("assessment.validate_quiz_draft", { runToken, bootstrapToken, draftJson: JSON.stringify(reused), visualAssets: negativeEnvelope.visualAssets });
    expect(reusedResult.valid).toBe(false);
    expect(reusedResult.issues[0].message).toContain("QUESTION_VISUAL_DISCLOSURE");
    expect(writes.length).toBe(initialWrites);
    expect(objects.size).toBe(initialObjects);
    idea = { ...idea, status: "draft" };
    const unpublished = await call("assessment.validate_quiz_draft", { runToken, bootstrapToken, ...negativeEnvelope });
    expect(unpublished.valid).toBe(false);
    idea = { ...idea, status: "published", chapterId: "other-chapter" };
    const wrongChapter = await call("assessment.validate_quiz_draft", { runToken, bootstrapToken, ...negativeEnvelope });
    expect(wrongChapter.valid).toBe(false);
    idea = { ...idea, chapterId: "chapter" };

    const readServer = createAuthoringMcpServer({ ...principal, scopes: ["authoring:read"] });
    const readClient = new Client({ name: "read-only-question-sdk", version: "1" });
    const [readCt, readSt] = InMemoryTransport.createLinkedPair();
    await Promise.all([readServer.connect(readSt), readClient.connect(readCt)]);
    try {
      const denied = await readClient.callTool({ name: "assessment.submit_quiz_draft", arguments: { runToken, bootstrapToken, ...negativeEnvelope } });
      expect(denied.isError).toBe(true);
      expect(writes.length).toBe(initialWrites);
      expect(objects.size).toBe(initialObjects);
    } finally { await readClient.close(); await readServer.close(); }
    for (const id of questionCases) {
      const pair = await readRichDocumentPair(id === "thermal-article" ? "brick" : id);
      for (const placement of ["prompt", "option", "explanation"] as const) {
        currentId = undefined;
        const question = makeQuestion(id, pair, placement);
        if (id === "mechanics") expect(question.correctIndices).toEqual([2]);
        if (id === "sampling") expect(question.correctIndices).toEqual([0]);
        const draft = { schemaVersion: "question-bank-draft.v2", draftId: `draft-${id}-${placement}`, questions: [question] };
        const envelope = await questionEnvelope(draft, [pair]);
        const args = { runToken, bootstrapToken, ...envelope };
        const requestBytes = (name: string, arguments_: unknown) => Buffer.byteLength(JSON.stringify({ name, arguments: arguments_ }));
        const validated = await call("assessment.validate_quiz_draft", args);
        expect(validated.valid).toBe(true);
        const submitted = await call("assessment.submit_quiz_draft", args);
        expect(submitted.staged).toBe(true);
        currentId = submitted.questionIds[0];
        const saved = projections.get(currentId!);
        expect(saved.reviewStatus).toBe("generated");
        expect(canonical.get(currentId!).prompt).toBe(saved.prompt);
        expect(canonical.get(currentId!).optionsSnapshot.map((option: { text: string }) => option.text)).toEqual(saved.options);
        expect(await verifyQuestionVisualBinding("legacy-course", saved)).toBe(true);
        expect(await verifyQuestionVisualBinding("other", saved)).toBe(false);
        expect(await verifyQuestionVisualBinding("legacy-course", { ...saved, explanation: `${saved.explanation} changed` })).toBe(false);
        expect(Buffer.from(await readInteractiveDocumentAsset(pair.spec, "document"))).toEqual(Buffer.from(pair.document));
        expect(Buffer.from(await readInteractiveDocumentAsset(pair.spec, "print"))).toEqual(Buffer.from(pair.print));
        expect(JSON.stringify(writes)).not.toContain(Buffer.from(pair.document).toString("base64"));
        const { id: _id, ideaLinks, ...updateQuestion } = question;
        const revised = { ...updateQuestion, explanation: `${updateQuestion.explanation}\n\nPeriksa alasan setiap pilihan.` };
        const updateArgs = { runToken, bootstrapToken, questionId: currentId, question: revised, ideaLinks, visualAssets: envelope.visualAssets };
        if (id === "museum" && placement === "prompt") {
          const priorWrites = writes.length, priorObjects = objects.size;
          for (const visualAssets of [[], [{ ...envelope.visualAssets[0], base64: Buffer.alloc(pair.document.length).toString("base64") }, envelope.visualAssets[1]]]) {
            const deniedUpdate = await client.callTool({ name: "assessment.update_question", arguments: { ...updateArgs, visualAssets } });
            expect(deniedUpdate.isError).toBe(true);
            expect(writes.length).toBe(priorWrites);
            expect(objects.size).toBe(priorObjects);
          }
        }
        const lockStart = locks.length;
        const updated = await call("assessment.update_question", updateArgs);
        expect(locks.slice(lockStart)).toEqual([schema.aiQuestionBank, schema.soal]);
        expect(updated.result.reviewStatus).toBe("generated");
        expect(await verifyQuestionVisualBinding("legacy-course", projections.get(currentId!))).toBe(true);
        expect(await verifyQuestionVisualBinding("legacy-course", saved)).toBe(true);
        const snapshot = { id: currentId!, prompt: saved.prompt, options: saved.options, explanation: saved.explanation };
        const attempt = { id: "attempt", studentId: "student", status: "in_progress", questionsSnapshot: [snapshot] };
        const template = { courseId: "legacy-course", selectionRules: { explanationRelease: "immediate" }, showDiscussion: true, manualStatus: "open", closeAt: null };
        const access = { userId: "student", courseId: "legacy-course", attemptId: "attempt", questionId: currentId!, field: placement, ...(placement === "option" ? { option: 1 } : {}), visualId: pair.spec.id, hash: pair.spec.documentSha256, kind: "document" as const, attempt, template };
        expect(authorizeAttemptDocument({ ...access, userId: "other" })).toBeNull();
        expect(authorizeAttemptDocument({ ...access, field: placement === "prompt" ? "explanation" : "prompt" })).toBeNull();
        if (placement === "option") expect(authorizeAttemptDocument({ ...access, option: 0 })).toBeNull();
        if (placement === "explanation") {
          expect(authorizeAttemptDocument(access)).toBeNull();
          expect(authorizeAttemptDocument({ ...access, attempt: { ...attempt, status: "completed" } })).toEqual(pair.spec);
        } else expect(authorizeAttemptDocument(access)).toEqual(pair.spec);
        records.push({ case: id, placement, requestBytes: { validate: requestBytes("assessment.validate_quiz_draft", args), submit: requestBytes("assessment.submit_quiz_draft", args), update: requestBytes("assessment.update_question", updateArgs) }, validate: { ok: validated.ok, valid: validated.valid, warnings: validated.warnings.length }, submit: { ok: submitted.ok, staged: submitted.staged, createdCount: submitted.createdCount }, update: { ok: updated.ok, reviewStatus: updated.result.reviewStatus, version: updated.result.version } });
      }
    }
    const mechanics = await readRichDocumentPair("mechanics");
    const mechanicsQuestion = makeQuestion("mechanics", mechanics, "prompt");
    const mechanicsEnvelope = await questionEnvelope({ schemaVersion: "question-bank-draft.v2", draftId: "mechanics-padded", questions: [mechanicsQuestion] }, [mechanics]);
    const paddedArgs = { runToken, bootstrapToken, ...mechanicsEnvelope, draftJson: `${mechanicsEnvelope.draftJson}${" ".repeat(1024 * 1024)}` };
    const paddedBytes = Buffer.byteLength(JSON.stringify({ name: "assessment.validate_quiz_draft", arguments: paddedArgs }));
    expect(paddedBytes).toBeGreaterThan(2 * 1024 * 1024);
    expect((await call("assessment.validate_quiz_draft", paddedArgs)).valid).toBe(true);
    await mkdir("artifacts/visual-quality/quality-95", { recursive: true });
    await writeFile("artifacts/visual-quality/quality-95/question-sdk-results.json", JSON.stringify({ records, negatives: ["missing assets on submit and update", "corrupt assets on submit and update", "visible and hidden hash reuse", "unpublished idea", "wrong idea chapter", "read-only scope", "wrong field", "wrong owner", "unreleased explanation"], paddedMechanicsValidationBytes: paddedBytes, transport: "local SDK in-memory only", note: "The multi-MiB mechanics request uses JSON whitespace padding." }, null, 2));
  } finally { await client.close(); await server.close(); }
}, 120_000);

test("synthetic mixed question keeps the answer-only pair behind release", async () => {
  const { createHash } = await import("node:crypto");
  const sharp = (await import("sharp")).default;
  const pair = async (id: string, text: string) => {
    const document = Buffer.from(`<!doctype html><html lang="id"><meta charset="utf-8"><title>${text}</title><body><p>${text}</p></body></html>`);
    const print = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="80"><rect width="500" height="80" fill="white"/><text x="12" y="45" font-size="20" fill="black">${text}</text></svg>`)).png().toBuffer();
    const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    return { document, print, spec: { id, kind: "interactive_document" as const, version: 1 as const, label: text, description: text, documentSha256: hash(document), documentBytes: document.length, printSha256: hash(print), printBytes: print.length, height: 240, staticFallback: { type: "text" as const, summary: text, content: text }, printCaption: text } };
  };
  // The prompt gives the two inputs only; the released visual states the result and calculation.
  const visible = await pair("mixed-input", "Persegi panjang: panjang 4 cm, lebar 3 cm");
  const hidden = await pair("mixed-solution", "Luas = 4 x 3 = 12 cm persegi");
  const visual = (spec: typeof visible.spec) => `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
  const question = { ...makeQuestion("museum", visible, "prompt"), id: "mixed-question", prompt: `Berapa luas persegi panjang?\n\n${visual(visible.spec)}`, options: ["7 cm persegi", "12 cm persegi", "14 cm persegi"], correctIndices: [1], explanation: `Kalikan panjang dan lebar.\n\n${visual(hidden.spec)}` };
  const envelope = await questionEnvelope({ schemaVersion: "question-bank-draft.v2", draftId: "mixed", questions: [question] }, [visible, hidden]);
  const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:read", "authoring:stage"] };
  const server = createAuthoringMcpServer(principal), client = new Client({ name: "mixed-question-sdk", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  const call = async (name: string, args: Record<string, unknown>) => { const response = await client.callTool({ name, arguments: args }); expect(response.isError).not.toBe(true); return response.structuredContent as any; };
  try {
    const bootstrapToken = (await call("workflow.get_playbook", { skill: "zyx-question-authoring-mcp", stage: "quiz", bootstrapProtocol: 1, pluginVersion: RECOMMENDED_PLUGIN_VERSION, clientCapabilities: { independentSubagents: false, localArtifactFiles: true, pdfRendering: false } })).bootstrapToken;
    const courseKey = (await call("catalog.list_courses", {})).choices[0].key;
    const chapterKey = (await call("catalog.list_chapters", { courseKey })).choices[0].key;
    const runToken = (await call("workflow.start", { workflow: "quiz_bank", courseKey, chapterKey, bootstrapToken })).runToken;
    const args = { runToken, bootstrapToken, ...envelope };
    expect((await call("assessment.validate_quiz_draft", args)).valid).toBe(true);
    const reused = { ...question, explanation: visual(visible.spec) };
    const reuseResult = await call("assessment.validate_quiz_draft", { ...args, draftJson: JSON.stringify({ schemaVersion: "question-bank-draft.v2", draftId: "reused", questions: [reused] }) });
    expect(reuseResult.valid).toBe(false);
    expect(JSON.stringify(reuseResult.issues)).toContain("QUESTION_VISUAL_DISCLOSURE");
    currentId = undefined;
    const submitted = await call("assessment.submit_quiz_draft", args);
    expect(submitted.staged).toBe(true);
    currentId = submitted.questionIds[0];
    const { id: _id, ideaLinks, ...updateQuestion } = question;
    const lockStart = locks.length;
    expect((await call("assessment.update_question", { runToken, bootstrapToken, questionId: currentId, question: updateQuestion, ideaLinks, visualAssets: envelope.visualAssets })).result.reviewStatus).toBe("generated");
    expect(locks.slice(lockStart)).toEqual([schema.aiQuestionBank, schema.soal]);
    const saved = projections.get(currentId!);
    expect(await verifyQuestionVisualBinding("legacy-course", saved)).toBe(true);
    const canonicalSaved = canonical.get(currentId!);
    expect(canonicalSaved.prompt).toBe(saved.prompt);
    expect(canonicalSaved.optionsSnapshot.map((option: { text: string }) => option.text)).toEqual(saved.options);
    for (const [item, field] of [[visible, saved.prompt], [hidden, saved.explanation]] as const) {
      const [storedSpec] = interactiveDocumentsInMarkdown(field);
      expect(storedSpec).toEqual(item.spec);
      expect(Buffer.from(await readInteractiveDocumentAsset(storedSpec, "document"))).toEqual(item.document);
      expect(Buffer.from(await readInteractiveDocumentAsset(storedSpec, "print"))).toEqual(item.print);
      expect(JSON.stringify(writes)).not.toContain(item.document.toString("base64"));
    }
    const snapshot = { id: currentId!, prompt: saved.prompt, options: saved.options, explanation: saved.explanation };
    const attempt = { id: "attempt", studentId: "student", status: "in_progress", questionsSnapshot: [snapshot] };
    const template = { courseId: "legacy-course", selectionRules: { explanationRelease: "immediate" }, showDiscussion: true, manualStatus: "open", closeAt: null };
    const access = { userId: "student", courseId: "legacy-course", attemptId: "attempt", questionId: currentId!, kind: "document" as const, attempt, template };
    expect(authorizeAttemptDocument({ ...access, field: "prompt", visualId: visible.spec.id, hash: visible.spec.documentSha256 })).toEqual(visible.spec);
    const solution = { ...access, field: "explanation" as const, visualId: hidden.spec.id, hash: hidden.spec.documentSha256 };
    expect(authorizeAttemptDocument(solution)).toBeNull();
    expect(authorizeAttemptDocument({ ...solution, attempt: { ...attempt, status: "completed" } })).toEqual(hidden.spec);
    expect(authorizeAttemptDocument({ ...access, field: "prompt", visualId: visible.spec.id, hash: visible.spec.printSha256, kind: "print" })).toEqual(visible.spec);
    expect(authorizeAttemptDocument({ ...solution, hash: hidden.spec.printSha256, kind: "print" })).toBeNull();
    expect(authorizeAttemptDocument({ ...solution, hash: hidden.spec.printSha256, kind: "print", attempt: { ...attempt, status: "completed" } })).toEqual(hidden.spec);
  } finally { await client.close(); await server.close(); }
}, 120_000);
