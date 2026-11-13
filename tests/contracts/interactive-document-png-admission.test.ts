import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { deflateSync, inflateSync } from "node:zlib";
import sharp from "sharp";
import { verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";

const crc32: (bytes: Buffer) => number = createRequire(import.meta.url)("pngjs/lib/crc").crc32;
const chunk = (type: string, data: Buffer) => {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  output.write(type, 4, 4, "ascii");
  data.copy(output, 8);
  output.writeInt32BE(crc32(output.subarray(4, -4)), output.length - 4);
  return output;
};
const replace = (png: Buffer, type: string, data: Buffer) => {
  const start = png.indexOf(type) - 4;
  return Buffer.concat([png.subarray(0, start), chunk(type, data), png.subarray(start + png.readUInt32BE(start) + 12)]);
};
const verify = (png: Buffer) => verifyInteractiveDocumentAsset({ printBytes: png.length, printSha256: createHash("sha256").update(png).digest("hex") } as InteractiveDocumentSpec, "print", png);
const base = await sharp({ create: { width: 2, height: 2, channels: 4, background: "white" } }).png().toBuffer();

test("fully decodes ordinary, palette and interlaced PNGs", async () => {
  await verify(base);
  await verify(await sharp(base).png({ palette: true }).toBuffer());
  const interlaced = await sharp(base).png({ progressive: true, palette: true, colours: 2 }).toBuffer();
  expect(interlaced[28]).toBe(1);
  await verify(interlaced);
});

test("rejects malformed, oversized and animated PNGs with matching digests", async () => {
  const header = Buffer.from(base.subarray(16, 29));
  const idatStart = base.indexOf("IDAT") - 4;
  const compressed = base.subarray(idatStart + 8, idatStart + 8 + base.readUInt32BE(idatStart));
  const raw = inflateSync(compressed);
  const badFilter = Buffer.from(raw); badFilter[0] = 5;
  const badChecksum = Buffer.from(compressed); badChecksum[badChecksum.length - 1] ^= 1;
  const badCrc = Buffer.from(base); badCrc[idatStart + 8 + compressed.length] ^= 1;
  const tooWide = Buffer.from(header); tooWide.writeUInt32BE(4097, 0);
  const tooMany = Buffer.from(header); tooMany.writeUInt32BE(4001, 0); tooMany.writeUInt32BE(4000, 4);
  const zeroWidth = Buffer.from(header); zeroWidth.writeUInt32BE(0, 0);
  const animated = Buffer.concat([base.subarray(0, 33), chunk("acTL", Buffer.from([0, 0, 0, 1, 0, 0, 0, 0])), base.subarray(33)]);
  const oversizedPalette = Buffer.concat([base.subarray(0, 33), chunk("PLTE", Buffer.alloc(771)), base.subarray(33)]);
  for (const invalid of [
    replace(base, "IHDR", tooWide), replace(base, "IHDR", tooMany), replace(base, "IHDR", zeroWidth),
    replace(base, "IDAT", deflateSync(Buffer.alloc(1_000_000))),
    replace(base, "IDAT", deflateSync(raw.subarray(0, raw.length - 1))),
    replace(base, "IDAT", deflateSync(badFilter)), replace(base, "IDAT", badChecksum), badCrc,
    replace(base, "IDAT", Buffer.concat([compressed, Buffer.from([1])])), animated, oversizedPalette,
    Buffer.concat([base.subarray(0, -12), Buffer.from([0]), base.subarray(-12)]),
  ]) await expect(verify(invalid)).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
});


test("checks ancillary CRC even when the asset digest matches", async () => {
  const at = base.indexOf("IDAT") - 4;
  for (const type of ["tEXt", "iCCP"]) {
    const data = type === "tEXt" ? Buffer.from("Comment\0hello") : Buffer.concat([Buffer.from("profile\0\0"), deflateSync(Buffer.from("profile"))]);
    const part = chunk(type, data);
    const good = Buffer.concat([base.subarray(0, at), part, base.subarray(at)]);
    await verify(good);
    part[part.length - 1] ^= 1;
    const bad = Buffer.concat([base.subarray(0, at), part, base.subarray(at)]);
    await expect(verify(bad)).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
    await expect(verify(bad)).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
  }
});

test("repeated and concurrent reads preserve byte integrity", async () => {
  await Promise.all(Array.from({ length: 12 }, () => verify(base)));
  const spec = { printBytes: base.length, printSha256: createHash("sha256").update(base).digest("hex") } as InteractiveDocumentSpec;
  const changed = Buffer.from(base); changed[40] ^= 1;
  await expect(verifyInteractiveDocumentAsset(spec, "print", changed)).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
  await expect(verifyInteractiveDocumentAsset({ ...spec, printBytes: spec.printBytes + 1 }, "print", base)).rejects.toThrow("INTERACTIVE_DOCUMENT_INTEGRITY");
});

test("captures the checked digest before asynchronous validation", async () => {
  const at = base.indexOf("IDAT") - 4;
  const good = Buffer.concat([base.subarray(0, at), chunk("tEXt", Buffer.from("Race\0immutable digest")), base.subarray(at)]);
  const bad = Buffer.from(good); bad[at + 10] ^= 1;
  const digest = createHash("sha256").update(good).digest("hex");
  const spec = { printBytes: good.length, printSha256: digest } as InteractiveDocumentSpec;
  const pending = verifyInteractiveDocumentAsset(spec, "print", good);
  spec.printSha256 = createHash("sha256").update(bad).digest("hex");
  await pending;
  await expect(verify(bad)).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
  await verify(good);
});

test("rejects malformed chunk names while accepting unknown ancillary chunks", async () => {
  const at = base.indexOf("IDAT") - 4;
  const withChunk = (type: string) => Buffer.concat([base.subarray(0, at), chunk(type, Buffer.from("data")), base.subarray(at)]);
  await verify(withChunk("vpAg"));
  await expect(verify(withChunk("t1Xt"))).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
  const highBit = chunk("tEXt", Buffer.from("data"));
  highBit[4] |= 128;
  highBit.writeInt32BE(crc32(highBit.subarray(4, -4)), highBit.length - 4);
  await expect(verify(Buffer.concat([base.subarray(0, at), highBit, base.subarray(at)]))).rejects.toThrow("INTERACTIVE_DOCUMENT_PRINT_INVALID");
});


test("limits queued distinct images and recovers after rejection", async () => {
  const at = base.indexOf("IDAT") - 4;
  const images = Array.from({ length: 12 }, (_, i) => Buffer.concat([base.subarray(0, at), chunk("tEXt", Buffer.from(`Queue\0${i}`)), base.subarray(at)]));
  const results = await Promise.allSettled(images.map(verify));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(9);
  expect(results.filter(result => result.status === "rejected").every(result => result.reason.message === "INTERACTIVE_DOCUMENT_PRINT_BUSY")).toBe(true);
  await verify(images[11]);
});
