import { expect, mock, test } from "bun:test";

const spec = { id: "visual", kind: "interactive_document", version: 1, label: "Visual", description: "Visual interaktif", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text", summary: "Ringkasan", content: "Isi" }, printCaption: "Awal" };
const visual = `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
const check = { checkKind: "multiple_choice", answer: "A", explanation: "Pembahasan", options: [{ id: "a", text: visual, isCorrect: true }, { id: "b", text: "B", isCorrect: false }] };
const product = { id: "article", productType: "article", version: 2, sections: [{ id: "section", blocks: [{ id: "block", formativeCheckPayload: check }] }] };
const checksum = "c".repeat(64);
let role = "admin";
let reads = 0;
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "user", role } }) } } }));
mock.module("@/db", () => ({ db: {} }));
mock.module("@/lib/articles/structured-repository", () => ({ fetchSharedCanonicalArticle: async () => null }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}), canAccessCourseContent: () => false }));
mock.module("@/lib/materials/formative-check-server", () => ({ resolvePublishedFormativeCheck: async () => ({ ok: false }) }));
mock.module("@/lib/materials/formative-check-draft-server", () => ({ resolveDraftProductFormativeCheck: async () => ({ ok: true, context: { formativeCheck: check, article: { courseId: "course" } } }) }));
mock.module("@/lib/bundle/product-staging", () => ({ getProductBundleImport: async () => ({ status: "draft", checksum }), parseStagedProductBundle: async () => ({ checksum, products: [product], files: new Map([[`visuals/${spec.documentSha256}.html`, new Uint8Array([1])], [`visuals/${spec.printSha256}.png`, new Uint8Array([2])]]) }) }));
mock.module("@/lib/bundle/product-bundle-v2", () => ({ productEntityHash: () => "hash" }));
mock.module("@/lib/materials/interactive-document-assets", () => ({ readInteractiveDocumentAsset: async () => { reads++; return new Uint8Array([1]); } }));
mock.module("@/lib/materials/interactive-document-server", () => ({ verifyInteractiveDocumentAsset: async () => {}, interactiveDocumentResponse: (bytes: Uint8Array) => new Response(bytes as unknown as BodyInit) }));
const route = await import("@/app/api/materials/interactive-document/option/route");
const query = new URLSearchParams({ courseId: "course", articleId: "article", articleVersion: "2", sectionId: "section", blockId: "block", optionId: "a", visualId: "visual", hash: spec.documentSha256, draftId: "draft", checksum, kind: "document" });
const request = (params = query) => new Request(`http://localhost/api?${params}`);

test("formative option delivery binds the visible option and denies hidden reuse", async () => {
  role = "student";
  expect((await route.GET(request())).status).toBe(404);
  role = "admin";
  const wrong = new URLSearchParams(query); wrong.set("optionId", "b");
  expect((await route.GET(request(wrong))).status).toBe(404);
  check.explanation = visual;
  expect((await route.GET(request())).status).toBe(404);
  expect(reads).toBe(0);
  check.explanation = "Pembahasan";
  expect((await route.GET(request())).status).toBe(200);
  expect(reads).toBe(1);
});
