import sharp from "sharp";

export const DISCUSSION_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const DISCUSSION_IMAGE_MAX_PIXELS = 16_000_000;
export const DISCUSSION_IMAGE_MAX_EDGE = 4096;
export const DISCUSSION_IMAGE_MAX_COUNT = 4;
export const DISCUSSION_IMAGE_SMALL_BYTES = 1024 * 1024;
export const DISCUSSION_IMAGE_PREVIEW_MAX_BYTES = 128 * 1024;
export const DISCUSSION_IMAGE_PREVIEW_MAX_EDGE = 480;

export type DiscussionImageMime = "image/jpeg" | "image/png" | "image/webp";
export type DiscussionImageExtension = "jpg" | "png" | "webp";

export class DiscussionImageError extends Error {
  constructor(public readonly code: "format" | "size" | "pixels" | "animation" | "invalid") {
    super(code);
  }
}

export { requireDiscussionPrivateStorage } from "./image-storage-policy";

export async function parseDiscussionImageUpload(request: Request): Promise<{ channelId: string; file: File }> {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin !== new URL(request.url).origin || (fetchSite && fetchSite !== "same-origin")) {
    throw new DiscussionImageError("invalid");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new DiscussionImageError("invalid");
  const maxBody = DISCUSSION_IMAGE_MAX_BYTES + 64 * 1024;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBody)) throw new DiscussionImageError("size");
  if (!request.body) throw new DiscussionImageError("invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBody) {
      void reader.cancel();
      throw new DiscussionImageError("size");
    }
    chunks.push(value);
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new DiscussionImageError("invalid");
  }
  const fields = [...form.keys()];
  const channelId = form.get("channelId");
  const file = form.get("file");
  if (fields.length !== 2 || typeof channelId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(channelId) || !(file instanceof File)) {
    throw new DiscussionImageError("invalid");
  }
  if (!file.size || file.size > DISCUSSION_IMAGE_MAX_BYTES) throw new DiscussionImageError("size");
  return { channelId, file };
}

function stripJpeg(source: Buffer): Buffer {
  const parts = [source.subarray(0, 2)];
  let position = 2;
  let sawScan = false;
  while (position < source.length) {
    const start = position;
    if (source[position++] !== 0xff) throw new DiscussionImageError("invalid");
    while (source[position] === 0xff) position++;
    const marker = source[position++];
    if (marker === 0xd9) {
      if (!sawScan) throw new DiscussionImageError("invalid");
      parts.push(source.subarray(start, position));
      return Buffer.concat(parts);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(source.subarray(start, position));
      continue;
    }
    if (position + 2 > source.length) throw new DiscussionImageError("invalid");
    const length = source.readUInt16BE(position);
    const end = position + length;
    if (length < 2 || end > source.length) throw new DiscussionImageError("invalid");
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) parts.push(source.subarray(start, end));
    position = end;
    if (marker === 0xda) {
      sawScan = true;
      const scanStart = position;
      while (position < source.length) {
        if (source[position] !== 0xff) { position++; continue; }
        let next = position + 1;
        while (source[next] === 0xff) next++;
        if (source[next] === 0x00 || (source[next] >= 0xd0 && source[next] <= 0xd7)) {
          position = next + 1;
        } else break;
      }
      parts.push(source.subarray(scanStart, position));
    }
  }
  throw new DiscussionImageError("invalid");
}

function stripPng(source: Buffer): Buffer {
  const parts = [source.subarray(0, 8)];
  let position = 8;
  while (position + 12 <= source.length) {
    const length = source.readUInt32BE(position);
    const end = position + 12 + length;
    if (end > source.length) throw new DiscussionImageError("invalid");
    const kind = source.toString("ascii", position + 4, position + 8);
    if (["acTL", "fcTL", "fdAT"].includes(kind)) throw new DiscussionImageError("animation");
    if (["IHDR", "PLTE", "IDAT", "IEND", "tRNS"].includes(kind)) parts.push(source.subarray(position, end));
    else if (/^[A-Z]/.test(kind)) throw new DiscussionImageError("invalid");
    position = end;
    if (kind === "IEND") return Buffer.concat(parts);
  }
  throw new DiscussionImageError("invalid");
}

function stripWebp(source: Buffer): Buffer {
  if (source.length < 12) throw new DiscussionImageError("invalid");
  const end = source.readUInt32LE(4) + 8;
  if (end > source.length || end < 12) throw new DiscussionImageError("invalid");
  const parts: Buffer[] = [];
  let position = 12;
  while (position + 8 <= end) {
    const kind = source.toString("ascii", position, position + 4);
    const length = source.readUInt32LE(position + 4);
    const next = position + 8 + length + (length & 1);
    if (next > end) throw new DiscussionImageError("invalid");
    if (kind === "ANIM" || kind === "ANMF") throw new DiscussionImageError("animation");
    if (["VP8X", "VP8 ", "VP8L", "ALPH"].includes(kind)) {
      const chunk = Buffer.from(source.subarray(position, next));
      if (kind === "VP8X") {
        if (length !== 10) throw new DiscussionImageError("invalid");
        if (chunk[8] & 0x02) throw new DiscussionImageError("animation");
        chunk[8] &= ~0x2c;
      }
      parts.push(chunk);
    }
    position = next;
  }
  if (position !== end) throw new DiscussionImageError("invalid");
  const payload = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(payload.length + 4, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, payload]);
}

export async function sanitizeDiscussionImage(input: Uint8Array, declaredMime: string): Promise<{
  bytes: Uint8Array;
  mime: DiscussionImageMime;
  extension: DiscussionImageExtension;
  width: number;
  height: number;
}> {
  if (!input.byteLength || input.byteLength > DISCUSSION_IMAGE_MAX_BYTES) throw new DiscussionImageError("size");
  const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;
  if (!Object.hasOwn(formats, declaredMime)) throw new DiscussionImageError("format");
  const mime = declaredMime as DiscussionImageMime;
  const source = Buffer.from(input);
  try {
    const image = sharp(source, { limitInputPixels: DISCUSSION_IMAGE_MAX_PIXELS, animated: true, failOn: "warning", sequentialRead: true });
    const metadata = await image.metadata();
    if (metadata.format !== formats[mime]) throw new DiscussionImageError("format");
    if (!metadata.width || !metadata.height) throw new DiscussionImageError("invalid");
    if ((metadata.pages ?? 1) > 1 || (metadata.pageHeight !== undefined && metadata.pageHeight !== metadata.height)) throw new DiscussionImageError("animation");
    if (metadata.width * metadata.height > DISCUSSION_IMAGE_MAX_PIXELS || Math.max(metadata.width, metadata.height) > DISCUSSION_IMAGE_MAX_EDGE) throw new DiscussionImageError("pixels");

    const stripped = mime === "image/jpeg" ? stripJpeg(source) : mime === "image/png" ? stripPng(source) : stripWebp(source);
    await image.stats();
    const needsOrientation = (metadata.orientation ?? 1) !== 1 || metadata.space === "cmyk";
    let output = stripped;
    let outputMime: DiscussionImageMime = mime;
    if (source.length > DISCUSSION_IMAGE_SMALL_BYTES) {
      const compressed = await sharp(source, { limitInputPixels: DISCUSSION_IMAGE_MAX_PIXELS, failOn: "warning" })
        .rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).webp({ quality: 84, effort: 4 }).toBuffer();
      if (needsOrientation || Math.max(metadata.width, metadata.height) > 2048 || compressed.length < stripped.length) {
        output = compressed;
        outputMime = "image/webp";
      }
    } else if (needsOrientation) {
      const png = await sharp(source, { limitInputPixels: DISCUSSION_IMAGE_MAX_PIXELS, failOn: "warning" }).rotate().png().toBuffer();
      const webp = await sharp(source, { limitInputPixels: DISCUSSION_IMAGE_MAX_PIXELS, failOn: "warning" }).rotate().webp({ lossless: true }).toBuffer();
      output = png.length <= webp.length ? png : webp;
      outputMime = png.length <= webp.length ? "image/png" : "image/webp";
    }
    if (output.length > DISCUSSION_IMAGE_MAX_BYTES) throw new DiscussionImageError("size");
    const result = sharp(output, { limitInputPixels: DISCUSSION_IMAGE_MAX_PIXELS, failOn: "warning" });
    const resultMetadata = await result.metadata();
    await result.stats();
    if (!resultMetadata.width || !resultMetadata.height) throw new DiscussionImageError("invalid");
    return { bytes: new Uint8Array(output), mime: outputMime, extension: outputMime === "image/jpeg" ? "jpg" : outputMime === "image/png" ? "png" : "webp", width: resultMetadata.width, height: resultMetadata.height };
  } catch (error) {
    if (error instanceof DiscussionImageError) throw error;
    throw new DiscussionImageError("invalid");
  }
}

export async function makeDiscussionImagePreview(input: Uint8Array): Promise<Uint8Array> {
  for (const edge of [DISCUSSION_IMAGE_PREVIEW_MAX_EDGE, 240, 120]) {
    const bytes = await sharp(input, { limitInputPixels: DISCUSSION_IMAGE_MAX_PIXELS, failOn: "warning" })
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70, alphaQuality: 80, effort: 4 }).toBuffer();
    if (bytes.byteLength > 0 && bytes.byteLength <= DISCUSSION_IMAGE_PREVIEW_MAX_BYTES) return bytes;
  }
  throw new DiscussionImageError("size");
}
