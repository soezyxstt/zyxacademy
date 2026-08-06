import { randomBytes } from "node:crypto";

/**
 * Slugifies form title into a clean URL & path safe string for storage folders.
 */
export function slugifyFormTitle(title?: string | null): string {
  if (!title || !title.trim()) return "unnamed-form";

  const slugified = title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric chars with hyphen
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens

  return slugified || "unnamed-form";
}

/**
 * Normalizes question number/identifier for folder structure.
 * e.g., 1 -> "question-1", "q2" -> "question-2", "3-nama-lengkap" -> "question-3"
 */
export function formatQuestionFolder(qNum?: string | number | null): string {
  if (qNum === null || qNum === undefined || qNum === "") {
    return "general";
  }

  const rawStr = String(qNum).trim();
  // Extract digits if present
  const match = rawStr.match(/\d+/);
  if (match) {
    return `question-${match[0]}`;
  }

  const clean = rawStr
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean ? `question-${clean}` : "general";
}

/**
 * Builds a structured storage key for form uploads:
 * forms/[slugified-judul-forms]/question-[number]/[timestamp]-[hash]-[filename]
 */
export function buildFormStorageKey(params: {
  formTitle?: string | null;
  formSlug?: string | null;
  questionNumber?: string | number | null;
  filename: string;
}): string {
  const formFolder = slugifyFormTitle(params.formTitle || params.formSlug);
  const qFolder = formatQuestionFolder(params.questionNumber);

  const time = Date.now();
  const randHash = randomBytes(4).toString("hex");

  // Clean filename
  const extensionIndex = params.filename.lastIndexOf(".");
  let baseName = params.filename;
  let ext = "";
  if (extensionIndex !== -1) {
    baseName = params.filename.substring(0, extensionIndex);
    ext = params.filename.substring(extensionIndex);
  }

  const cleanBaseName =
    baseName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "file";

  const safeFilename = `${time}-${randHash}-${cleanBaseName}${ext.toLowerCase()}`;

  return `forms/${formFolder}/${qFolder}/${safeFilename}`;
}
