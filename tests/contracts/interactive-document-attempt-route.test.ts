import { expect, mock, test } from "bun:test";

const spec = { id: "visual", kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Isi" }, printCaption: "Awal" };
const fence = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
const attempt = { id: "attempt", studentId: "user", status: "in_progress", questionsSnapshot: [{ id: "q", prompt: fence, options: ["A", "B"], explanation: "Jawaban" }] };
const template = { courseId: "course", status: "published", selectionRules: { explanationRelease: "immediate" }, showDiscussion: true, manualStatus: "open", closeAt: null };
let access = { hasCourseAccess: true, tier: "enrolled", hasFullContentAccess: true, freeChapterIds: [] as string[] }, freeScoped = false;
let row: any = { attempt, template };
let signedIn = true, reads = 0, snapshotAllowed = true;
const objects = new Map<string, Uint8Array>();
const chain: Record<string, any> = {};
for (const method of ["from", "innerJoin", "where"]) chain[method] = () => chain;
chain.limit = async () => row ? [row] : [];
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("server-only", () => ({}));
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key),
  upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { objects.set(options.key, bytes); },
  download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("missing"); return bytes; },
} }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => signedIn ? { user: { id: "user" } } : null } } }));
mock.module("@/db", () => ({ db: { select: () => chain } }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => access, hasChapterScopeWithin: () => true }));
mock.module("@/lib/quiz/question-scope", () => ({ canAccessQuizSnapshot: async () => snapshotAllowed }));
mock.module("@/lib/course-utils", () => ({ isFreeQuizTemplate: () => freeScoped, parseQuizSelectionRules: (value: unknown) => value ?? {} }));
mock.module("@/lib/materials/interactive-document-assets", () => ({ readInteractiveDocumentAsset: async () => { reads++; return new Uint8Array([1]); } }));
mock.module("@/lib/materials/interactive-document-server", () => ({ interactiveDocumentResponse: (bytes: Uint8Array) => new Response(bytes as unknown as BodyInit) }));
const route = await import("@/app/api/materials/interactive-document/attempt/route");
const { stageQuestionVisualBinding } = await import("@/lib/materials/question-visual-binding");
const query = new URLSearchParams({ courseId: "course", attemptId: "attempt", questionId: "q", field: "prompt", visualId: "visual", hash: spec.documentSha256, kind: "document" });
const request = (params = query) => new Request(`http://localhost/api?${params}`);

test("attempt delivery verifies owner, field, release and immutable binding before asset access", async () => {
  signedIn = false; expect((await route.GET(request())).status).toBe(401); signedIn = true;
  expect((await route.GET(request())).status).toBe(404);
  await stageQuestionVisualBinding("course", attempt.questionsSnapshot[0], [{ spec: spec as any, document: new Uint8Array([1]), print: new Uint8Array([2]) }]);
  row = { attempt: { ...attempt, studentId: "other" }, template }; expect((await route.GET(request())).status).toBe(404);
  row = { attempt, template: { ...template, courseId: "other" } }; expect((await route.GET(request())).status).toBe(404);
  row = { attempt, template };
  const explanation = new URLSearchParams(query); explanation.set("field", "explanation");
  expect((await route.GET(request(explanation))).status).toBe(404);
  expect(reads).toBe(0);
  expect((await route.GET(request())).status).toBe(200);
  expect((await route.HEAD(request())).status).toBe(200);
  expect(reads).toBe(2);
});

test("explanation assets require the completed attempt's release policy", async () => {
  const solution = { ...spec, id: "solution", documentSha256: "c".repeat(64), printSha256: "d".repeat(64) };
  const question = { ...attempt.questionsSnapshot[0], explanation: `\`\`\`zyx-visual\n${JSON.stringify(solution)}\n\`\`\`` };
  await stageQuestionVisualBinding("course", question, [{ spec: spec as any, document: new Uint8Array([1]), print: new Uint8Array([2]) }, { spec: solution as any, document: new Uint8Array([3]), print: new Uint8Array([4]) }]);
  row = { attempt: { ...attempt, questionsSnapshot: [question], status: "completed" }, template: { ...template, selectionRules: { explanationRelease: "after_close" } } };
  const params = new URLSearchParams(query); params.set("field", "explanation"); params.set("visualId", "solution"); params.set("hash", solution.documentSha256);
  expect((await route.GET(request(params))).status).toBe(404);
  row.template.manualStatus = "closed";
  expect((await route.GET(request(params))).status).toBe(200);
  row.template.selectionRules = { explanationRelease: "never" };
  expect((await route.GET(request(params))).status).toBe(404);
});

test("saved asset URLs retain current course and draft access gates", async () => {
  row = { attempt, template };
  const before = reads;
  snapshotAllowed = false;
  expect((await route.GET(request())).status).toBe(404);
  snapshotAllowed = true;
  access = { ...access, hasCourseAccess: false };
  expect((await route.GET(request())).status).toBe(404);
  access = { ...access, hasCourseAccess: true };
  row = { attempt, template: { ...template, status: "draft" } };
  expect((await route.GET(request())).status).toBe(404);
  row = { attempt, template };
  access = { ...access, tier: "free", hasFullContentAccess: false };
  expect((await route.GET(request())).status).toBe(404);
  expect(reads).toBe(before);
  access = { ...access, hasFullContentAccess: true };
  expect((await route.GET(request())).status).toBe(200);
  access = { ...access, hasFullContentAccess: false };
  freeScoped = true;
  expect((await route.GET(request())).status).toBe(200);
  access = { ...access, tier: "staff" };
  row = { attempt, template: { ...template, status: "draft" } };
  expect((await route.GET(request())).status).toBe(200);
});
