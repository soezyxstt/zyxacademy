import { z } from "zod";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { getCapacitor, getTauri } from "@/lib/native/runtime";
import { queryKeys } from "@/lib/query/keys";
import { readOfflineState, writeOfflineState } from "./cache-db";
import { captureOfflineScope, getOfflineScope, isOfflineScopeCurrent, type OfflineCacheScope, type OfflineScopeToken } from "./cache-scope";
import { offlineDescriptorSchema, offlineEnvelopeSchema } from "./client-validation";
import { DEFAULT_OFFLINE_POLICY, offlinePolicySchema } from "./sync-contract";
import { notifyOfflineCacheChanged, type NativeOfflineLibrarySnapshot, type OfflineMetadataSnapshot } from "./library-contract";

const course = z.object({ id: z.string().min(1), title: z.string() });
const librarySchema = z.object({ schemaVersion: z.literal(2), scopeKey: z.string(), environment: z.string(), userId: z.string(), locale: z.enum(["id", "en"]), sessionId: z.string().optional(), accessValidUntil: z.number(), lastVerifiedAt: z.number(), syncCursor: z.string().regex(/^\d+$/), enrollmentIds: z.array(z.string()).optional(), courses: z.array(course.extend({ accessValidUntil: z.number().optional(), chapterIds: z.array(z.string()).optional(), fullContent: z.boolean().optional() })).max(150), achievements: z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional(), icon: z.string().optional() })), materials: z.array(z.object({ id: z.string(), courseId: z.string(), title: z.string(), kind: z.string(), accessValidUntil: z.number().optional(), thumbnailUrl: z.string().optional(), videoUrl: z.string().optional(), contentVersion: z.string() })), policy: offlinePolicySchema, syncState: z.enum(["ready", "syncing", "error"]), syncError: z.enum(["network", "storage", "access"]).optional() });
export function emptyOfflineSnapshot(scope: OfflineCacheScope, initial?: NativeOfflineLibrarySnapshot): OfflineMetadataSnapshot {
  return { ...scope, schemaVersion: 2, accessValidUntil: 0, lastVerifiedAt: 0, syncCursor: "0", courses: [], achievements: [], materials: [], policy: DEFAULT_OFFLINE_POLICY, syncState: "ready", ...initial, resources: {}, manifests: {} };
}
export async function readOfflineLibrarySnapshot(userId?: string, includeExpired = false): Promise<OfflineMetadataSnapshot | null> {
  const scope = getOfflineScope(userId);
  if (!scope) return null;
  const raw = await readOfflineState<OfflineMetadataSnapshot>(`library:${scope.scopeKey}`).catch(() => null);
  const parsed = librarySchema.safeParse(raw);
  if (!parsed.success || parsed.data.scopeKey !== scope.scopeKey || parsed.data.userId !== scope.userId || parsed.data.environment !== scope.environment || parsed.data.locale !== scope.locale || (!includeExpired && parsed.data.accessValidUntil <= Date.now())) return null;
  const resources: OfflineMetadataSnapshot["resources"] = {};
  for (const [key, candidate] of Object.entries(raw?.resources ?? {}).slice(0, 301)) {
    try {
      const envelope = offlineEnvelopeSchema.parse(candidate);
      if (envelope.resource.key === key && envelope.accountId === scope.userId && envelope.environment === scope.environment && envelope.locale === scope.locale && envelope.resource.kind !== "article" && envelope.resource.kind !== "diktat") resources[key] = envelope;
    } catch { /* Corrupt metadata is refetched, never trusted as an ETag owner. */ }
  }
  const manifests: OfflineMetadataSnapshot["manifests"] = {};
  const manifestSchema = z.object({ cursor: z.string().regex(/^\d{1,19}$/), checkedAt: z.number().nonnegative(), resources: z.array(offlineDescriptorSchema).max(10000) });
  for (const [courseId, candidate] of Object.entries(raw?.manifests ?? {}).slice(0, 150)) {
    const manifest = manifestSchema.safeParse(candidate);
    if (manifest.success && manifest.data.resources.every(resource => resource.courseId === courseId)) manifests[courseId] = manifest.data;
  }
  return { ...parsed.data, resources, manifests };
}
export async function mirrorOfflineLibrarySnapshot(snapshot: NativeOfflineLibrarySnapshot): Promise<void> {
  const cap = getCapacitor()?.Plugins?.ZyxOfflineStore;
  const invoke = getTauri()?.core?.invoke;
  if (snapshot.accessValidUntil <= Date.now()) {
    await Promise.all([cap?.clearLibrarySnapshot?.(), invoke?.("clear_offline_library_snapshot")]);
    return;
  }
  const payloadJson = JSON.stringify(snapshot);
  const results = await Promise.all([cap?.saveLibrarySnapshot?.({ payloadJson }), invoke?.("save_offline_library_snapshot", { payloadJson })]);
  if (results.some(result => result === false || (result && typeof result === "object" && "saved" in result && result.saved === false))) throw new Error("offline_native_store_failed");
}
export function offlineMetadataByteLimit(maxBytes: number): number { return Math.min(8 * 1024 * 1024, Math.floor(maxBytes / 4)); }
export function offlineJsonBytes(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
export function boundOfflineMetadata(snapshot: OfflineMetadataSnapshot): OfflineMetadataSnapshot {
  const max = offlineMetadataByteLimit(snapshot.policy.maxBytes);
  if (offlineJsonBytes(snapshot) <= max) return snapshot;
  // Thumbnails are optional. Strip their duplicate data URLs before sacrificing
  // the course/material identity or dropping any required reading asset.
  const bounded = structuredClone(snapshot);
  for (const material of bounded.materials) delete material.thumbnailUrl;
  for (const resource of Object.values(bounded.resources)) {
    if (resource?.resource.kind === "video_catalog") {
      const catalog = resource.data as import("./sync-contract").OfflineVideoCatalog;
      for (const video of catalog.videos) video.thumbnailUrl = null;
    }
  }
  if (offlineJsonBytes(bounded) > max) throw new Error("offline_storage_unavailable");
  return bounded;
}
export async function writeOfflineLibrarySnapshot(snapshot: OfflineMetadataSnapshot, token: OfflineScopeToken): Promise<boolean> {
  if (!isOfflineScopeCurrent(token) || snapshot.scopeKey !== token.scope.scopeKey) return false;
  const bounded = boundOfflineMetadata(snapshot);
  const saved = await writeOfflineState(`library:${snapshot.scopeKey}`, bounded, () => isOfflineScopeCurrent(token));
  if (!isOfflineScopeCurrent(token)) return false;
  const { resources: _resources, manifests: _manifests, ...native } = bounded;
  await mirrorOfflineLibrarySnapshot(native);
  notifyOfflineCacheChanged();
  return saved;
}

export function parsePersistableQuery(key: QueryKey, data: unknown, userId: string): unknown | undefined {
  if (key[0] !== "zyx" || key[1] !== "account" || key[2] !== userId || key[3] !== "student") return undefined;
  if (key.length === 5 && key[4] === "enrollments") { const parsed = z.array(course).safeParse(data); return parsed.success ? parsed.data : undefined; }
  if (key.length === 6 && key[4] === "course" && typeof key[5] === "string") { const parsed = course.nullable().safeParse(data); return parsed.success && (!parsed.data || parsed.data.id === key[5]) ? parsed.data : undefined; }
  return undefined;
}
interface PersistedMetadataQuery { queryKey: QueryKey; data: unknown; dataUpdatedAt: number }
export async function attachOfflineQueryPersistence(client: QueryClient, scope: OfflineCacheScope): Promise<() => void> {
  const token = captureOfflineScope(scope.userId);
  if (!token || token.scope.scopeKey !== scope.scopeKey) return () => {};
  const snapshot = await readOfflineLibrarySnapshot(scope.userId);
  const stored = snapshot ? await readOfflineState<PersistedMetadataQuery[]>(`queries:${scope.scopeKey}`).catch(() => null) : null;
  if (!isOfflineScopeCurrent(token)) return () => {};
  for (const entry of Array.isArray(stored) ? stored : []) {
    if (!snapshot || entry.queryKey?.[4] !== "course") continue;
    const latestCourse = snapshot.courses.find(course => course.id === entry.queryKey[5]);
    if (!latestCourse || (latestCourse.accessValidUntil ?? snapshot.accessValidUntil) <= Date.now()) continue;
    const data = course.safeParse(parsePersistableQuery(entry.queryKey, entry.data, scope.userId));
    if (!data.success || data.data.title !== latestCourse.title || !Number.isFinite(entry.dataUpdatedAt) || entry.dataUpdatedAt > Date.now() || Date.now() - entry.dataUpdatedAt > snapshot.policy.retentionMs) continue;
    const current = client.getQueryState(entry.queryKey);
    if (!current?.dataUpdatedAt || current.dataUpdatedAt < entry.dataUpdatedAt) client.setQueryData(entry.queryKey, data.data, { updatedAt: entry.dataUpdatedAt });
  }
  // The authenticated sync snapshot also supplies a fast sidebar on a fresh
  // browser process, even before this process has persisted query state.
  if (snapshot && !client.getQueryData(queryKeys.student.enrollments(scope.userId))) client.setQueryData(queryKeys.student.enrollments(scope.userId), snapshot.courses.filter(course => (course.accessValidUntil ?? snapshot.accessValidUntil) > Date.now() && (!snapshot.enrollmentIds || snapshot.enrollmentIds.includes(course.id))).map(({ id, title }) => ({ id, title })), { updatedAt: snapshot.lastVerifiedAt });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const persist = () => {
    if (disposed || !isOfflineScopeCurrent(token)) return;
    const entries = client.getQueryCache().getAll().flatMap(query => {
      if (query.state.status !== "success") return [];
      const data = parsePersistableQuery(query.queryKey, query.state.data, scope.userId);
      return data === undefined ? [] : [{ queryKey: query.queryKey, data, dataUpdatedAt: query.state.dataUpdatedAt }];
    }).slice(0, 102);
    void writeOfflineState(`queries:${scope.scopeKey}`, entries, () => !disposed && isOfflineScopeCurrent(token)).catch(() => {});
  };
  const unsubscribe = client.getQueryCache().subscribe(event => {
    const key = event.query.queryKey;
    if (parsePersistableQuery(key, event.query.state.data, scope.userId) === undefined
      && !(event.type === "removed" && parsePersistableQuery(key, key.length === 5 ? [] : null, scope.userId) !== undefined)) return;
    clearTimeout(timer); timer = setTimeout(persist, 250);
  });
  return () => { persist(); disposed = true; clearTimeout(timer); unsubscribe(); };
}
