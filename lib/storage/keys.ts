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

export function isProtectedProductDiktatPdfKey(key: string): boolean {
  return /^overhaul\/[^/]+\/diktat-pdf\/[^/]+\.pdf$/.test(key);
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

export function buildQuestionAssetKey(input: {
  courseSlug: string;
  questionIdentifier?: string | null;
  hash: string;
  extension?: string;
}): string {
  const ext = (input.extension || "png").replace(/^\./, "").toLowerCase();
  const folder = input.questionIdentifier ? `question-${slugifySegment(input.questionIdentifier, "item")}` : "general";
  return joinKey(
    "courses",
    slugifySegment(input.courseSlug, "course"),
    "questions",
    folder,
    `${input.hash.slice(0, 16)}.${ext}`,
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

export function buildSourcePackKey(input: {
  packId: string;
  checksum: string;
  scopeKey?: string;
}): string {
  return joinKey(
    "overhaul",
    "source-packs",
    slugifySegment(input.scopeKey || "shared", "shared"),
    `${slugifySegment(input.packId, "source-pack")}-${input.checksum.slice(0, 16)}.zip`,
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

/**
 * Normalizes a stored `fileUrl` value into an R2 object key.
 *
 * Accepts raw keys, relative storage proxy paths (`/api/storage/file/`,
 * `/f/`), and absolute URLs (storage proxy or `R2_PUBLIC_URL`). Query
 * strings, hashes, and leading slashes are stripped. Returns null when the
 * value cannot be mapped to an object key. Shared by the thumbnail read
 * route and the thumbnail worker so both sides resolve the same key.
 */
export function extractStorageKey(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().split(/[?#]/, 1)[0];
  if (!raw) return null;
  let candidate = raw;
  const relativeMarker = ["/api/storage/file/", "/f/"].find((marker) => raw.startsWith(marker));
  if (relativeMarker) {
    candidate = raw.slice(relativeMarker.length);
  } else if (!/^https?:\/\//i.test(raw)) {
    candidate = raw.replace(/^\/+/, "");
  }
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const marker = ["/api/storage/file/", "/f/"].find((item) => url.pathname.includes(item));
      if (marker) candidate = url.pathname.split(marker).pop() || "";
      else {
        const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
        if (!publicBase || !raw.startsWith(`${publicBase}/`)) return null;
        candidate = url.pathname.slice(new URL(publicBase).pathname.replace(/\/$/, "").length + 1);
      }
    }
    return decodeURIComponent(candidate).replace(/^\/+/, "") || null;
  } catch {
    return null;
  }
}

/**
 * Schedule session attachment object key: `schedules/{bookingId}/{type}/{leaf}`.
 * type is either 'pre_session' (student questions/materials) or 'post_session' (tutor notes/handouts).
 */
export function buildScheduleAttachmentKey(params: {
  bookingId: string;
  type: "pre_session" | "post_session";
  filename: string;
}): string {
  return joinKey(
    "schedules",
    slugifySegment(params.bookingId, "booking"),
    params.type,
    userFileLeaf(params.filename)
  );
}

/**
 * Tryout essay attachment object key: `exams/{examId}/attachments/{leaf}`.
 * Uploaded by students while answering an essay question; downloaded by the grading tutor.
 */
export function buildExamAttachmentKey(params: {
  examId: string;
  filename: string;
}): string {
  return joinKey(
    "exams",
    slugifySegment(params.examId, "exam"),
    "attachments",
    userFileLeaf(params.filename)
  );
}

/**
 * Canonical prefix for quiz essay attachments: `quizzes/{slugifiedQuizId}/attachments/`.
 */
export function quizAttachmentPrefix(quizId: string): string {
  return `quizzes/${slugifySegment(quizId, "quiz")}/attachments/`;
}

/**
 * Quiz essay attachment object key: `quizzes/{quizId}/attachments/{leaf}`.
 * Uploaded by students while answering an essay question; downloaded by the grading tutor.
 */
export function buildQuizAttachmentKey(params: {
  quizId: string;
  filename: string;
}): string {
  return `${quizAttachmentPrefix(params.quizId)}${userFileLeaf(params.filename)}`;
}

/**
 * Course video object key: `courses/{courseSlug}/videos/{leaf}`.
 */
export function buildCourseVideoKey(params: {
  courseSlug: string;
  filename: string;
}): string {
  return joinKey(
    "courses",
    slugifySegment(params.courseSlug, "course"),
    "videos",
    userFileLeaf(params.filename),
  );
}

/**
 * Course video thumbnail object key: `courses/{courseSlug}/videos/thumbnails/{leaf}`.
 */
export function buildCourseVideoThumbnailKey(params: {
  courseSlug: string;
  filename: string;
}): string {
  return joinKey(
    "courses",
    slugifySegment(params.courseSlug, "course"),
    "videos",
    "thumbnails",
    userFileLeaf(params.filename),
  );
}



