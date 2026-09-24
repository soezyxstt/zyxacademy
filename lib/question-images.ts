import { createHash } from "node:crypto";
import { storage } from "@/lib/storage";
import { buildQuestionAssetKey, leafFilename } from "@/lib/storage/keys";

const BASE64_IMAGE_REGEX = /!\[(.*?)\]\((data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+))\)/g;

function mimeToExtension(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

/**
 * Validates that the buffer's magic header matches the declared image MIME type.
 * Prevents spoofing and rejects non-image or corrupted payloads.
 */
function validateImageMagicBytes(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 8) return false;

  const normalizedMime = mime.toLowerCase();
  if (normalizedMime === "image/png") {
    // 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg") {
    // 0xFF, 0xD8, 0xFF
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (normalizedMime === "image/gif") {
    // "GIF87a" or "GIF89a"
    return (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    );
  }

  if (normalizedMime === "image/webp") {
    // "RIFF" .... "WEBP"
    if (buffer.length < 12) return false;
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }

  return false;
}

/**
 * Scans markdown text for base64 data URI images, uploads them to R2 storage,
 * and replaces the data URI with the persistent storage proxy URL.
 * If no base64 images are present, returns the original text untouched.
 */
export async function offloadBase64ImagesToR2(
  text: string | null | undefined,
  context: {
    courseSlug: string;
    questionIdentifier?: string | null;
  },
): Promise<string> {
  if (!text || !text.includes("data:image/")) {
    return text ?? "";
  }

  // Find all matches
  const regex = new RegExp(BASE64_IMAGE_REGEX);
  let match: RegExpExecArray | null;
  const replacements: Array<{ original: string; replacement: string }> = [];

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const alt = match[1] || "";
    const mimeType = match[3];
    const rawBase64 = match[5].replace(/\s+/g, "");

    try {
      const buffer = Buffer.from(rawBase64, "base64");
      if (!validateImageMagicBytes(buffer, mimeType)) {
        console.warn(`[offloadBase64ImagesToR2] Image payload does not match declared MIME ${mimeType}, skipping.`);
        continue;
      }

      const hash = createHash("sha256").update(buffer).digest("hex");
      const extension = mimeToExtension(mimeType);

      const key = buildQuestionAssetKey({
        courseSlug: context.courseSlug,
        questionIdentifier: context.questionIdentifier,
        hash,
        extension,
      });

      // Upload to R2 (idempotent; if exists with same key, overwrites with identical bytes)
      const leaf = leafFilename(key);
      await storage.upload(buffer, leaf, mimeType, { key });

      const newImageUrl = `/api/storage/file/${key}`;
      const newMarkdown = `![${alt}](${newImageUrl})`;
      replacements.push({ original: fullMatch, replacement: newMarkdown });
    } catch (err) {
      console.error("[offloadBase64ImagesToR2] Failed to offload image:", err);
      // Fallback: keep original if upload fails
    }
  }

  let result = text;
  for (const { original, replacement } of replacements) {
    result = result.replace(original, () => replacement);
  }

  return result;
}

/**
 * Offloads base64 images from prompt, explanation, and options of a question draft.
 */
export async function offloadQuestionItemImages<T extends {
  prompt: string;
  explanation?: string | null;
  options?: unknown;
}>(
  item: T,
  context: {
    courseSlug: string;
    questionIdentifier?: string | null;
  },
): Promise<T> {
  const offloadedPrompt = await offloadBase64ImagesToR2(item.prompt, context);
  const offloadedExplanation = item.explanation
    ? await offloadBase64ImagesToR2(item.explanation, context)
    : item.explanation;

  let offloadedOptions = item.options;
  if (Array.isArray(item.options)) {
    offloadedOptions = await Promise.all(
      item.options.map(async (opt) => {
        if (typeof opt === "string") {
          return offloadBase64ImagesToR2(opt, context);
        }
        if (opt && typeof opt === "object" && "text" in opt && typeof (opt as { text: unknown }).text === "string") {
          return {
            ...opt,
            text: await offloadBase64ImagesToR2((opt as { text: string }).text, context),
          };
        }
        return opt;
      }),
    );
  }

  return {
    ...item,
    prompt: offloadedPrompt,
    explanation: offloadedExplanation,
    options: offloadedOptions,
  };
}
