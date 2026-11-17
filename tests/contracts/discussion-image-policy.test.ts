import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { DISCUSSION_IMAGE_MAX_BYTES, DISCUSSION_IMAGE_PREVIEW_MAX_BYTES, DISCUSSION_IMAGE_PREVIEW_MAX_EDGE, parseDiscussionImageUpload, requireDiscussionPrivateStorage } from "@/lib/discussions/image-policy";
import { makeDiscussionImagePreview, sanitizeDiscussionImage } from "@/lib/discussions/image-sanitizer";
import { buildDiscussionImageKey, isPrivateAttachmentKey } from "@/lib/storage/keys";

function pngChunk(name: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(name), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return chunk;
}

describe("discussion image validation", () => {
  test("preview stays small for detailed transparent images and strips metadata", async () => {
    const width = 620, height = 360;
    const source = await sharp(randomBytes(width * height * 4), { raw: { width, height, channels: 4 } }).png().withMetadata().toBuffer();
    const clean = await sanitizeDiscussionImage(source, "image/png");
    const preview = await makeDiscussionImagePreview(clean.bytes);
    const metadata = await sharp(preview).metadata();
    expect(preview.byteLength).toBeLessThanOrEqual(DISCUSSION_IMAGE_PREVIEW_MAX_BYTES);
    expect(Math.max(metadata.width!, metadata.height!)).toBeLessThanOrEqual(DISCUSSION_IMAGE_PREVIEW_MAX_EDGE);
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(clean.mime).toBe("image/png");
  });

  for (const format of ["jpeg", "png", "webp"] as const) {
    test(`small ${format} pixels survive metadata removal without lossy recompression`, async () => {
      const source = await sharp({ create: { width: 31, height: 17, channels: 3, background: "#6284a7" } })
        .toFormat(format).withMetadata({ orientation: 1 }).toBuffer();
      const clean = await sanitizeDiscussionImage(source, `image/${format}`);
      expect(clean.mime).toBe(`image/${format}`);
      expect((await sharp(clean.bytes).metadata()).exif).toBeUndefined();
      expect(await sharp(clean.bytes).raw().toBuffer()).toEqual(await sharp(source).raw().toBuffer());
      expect(clean.bytes.byteLength).toBeLessThanOrEqual(source.length);
    });
  }

  test("applies EXIF orientation and removes it from the output", async () => {
    const source = await sharp({ create: { width: 12, height: 24, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const clean = await sanitizeDiscussionImage(source, "image/jpeg");
    expect([clean.width, clean.height]).toEqual([24, 12]);
    expect((await sharp(clean.bytes).metadata()).orientation).toBeUndefined();
    expect(await sharp(clean.bytes).raw().toBuffer()).toEqual(await sharp(source).rotate().raw().toBuffer());
  });

  test("preserves progressive JPEG scans and WebP transparency", async () => {
    const jpeg = await sharp({ create: { width: 30, height: 30, channels: 3, background: "blue" } }).jpeg({ progressive: true }).withMetadata().toBuffer();
    const cleanJpeg = await sanitizeDiscussionImage(jpeg, "image/jpeg");
    expect(await sharp(cleanJpeg.bytes).raw().toBuffer()).toEqual(await sharp(jpeg).raw().toBuffer());
    const webp = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).webp({ lossless: true }).withMetadata().toBuffer();
    const cleanWebp = await sanitizeDiscussionImage(webp, "image/webp");
    expect(await sharp(cleanWebp.bytes).raw().toBuffer()).toEqual(await sharp(webp).raw().toBuffer());
  });

  test("rejects MIME spoofing, truncated input, byte, pixel and edge limits", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
    await expect(sanitizeDiscussionImage(png, "image/jpeg")).rejects.toMatchObject({ code: "format" });
    await expect(sanitizeDiscussionImage(png.subarray(0, 25), "image/png")).rejects.toBeDefined();
    await expect(sanitizeDiscussionImage(Buffer.alloc(DISCUSSION_IMAGE_MAX_BYTES + 1), "image/png")).rejects.toMatchObject({ code: "size" });
    const huge = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
    await expect(sanitizeDiscussionImage(huge, "image/png")).rejects.toBeDefined();
    const wide = await sharp({ create: { width: 4097, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    await expect(sanitizeDiscussionImage(wide, "image/png")).rejects.toMatchObject({ code: "pixels" });
    await expect(sanitizeDiscussionImage(Buffer.from("<svg/>"), "image/svg+xml")).rejects.toMatchObject({ code: "format" });
  });

  test("rejects actual animated WebP", async () => {
    const frameSize = 12 * 12 * 4;
    const frames = Buffer.concat([Buffer.alloc(frameSize, 32), Buffer.alloc(frameSize, 224)]);
    const source = await sharp(frames, { raw: { width: 12, height: 24, pageHeight: 12, channels: 4 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(source, { animated: true }).metadata()).pages).toBe(2);
    await expect(sanitizeDiscussionImage(source, "image/webp")).rejects.toMatchObject({ code: "animation" });
  });

  test("rejects PNG animation markers and strips ordinary ancillary text", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
    const animated = Buffer.concat([png.subarray(0, 33), pngChunk("acTL", Buffer.from([0, 0, 0, 2, 0, 0, 0, 0])), png.subarray(33)]);
    await expect(sanitizeDiscussionImage(animated, "image/png")).rejects.toBeDefined();
    const withText = Buffer.concat([png.subarray(0, 33), pngChunk("tEXt", Buffer.from("Author\0private")), png.subarray(33)]);
    const clean = await sanitizeDiscussionImage(withText, "image/png");
    expect(Buffer.from(clean.bytes).includes(Buffer.from("private"))).toBe(false);
  });

  test("compresses large images and bounds their output dimensions", async () => {
    const width = 2200;
    const height = 700;
    const source = await sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).png().toBuffer();
    expect(source.length).toBeGreaterThan(1024 * 1024);
    const clean = await sanitizeDiscussionImage(source, "image/png");
    expect(clean.mime).toBe("image/webp");
    expect(clean.width).toBe(2048);
    expect(clean.bytes.byteLength).toBeLessThan(source.length);
    expect(clean.bytes.byteLength).toBeLessThanOrEqual(DISCUSSION_IMAGE_MAX_BYTES);
  });
});

describe("private prefixes and upload body", () => {
  test("fails closed outside the configured private Neon bucket", () => {
    expect(() => requireDiscussionPrivateStorage("neon")).not.toThrow();
    expect(() => requireDiscussionPrivateStorage("r2")).toThrow();
  });

  test("denies encoded and normalized private prefixes without blocking other domains", () => {
    for (const key of ["discussions/a/images/x.png", "%64iscussions%2Fa", "%2564iscussions%252Fa", "other/../discussions/a", "discussions/../public", "zyx-attachments/a", "zyx%252dattachments%252fa", "foo\\..\\zyx-attachments\\a"]) expect(isPrivateAttachmentKey(key)).toBe(true);
    for (const key of ["courses/a/materials/x.pdf", "forms/a/x.png", "overhaul/a/x", "my-discussions/a"]) expect(isPrivateAttachmentKey(key)).toBe(false);
    expect(buildDiscussionImageKey({ channelId: "channel-1", attachmentId: "id-1", extension: "png" })).toBe("discussions/channel-1/images/id-1.png");
    expect(buildDiscussionImageKey({ channelId: "channel-1", attachmentId: "id-1", extension: "webp", variant: "preview" })).toBe("discussions/channel-1/previews/id-1.webp");
    expect(isPrivateAttachmentKey("discussions/channel-1/previews/id-1.webp")).toBe(true);
    expect(() => buildDiscussionImageKey({ channelId: "../other", attachmentId: "id", extension: "png" })).toThrow();
  });

  test("accepts one same-origin file and rejects cross-origin and forged lengths", async () => {
    const form = new FormData();
    form.set("channelId", "channel-1");
    form.set("file", new File(["abc"], "a.png", { type: "image/png" }));
    const request = () => new Request("https://example.com/api/discussions/attachments", { method: "POST", headers: { origin: "https://example.com" }, body: form });
    expect((await parseDiscussionImageUpload(request())).channelId).toBe("channel-1");
    const cross = new Request("https://example.com/api/discussions/attachments", { method: "POST", headers: { origin: "https://evil.example" }, body: form });
    await expect(parseDiscussionImageUpload(cross)).rejects.toBeDefined();
    const forged = new Request("https://example.com/api/discussions/attachments", { method: "POST", headers: { origin: "https://example.com", "content-length": "1", "content-type": "multipart/form-data; boundary=x" }, body: Buffer.alloc(DISCUSSION_IMAGE_MAX_BYTES + 64 * 1024 + 1) });
    await expect(parseDiscussionImageUpload(forged)).rejects.toMatchObject({ code: "size" });
  });

  test("keeps non-upload discussion modules free of sharp and the upload sanitizer", () => {
    for (const file of [
      "lib/discussions/image-policy.ts",
      "lib/discussions/images.ts",
      "lib/discussions/service.ts",
      "lib/discussions/actions.ts",
      "app/api/discussions/attachments/[id]/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/["']sharp["']/);
      expect(source).not.toContain("image-sanitizer");
      expect(source).not.toContain("image-upload");
    }
  });
});
