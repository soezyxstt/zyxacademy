import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { sanitizeZyraImage, ZyraImageSanitizationError } from "@/lib/zyra/images";

async function pngFixture(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 24, height: 16, channels: 4, background: { r: 40, g: 80, b: 160, alpha: 1 } },
  }).png().toBuffer());
}

describe("Zyra private image validation", () => {
  test("sanitizes an accepted PNG and strips metadata by re-encoding", async () => {
    const sanitized = await sanitizeZyraImage(await pngFixture(), "image/png");
    expect(sanitized.mimeType).toBe("image/png");
    expect(sanitized.width).toBe(24);
    const metadata = await sharp(sanitized.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(sanitized.sanitizedSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("rejects a mismatched MIME and magic format", async () => {
    await expect(sanitizeZyraImage(await pngFixture(), "image/jpeg"))
      .rejects.toMatchObject({ code: "BAD_MAGIC_BYTES" });
  });

  test("rejects SVG and unknown MIME before decode", async () => {
    await expect(sanitizeZyraImage(new TextEncoder().encode("<svg></svg>"), "image/svg+xml"))
      .rejects.toMatchObject({ code: "UNSUPPORTED_MIME" });
  });

  test("rejects source bytes above the hard limit", async () => {
    await expect(sanitizeZyraImage(new Uint8Array(8 * 1024 * 1024 + 1), "image/png"))
      .rejects.toBeInstanceOf(ZyraImageSanitizationError);
  });

  test("reduces oversized accepted images before multimodal dispatch", async () => {
    const source = new Uint8Array(await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: { r: 240, g: 240, b: 240 } },
    }).jpeg().toBuffer());
    const sanitized = await sanitizeZyraImage(source, "image/jpeg");
    expect(sanitized.width).toBe(2048);
    expect(sanitized.height).toBeLessThanOrEqual(683);
  });
});
