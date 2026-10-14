import type {
  CourseMaterialSubcategory,
  MaterialLevel1Category,
  MaterialRoleQualifier,
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
  chapterIds: string[];
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
  if (/\bup\b|ujian\s*perbaikan/i.test(base)) return "up";
  if (/\bltm\b/i.test(base)) return "ltm";
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
  if (/\bppt\b|\bslide|slides\b|\bmateri\s*dosen\b/i.test(base)) return "materi_dosen";
  if (/\bscl\b|\bstudent[- ]?cent/i.test(base)) return "scl";
  if (/modul|module/i.test(base)) return "modul";
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
  subcategory?: CourseMaterialSubcategory | string | null;
  chapterIndex?: number | null;
  chapterNumber?: number | string | null;
  year?: number | string | null;
  semester?: string | null;
  title: string;
  extension?: string;
  role?: string | null;
}

const CATEGORY_MAP: Record<string, string> = {
  materi: "materi",
  soal: "soal",
  pembahasan_soal: "pembahasan",
  ebook: "diktat",
  diktat: "diktat",
  catatan: "catatan",
  silabus: "silabus",
  materi_dosen: "materi",
  scl: "materi",
  tutorial: "tutorial",
  latihan: "latihan",
  pr: "pr",
  kuis: "kuis",
  kbf: "kbf",
  uts: "uts",
  uas: "uas",
  up: "up",
  ltm: "ltm",
  tryout: "tryout",
  modul: "modul",
};

/**
 * Deterministic standard naming engine:
 * Formula: [KODE_MK]_[BAB]_[KATEGORI]_[DESKRIPSI]_[ROLE]_[TAHUN-SEMESTER].[ext]
 */
export function generateFileName(input: GenerateFileNameInput): string {
  const ext = (input.extension || ".pdf").toLowerCase();
  const code = sanitizeNameToken(input.courseCode) || "mk";
  const parts: string[] = [code];

  // 1. Chapter segment (bab01, bab02, etc.)
  let chapNum: number | null = null;
  if (typeof input.chapterIndex === "number" && input.chapterIndex >= 0) {
    chapNum = input.chapterIndex;
  } else if (input.chapterNumber !== undefined && input.chapterNumber !== null) {
    chapNum = parseChapterNumber(String(input.chapterNumber));
  }

  const isComprehensiveExam =
    input.subcategory === "uts" || input.subcategory === "uas" || input.subcategory === "up";

  if (chapNum !== null && !isComprehensiveExam) {
    parts.push(`bab${String(chapNum).padStart(2, "0")}`);
  }

  // 2. Category segment
  let catSegment = "materi";
  if (input.category === "materi") {
    if (input.subcategory && ["ebook", "diktat", "catatan", "silabus"].includes(input.subcategory)) {
      catSegment = CATEGORY_MAP[input.subcategory] || "materi";
    } else {
      catSegment = "materi";
    }
  } else if (input.subcategory && input.subcategory !== "lainnya") {
    catSegment = CATEGORY_MAP[input.subcategory] || input.subcategory;
  } else if (input.category === "pembahasan_soal") {
    catSegment = "soal";
  } else {
    catSegment = "soal";
  }
  parts.push(catSegment);

  // 3. Description / Topic (cleaned, avoiding redundant category repetition)
  const rawTitleToken = sanitizeNameToken(input.title);
  const redundantTokens = new Set([
    code,
    catSegment,
    "soal",
    "solusi",
    "pembahasan",
    "uts",
    "uas",
    "kuis",
    "dokumen",
  ]);
  if (chapNum !== null) {
    redundantTokens.add(`bab-${chapNum}`);
    redundantTokens.add(`bab-${String(chapNum).padStart(2, "0")}`);
    redundantTokens.add(`bab${chapNum}`);
    redundantTokens.add(`bab${String(chapNum).padStart(2, "0")}`);
  }

  let descToken = rawTitleToken;
  if (redundantTokens.has(descToken)) {
    descToken = "";
  } else {
    // Strip redundant prefix/suffix matching category or code
    descToken = descToken
      .replace(new RegExp(`^${code}-?`, "i"), "")
      .replace(new RegExp(`^${catSegment}-?`, "i"), "")
      .replace(/-(soal|solusi|pembahasan)$/i, "")
      .replace(/^-+|-+$/g, "");
  }

  if (descToken) {
    parts.push(descToken);
  }

  // 4. Role (soal / solusi / slide)
  let role = input.role ? sanitizeNameToken(input.role) : null;
  if (!role) {
    if (input.category === "pembahasan_soal") {
      role = "solusi";
    } else if (
      input.category === "soal" &&
      ["uts", "uas", "kuis", "tutorial", "kbf", "latihan"].includes(input.subcategory || "")
    ) {
      role = "soal";
    }
  }

  if (role && role !== catSegment && role !== descToken) {
    parts.push(role);
  }

  // 5. Year & Semester at the end
  let yearStr = "";
  if (input.year) {
    yearStr = String(input.year).trim();
    if (input.semester && !yearStr.includes("-")) {
      yearStr = `${yearStr}-${input.semester.toLowerCase()}`;
    }
  }

  if (yearStr) {
    parts.push(yearStr);
  }

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

export type BatchChapterInfo = {
  id: string;
  title: string;
  orderIndex: number;
};

const ROMAN_NUMERALS: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
};

export function parseChapterNumber(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (ROMAN_NUMERALS[trimmed] !== undefined) {
    return ROMAN_NUMERALS[trimmed];
  }
  return null;
}

export function detectChaptersFromFilename(
  filename: string,
  chapters: BatchChapterInfo[],
  subcategory?: CourseMaterialSubcategory | null
): string[] {
  if (!chapters.length) return [];
  if (chapters.length === 1) return [chapters[0].id];

  const base = stripPdfExtension(filename).toLowerCase();

  // 1. Check for UTS / UAS exam subcategory auto-assignment
  if (subcategory === "uts" || /\buts\b|ujian\s*tengah\s*semester/i.test(base)) {
    const midpoint = Math.max(1, Math.ceil(chapters.length / 2));
    const sorted = [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
    return sorted.slice(0, midpoint).map((c) => c.id);
  }
  if (subcategory === "uas" || /\buas\b|ujian\s*akhir\s*semester/i.test(base)) {
    const sorted = [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
    return sorted.map((c) => c.id);
  }
  if (subcategory === "up" || /\bup\b|ujian\s*perbaikan/i.test(base)) {
    const sorted = [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
    return sorted.map((c) => c.id);
  }

  // 2. Direct chapter patterns: "bab 0", "bab 1", "chapter 2", "ch 3", "modul 1", "tutorial 2", "kbf 1"
  let foundByNumber: BatchChapterInfo | null = null;
  const pattern = /(?:bab|chapter|ch|modul|module|minggu|week|w|tutorial|tut|kbf|kuis|quiz)\s*[-_:]?\s*([0-9]+|[ivxlcdm]+)\b/i;
  const match = base.match(pattern);
  if (match) {
    const num = parseChapterNumber(match[1]);
    if (num !== null) {
      foundByNumber = chapters.find(
        (c) =>
          c.orderIndex === num ||
          new RegExp(`\\bbab\\s*${num}\\b`, "i").test(c.title) ||
          new RegExp(`^${num}[\\.:\\s]`, "i").test(c.title)
      ) ?? null;
    }
  }

  // 3. Fallback: Check if full chapter title words appear in filename (e.g. "Pertaksamaan dan Fungsi", "Limit")
  let bestSemanticMatch: { chapter: BatchChapterInfo; length: number } | null = null;
  for (const ch of chapters) {
    const cleanTitle = ch.title
      .replace(/^bab\s*\d+\s*[:\.-]?\s*/i, "")
      .trim()
      .toLowerCase();
    if (cleanTitle.length >= 4 && base.includes(cleanTitle)) {
      if (!bestSemanticMatch || cleanTitle.length > bestSemanticMatch.length) {
        bestSemanticMatch = { chapter: ch, length: cleanTitle.length };
      }
    }
  }
  let foundBySemantic: BatchChapterInfo | null = bestSemanticMatch?.chapter ?? null;

  // 4. Keyword token match: check significant chapter words (e.g. "limit", "turunan", "integral")
  if (!foundBySemantic) {
    const stopWords = new Set(["dan", "atau", "pada", "untuk", "dengan", "dalam", "bab", "part", "bagian", "materi"]);
    let bestTokenMatch: { chapter: BatchChapterInfo; score: number } | null = null;
    for (const ch of chapters) {
      const cleanTitle = ch.title
        .replace(/^bab\s*\d+\s*[:\.-]?\s*/i, "")
        .trim()
        .toLowerCase();
      const tokens = cleanTitle
        .split(/[\s,–—\-_:]+/)
        .filter((w) => w.length >= 4 && !stopWords.has(w));
      const matchedTokens = tokens.filter((token) => {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(base);
      });
      if (matchedTokens.length > 0 && (!bestTokenMatch || matchedTokens.length > bestTokenMatch.score)) {
        bestTokenMatch = { chapter: ch, score: matchedTokens.length };
      }
    }
    foundBySemantic = bestTokenMatch?.chapter ?? null;
  }

  // Discrepancy resolver (e.g. campus Bab 0 vs Zyx Bab 1):
  // If chapter found by number does NOT mention any of its keywords in the filename,
  // or a more specific semantic full-title match exists, prefer the semantic match!
  if (foundByNumber && foundBySemantic && foundByNumber.id !== foundBySemantic.id) {
    const cleanSemanticTitle = foundBySemantic.title
      .replace(/^bab\s*\d+\s*[:\.-]?\s*/i, "")
      .trim()
      .toLowerCase();
    const cleanNumberTitle = foundByNumber.title
      .replace(/^bab\s*\d+\s*[:\.-]?\s*/i, "")
      .trim()
      .toLowerCase();

    if (
      base.includes(cleanSemanticTitle) &&
      (!base.includes(cleanNumberTitle) || cleanSemanticTitle.length > cleanNumberTitle.length)
    ) {
      return [foundBySemantic.id];
    }

    const numberChapTokens = foundByNumber.title
      .toLowerCase()
      .split(/[\s,–—\-_:]+/)
      .filter((w) => w.length >= 4 && !["dan", "atau", "pada", "untuk", "dengan", "dalam", "bab"].includes(w));
    const numberOverlaps = numberChapTokens.some((token) => {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(base);
    });
    if (!numberOverlaps) {
      return [foundBySemantic.id];
    }
    return [foundByNumber.id];
  }

  if (foundBySemantic) return [foundBySemantic.id];
  if (foundByNumber) return [foundByNumber.id];

  return [];
}

export interface DetectedFileMetadata {
  title: string;
  category: MaterialLevel1Category;
  subcategory: CourseMaterialSubcategory | null;
  year: number | null;
  chapterIds: string[];
  primaryChapterIndex: number | null;
  role: string | null;
}

/**
 * Comprehensive heuristic metadata extractor from a filename.
 * Used for both single upload auto-fill and batch upload ingestion.
 */
export function detectMetadataFromFilename(
  filename: string,
  chapters: BatchChapterInfo[] = []
): DetectedFileMetadata {
  const base = stripPdfExtension(filename);
  const detectedCategory = detectCategoryFromFilename(filename);
  const year = detectYear(filename);
  const chapterIds = detectChaptersFromFilename(
    filename,
    chapters,
    detectedCategory.subcategory
  );

  let primaryChapterIndex: number | null = null;
  if (chapterIds.length === 1) {
    const matched = chapters.find((c) => c.id === chapterIds[0]);
    if (matched) primaryChapterIndex = matched.orderIndex;
  }

  if (primaryChapterIndex === null) {
    const match = base.match(/(?:bab|chapter|ch|modul|module)\s*[-_:]?\s*([0-9]+|[ivxlcdm]+)\b/i);
    if (match) {
      primaryChapterIndex = parseChapterNumber(match[1]);
    }
  }

  // Clean title: remove course code, bab markers, years, semester, and clean whitespace
  let cleanTitle = base
    .replace(/[_-]+/g, " ")
    .replace(/\b[a-zA-Z]{2}\d{4}\b/gi, "") // e.g. MA1101, FI1101
    .replace(/\b(19|20)\d{2}\s*[-/]?\s*(19|20)?\d{2}\b/g, "") // e.g. 2022 2023, 2022-2023
    .replace(/\b(19|20)\d{2}\b/g, "") // e.g. 2024
    .replace(/\b(sem(ester)?\s*[12]|gasal|genap|ganjil|sp)\b/gi, "")
    .replace(/^(?:bab|chapter|ch|modul|module)\s*[-_:]?\s*([0-9]+|[ivxlcdm]+)\s*[-_:]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // If title was stripped down completely or only has punctuation, fall back
  if (!cleanTitle || /^[-_:\s]+$/.test(cleanTitle)) {
    cleanTitle = detectedCategory.subcategory
      ? detectedCategory.subcategory.replace("_", " ")
      : detectedCategory.category;
  }

  // Convert ALL CAPS title to Title Case for cleaner readability
  if (cleanTitle === cleanTitle.toUpperCase() && cleanTitle.length > 3 && /[A-Z]/.test(cleanTitle)) {
    cleanTitle = cleanTitle
      .toLowerCase()
      .split(" ")
      .map((word) => {
        const lower = word.toLowerCase();
        if (["dan", "atau", "di", "ke", "dari", "pada", "untuk", "dengan", "the", "of", "and", "in", "on"].includes(lower)) {
          return lower;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
    // Capitalize first character
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  }

  let role: string | null = null;
  if (detectedCategory.category === "pembahasan_soal") {
    role = "solusi";
  } else if (detectedCategory.category === "soal") {
    role = "soal";
  }

  return {
    title: cleanTitle,
    category: detectedCategory.category,
    subcategory: detectedCategory.subcategory,
    year,
    chapterIds,
    primaryChapterIndex,
    role,
  };
}

const LOWERCASE_WORDS = new Set([
  "dan",
  "atau",
  "di",
  "ke",
  "dari",
  "pada",
  "untuk",
  "dengan",
  "oleh",
  "the",
  "of",
  "and",
  "in",
  "on",
]);

const ACRONYM_WORDS = new Set([
  "itb",
  "tpb",
  "uts",
  "uas",
  "up",
  "ltm",
  "kbf",
  "scl",
  "ppt",
  "pdf",
  "doc",
  "mk",
  "ai",
]);

export function detectSessionFromFilename(filename: string): string | null {
  const match = filename.match(/(?:^|[^a-zA-Z0-9])sesi\s*[-_]?\s*([0-9]+|[a-zA-Z])(?=[^a-zA-Z0-9]|$)/i);
  if (!match) return null;
  const token = match[1].trim();
  if (/^\d+$/.test(token)) {
    return `Sesi ${token}`;
  }
  return `Sesi ${token.toUpperCase()}`;
}

export function detectPartNumberFromFilename(filename: string): number | null {
  const match = filename.match(/(?:^|[^a-zA-Z0-9])(?:bagian|part)\s*[-_]?\s*([0-9]+)(?=[^a-zA-Z0-9]|$)/i);
  if (match) return Number(match[1]);
  const exerciseMatch = filename.match(/(?:^|[^a-zA-Z0-9])(?:ltm|kuis|quiz|tutorial|tut|kbf|modul)\s*[-_]?\s*([0-9]+)(?=[^a-zA-Z0-9]|$)/i);
  if (exerciseMatch) return Number(exerciseMatch[1]);
  return null;
}

export interface CanonicalTitleOptions {
  courseCode?: string;
  category: MaterialLevel1Category;
  subcategory?: CourseMaterialSubcategory | string | null;
  chapterIndex?: number | null;
  chapterTitle?: string | null;
  year?: number | null;
  session?: string | null;
  partNumber?: number | null;
  qualifier?: MaterialRoleQualifier | string | null;
  customTopic?: string | null;
  isSolution?: boolean;
}

/**
 * Builds a clean, unique, collision-proof canonical document title according to Zyx Academy rules:
 * - No em dashes or en dashes
 * - No exclamation marks
 * - Sentence-case with uppercase official exam and course codes
 */
export function buildCanonicalDocumentTitle(opts: CanonicalTitleOptions): string {
  const {
    courseCode = "",
    category,
    subcategory,
    chapterIndex,
    chapterTitle,
    year,
    session,
    partNumber,
    qualifier = "utama",
    customTopic,
    isSolution = category === "pembahasan_soal",
  } = opts;

  const cleanCourse = courseCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cleanChapTitle = chapterTitle
    ? standardizeDocumentTitle(chapterTitle.replace(/^bab\s*\d+\s*[:\.-]?\s*/i, ""))
    : "";

  // 1. Comprehensive Exams: UTS, UAS, UP
  if (subcategory === "uts" || subcategory === "uas" || subcategory === "up") {
    const examLabel = subcategory.toUpperCase();
    const sessionStr = session ? ` ${session.trim()}` : "";
    const yearStr = year ? ` ${year}` : "";
    const courseStr = cleanCourse ? ` ${cleanCourse}` : "";

    if (isSolution) {
      return `Pembahasan ${examLabel}${courseStr}${sessionStr}${yearStr}`.replace(/\s+/g, " ").trim();
    }
    return `${examLabel}${courseStr}${sessionStr}${yearStr} (Soal)`.replace(/\s+/g, " ").trim();
  }

  // 2. Exercises: Tutorial, Kuis, KBF, LTM
  if (subcategory === "tutorial" || subcategory === "kuis" || subcategory === "kbf" || subcategory === "ltm") {
    const typeLabel = subcategory === "tutorial" ? "Tutorial" : subcategory.toUpperCase();
    const num = partNumber ? ` ${partNumber}` : "";
    const chapStr = chapterIndex ? `Bab ${chapterIndex}` : "";
    const topicStr = cleanChapTitle ? ` (${cleanChapTitle})` : (customTopic ? ` (${customTopic})` : "");
    const yearStr = year ? ` ${year}` : "";
    const courseStr = cleanCourse && (subcategory === "kbf" || subcategory === "ltm") ? ` ${cleanCourse}` : "";

    const middle = [chapStr, topicStr].filter(Boolean).join(" ");
    const content = middle ? `: ${middle}` : "";

    if (isSolution) {
      return `Pembahasan ${typeLabel}${num}${courseStr}${content}${yearStr}`.replace(/\s+/g, " ").trim();
    }
    return `${typeLabel}${num}${courseStr}${content}${yearStr}`.replace(/\s+/g, " ").trim();
  }

  // 3. E-Book / Diktat
  if (subcategory === "ebook" || subcategory === "diktat") {
    const topic = customTopic || cleanChapTitle || "Buku Teks";
    if (isSolution) {
      return `Pembahasan Buku Teks: ${topic}`;
    }
    return `Buku Teks: ${topic}`;
  }

  // 4. Chapter Materials (materi_dosen, scl, modul, lainnya)
  if (chapterIndex !== null && chapterIndex !== undefined && chapterIndex > 0) {
    const baseChap = `Bab ${chapterIndex}: ${cleanChapTitle || customTopic || "Materi"}`;

    if (subcategory === "scl") {
      return `SCL ${baseChap}`;
    }

    if (qualifier === "bagian" && partNumber) {
      return `${baseChap} (Bagian ${partNumber})`;
    }
    if (qualifier === "aplikasi") {
      const appTopic = customTopic ? `: ${customTopic}` : "";
      return `${baseChap} (Aplikasi${appTopic})`;
    }
    if (qualifier === "problem") {
      const probTopic = customTopic ? `: ${customTopic}` : "";
      return `${baseChap} (Contoh Problem${probTopic})`;
    }
    if (qualifier === "kustom" && customTopic) {
      return `${baseChap} (${customTopic})`;
    }

    if (subcategory === "modul") {
      return `Modul ${baseChap}`;
    }

    return baseChap;
  }

  if (subcategory === "scl") {
    const base = customTopic || cleanChapTitle || "Modul";
    return base.toLowerCase().startsWith("scl") ? base : `SCL ${base}`.replace(/\s*:\s*/g, ": ");
  }

  return customTopic || cleanChapTitle || "Dokumen Materi";
}

export function standardizeDocumentTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  const cleaned = rawTitle
    .replace(/\.pdf$/i, "")
    .replace(/[—–]/g, ", ")
    .replace(/!+/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const words = cleaned.split(" ");
  const formattedWords = words.map((word, index) => {
    const lower = word.toLowerCase();
    if (ACRONYM_WORDS.has(lower)) {
      return lower.toUpperCase();
    }
    if (index > 0 && LOWERCASE_WORDS.has(lower)) {
      return lower;
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  return formattedWords.join(" ");
}
