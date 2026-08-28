import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bab, courseMaterials, mataKuliah } from "@/db/schema";
import { normalizeLevel1Category, type MaterialLevel1Category } from "@/lib/course-materials";
import { normalizeDate } from "@/lib/date-utils";
import { storage } from "@/lib/storage";
import { isSafeKey, joinKey, slugifySegment } from "@/lib/storage/keys";
import {
  issueMcpSourceFileKey,
  readMcpCatalogScope,
  readMcpSourceFileKey,
  type McpSourceFileTokenPayload,
} from "@/lib/authoring/mcp-workflows";

export const AUTHORING_MCP_MAX_STORED_ORIGINAL_BYTES = 50 * 1024 * 1024;
export const AUTHORING_MCP_MAX_STORED_BLOB_BYTES = 32 * 1024 * 1024;
export const AUTHORING_MCP_MAX_TOTAL_ORIGINAL_BYTES = 96 * 1024 * 1024;
export const AUTHORING_MCP_PDF_PAGE_WIDTH = 1280;
export const AUTHORING_MCP_MAX_PAGES_PER_READ = 4;

export type StoredSourceScope = {
  courseId: string;
  chapterId: string;
  legacyCourseId: string;
  legacyChapterId: string;
};

export type StoredSourceFileRow = {
  id: string;
  courseId: string;
  title: string;
  type: "materi" | "soal" | "pembahasan_soal" | "materi_kelas" | "contoh_soal";
  subcategory: string | null;
  year: number | null;
  fileUrl: string;
  checksum: string | null;
  chapterIds: string[];
  updatedAt: Date | string | number;
};

export type SourceFilePage = {
  pageNumber: number;
  text: string;
  png: Uint8Array;
  width: number;
  height: number;
};

export type SourceFileDependencies = {
  resolveScope(courseKey: string, chapterKey: string): Promise<StoredSourceScope>;
  listRows(legacyCourseId: string): Promise<StoredSourceFileRow[]>;
  getRow(materialId: string): Promise<StoredSourceFileRow | null>;
  download(key: string): Promise<Uint8Array>;
  parsePages(bytes: Uint8Array, pages: number[]): Promise<{ totalPages: number; pages: SourceFilePage[] }>;
  issueFileKey(input: Parameters<typeof issueMcpSourceFileKey>[0]): string;
  readFileKey(fileKey: string): McpSourceFileTokenPayload;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function cursorOffset(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Number.isInteger(parsed.offset) || parsed.offset < 0) throw new Error();
    return parsed.offset;
  } catch {
    throw new Error("AUTHORING_MCP_SOURCE_CURSOR_INVALID");
  }
}

function nextCursor(offset: number | null): string | null {
  return offset === null ? null : Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function expectedMaterialPrefix(legacyCourseId: string): string {
  return joinKey("courses", slugifySegment(legacyCourseId), "materials");
}

function isEligibleStorageKey(key: string, legacyCourseId: string): boolean {
  if (!isSafeKey(key) || key.startsWith("http://") || key.startsWith("https://")) return false;
  return key.startsWith(`${expectedMaterialPrefix(legacyCourseId)}/`) && key.toLowerCase().endsWith(".pdf");
}

function rowUpdatedAtMs(row: StoredSourceFileRow): number {
  const value = normalizeDate(row.updatedAt).getTime();
  if (!Number.isFinite(value)) throw new Error("AUTHORING_MCP_SOURCE_FILE_INVALID");
  return value;
}

export function assertStoredSourceFileInScope(row: StoredSourceFileRow, token: McpSourceFileTokenPayload): void {
  if (
    row.id !== token.materialId ||
    row.fileUrl !== token.storageKey ||
    row.courseId !== token.legacyCourseId ||
    !Array.isArray(row.chapterIds) ||
    !row.chapterIds.includes(token.legacyChapterId)
  ) {
    throw new Error("AUTHORING_MCP_SOURCE_FILE_NOT_IN_SCOPE");
  }
  if (!isEligibleStorageKey(row.fileUrl, token.legacyCourseId)) {
    throw new Error("AUTHORING_MCP_SOURCE_FILE_UNAVAILABLE");
  }
  if (rowUpdatedAtMs(row) !== token.updatedAtMs || row.checksum !== token.checksum) {
    throw new Error("AUTHORING_MCP_SOURCE_FILE_STALE");
  }
}

async function resolveScope(courseKey: string, chapterKey: string): Promise<StoredSourceScope> {
  const scope = readMcpCatalogScope(courseKey, chapterKey);
  const [course] = await db
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(and(eq(mataKuliah.id, scope.courseId), eq(mataKuliah.status, "active")))
    .limit(1);
  if (!course) throw new Error("AUTHORING_MCP_COURSE_NOT_FOUND");
  if (!course.legacyCourseId) throw new Error("AUTHORING_MCP_LEGACY_COURSE_MAPPING_MISSING");

  const [chapter] = await db
    .select({ id: bab.id, legacyChapterId: bab.legacyChapterId })
    .from(bab)
    .where(and(eq(bab.id, scope.chapterId), eq(bab.mataKuliahId, course.id), eq(bab.status, "active")))
    .limit(1);
  if (!chapter) throw new Error("AUTHORING_MCP_CHAPTER_NOT_FOUND");
  if (!chapter.legacyChapterId) throw new Error("AUTHORING_MCP_LEGACY_CHAPTER_MAPPING_MISSING");

  return {
    courseId: course.id,
    chapterId: chapter.id,
    legacyCourseId: course.legacyCourseId,
    legacyChapterId: chapter.legacyChapterId,
  };
}

async function listRows(legacyCourseId: string): Promise<StoredSourceFileRow[]> {
  return db
    .select({
      id: courseMaterials.id,
      courseId: courseMaterials.courseId,
      title: courseMaterials.title,
      type: courseMaterials.type,
      subcategory: courseMaterials.subcategory,
      year: courseMaterials.year,
      fileUrl: courseMaterials.fileUrl,
      checksum: courseMaterials.checksum,
      chapterIds: courseMaterials.chapterIds,
      updatedAt: courseMaterials.updatedAt,
    })
    .from(courseMaterials)
    .where(eq(courseMaterials.courseId, legacyCourseId))
    .orderBy(asc(courseMaterials.title), asc(courseMaterials.id));
}

async function getRow(materialId: string): Promise<StoredSourceFileRow | null> {
  const [row] = await db
    .select({
      id: courseMaterials.id,
      courseId: courseMaterials.courseId,
      title: courseMaterials.title,
      type: courseMaterials.type,
      subcategory: courseMaterials.subcategory,
      year: courseMaterials.year,
      fileUrl: courseMaterials.fileUrl,
      checksum: courseMaterials.checksum,
      chapterIds: courseMaterials.chapterIds,
      updatedAt: courseMaterials.updatedAt,
    })
    .from(courseMaterials)
    .where(eq(courseMaterials.id, materialId))
    .limit(1);
  return row ?? null;
}

async function download(key: string): Promise<Uint8Array> {
  if (typeof storage.download !== "function") throw new Error("AUTHORING_MCP_SOURCE_DOWNLOAD_UNSUPPORTED");
  try {
    return await storage.download(key);
  } catch {
    throw new Error("AUTHORING_MCP_SOURCE_FILE_DOWNLOAD_FAILED");
  }
}

export async function parseStoredPdfPages(bytes: Uint8Array, pages: number[]): Promise<{ totalPages: number; pages: SourceFilePage[] }> {
  const { PDFParse } = await import("pdf-parse");
  const workerPath = path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  PDFParse.setWorker(pathToFileURL(workerPath).href);
  const parser = new PDFParse({ data: bytes });
  try {
    const info = await parser.getInfo();
    const totalPages = info.total;
    if (pages.some((page) => page > totalPages)) throw new Error("AUTHORING_MCP_SOURCE_PAGE_INVALID");
    const text = await parser.getText({ partial: pages });
    const screenshots = await parser.getScreenshot({
      partial: pages,
      desiredWidth: AUTHORING_MCP_PDF_PAGE_WIDTH,
      imageBuffer: true,
    });
    const textByPage = new Map(text.pages.map((page) => [page.num, page.text]));
    const imageByPage = new Map(screenshots.pages.map((page) => [page.pageNumber, page]));
    return {
      totalPages,
      pages: pages.map((pageNumber) => {
        const image = imageByPage.get(pageNumber);
        if (!image || image.data.byteLength === 0) throw new Error("AUTHORING_MCP_SOURCE_PAGE_RENDER_FAILED");
        return {
          pageNumber,
          text: textByPage.get(pageNumber) ?? "",
          png: image.data,
          width: image.width,
          height: image.height,
        };
      }),
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AUTHORING_MCP_")) throw error;
    throw new Error(classifyStoredPdfError(error));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export function classifyStoredPdfError(error: unknown): "AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED" | "AUTHORING_MCP_SOURCE_PDF_INVALID" {
  const message = error instanceof Error ? `${error.name}:${error.message}`.toLowerCase() : "";
  return message.includes("password")
    ? "AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED"
    : "AUTHORING_MCP_SOURCE_PDF_INVALID";
}

const defaultDependencies: SourceFileDependencies = {
  resolveScope,
  listRows,
  getRow,
  download,
  parsePages: parseStoredPdfPages,
  issueFileKey: issueMcpSourceFileKey,
  readFileKey: readMcpSourceFileKey,
};

export async function listStoredSourceFiles(
  input: {
    courseKey: string;
    chapterKey: string;
    categories?: MaterialLevel1Category[];
    cursor?: string;
    limit?: number;
  },
  dependencies: SourceFileDependencies = defaultDependencies,
) {
  const scope = await dependencies.resolveScope(input.courseKey, input.chapterKey);
  const categorySet = input.categories?.length ? new Set(input.categories) : null;
  const rows = (await dependencies.listRows(scope.legacyCourseId)).filter((row) => {
    if (row.courseId !== scope.legacyCourseId) return false;
    if (!Array.isArray(row.chapterIds) || !row.chapterIds.includes(scope.legacyChapterId)) return false;
    if (!isEligibleStorageKey(row.fileUrl, scope.legacyCourseId)) return false;
    return !categorySet || categorySet.has(normalizeLevel1Category(row.type));
  });
  const offset = cursorOffset(input.cursor);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const page = rows.slice(offset, offset + limit);
  const followingOffset = offset + page.length < rows.length ? offset + page.length : null;
  return {
    total: rows.length,
    nextCursor: nextCursor(followingOffset),
    files: page.map((row) => ({
      fileKey: dependencies.issueFileKey({
        materialId: row.id,
        storageKey: row.fileUrl,
        courseId: scope.courseId,
        chapterId: scope.chapterId,
        legacyCourseId: scope.legacyCourseId,
        legacyChapterId: scope.legacyChapterId,
        updatedAtMs: rowUpdatedAtMs(row),
        checksum: row.checksum,
      }),
      title: row.title,
      category: normalizeLevel1Category(row.type),
      subcategory: row.subcategory,
      year: row.year,
      checksum: row.checksum,
    })),
  };
}

async function loadFile(fileKey: string, dependencies: SourceFileDependencies) {
  const token = dependencies.readFileKey(fileKey);
  const row = await dependencies.getRow(token.materialId);
  if (!row) throw new Error("AUTHORING_MCP_SOURCE_FILE_NOT_FOUND");
  assertStoredSourceFileInScope(row, token);
  const bytes = await dependencies.download(row.fileUrl);
  if (bytes.byteLength === 0 || bytes.byteLength > AUTHORING_MCP_MAX_STORED_ORIGINAL_BYTES) {
    throw new Error("AUTHORING_MCP_SOURCE_FILE_SIZE_LIMIT");
  }
  const checksum = sha256(bytes);
  if (row.checksum && checksum !== row.checksum) throw new Error("AUTHORING_MCP_SOURCE_FILE_CHECKSUM_MISMATCH");
  return { token, row, bytes, checksum };
}

export async function readStoredSourceFile(
  input: { fileKey: string; mode?: "pages" | "blob"; pages?: number[] },
  dependencies: SourceFileDependencies = defaultDependencies,
) {
  const loaded = await loadFile(input.fileKey, dependencies);
  const mode = input.mode ?? "pages";
  if (mode === "blob") {
    if (loaded.bytes.byteLength > AUTHORING_MCP_MAX_STORED_BLOB_BYTES) {
      throw new Error("AUTHORING_MCP_SOURCE_BLOB_SIZE_LIMIT");
    }
    return {
      mode,
      title: loaded.row.title,
      checksum: loaded.checksum,
      size: loaded.bytes.byteLength,
      bytes: loaded.bytes,
    };
  }

  const pages = input.pages?.length ? input.pages : [1];
  if (
    pages.length > AUTHORING_MCP_MAX_PAGES_PER_READ ||
    pages.some((page) => !Number.isInteger(page) || page < 1) ||
    new Set(pages).size !== pages.length
  ) {
    throw new Error("AUTHORING_MCP_SOURCE_PAGE_INVALID");
  }
  const parsed = await dependencies.parsePages(loaded.bytes, pages);
  if (!Number.isInteger(parsed.totalPages) || parsed.totalPages < 1 || pages.some((page) => page > parsed.totalPages)) {
    throw new Error("AUTHORING_MCP_SOURCE_PAGE_INVALID");
  }
  return {
    mode,
    title: loaded.row.title,
    checksum: loaded.checksum,
    size: loaded.bytes.byteLength,
    totalPages: parsed.totalPages,
    pages: parsed.pages,
  };
}

export async function loadStoredOriginals(
  entries: readonly { documentId: string; fileKey: string }[],
  dependencies: SourceFileDependencies = defaultDependencies,
) {
  const originals = new Map<string, Uint8Array>();
  let boundScope: { courseId: string; chapterId: string } | null = null;
  let totalBytes = 0;
  for (const entry of entries) {
    if (originals.has(entry.documentId)) throw new Error(`SOURCE_PACK_ORIGINAL_DOCUMENT_DUPLICATE:${entry.documentId}`);
    const loaded = await loadFile(entry.fileKey, dependencies);
    const scope = { courseId: loaded.token.courseId, chapterId: loaded.token.chapterId };
    if (boundScope && (boundScope.courseId !== scope.courseId || boundScope.chapterId !== scope.chapterId)) {
      throw new Error("AUTHORING_MCP_SOURCE_FILE_SCOPE_MISMATCH");
    }
    boundScope = scope;
    totalBytes += loaded.bytes.byteLength;
    if (totalBytes > AUTHORING_MCP_MAX_TOTAL_ORIGINAL_BYTES) throw new Error("AUTHORING_MCP_ORIGINALS_LIMIT");
    originals.set(entry.documentId, loaded.bytes);
  }
  return { originals, boundScope, totalBytes };
}

export function mergeSourceOriginals(
  direct: ReadonlyMap<string, Uint8Array> | undefined,
  stored: Awaited<ReturnType<typeof loadStoredOriginals>>,
) {
  const merged = new Map<string, Uint8Array>();
  let totalBytes = stored.totalBytes;
  for (const [documentId, bytes] of direct ?? []) {
    if (stored.originals.has(documentId)) throw new Error(`SOURCE_PACK_ORIGINAL_DOCUMENT_DUPLICATE:${documentId}`);
    totalBytes += bytes.byteLength;
    if (totalBytes > AUTHORING_MCP_MAX_TOTAL_ORIGINAL_BYTES) throw new Error("AUTHORING_MCP_ORIGINALS_LIMIT");
    merged.set(documentId, bytes);
  }
  for (const [documentId, bytes] of stored.originals) merged.set(documentId, bytes);
  return {
    originals: merged.size > 0 ? merged : undefined,
    boundScope: stored.boundScope ?? undefined,
  };
}
