import { expect, mock, test } from "bun:test";

const spec = { id: "visual", kind: "interactive_document", version: 1, label: "Visual", description: "Visual interaktif", documentSha256: "a".repeat(64), documentBytes: 1, printSha256: "b".repeat(64), printBytes: 1, height: 400, staticFallback: { type: "text", summary: "Ringkasan", content: "Isi" }, printCaption: "Awal" };
const part = { id: "part", kind: "visual_ref", visualId: "visual" };
const product = { id: "article", courseId: "course", productType: "article", version: 2, visuals: [spec], sections: [{ id: "section", blocks: [{ id: "block", parts: [part] }] }] };
const checksum = "c".repeat(64);
let role = "admin";
let status = "draft";
let reads = 0;
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "user", role } }) } } }));
mock.module("@/lib/bundle/product-staging", () => ({ getProductBundleImport: async () => ({ status, checksum }), parseStagedProductBundle: async () => ({ checksum, products: [product], files: new Map([[`visuals/${spec.documentSha256}.html`, new Uint8Array([1])], [`visuals/${spec.printSha256}.png`, new Uint8Array([2])]]) }) }));
mock.module("@/lib/materials/interactive-document-assets", () => ({ readInteractiveDocumentAsset: async () => { reads++; return new Uint8Array([1]); } }));
mock.module("@/lib/materials/interactive-document-server", () => ({ verifyInteractiveDocumentAsset: async () => {}, interactiveDocumentResponse: (bytes: Uint8Array) => new Response(bytes as unknown as BodyInit, { headers: { "content-type": "text/html", "cache-control": "private, no-store" } }) }));
const route = await import("@/app/api/admin/bundles/product/[id]/interactive-document/route");
const query = new URLSearchParams({ courseId: "course", articleId: "article", articleVersion: "2", sectionId: "section", blockId: "block", field: "visual_ref", partId: "part", visualId: "visual", hash: spec.documentSha256, checksum, kind: "document" });
const context = { params: Promise.resolve({ id: "draft" }) };
const request = (params = query) => new Request(`http://localhost/api?${params}`);

test("draft delivery verifies role, current checksum, field and version before reading", async () => {
  role = "student";
  expect((await route.GET(request(), context)).status).toBe(401);
  role = "admin";
  for (const [key, value] of [["checksum", "d".repeat(64)], ["articleVersion", "3"], ["courseId", "other"], ["partId", "other"], ["hash", "e".repeat(64)]]) {
    const bad = new URLSearchParams(query); bad.set(key, value);
    expect((await route.GET(request(bad), context)).status).toBe(404);
  }
  status = "published";
  expect((await route.GET(request(), context)).status).toBe(404);
  expect(reads).toBe(0);
  status = "draft";
  const result = await route.GET(request(), context);
  expect(result.status).toBe(200);
  expect(reads).toBe(1);
});
