import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import sharp from "sharp";

const objects = new Map<string, Uint8Array>();
mock.module("server-only", () => ({}));
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key),
  download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("missing"); return bytes; },
  upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { objects.set(options.key, bytes); },
} }));
const { readInteractiveDocumentAsset, stageInteractiveDocumentAssets, validateInteractiveDocumentArchive } = await import("@/lib/materials/interactive-document-assets");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const document = new TextEncoder().encode("<!doctype html><script>1</script>");
const print = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();
const spec = { id: "one", kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: digest(document), documentBytes: document.length, printSha256: digest(print), printBytes: print.length, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Keadaan awal" }, printCaption: "Keadaan awal" } as const;

describe("interactive document private assets", () => {
  test("validates before writing, reads back and detects corruption", async () => {
    objects.clear();
    await expect(stageInteractiveDocumentAssets([{ spec, document, print: document }])).rejects.toThrow();
    expect(objects.size).toBe(0);
    await stageInteractiveDocumentAssets([{ spec, document, print }]);
    expect(await readInteractiveDocumentAsset(spec, "document")).toEqual(document);
    expect(await readInteractiveDocumentAsset(spec, "print")).toEqual(print);
    const key = [...objects.keys()].find((item) => item.endsWith(".html"))!;
    objects.set(key, new Uint8Array(document.length));
    await expect(readInteractiveDocumentAsset(spec, "document")).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
    await expect(stageInteractiveDocumentAssets([{ spec, document, print }])).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
  });

  test("requires an exact asset manifest and verifies both archive entries", async () => {
    const docPath = `visuals/${spec.documentSha256}.html`;
    const printPath = `visuals/${spec.printSha256}.png`;
    const files = new Map([[docPath, document], [printPath, print]]);
    const manifest = [{ path: docPath, sha256: spec.documentSha256, bytes: document.length }, { path: printPath, sha256: spec.printSha256, bytes: print.length }];
    expect(await validateInteractiveDocumentArchive([spec], manifest, files)).toHaveLength(1);
    await expect(validateInteractiveDocumentArchive([spec], manifest.slice(1), files)).rejects.toThrow("INTERACTIVE_DOCUMENT_MANIFEST_MISMATCH");
    await expect(validateInteractiveDocumentArchive([spec], [...manifest, manifest[0]], files)).rejects.toThrow("INTERACTIVE_DOCUMENT_MANIFEST_MISMATCH");
    await expect(validateInteractiveDocumentArchive([spec], manifest, new Map([...files, ["visuals/extra.html", document]]))).rejects.toThrow("INTERACTIVE_DOCUMENT_ORPHAN_ASSET");
    await expect(validateInteractiveDocumentArchive([spec], manifest, new Map([[docPath, document], [printPath, document]]))).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
  });
});
