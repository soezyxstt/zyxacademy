import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  ZyraImageMimeSchema,
  ZYRA_IMAGE_MAX_DECODED_PIXELS,
  ZYRA_IMAGE_MAX_LONGEST_EDGE,
  ZYRA_IMAGE_MAX_SANITIZED_BYTES,
  ZYRA_IMAGE_MAX_SOURCE_BYTES,
  ZYRA_IMAGE_SANITIZER_VERSION,
  type SanitizedZyraImage,
  type ZyraImageExtension,
  type ZyraImageFailureCode,
  type ZyraImageMime,
} from "./contracts";

export class ZyraImageSanitizationError extends Error {
  constructor(public readonly code: ZyraImageFailureCode) {
    super(code);
    this.name = "ZyraImageSanitizationError";
  }
}

function extensionForMime(mimeType: ZyraImageMime): ZyraImageExtension {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function formatForMime(mimeType: ZyraImageMime): "jpeg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sanitizeZyraImage(
  input: Uint8Array,
  declaredMimeType: string,
): Promise<SanitizedZyraImage> {
  if (input.byteLength > ZYRA_IMAGE_MAX_SOURCE_BYTES) {
    throw new ZyraImageSanitizationError("SOURCE_TOO_LARGE");
  }
  const mimeResult = ZyraImageMimeSchema.safeParse(declaredMimeType);
  if (!mimeResult.success) throw new ZyraImageSanitizationError("UNSUPPORTED_MIME");
  const mimeType = mimeResult.data;
  const source = Buffer.from(input);

  try {
    const image = sharp(source, {
      limitInputPixels: ZYRA_IMAGE_MAX_DECODED_PIXELS,
      sequentialRead: true,
      animated: false,
    });
    const metadata = await image.metadata();
    if (!metadata.format || !metadata.width || !metadata.height) {
      throw new ZyraImageSanitizationError("CORRUPT_IMAGE");
    }
    const formatMatches = (mimeType === "image/jpeg" && metadata.format === "jpeg")
      || (mimeType === "image/png" && metadata.format === "png")
      || (mimeType === "image/webp" && metadata.format === "webp");
    if (!formatMatches) throw new ZyraImageSanitizationError("BAD_MAGIC_BYTES");
    if ((metadata.pages ?? 1) > 1 || metadata.pageHeight !== undefined && metadata.pageHeight !== metadata.height) {
      throw new ZyraImageSanitizationError("ANIMATED_IMAGE_REJECTED");
    }
    if (
      Math.max(metadata.width, metadata.height) > ZYRA_IMAGE_MAX_LONGEST_EDGE
      || metadata.width * metadata.height > ZYRA_IMAGE_MAX_DECODED_PIXELS
    ) {
      throw new ZyraImageSanitizationError("DECODED_IMAGE_TOO_LARGE");
    }

    const output = await image
      .rotate()
      .toFormat(formatForMime(mimeType), mimeType === "image/jpeg"
        ? { quality: 86, chromaSubsampling: "4:4:4" }
        : mimeType === "image/webp"
          ? { quality: 86, alphaQuality: 90 }
          : { compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    if (output.data.byteLength > ZYRA_IMAGE_MAX_SANITIZED_BYTES) {
      throw new ZyraImageSanitizationError("SOURCE_TOO_LARGE");
    }
    const width = output.info.width;
    const height = output.info.height;
    if (!width || !height || Math.max(width, height) > ZYRA_IMAGE_MAX_LONGEST_EDGE) {
      throw new ZyraImageSanitizationError("DECODED_IMAGE_TOO_LARGE");
    }
    const bytes = new Uint8Array(output.data);
    return {
      bytes,
      mimeType,
      extension: extensionForMime(mimeType),
      width,
      height,
      sanitizedSha256: sha256(bytes),
      sanitizerVersion: ZYRA_IMAGE_SANITIZER_VERSION,
    };
  } catch (error) {
    if (error instanceof ZyraImageSanitizationError) throw error;
    throw new ZyraImageSanitizationError("CORRUPT_IMAGE");
  }
}
