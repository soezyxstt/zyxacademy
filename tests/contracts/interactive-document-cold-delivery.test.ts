import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";

const objects = new Map<string, Uint8Array>();
mock.module("server-only", () => ({}));
mock.module("@/lib/storage", () => ({ storage: {
  exists: async (key: string) => objects.has(key),
  upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { objects.set(options.key, Buffer.from(bytes)); },
  download: async (key: string) => { const value = objects.get(key); if (!value) throw new Error("missing"); return value; },
} }));
const { stageInteractiveDocumentAssets, verifyAdmittedInteractiveDocumentArchive, readInteractiveDocumentAsset } = await import("@/lib/materials/interactive-document-assets");
const crc32: (bytes: Buffer) => number = createRequire(import.meta.url)("pngjs/lib/crc").crc32;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function chunk(type: string, data: Buffer) {
  const bytes = Buffer.alloc(data.length + 12); bytes.writeUInt32BE(data.length); bytes.write(type, 4, 4, "ascii"); data.copy(bytes, 8);
  bytes.writeInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4); return bytes;
}

test("eight cold clients deliver two distinct maximum-pixel PNGs each without decoding again", async () => {
  const header = Buffer.alloc(13); header.writeUInt32BE(4000); header.writeUInt32BE(4000, 4); header[8] = 16; header[9] = 6;
  const parts = [Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc((4000 * 8 + 1) * 4000))), chunk("IEND", Buffer.alloc(0))];
  const document = Buffer.from("<!doctype html><p>Visual</p>");
  const pairs = Array.from({ length: 16 }, (_, index) => {
    const print = Buffer.concat([parts[0], parts[1], chunk("tEXt", Buffer.from(`Client\0${index}`)), parts[2], parts[3]]);
    const spec = { id: `v${index}`, kind: "interactive_document", version: 1, label: "Visual", description: "Visual", documentSha256: hash(document), documentBytes: document.length, printSha256: hash(print), printBytes: print.length, height: 400, staticFallback: { type: "text", summary: "Visual", content: "Keadaan awal" }, printCaption: "Keadaan awal" } as InteractiveDocumentSpec;
    return { spec, document, print };
  });
  await stageInteractiveDocumentAssets(pairs.slice(0, 8));
  await stageInteractiveDocumentAssets(pairs.slice(8));
  const state = (globalThis as typeof globalThis & { __zyxPngValidation: { admitted: Set<string>; pending: Map<string, Promise<void>> } }).__zyxPngValidation;
  state.admitted.clear();
  const start = performance.now();
  await Promise.all(Array.from({ length: 8 }, async (_, index) => {
    const pair = pairs.slice(index * 2, index * 2 + 2);
    const files = new Map<string, Uint8Array>();
    for (const item of pair) { files.set(`visuals/${item.spec.documentSha256}.html`, item.document); files.set(`visuals/${item.spec.printSha256}.png`, item.print); }
    const manifest = [...files].map(([path, bytes]) => ({ path, sha256: hash(bytes), bytes: bytes.length }));
    await verifyAdmittedInteractiveDocumentArchive(pair.map(item => item.spec), manifest, files);
    for (const item of pair) expect(await readInteractiveDocumentAsset(item.spec, "print")).toEqual(item.print);
  }));
  const elapsedMs = performance.now() - start;
  console.log(JSON.stringify({ coldDeliveryMs: Math.round(elapsedMs), clients: 8, pngs: 16, width: 4000, height: 4000, bitDepth: 16 }));
  expect(elapsedMs).toBeLessThan(15_000);
  expect(state.admitted.size).toBe(0);
  expect(state.pending.size).toBe(0);
}, 120_000);
