import { createHash } from "node:crypto";
import { storage } from "@/lib/storage";
import { buildQuestionAssetKey, leafFilename } from "@/lib/storage/keys";

const BASE64_IMAGE_REGEX = /!\[(.*?)\]\((data:(image\/(png|jpeg|jpg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=\s]+))\)/g;

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
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
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
    result = result.replace(original, replacement);
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
      item.options.map((opt) =>
        typeof opt === "string" ? offloadBase64ImagesToR2(opt, context) : opt,
      ),
    );
  }

  return {
    ...item,
    prompt: offloadedPrompt,
    explanation: offloadedExplanation,
    options: offloadedOptions,
  };
}
