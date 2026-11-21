/**
 * lib/offline/reading-cache.ts
 *
 * Lightweight, account-scoped, storage-bounded IndexedDB LRU cache for
 * text-based reading materials (structured articles and markdown materi).
 *
 * Intentionally excludes heavy media (videos, PDFs) and caps storage at
 * 25 readings / 8 MB per user so student devices are never bloated.
 */

import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import type { CourseMaterial } from "@/lib/student-course-fixtures";

const DB_NAME = "zyx-offline-readings-v1";
const DB_VERSION = 1;
const STORE_NAME = "readings";

export const OFFLINE_CACHE_MAX_ENTRIES = 25;
export const OFFLINE_CACHE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB per user

export type OfflineReadingKind = "structured_article" | "course_material";

export interface OfflineReadingRecord {
  /** Composite key: `${userId}::${courseId}::${materialId}` */
  key: string;
  userId: string;
  courseId: string;
  materialId: string;
  kind: OfflineReadingKind;
  title: string;
  courseTitle?: string;
  chapterTitle?: string;
  estimatedMinutes?: number;
  sizeBytes: number;
  savedAt: number;
  lastAccessedAt: number;
  article?: PublicArticleReadModel;
  material?: Pick<CourseMaterial, "id" | "courseId" | "title" | "kind" | "body" | "docCategory" | "source">;
}

export interface OfflineReadingSummary {
  key: string;
  userId: string;
  courseId: string;
  materialId: string;
  kind: OfflineReadingKind;
  title: string;
  courseTitle?: string;
  chapterTitle?: string;
  estimatedMinutes?: number;
  sizeBytes: number;
  savedAt: number;
  lastAccessedAt: number;
}

export interface OfflineCacheStats {
  count: number;
  totalBytes: number;
  maxEntries: number;
  maxBytes: number;
}

function buildKey(userId: string, courseId: string, materialId: string): string {
  return `${userId}::${courseId}::${materialId}`;
}

function estimateJsonBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(serialized).byteLength;
    }
    return serialized.length * 2;
  } catch {
    return 0;
  }
}

export function isOfflineReadingCacheSupported(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isOfflineReadingCacheSupported()) {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("by_user", "userId", { unique: false });
        store.createIndex("by_user_accessed", ["userId", "lastAccessedAt"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

function toSummary(record: OfflineReadingRecord): OfflineReadingSummary {
  return {
    key: record.key,
    userId: record.userId,
    courseId: record.courseId,
    materialId: record.materialId,
    kind: record.kind,
    title: record.title,
    courseTitle: record.courseTitle,
    chapterTitle: record.chapterTitle,
    estimatedMinutes: record.estimatedMinutes,
    sizeBytes: record.sizeBytes,
    savedAt: record.savedAt,
    lastAccessedAt: record.lastAccessedAt,
  };
}

/**
 * Pure LRU eviction planner exported for unit testing.
 * Returns keys to delete so remaining entries fit within maxEntries and maxBytes.
 */
export function selectEvictionKeys(
  records: ReadonlyArray<{ key: string; sizeBytes: number; lastAccessedAt: number }>,
  maxEntries = OFFLINE_CACHE_MAX_ENTRIES,
  maxBytes = OFFLINE_CACHE_MAX_BYTES,
): string[] {
  const sorted = [...records].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let totalBytes = sorted.reduce((sum, item) => sum + item.sizeBytes, 0);
  let remainingCount = sorted.length;
  const toDelete: string[] = [];

  for (const item of sorted) {
    if (remainingCount <= maxEntries && totalBytes <= maxBytes) {
      break;
    }
    toDelete.push(item.key);
    remainingCount -= 1;
    totalBytes -= item.sizeBytes;
  }

  return toDelete;
}

async function getAllRecordsForUser(db: IDBDatabase, userId: string): Promise<OfflineReadingRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("by_user");
    const req = index.getAll(IDBKeyRange.only(userId));
    req.onsuccess = () => resolve((req.result as OfflineReadingRecord[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_read_failed"));
  });
}

async function putRecordAndEnforceQuota(record: OfflineReadingRecord): Promise<boolean> {
  if (!isOfflineReadingCacheSupported()) return false;
  if (record.sizeBytes <= 0 || record.sizeBytes > OFFLINE_CACHE_MAX_BYTES) {
    return false;
  }

  const db = await openDb();
  try {
    const existing = await getAllRecordsForUser(db, record.userId);
    const merged = existing.filter((item) => item.key !== record.key);
    merged.push(record);
    const evictKeys = selectEvictionKeys(merged, OFFLINE_CACHE_MAX_ENTRIES, OFFLINE_CACHE_MAX_BYTES);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      for (const key of evictKeys) {
        if (key !== record.key) {
          store.delete(key);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_write_failed"));
    });

    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export async function saveStructuredArticleOffline(
  userId: string,
  article: PublicArticleReadModel,
): Promise<boolean> {
  if (!userId || !article?.id || !article?.courseId) return false;
  const now = Date.now();
  const sizeBytes = estimateJsonBytes(article);
  return putRecordAndEnforceQuota({
    key: buildKey(userId, article.courseId, article.id),
    userId,
    courseId: article.courseId,
    materialId: article.id,
    kind: "structured_article",
    title: article.title,
    courseTitle: article.courseTitle,
    chapterTitle: article.chapterTitle ?? undefined,
    estimatedMinutes: article.totalEstimatedReadingMinutes,
    sizeBytes,
    savedAt: now,
    lastAccessedAt: now,
    article,
  });
}

export async function saveTextMaterialOffline(
  userId: string,
  material: CourseMaterial,
  courseTitle?: string,
): Promise<boolean> {
  // Only cache lightweight text/markdown articles; never cache PDFs or videos.
  if (!userId || !material?.id || !material?.courseId) return false;
  if (material.kind !== "article" || !material.body?.trim()) return false;

  const slimMaterial: OfflineReadingRecord["material"] = {
    id: material.id,
    courseId: material.courseId,
    title: material.title,
    kind: material.kind,
    body: material.body,
    docCategory: material.docCategory,
    source: material.source,
  };
  const now = Date.now();
  const sizeBytes = estimateJsonBytes(slimMaterial);
  return putRecordAndEnforceQuota({
    key: buildKey(userId, material.courseId, material.id),
    userId,
    courseId: material.courseId,
    materialId: material.id,
    kind: "course_material",
    title: material.title,
    courseTitle,
    sizeBytes,
    savedAt: now,
    lastAccessedAt: now,
    material: slimMaterial,
  });
}

export async function listOfflineReadings(userId?: string): Promise<OfflineReadingSummary[]> {
  if (!isOfflineReadingCacheSupported()) return [];
  const db = await openDb();
  try {
    const records = await new Promise<OfflineReadingRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = userId
        ? store.index("by_user").getAll(IDBKeyRange.only(userId))
        : store.getAll();
      req.onsuccess = () => resolve((req.result as OfflineReadingRecord[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error("indexeddb_list_failed"));
    });
    return records
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
      .map(toSummary);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function getOfflineReadingByKey(key: string): Promise<OfflineReadingRecord | null> {
  if (!isOfflineReadingCacheSupported() || !key) return null;
  const db = await openDb();
  try {
    const record = await new Promise<OfflineReadingRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const found = (req.result as OfflineReadingRecord | undefined) ?? null;
        if (found) {
          found.lastAccessedAt = Date.now();
          store.put(found);
        }
        resolve(found);
      };
      req.onerror = () => reject(req.error ?? new Error("indexeddb_get_failed"));
    });
    return record;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function removeOfflineReadingByKey(key: string): Promise<void> {
  if (!isOfflineReadingCacheSupported() || !key) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_delete_failed"));
    });
  } catch {
    // Non-fatal
  } finally {
    db.close();
  }
}

export async function clearOfflineReadingsForOtherUsers(currentUserId: string | null): Promise<void> {
  if (!isOfflineReadingCacheSupported()) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result as OfflineReadingRecord[]) ?? [];
        for (const item of records) {
          if (!currentUserId || item.userId !== currentUserId) {
            store.delete(item.key);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_clear_failed"));
    });
  } catch {
    // Non-fatal
  } finally {
    db.close();
  }
}

export async function clearAllOfflineReadings(): Promise<void> {
  return clearOfflineReadingsForOtherUsers(null);
}

export async function getOfflineCacheStats(userId?: string): Promise<OfflineCacheStats> {
  const items = await listOfflineReadings(userId);
  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  return {
    count: items.length,
    totalBytes,
    maxEntries: OFFLINE_CACHE_MAX_ENTRIES,
    maxBytes: OFFLINE_CACHE_MAX_BYTES,
  };
}

export function formatOfflineBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
