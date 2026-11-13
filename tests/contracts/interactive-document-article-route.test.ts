import { expect, mock, test } from "bun:test";

const spec = { id: "visual", kind: "interactive_document", version: 1, label: "Visual", description: "Visual interaktif", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text", summary: "Ringkasan", content: "Isi" }, printCaption: "Awal" };
const part = { id: "part", kind: "visual_ref", visualId: "visual" };
const product = { id: "article", productType: "article", version: 2, visuals: [spec], sections: [{ id: "section", blocks: [{ id: "block", parts: [part] }] }] };
const shared = { articleRecord: { id: "article:v2", version: 2, babId: "chapter" }, chapterRecord: { legacyChapterId: "chapter" }, parsedSections: [{ id: "section-row", sectionKey: "section" }], parsedBlocks: [{ id: "block-row", bagianArtikelId: "section-row", blockKey: "block", parts: [part] }], articleVisuals: [spec] };
let permitted = true;
let signedIn = true;
let reads = 0;
const chain: Record<string, any> = {};
for (const method of ["from", "innerJoin", "where"]) chain[method] = () => chain;
chain.limit = async () => [{ importId: "import", entityHash: "entity-hash" }];
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => signedIn ? { user: { id: "user" } } : null } } }));
mock.module("@/db", () => ({ db: { select: () => chain } }));
mock.module("@/lib/articles/structured-repository", () => ({ fetchSharedCanonicalArticle: async (course: string) => course === "course" ? shared : null }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}), canAccessCourseContent: () => permitted }));
mock.module("@/lib/bundle/product-staging", () => ({ parseStagedProductBundle: async () => ({ products: [product], files: new Map([[`visuals/${spec.documentSha256}.html`, new Uint8Array([1])], [`visuals/${spec.printSha256}.png`, new Uint8Array([2])]]) }) }));
mock.module("@/lib/bundle/product-bundle-v2", () => ({ productEntityHash: () => "entity-hash" }));
mock.module("@/lib/materials/interactive-document-assets", () => ({ readInteractiveDocumentAsset: async () => { reads++; return new Uint8Array([1]); } }));
mock.module("@/lib/materials/interactive-document-verified", () => ({ verifyAdmittedInteractiveDocumentAsset: () => {}, interactiveDocumentResponse: (bytes: Uint8Array) => new Response(bytes as unknown as BodyInit, { headers: { "content-type": "text/html", "cache-control": "private, no-store" } }) }));
const route = await import("@/app/api/materials/interactive-document/article/route");
const query = new URLSearchParams({ courseId: "course", articleId: "article:v2", articleVersion: "2", sectionId: "section-row", blockId: "block-row", field: "visual_ref", partId: "part", visualId: "visual", hash: spec.documentSha256, kind: "document" });
const request = (params = query) => new Request(`http://localhost/api?${params}`);

test("published article delivery rejects inaccessible and mismatched fields before reading", async () => {
  signedIn = false;
  expect((await route.GET(request())).status).toBe(401);
  signedIn = true; permitted = false;
  expect((await route.GET(request())).status).toBe(404);
  permitted = true;
  for (const [key, value] of [["courseId", "other"], ["articleVersion", "3"], ["sectionId", "other"], ["blockId", "other"], ["partId", "other"], ["hash", "e".repeat(64)]]) {
    const bad = new URLSearchParams(query); bad.set(key, value);
    expect((await route.GET(request(bad))).status).toBe(404);
  }
  expect(reads).toBe(0);
  expect((await route.GET(request())).status).toBe(200);
  expect(reads).toBe(1);
});
