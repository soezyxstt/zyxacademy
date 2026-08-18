import { randomBytes } from "node:crypto";
import { formatIsoDateUtc } from "@/lib/date-utils";

const LEAF_HASH_BYTES = 4;

export const INVALID_OBJECT_KEY = "INVALID_OBJECT_KEY";

export function isSafeKey(key: string): boolean {
  return Boolean(key) && !key.startsWith("/") && !key.includes("\\") && !key.includes("..");
}

export function assertSafeKey(key: string): void {
  if (!isSafeKey(key)) throw new Error(INVALID_OBJECT_KEY);
}

export function assertSafeObjectKey(key: string): string {
  assertSafeKey(key);
  return key;
}

export function slugifySegment(input?: string | null, fallback = "untitled"): string {
  const cleaned = (input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || fallback;
}

export function sanitizeFilename(filename: string): string {
  const extensionIndex = filename.lastIndexOf(".");
  let baseName = filename;
  let ext = "";
  if (extensionIndex !== -1) {
    baseName = filename.substring(0, extensionIndex);
    ext = filename.substring(extensionIndex);
  }

  const cleanBaseName =
    baseName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "file";

  return `${cleanBaseName}${ext.trim().toLowerCase()}`;
}

export function userFileLeaf(filename: string): string {
  return `${Date.now()}-${randomBytes(LEAF_HASH_BYTES).toString("hex")}-${sanitizeFilename(filename)}`;
}

export function joinKey(...segments: string[]): string {
  const key = segments.filter(Boolean).join("/");
  assertSafeKey(key);
  return key;
}

export function buildZyraAttachmentKey(input: {
  attachmentId: string;
  extension: "jpg" | "png" | "webp";
  createdAt?: Date;
}): string {
  const day = formatIsoDateUtc(input.createdAt ?? new Date());
  return assertSafeObjectKey(`zyx-attachments/${day}/${input.attachmentId}.${input.extension}`);
}

export function leafFilename(key: string): string {
  const leaf = key.split("/").filter(Boolean).pop() || key;
  return leaf.replace(/^\d+-[a-f0-9]{8}-/, "");
}

export function slugifyFormTitle(title?: string | null): string {
  return slugifySegment(title, "unnamed-form");
}

export function formatQuestionFolder(qNum?: string | number | null): string {
  if (qNum === null || qNum === undefined || qNum === "") {
    return "general";
  }

  const rawStr = String(qNum).trim();
  const match = rawStr.match(/\d+/);
  if (match) {
    return `question-${match[0]}`;
  }

  return `question-${slugifySegment(rawStr, "general")}`;
}

export function buildFormStorageKey(params: {
  formTitle?: string | null;
  formSlug?: string | null;
  questionNumber?: string | number | null;
  filename: string;
}): string {
  return joinKey(
    "forms",
    slugifyFormTitle(params.formTitle || params.formSlug),
    formatQuestionFolder(params.questionNumber),
    userFileLeaf(params.filename)
  );
}

export function buildIdeaBundleKey(input: {
  runId: string;
  bundleId: string;
  checksum: string;
}): string {
  return joinKey(
    "overhaul",
    "idea-bundles",
    slugifySegment(input.runId, "run"),
    `${slugifySegment(input.bundleId, "idea-bundle")}-${input.checksum.slice(0, 16)}.zip`,
  );
}

export function buildProductBundleKey(input: {
  runId: string;
  bundleId: string;
  checksum: string;
}): string {
  return joinKey(
    "overhaul",
    "product-bundles",
    slugifySegment(input.runId, "run"),
    `${slugifySegment(input.bundleId, "product-bundle")}-${input.checksum.slice(0, 16)}.zip`,
  );
}

export function buildAuthoringContextKey(input: {
  runId: string;
  packId: string;
}): string {
  return joinKey(
    "overhaul",
    slugifySegment(input.runId, "run"),
    "authoring-context",
    `${slugifySegment(input.packId, "authoring-context")}.zip`,
  );
}

/**
 * Media Library leaf name. Unlike user-upload leaves, the Media Library is a
 * managed workspace where the human-visible filename IS the object name, so the
 * leaf keeps the original base name (no timestamp/hash prefix) and only the
 * extension is lowercased. Renames are explicit copy+delete operations.
 */
export function mediaLeaf(filename: string): string {
  return sanitizeFilename(filename);
}

/**
 * Media Library object key: `media/{children_folder...}/{leaf}`.
 * `folderPath` is an optional nested folder path, e.g. "logos" or "kelas/tpb-2026".
 */
export function buildMediaKey(params: {
  folderPath?: string | null;
  filename: string;
}): string {
  const rawFolder = (params.folderPath || "").trim();
  if (rawFolder) assertSafeKey(rawFolder);
  const folder = rawFolder
    .split("/")
    .map((seg) => slugifySegment(seg, ""))
    .filter(Boolean)
    .join("/");
  return joinKey("media", folder, mediaLeaf(params.filename));
}

/** Returns true when a key lives under the `media/` domain. */
export function isMediaKey(key: string): boolean {
  return key === "media" || key.startsWith("media/");
}

/**
 * Course document thumbnail object key: `thumbnails/courses/{courseSlug}/{materialId}.{extension}`.
 */
export function buildCourseThumbnailKey(params: {
  courseSlug: string;
  materialId: string;
  extension?: "webp" | "png" | "jpg";
}): string {
  const ext = params.extension || "webp";
  return joinKey(
    "thumbnails",
    "courses",
    slugifySegment(params.courseSlug, "general"),
    `${slugifySegment(params.materialId, "material")}.${ext}`
  );
}
