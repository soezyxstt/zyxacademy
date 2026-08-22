import type {
  CourseMaterialSubcategory,
  MaterialLevel1Category,
} from "@/lib/course-materials";

export const BATCH_MAX_FILES = 200;
export const BATCH_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const HASH_WORKER_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_CONCURRENCY = 4;
export const UPLOAD_MAX_RETRIES = 3;

export type BatchDocStatus =
  | "hashing"
  | "ready"
  | "uploading"
  | "completed"
  | "error";

export type DuplicateAction = "skip" | "overwrite" | "keep";

export interface DuplicateMatch {
  materialId: string;
  title: string;
}

export interface StagedBatchDocument {
  id: string;
  file: File;
  originalName: string;
  relativePath: string;
  size: number;
  checksum: string | null;
  status: BatchDocStatus;
  uploadProgress: number;
  errorMessage?: string;
  duplicateOf: DuplicateMatch | null;
  duplicateAction: DuplicateAction;
  category: MaterialLevel1Category;
  subcategory: CourseMaterialSubcategory | null;
  year: number | null;
  title: string;
  generatedName: string;
}

const HIDDEN_FILE_BASENAMES = new Set([
  "thumbs.db",
  "desktop.ini",
  ".ds_store",
]);

export function isHiddenOrSystemFile(name: string): boolean {
  const base = name.split("/").pop() || name;
  if (base.startsWith(".")) return true;
  if (HIDDEN_FILE_BASENAMES.has(base.toLowerCase())) return true;
  return false;
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  if (index === -1) return "";
  return name.slice(index).toLowerCase();
}

export function isSupportedBatchFile(name: string): boolean {
  return extensionOf(name) === ".pdf";
}

/** Year heuristic: first plausible 19xx or 20xx token in the filename. */
export function detectYear(name: string): number | null {
  const match = name.match(/(19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  if (year < 1900 || year > 2100) return null;
  return year;
}

function hasPembahasanKeyword(base: string): boolean {
  return /pembahasan|bahasan|solusi|penyelesaian|solution/i.test(base);
}

function detectExamSubcategory(
  base: string
): CourseMaterialSubcategory | null {
  if (/\buts\b|ujian\s*tengah\s*semester/i.test(base)) return "uts";
  if (/\buas\b|ujian\s*akhir\s*semester/i.test(base)) return "uas";
  if (/kuis|\bquiz\b/i.test(base)) return "kuis";
  if (/\bkbf\b/i.test(base)) return "kbf";
  if (/tutorial/i.test(base)) return "tutorial";
  if (/modul|module/i.test(base)) return "modul";
  return null;
}

function detectMateriSubcategory(
  base: string
): CourseMaterialSubcategory | null {
  if (/e-?book|buku|textbook/i.test(base)) return "ebook";
  if (/\bppt\b|\bslide|slides\b/i.test(base)) return "ppt_dosen";
  if (/catatan|ringkasan|\bnotes?\b/i.test(base)) return "catatan";
  return null;
}

export interface DetectedBatchCategory {
  category: MaterialLevel1Category;
  subcategory: CourseMaterialSubcategory | null;
}

/**
 * Heuristic filename auto-tagging mapped onto the existing two-level course
 * material taxonomy (materi/soal/pembahasan_soal plus their subcategories).
 */
export function detectCategoryFromFilename(
  filename: string
): DetectedBatchCategory {
  const base = stripPdfExtension(filename);

  if (hasPembahasanKeyword(base)) {
    return {
      category: "pembahasan_soal",
      subcategory: detectExamSubcategory(base) ?? "lainnya",
    };
  }

  const examSubcategory = detectExamSubcategory(base);
  if (
    examSubcategory ||
    /\bsoal\b|\bexam\b|\bujian\b|\btes?t\b|\blatihan\b|latihan\s*soal/i.test(base)
  ) {
    return { category: "soal", subcategory: examSubcategory ?? "lainnya" };
  }

  const materiSubcategory = detectMateriSubcategory(base);
  return { category: "materi", subcategory: materiSubcategory };
}

export function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/** Kebab-case token for generated filenames. */
export function sanitizeNameToken(input: string): string {
  const cleaned = input
    .normalize("NFC")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return cleaned || "dokumen";
}

export interface GenerateFileNameInput {
  courseCode: string;
  category: MaterialLevel1Category;
  subcategory?: CourseMaterialSubcategory | null;
  year?: number | null;
  title: string;
  extension?: string;
}

const CATEGORY_LABELS: Record<MaterialLevel1Category, string> = {
  materi: "materi",
  soal: "soal",
  pembahasan_soal: "pembahasan",
};

/**
 * Deterministic renaming engine adapted to the existing taxonomy:
 * soal/pembahasan embed year and subcategory when known, materi stays static.
 */
export function generateFileName(input: GenerateFileNameInput): string {
  const ext = (input.extension || ".pdf").toLowerCase();
  const code = sanitizeNameToken(input.courseCode) || "mk";
  const label = CATEGORY_LABELS[input.category];
  const title = sanitizeNameToken(input.title);
  const parts: string[] = [code, label];

  if (input.category === "materi") {
    if (input.subcategory && input.subcategory !== "lainnya") {
      parts.push(input.subcategory);
    }
    parts.push(title);
    return `${parts.join("_")}${ext}`;
  }

  parts.push(input.subcategory ?? "lainnya");
  if (input.year) parts.push(String(input.year));
  parts.push(title);
  return `${parts.join("_")}${ext}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}
