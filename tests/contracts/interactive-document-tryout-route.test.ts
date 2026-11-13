import { expect, mock, test } from "bun:test";

const spec = { id: "visual", kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Isi" }, printCaption: "Awal" };
const fence = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
let exam: any = { id: "exam", courseId: "course", type: "tryout", status: "published", openAt: null, closeAt: null };
let rows: any[] = [{ id: "q", content: { prompt: fence, options: ["A", "B"], explanation: "Jawaban" } }];
let allowed = true, verified = true, reads = 0;
const chain: Record<string, any> = {};
chain.from = () => chain;
chain.where = () => Object.assign(Promise.resolve(rows), { limit: async () => exam ? [exam] : [] });
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "user", role: "student" } }) } } }));
mock.module("@/db", () => ({ db: { select: () => chain } }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({ hasCourseAccess: allowed, hasFullContentAccess: allowed, tier: allowed ? "enrolled" : "free" }) }));
mock.module("@/lib/materials/question-visual-binding", () => ({ verifyQuestionVisualBinding: async () => verified }));
mock.module("@/lib/materials/interactive-document-assets", () => ({ readInteractiveDocumentAsset: async () => { reads++; return new Uint8Array([1]); } }));
mock.module("@/lib/materials/interactive-document-server", () => ({ interactiveDocumentResponse: (bytes: Uint8Array) => new Response(bytes as unknown as BodyInit) }));
const route = await import("@/app/api/materials/interactive-document/tryout/route");
const query = new URLSearchParams({ courseId: "course", examId: "exam", questionId: "q", field: "prompt", visualId: "visual", hash: spec.documentSha256, kind: "document" });
const request = () => new Request(`http://localhost/api?${query}`);

test("tryout delivery checks access, current exam, hidden references and authoring proof", async () => {
  allowed = false; expect((await route.GET(request())).status).toBe(404); allowed = true;
  verified = false; expect((await route.GET(request())).status).toBe(404); verified = true;
  exam = { ...exam, status: "ended" }; expect((await route.GET(request())).status).toBe(404); exam = { ...exam, status: "published" };
  rows = [...rows, { id: "q2", content: { explanation: fence } }]; expect((await route.GET(request())).status).toBe(404);
  rows = rows.slice(0, 1);
  expect(reads).toBe(0);
  expect((await route.GET(request())).status).toBe(200);
  expect(reads).toBe(1);
});
