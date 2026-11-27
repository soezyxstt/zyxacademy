/**
 * lib/offline/reading-cache.ts
 *
 * Account, origin and language-scoped packages with server-issued access leases.
 * A version becomes readable only after its text and required images are stored.
 * Admin policy bounds retained packages; pinned downloads survive LRU eviction.
 * Video streams and assessment answers never enter this store.
 */

import { ApiError } from "@/lib/query/http";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { getCapacitor, getTauri } from "@/lib/native/runtime";
import { buildOfflineReadingSections, type NativeOfflineSection } from "./reading-sections";
import {
  clearOfflineReadingPositionsForOtherUsers,
  loadOfflineReadingPosition,
  removeOfflineReadingPosition,
  type OfflineReadingPosition,
} from "@/lib/offline/reading-position";
import { openOfflineDb as openDb, isOfflineStorageSupported, READING_STORE as STORE_NAME, clearOfflineStateExcept } from "./cache-db";
import { getOfflineScope, isOfflineAccountKnown, captureOfflineScope, isOfflineScopeCurrent, scopedReadingKey, setOfflineAccount, type OfflineCacheScope, type OfflineScopeToken } from "./cache-scope";
import { OFFLINE_HEADERS, offlineResourceUrl, DEFAULT_OFFLINE_POLICY, type OfflinePolicy, type OfflineResourceEnvelope } from "./sync-contract";
import { offlineMetadataByteLimit, offlineJsonBytes, readOfflineLibrarySnapshot } from "./metadata-cache";
import { notifyOfflineCacheChanged } from "./library-contract";
import { OFFLINE_PACKAGE_MAX_BYTES, collectSnapshotImageUrls, downloadOfflineImages, replaceOfflineAssetUrls } from "./asset-cache";
import type { CourseMaterial } from "@/lib/student-course-fixtures";

export type { NativeOfflineSection } from "./reading-sections";

const resourceGenerations = new Map<string, number>();
let readingCacheGeneration = 0;
export function offlineReadingGeneration(key: string): number { return readingCacheGeneration + (resourceGenerations.get(key) ?? 0); }

export const OFFLINE_CACHE_MAX_ENTRIES = DEFAULT_OFFLINE_POLICY.maxEntries;
export const OFFLINE_CACHE_MAX_BYTES = DEFAULT_OFFLINE_POLICY.maxBytes;

export type OfflineReadingKind = "structured_article" | "course_material";

export interface OfflineReadingRecord {
  /** Includes the account, origin, language, course and material. */
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
  schemaVersion?: 2;
  scopeKey?: string;
  environment?: string;
  locale?: "id" | "en";
  contentVersion?: string;
  contentCursor?: string;
  lastVerifiedAt?: number;
  accessValidUntil?: number;
  chapterIds?: string[];
  pinned?: boolean;
  assetsComplete?: boolean;
  nativeMirrored?: boolean;
  invalidated?: boolean;
  requiredCursor?: string;
  snapshot?: NativeOfflineSnapshot;
  article?: PublicArticleReadModel;
  material?: Pick<CourseMaterial, "id" | "courseId" | "title" | "kind" | "body" | "docCategory" | "source">;
}

export type OfflineReadingSummary = Omit<OfflineReadingRecord, "article" | "material" | "snapshot">;

export interface OfflineCacheStats {
  count: number;
  totalBytes: number;
  maxEntries: number;
  maxBytes: number;
}

function buildKey(userId: string, courseId: string, materialId: string): string {
  const scope = getOfflineScope(userId);
  return scope ? scopedReadingKey(scope, courseId, materialId) : "";
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

export const isOfflineReadingCacheSupported = isOfflineStorageSupported;
function toSummary(record: OfflineReadingRecord): OfflineReadingSummary {
  const { article: _article, material: _material, snapshot: _snapshot, ...summary } = record;
  return summary;
}

/**
 * Pure LRU eviction planner exported for unit testing.
 * Returns keys to delete so remaining entries fit within maxEntries and maxBytes.
 */
export function selectEvictionKeys(
  records: ReadonlyArray<{ key: string; sizeBytes: number; lastAccessedAt: number; pinned?: boolean }>,
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
    if (item.pinned) continue;
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

export interface NativeOfflineSnapshot {
  kind: OfflineReadingKind;
  chapterIds: string[];
  schemaVersion: 2;
  scopeKey: string;
  environment: string;
  locale: "id" | "en";
  contentVersion: string;
  contentCursor: string;
  lastVerifiedAt: number;
  accessValidUntil: number;
  pinned: boolean;
  assetsComplete: boolean;
  key: string;
  userId: string;
  courseId?: string;
  materialId?: string;
  title: string;
  courseTitle?: string;
  chapterTitle?: string;
  estimatedMinutes?: number;
  sizeBytes: number;
  savedAt: number;
  lastAccessedAt: number;
  readingPosition?: OfflineReadingPosition | null;
  sections: NativeOfflineSection[];
}

export function buildNativeOfflineSnapshot(record: OfflineReadingRecord): NativeOfflineSnapshot {
  if (record.snapshot) return { ...record.snapshot, readingPosition: loadOfflineReadingPosition(record.key), lastAccessedAt: record.lastAccessedAt, pinned: Boolean(record.pinned), accessValidUntil: record.accessValidUntil ?? 0, lastVerifiedAt: record.lastVerifiedAt ?? 0 };
  const sections = buildOfflineReadingSections(record);

  const savedPosition = loadOfflineReadingPosition(record.key);

  return {
    kind: record.kind,
    chapterIds: record.chapterIds ?? [],
    schemaVersion: 2,
    scopeKey: record.scopeKey ?? "",
    environment: record.environment ?? "",
    locale: record.locale ?? "id",
    contentVersion: record.contentVersion ?? "",
    contentCursor: record.contentCursor ?? "0",
    lastVerifiedAt: record.lastVerifiedAt ?? 0,
    accessValidUntil: record.accessValidUntil ?? 0,
    pinned: Boolean(record.pinned),
    assetsComplete: Boolean(record.assetsComplete),
    key: record.key,
    userId: record.userId,
    courseId: record.courseId,
    materialId: record.materialId,
    title: record.title,
    courseTitle: record.courseTitle,
    chapterTitle: record.chapterTitle,
    estimatedMinutes: record.estimatedMinutes,
    sizeBytes: record.sizeBytes,
    savedAt: record.savedAt,
    lastAccessedAt: record.lastAccessedAt,
    readingPosition: savedPosition,
    sections,
  };
}

export async function mirrorSaveToNativeStore(record: OfflineReadingRecord): Promise<boolean> {
  const capStore = getCapacitor()?.Plugins?.ZyxOfflineStore;
  const tauriInvoke = getTauri()?.core?.invoke;
  if (!capStore?.saveReading && !tauriInvoke) return true;
  try {
    const payloadJson = JSON.stringify(buildNativeOfflineSnapshot(record));
    const results = await Promise.all([
      capStore?.saveReading({ key: record.key, payloadJson }),
      tauriInvoke?.("save_offline_reading", { key: record.key, payloadJson }),
    ]);
    return !results.some(result => result === false || (result && typeof result === "object" && "saved" in result && result.saved === false));
  } catch { return false; }
}

/** Revisions are opaque hashes; commit cursors prevent late responses regressing data. */
export function canReplaceOfflineRecord(current: OfflineReadingRecord | undefined, candidate: OfflineReadingRecord): boolean {
  if (candidate.schemaVersion !== 2 || !candidate.assetsComplete || !candidate.contentCursor) return false;
  if (current?.scopeKey && current.scopeKey !== candidate.scopeKey) return false;
  if (BigInt(candidate.contentCursor) < BigInt(current?.contentCursor ?? "0")) return false;
  if (BigInt(candidate.contentCursor) < BigInt(current?.requiredCursor ?? "0")) return false;
  return true;
}
export function isOfflineRecordReadable(record: OfflineReadingRecord, scope: OfflineCacheScope, now = Date.now()): boolean {
  return record.schemaVersion === 2 && record.scopeKey === scope.scopeKey && record.userId === scope.userId && record.assetsComplete === true && (record.accessValidUntil ?? 0) > now;
}
export async function putOfflineReading(record: OfflineReadingRecord, token: OfflineScopeToken, policy: OfflinePolicy = DEFAULT_OFFLINE_POLICY, canWrite: () => boolean = () => true): Promise<boolean> {
  if (!isOfflineReadingCacheSupported() || !isOfflineScopeCurrent(token) || !canWrite() || record.sizeBytes <= 0 || record.sizeBytes > Math.min(policy.maxBytes, OFFLINE_PACKAGE_MAX_BYTES)) return false;
  const readingByteLimit = policy.maxBytes - offlineMetadataByteLimit(policy.maxBytes);
  const db = await openDb();
  let saved = false;
  const removed: string[] = [];
  try {
    if (!isOfflineScopeCurrent(token) || !canWrite()) return false;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.index("by_user").getAll(IDBKeyRange.only(record.userId));
      request.onsuccess = () => {
        if (!isOfflineScopeCurrent(token) || !canWrite()) { tx.abort(); return; }
        const records = (request.result as OfflineReadingRecord[]).filter(item => item.scopeKey === token.scope.scopeKey);
        const existing = records.find(item => item.key === record.key);
        if (!canReplaceOfflineRecord(existing, record)) return;
        record.pinned = record.pinned || existing?.pinned || false;
        record.lastAccessedAt = Math.max(record.lastAccessedAt, existing?.lastAccessedAt ?? 0);
        const merged = [...records.filter(item => item.key !== record.key), record];
        const evictions = selectEvictionKeys(merged, policy.maxEntries, readingByteLimit);
        const retained = merged.filter(item => !evictions.includes(item.key));
        if (evictions.includes(record.key) || retained.length > policy.maxEntries || retained.reduce((sum, item) => sum + item.sizeBytes, 0) > readingByteLimit) return;
        store.put(record);
        for (const key of evictions) { store.delete(key); removed.push(key); }
        saved = true;
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_write_failed"));
      tx.onabort = () => resolve();
    });
    if (saved && isOfflineScopeCurrent(token)) {
      for (const key of removed) void removeNativeReading(key).catch(() => {});
      const mirrored = await mirrorSaveToNativeStore(record);
      if (isOfflineScopeCurrent(token)) await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); const request = store.get(record.key);
        request.onsuccess = () => {
          const latest = request.result as OfflineReadingRecord | undefined;
          if (latest && latest.contentVersion === record.contentVersion && latest.contentCursor === record.contentCursor && isOfflineScopeCurrent(token)) store.put({ ...latest, nativeMirrored: mirrored });
        };
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      notifyOfflineCacheChanged();
      if (!mirrored) return false;
    }
    return saved && isOfflineScopeCurrent(token);
  } catch { return false; }
  finally { db.close(); }
}

/** Finish the whole image package before opening the transaction that replaces it. */
export async function cacheOfflineResource(envelope: OfflineResourceEnvelope, token: OfflineScopeToken, options: { fetcher?: typeof fetch; signal?: AbortSignal; policy?: OfflinePolicy; pinned?: boolean; canWrite?: () => boolean } = {}): Promise<boolean> {
  if ((envelope.resource.kind !== "article" && envelope.resource.kind !== "diktat") || !envelope.resource.courseId || !isOfflineScopeCurrent(token)) return false;
  if (envelope.accountId !== token.scope.userId || envelope.environment !== token.scope.environment || envelope.locale !== token.scope.locale || envelope.leaseExpiresAt <= Date.now()) return false;
  const now = Date.now();
  const record: OfflineReadingRecord = {
    key: scopedReadingKey(token.scope, envelope.resource.courseId, envelope.resource.id), userId: token.scope.userId,
    courseId: envelope.resource.courseId, materialId: envelope.resource.id,
    kind: envelope.resource.kind === "article" ? "structured_article" : "course_material", title: envelope.resource.title,
    schemaVersion: 2, scopeKey: token.scope.scopeKey, environment: token.scope.environment, locale: token.scope.locale,
    contentVersion: envelope.resource.revision, contentCursor: envelope.cursor, lastVerifiedAt: envelope.validatedAt,
    accessValidUntil: envelope.leaseExpiresAt, chapterIds: envelope.resource.chapterIds, pinned: options.pinned ?? false,
    assetsComplete: false, savedAt: now, lastAccessedAt: now, sizeBytes: 0,
    ...(envelope.resource.kind === "article" ? { article: envelope.data as PublicArticleReadModel } : { material: envelope.data as OfflineReadingRecord["material"] }),
  };
  if (record.article) { record.courseTitle = record.article.courseTitle; record.chapterTitle = record.article.chapterTitle ?? undefined; record.estimatedMinutes = record.article.totalEstimatedReadingMinutes; }
  const snapshot = buildNativeOfflineSnapshot(record);
  const urls = collectSnapshotImageUrls(snapshot.sections.map(section => section.bodyHtml ?? "").join("\n"));
  const assets = [...envelope.assets];
  for (const url of urls) if (!assets.some(asset => asset.url === url)) assets.push({ url, required: true });
  try {
    const images = await downloadOfflineImages({ assets, identity: envelope, resource: envelope.resource, fetcher: options.fetcher ?? fetch, signal: options.signal, maxBytes: Math.min(options.policy?.maxBytes ?? OFFLINE_CACHE_MAX_BYTES, OFFLINE_PACKAGE_MAX_BYTES) - estimateJsonBytes(record) });
    if (!isOfflineScopeCurrent(token) || options.signal?.aborted || options.canWrite?.() === false) return false;
    record.accessValidUntil = Math.min(envelope.leaseExpiresAt, ...images.map(image => image.leaseExpiresAt ?? envelope.leaseExpiresAt));
    if (images.length) {
      // Large image downloads may overlap a publication or enrollment change.
      // Recheck the unchanged package before exposing it as complete.
      const headers = new Headers({ "If-None-Match": `"${envelope.resource.revision}"`, [OFFLINE_HEADERS.accountId]: envelope.accountId, [OFFLINE_HEADERS.sessionId]: envelope.sessionId });
      const response = await (options.fetcher ?? fetch)(offlineResourceUrl(envelope.resource, envelope.locale), { headers, cache: "no-store", credentials: "same-origin", signal: options.signal });
      if (response.status === 401 || response.status === 403 || response.status === 404) throw new ApiError(response.status, "Offline access changed");
      const lease = Number(response.headers.get(OFFLINE_HEADERS.leaseExpiresAt));
      if (response.status !== 304 || response.headers.get(OFFLINE_HEADERS.accountId) !== envelope.accountId || response.headers.get(OFFLINE_HEADERS.sessionId) !== envelope.sessionId || response.headers.get(OFFLINE_HEADERS.environment) !== envelope.environment || response.headers.get(OFFLINE_HEADERS.locale) !== envelope.locale || response.headers.get(OFFLINE_HEADERS.revision) !== envelope.resource.revision || !Number.isFinite(lease) || lease <= Date.now()) return false;
      record.accessValidUntil = Math.min(record.accessValidUntil, lease);
    }
    if (!isOfflineScopeCurrent(token) || options.signal?.aborted || options.canWrite?.() === false || record.accessValidUntil <= Date.now()) return false;
    record.article = replaceOfflineAssetUrls(record.article, images);
    record.material = replaceOfflineAssetUrls(record.material, images);
    record.assetsComplete = true;
    record.snapshot = { ...replaceOfflineAssetUrls(snapshot, images), assetsComplete: true, accessValidUntil: record.accessValidUntil };
    record.sizeBytes = estimateJsonBytes(record);
    record.snapshot.sizeBytes = record.sizeBytes;
    return putOfflineReading(record, token, options.policy, options.canWrite);
  } catch (error) { if (error instanceof ApiError) throw error; return false; }
}

export async function listOfflineReadingRecords(userId?: string, includeExpired = false): Promise<OfflineReadingRecord[]> {
  const scope = getOfflineScope(userId);
  if (!isOfflineReadingCacheSupported() || !scope) return [];
  const db = await openDb();
  try {
    const records = await getAllRecordsForUser(db, scope.userId);
    return records.filter(record => record.scopeKey === scope.scopeKey && record.schemaVersion === 2 && (includeExpired || isOfflineRecordReadable(record, scope))).sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  } catch { return []; }
  finally { db.close(); }
}
export async function listOfflineReadings(userId?: string): Promise<OfflineReadingSummary[]> {
  return (await listOfflineReadingRecords(userId, true)).map(toSummary);
}
export async function getOfflineReadingByKey(key: string, options: { includeExpired?: boolean } = {}): Promise<OfflineReadingRecord | null> {
  const scope = getOfflineScope();
  if (!isOfflineReadingCacheSupported() || !scope || !key) return null;
  const db = await openDb();
  try {
    return await new Promise<OfflineReadingRecord | null>((resolve, reject) => {
      let found: OfflineReadingRecord | null = null;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const candidate = request.result as OfflineReadingRecord | undefined;
        if (!candidate || candidate.scopeKey !== scope.scopeKey || candidate.schemaVersion !== 2 || (!options.includeExpired && !isOfflineRecordReadable(candidate, scope))) return;
        found = { ...candidate, lastAccessedAt: Date.now() };
        if (getOfflineScope()?.scopeKey !== scope.scopeKey) { found = null; return; }
        store.put(found);
      };
      tx.oncomplete = () => resolve(found);
      tx.onerror = () => reject(tx.error);
    });
  } catch { return null; }
  finally { db.close(); }
}
export async function getOfflineReading(userId: string, courseId: string, materialId: string): Promise<OfflineReadingRecord | null> {
  return getOfflineReadingByKey(buildKey(userId, courseId, materialId));
}
async function removeNativeReading(key: string): Promise<void> {
  removeOfflineReadingPosition(key);
  await Promise.all([
    getCapacitor()?.Plugins?.ZyxOfflineStore?.removeReading({ key }),
    getTauri()?.core?.invoke?.("remove_offline_reading", { key }),
  ]);
}
export async function removeOfflineReadingByKey(key: string): Promise<void> {
  if (!key) return;
  resourceGenerations.set(key, (resourceGenerations.get(key) ?? 0) + 1);
  if (!isOfflineReadingCacheSupported()) { await removeNativeReading(key); return; }
  const db = await openDb();
  const update = (quarantine: boolean) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (quarantine) {
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result as OfflineReadingRecord | undefined;
        if (record) store.put({ ...record, accessValidUntil: 0 });
      };
    } else store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  try {
    if (getCapacitor()?.Plugins?.ZyxOfflineStore || getTauri()?.core?.invoke) {
      // Keep enough identity to retry a failed native deletion. The browser
      // package becomes unreadable before waiting on the bridge.
      await update(true);
      notifyOfflineCacheChanged();
    }
    await removeNativeReading(key);
    await update(false);
    notifyOfflineCacheChanged();
  } finally { db.close(); }
}
export function canApplyOfflineValidation(record: OfflineReadingRecord, validation: { cursor: string; generation: number }): boolean {
  return validation.generation === offlineReadingGeneration(record.key)
    && BigInt(validation.cursor) >= BigInt(record.requiredCursor ?? "0")
    && BigInt(validation.cursor) >= BigInt(record.contentCursor ?? "0");
}
export async function updateOfflineReadingMetadata(key: string, patch: Pick<Partial<OfflineReadingRecord>, "pinned" | "invalidated" | "requiredCursor" | "lastVerifiedAt" | "accessValidUntil">, validation?: { cursor: string; generation: number }): Promise<boolean> {
  const token = getOfflineScope() ? captureOfflineScope(getOfflineScope()!.userId) : null;
  if (!token || !isOfflineReadingCacheSupported()) return false;
  const db = await openDb();
  let updated: OfflineReadingRecord | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result as OfflineReadingRecord | undefined;
        if (!record || record.scopeKey !== token.scope.scopeKey || !isOfflineScopeCurrent(token)) return;
        if (patch.invalidated === false && (!validation || !canApplyOfflineValidation(record, validation))) return;
        updated = { ...record, ...patch, nativeMirrored: false };
        if (patch.requiredCursor && BigInt(record.requiredCursor ?? "0") > BigInt(patch.requiredCursor)) updated.requiredCursor = record.requiredCursor;
        store.put(updated);
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    if (updated && isOfflineScopeCurrent(token)) {
      const mirrored = await mirrorSaveToNativeStore(updated);
      const expected = updated;
      if (mirrored && isOfflineScopeCurrent(token)) await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); const request = store.get(key);
        request.onsuccess = () => {
          const latest = request.result as OfflineReadingRecord | undefined;
          if (latest && latest.contentVersion === expected.contentVersion && latest.contentCursor === expected.contentCursor && latest.lastVerifiedAt === expected.lastVerifiedAt && latest.pinned === expected.pinned && isOfflineScopeCurrent(token)) store.put({ ...latest, nativeMirrored: true });
        };
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
      notifyOfflineCacheChanged();
      if (!mirrored) throw new Error("offline_native_store_failed");
      return true;
    }
    return false;
  } finally { db.close(); }
}
export async function setOfflineReadingPinned(key: string, pinned: boolean): Promise<boolean> { return updateOfflineReadingMetadata(key, { pinned }); }
export async function clearOfflineReadingsForOtherUsers(currentUserId: string | null): Promise<void> {
  if (currentUserId && getOfflineScope()?.userId !== currentUserId) {
    if (isOfflineAccountKnown()) return;
    setOfflineAccount(currentUserId);
  }
  if (!currentUserId) setOfflineAccount(null);
  const scope = getOfflineScope(currentUserId ?? undefined);
  clearOfflineReadingPositionsForOtherUsers(currentUserId);
  void getCapacitor()?.Plugins?.ZyxOfflineStore?.clearOtherUsers({ userId: currentUserId ?? "" }).catch(() => {});
  void getTauri()?.core?.invoke?.("clear_other_offline_users", { userId: currentUserId ?? "" }).catch(() => {});
  await clearOfflineStateExcept(scope?.scopeKey ?? null).catch(() => {});
  if (!isOfflineReadingCacheSupported()) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); const request = store.getAll();
      request.onsuccess = () => {
        for (const item of request.result as OfflineReadingRecord[]) if (!scope || item.scopeKey !== scope.scopeKey) { store.delete(item.key); void removeNativeReading(item.key).catch(() => {}); }
      };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    notifyOfflineCacheChanged();
  } finally { db.close(); }
}
export async function clearAllOfflineReadings(): Promise<void> {
  const scope = getOfflineScope();
  const token = scope ? captureOfflineScope(scope.userId) : null;
  if (!token) return;
  // Storage cleanup does not sign out or dispose the active sync controller.
  // Keep the small authenticated library/grants required by the native bridge,
  // but fence every package request that began before this explicit clear.
  readingCacheGeneration += 1;
  const keys = new Set<string>();
  const cap = getCapacitor()?.Plugins?.ZyxOfflineStore;
  const invoke = getTauri()?.core?.invoke;
  const native = cap ? await cap.listReadings({ includeExpired: true }) : await invoke?.<{ items?: Array<Record<string, unknown>> }>("list_offline_readings", { includeExpired: true });
  if (!isOfflineScopeCurrent(token)) return;
  for (const item of native?.items ?? []) if (item.scopeKey === token.scope.scopeKey && typeof item.key === "string") keys.add(item.key);
  if (isOfflineReadingCacheSupported()) {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.index("by_user").getAll(IDBKeyRange.only(token.scope.userId));
        request.onsuccess = () => {
          if (!isOfflineScopeCurrent(token)) return;
          for (const record of request.result as OfflineReadingRecord[]) if (record.scopeKey === token.scope.scopeKey) { keys.add(record.key); store.delete(record.key); }
        };
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  if (!isOfflineScopeCurrent(token)) return;
  await Promise.all([...keys].map(async key => {
    removeOfflineReadingPosition(key);
    await Promise.all([cap?.removeReading({ key }), invoke?.("remove_offline_reading", { key })]);
  }));
  notifyOfflineCacheChanged();
}
export async function getOfflineCacheStats(userId?: string): Promise<OfflineCacheStats> {
  const [items, metadata] = await Promise.all([listOfflineReadings(userId), readOfflineLibrarySnapshot(userId, true)]);
  return { count: items.length, totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0) + (metadata ? offlineJsonBytes(metadata) : 0), maxEntries: metadata?.policy.maxEntries ?? OFFLINE_CACHE_MAX_ENTRIES, maxBytes: metadata?.policy.maxBytes ?? OFFLINE_CACHE_MAX_BYTES };
}
export function formatOfflineBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The local native origin imports only snapshots from its confirmed remote scope. */
export async function hydrateNativeOfflineReadings(scope: OfflineCacheScope): Promise<void> {
  const token = captureOfflineScope(scope.userId);
  if (!token || token.scope.scopeKey !== scope.scopeKey || !isOfflineReadingCacheSupported()) return;
  const cap = getCapacitor()?.Plugins?.ZyxOfflineStore;
  const invoke = getTauri()?.core?.invoke;
  let items: Array<Record<string, unknown>> = [];
  try {
    if (cap) items = (await cap.listReadings({ includeExpired: true })).items ?? [];
    else if (invoke) items = (await invoke<{ items?: Array<Record<string, unknown>> }>("list_offline_readings", { includeExpired: true })).items ?? [];
  } catch { return; }
  for (const item of items.slice(0, 1000)) {
    if (!isOfflineScopeCurrent(token) || item.scopeKey !== scope.scopeKey || typeof item.key !== "string" || typeof item.courseId !== "string" || typeof item.materialId !== "string") continue;
    let snapshot: NativeOfflineSnapshot | null = null;
    try {
      const result = cap ? await cap.getReading({ key: item.key }) : await invoke?.<{ reading?: Record<string, unknown> | null }>("get_offline_reading", { key: item.key });
      const raw = result?.reading;
      if (raw && raw.schemaVersion === 2 && raw.scopeKey === scope.scopeKey && Array.isArray(raw.sections) && raw.sections.every(section => section && typeof section === "object" && typeof section.heading === "string" && typeof section.body === "string") && typeof raw.accessValidUntil === "number" && raw.accessValidUntil > Date.now()) snapshot = raw as unknown as NativeOfflineSnapshot;
    } catch { /* Expired records retain only their id and explicit download choice. */ }
    if (!isOfflineScopeCurrent(token)) return;
    const record: OfflineReadingRecord = {
      key: item.key, userId: scope.userId, courseId: item.courseId, materialId: item.materialId,
      kind: item.kind === "structured_article" ? "structured_article" : "course_material", title: typeof item.title === "string" ? item.title : "",
      schemaVersion: 2, scopeKey: scope.scopeKey, environment: scope.environment, locale: scope.locale,
      contentVersion: typeof item.contentVersion === "string" ? item.contentVersion : "", contentCursor: typeof item.contentCursor === "string" && /^\d+$/.test(item.contentCursor) ? item.contentCursor : "0",
      lastVerifiedAt: typeof item.lastVerifiedAt === "number" ? item.lastVerifiedAt : 0, accessValidUntil: typeof item.accessValidUntil === "number" ? item.accessValidUntil : 0,
      chapterIds: Array.isArray(item.chapterIds) ? item.chapterIds.filter((id): id is string => typeof id === "string") : [], pinned: item.pinned === true,
      assetsComplete: Boolean(snapshot?.assetsComplete), nativeMirrored: Boolean(snapshot), invalidated: !snapshot, sizeBytes: snapshot ? estimateJsonBytes(snapshot) : 0,
      savedAt: typeof item.savedAt === "number" ? item.savedAt : 0, lastAccessedAt: typeof item.lastAccessedAt === "number" ? item.lastAccessedAt : 0,
      ...(snapshot ? { snapshot } : {}),
    };
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); const request = store.get(record.key);
        request.onsuccess = () => {
          const existing = request.result as OfflineReadingRecord | undefined;
          if (isOfflineScopeCurrent(token) && (!existing || BigInt(existing.contentCursor ?? "0") < BigInt(record.contentCursor ?? "0") || (!existing.assetsComplete && record.assetsComplete))) store.put(record);
        };
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
}
