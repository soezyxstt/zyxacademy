import type { QueryClient } from "@tanstack/react-query";
import { ApiError, ApiResponseError } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";
import { getCapacitor } from "@/lib/native/runtime";
import { isOfflineScheduledCheckDue } from "@/lib/date-utils";
import { captureOfflineScope, isOfflineScopeCurrent, scopedReadingKey, subscribeOfflineScope, type OfflineCacheScope, type OfflineScopeToken } from "./cache-scope";
import { offlineEnvelopeSchema, offlineManifestResponseSchema, offlineSyncResponseSchema } from "./client-validation";
import { OFFLINE_HEADERS, offlineResourceKey, offlineResourceUrl, type OfflineCourseAccess, type OfflineManifestResponse, type OfflinePolicy, type OfflineResourceDescriptor, type OfflineResourceEnvelope,  type OfflineSyncResponse, type OfflineVideoCatalog, type OfflineAchievementCatalog, type OfflineCourseOutline } from "./sync-contract";
import { boundOfflineMetadata, emptyOfflineSnapshot, readOfflineLibrarySnapshot, writeOfflineLibrarySnapshot } from "./metadata-cache";
import { cacheOfflineResource, offlineReadingGeneration, listOfflineReadingRecords, removeOfflineReadingByKey, updateOfflineReadingMetadata, type OfflineReadingRecord } from "./reading-cache";
import { downloadOfflineImages, replaceOfflineAssetUrls } from "./asset-cache";
import { OFFLINE_RESOURCE_CHANGED_EVENT, requestOfflineSync, type NativeOfflineLibrarySnapshot, type OfflineMetadataSnapshot } from "./library-contract";

const watchedResources = new Map<string, { scopeKey: string; resource: OfflineResourceRequest; count: number }>();

export type OfflineResourceRequest = Pick<OfflineResourceDescriptor, "kind" | "id" | "courseId">;
export interface OfflineSyncRepository {
  readSnapshot: () => Promise<OfflineMetadataSnapshot | null>;
  writeSnapshot: (snapshot: OfflineMetadataSnapshot, token: OfflineScopeToken) => Promise<boolean>;
  listReadings: () => Promise<OfflineReadingRecord[]>;
  removeReading: (key: string) => Promise<void>;
  patchReading: (key: string, patch: Pick<Partial<OfflineReadingRecord>, "pinned" | "invalidated" | "requiredCursor" | "lastVerifiedAt" | "accessValidUntil">, validation?: { cursor: string; generation: number }) => Promise<boolean>;
  cacheReading: (envelope: OfflineResourceEnvelope, token: OfflineScopeToken, options: { fetcher: typeof fetch; signal: AbortSignal; policy: OfflinePolicy; pinned?: boolean; canWrite?: () => boolean }) => Promise<boolean>;
}
export interface OfflineSyncController {
  sync: () => Promise<void>;
  refreshResource: (resource: OfflineResourceRequest, options?: { pinned?: boolean; force?: boolean }) => Promise<boolean>;
  snapshot: () => Promise<OfflineMetadataSnapshot>;
  dispose: () => void;
}
export function compareOfflineCursors(a: string, b: string): number { return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0; }
export function offlineAccessAllowsRecord(grant: OfflineCourseAccess | undefined, record: Pick<OfflineReadingRecord, "chapterIds">): boolean {
  if (!grant?.allowed) return false;
  return Boolean(record.chapterIds?.length) && record.chapterIds!.every(chapterId => grant.chapterIds.includes(chapterId));
}
export async function canAutomaticallyCacheOffline(policy: OfflinePolicy): Promise<boolean> {
  if (!policy.autoCache) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const connection = typeof navigator !== "undefined" ? (navigator as Navigator & { connection?: { type?: string; saveData?: boolean; effectiveType?: string } }).connection : undefined;
  if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return false;
  if (!policy.wifiOnly) return true;
  try {
    const native = await getCapacitor()?.Plugins?.Network?.getStatus();
    if (native) return native.connected && (native.connectionType === "wifi" || native.connectionType === "ethernet");
  } catch { /* The explicit download action remains available. */ }
  if (connection?.type) return connection.type === "wifi" || connection.type === "ethernet";
  // Browsers that cannot identify the connection may still cache the small
  // metadata, but wait for an explicit download before fetching large assets.
  return false;
}
function defaultRepository(scope: OfflineCacheScope): OfflineSyncRepository {
  return { readSnapshot: () => readOfflineLibrarySnapshot(scope.userId, true), writeSnapshot: writeOfflineLibrarySnapshot, listReadings: () => listOfflineReadingRecords(scope.userId, true), removeReading: removeOfflineReadingByKey, patchReading: updateOfflineReadingMetadata, cacheReading: cacheOfflineResource };
}

export function createOfflineSyncController(options: {
  scope: OfflineCacheScope;
  fetcher?: typeof fetch;
  queryClient?: QueryClient;
  onSnapshot?: (snapshot: NativeOfflineLibrarySnapshot) => void;
  initialSnapshot?: NativeOfflineLibrarySnapshot;
  repository?: OfflineSyncRepository;
  now?: () => number;
}): OfflineSyncController {
  const token = captureOfflineScope(options.scope.userId);
  const fetcher = options.fetcher ?? fetch;
  const repository = options.repository ?? defaultRepository(options.scope);
  const now = options.now ?? Date.now;
  const abort = new AbortController();
  let disposed = false;
  let verifiedSession: string | undefined;
  let syncFlight: Promise<void> | undefined;
  let value: OfflineMetadataSnapshot | undefined;
  const resourceFlights = new Map<string, Promise<boolean>>();
  const requestedCourses = new Set<string>();
  const courseGrants = new Map<string, OfflineCourseAccess>();
  const emittedChanges = new Set<string>();
  const emitChange = (change: import("./sync-contract").OfflineChange) => {
    const key = JSON.stringify(change);
    if (emittedChanges.has(key)) return;
    emittedChanges.add(key);
    if (emittedChanges.size > 500) emittedChanges.delete(emittedChanges.values().next().value!);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OFFLINE_RESOURCE_CHANGED_EVENT, { detail: { scopeKey: options.scope.scopeKey, change } }));
  };
  const load = repository.readSnapshot().then(stored => value = stored?.scopeKey === options.scope.scopeKey ? stored : emptyOfflineSnapshot(options.scope, options.initialSnapshot?.scopeKey === options.scope.scopeKey ? options.initialSnapshot : undefined));
  const current = () => !disposed && Boolean(token && token.scope.scopeKey === options.scope.scopeKey && isOfflineScopeCurrent(token));
  const assertCurrent = () => { if (!current()) throw new DOMException("Offline account changed", "AbortError"); };
  const unsubscribe = subscribeOfflineScope(() => { if (!current()) { disposed = true; abort.abort(); } });
  const getSnapshot = async () => { await load; return value!; };
  const persist = async () => {
    assertCurrent();
    value = boundOfflineMetadata(value!);
    if (!await repository.writeSnapshot(value!, token!)) throw new Error("offline_storage_unavailable");
    assertCurrent();
    options.onSnapshot?.(value!);
  };
  const validateIdentity = (identity: { accountId: string; sessionId: string; environment: string; locale: string }) => {
    assertCurrent();
    if (identity.accountId !== options.scope.userId || identity.environment !== options.scope.environment || identity.locale !== options.scope.locale || (verifiedSession && identity.sessionId !== verifiedSession)) throw new ApiResponseError("Offline response identity changed");
    verifiedSession = identity.sessionId;
  };
  const request = async (path: string, init: RequestInit = {}) => {
    assertCurrent();
    const headers = new Headers(init.headers);
    headers.set(OFFLINE_HEADERS.accountId, options.scope.userId);
    if (verifiedSession) headers.set(OFFLINE_HEADERS.sessionId, verifiedSession);
    const response = await fetcher(path, { ...init, cache: "no-store", credentials: "same-origin", headers, signal: abort.signal });
    assertCurrent();
    if (!response.ok && response.status !== 304) throw new ApiError(response.status, "Offline synchronization failed");
    return response;
  };
  const applyMetadata = async (envelope: OfflineResourceEnvelope) => {
    if (compareOfflineCursors(envelope.cursor, value!.resources[envelope.resource.key]?.cursor ?? "0") < 0) return;
    let prepared = envelope;
    if (envelope.assets.length && await canAutomaticallyCacheOffline(value!.policy)) {
      const images = await downloadOfflineImages({ assets: envelope.assets, identity: envelope, resource: envelope.resource, fetcher, signal: abort.signal, maxBytes: Math.min(value!.policy.maxBytes / 4, 8 * 1024 * 1024) });
      assertCurrent();
      prepared = { ...envelope, leaseExpiresAt: Math.min(envelope.leaseExpiresAt, ...images.map(image => image.leaseExpiresAt ?? envelope.leaseExpiresAt)), data: replaceOfflineAssetUrls(envelope.data, images) };
    }
    value!.resources[envelope.resource.key] = prepared;
    if (prepared.resource.kind === "achievement_catalog") value!.achievements = (prepared.data as OfflineAchievementCatalog).achievements;
    if (prepared.resource.kind === "course_outline") {
      const outline = prepared.data as OfflineCourseOutline;
      value!.courses = [...value!.courses.filter(course => course.id !== outline.id), { id: outline.id, title: outline.title, accessValidUntil: prepared.leaseExpiresAt, chapterIds: courseGrants.get(outline.id)?.chapterIds ?? value!.courses.find(course => course.id === outline.id)?.chapterIds }];
      value!.materials = [...value!.materials.filter(item => item.courseId !== outline.id || item.kind === "video"), ...outline.materials.map(item => ({ id: item.id, courseId: outline.id, accessValidUntil: prepared.leaseExpiresAt, title: item.title, kind: item.kind, contentVersion: item.revision }))];
    }
    if (prepared.resource.kind === "video_catalog" && prepared.resource.courseId) {
      const courseId = prepared.resource.courseId;
      value!.materials = [...value!.materials.filter(item => item.courseId !== courseId || item.kind !== "video"), ...(prepared.data as OfflineVideoCatalog).videos.map(item => ({ id: item.id, courseId, accessValidUntil: prepared.leaseExpiresAt, title: item.title, kind: "video", videoUrl: item.videoUrl, thumbnailUrl: item.thumbnailUrl?.startsWith("data:image/") ? item.thumbnailUrl : undefined, contentVersion: prepared.resource.revision }))];
    }
    await persist();
  };
  const doRefreshResource = async (resource: OfflineResourceRequest, refreshOptions: { pinned?: boolean; force?: boolean } = {}): Promise<boolean> => {
    await getSnapshot(); assertCurrent();
    if (resource.courseId) requestedCourses.add(resource.courseId);
    const key = offlineResourceKey(resource.kind, resource.id, resource.courseId);
    const readingKey = resource.courseId ? scopedReadingKey(options.scope, resource.courseId, resource.id) : key;
    const readingGeneration = offlineReadingGeneration(readingKey);
    const canWrite = () => current() && offlineReadingGeneration(readingKey) === readingGeneration;
    const readings = resource.kind === "article" || resource.kind === "diktat" ? await repository.listReadings() : [];
    const previous = readings.find(item => item.materialId === resource.id && item.courseId === resource.courseId);
    const metadata = value!.resources[key];
    if (!refreshOptions.force && !previous?.invalidated && previous?.assetsComplete && (previous.accessValidUntil ?? 0) > now() && now() - (previous.lastVerifiedAt ?? 0) < value!.policy.contentMaxAgeMs) {
      if (refreshOptions.pinned) await repository.patchReading(previous.key, { pinned: true });
      return true;
    }
    const previousRevision = previous?.assetsComplete ? previous.contentVersion : metadata?.resource.revision;
    const headers = new Headers();
    if (previousRevision) headers.set("If-None-Match", `"${previousRevision}"`);
    try {
      const response = await request(offlineResourceUrl(resource, options.scope.locale), { headers });
      if (response.status === 304) {
        const identity = { accountId: response.headers.get(OFFLINE_HEADERS.accountId) ?? "", sessionId: response.headers.get(OFFLINE_HEADERS.sessionId) ?? "", environment: response.headers.get(OFFLINE_HEADERS.environment) ?? "", locale: response.headers.get(OFFLINE_HEADERS.locale) ?? "" };
        validateIdentity(identity);
        const lease = Number(response.headers.get(OFFLINE_HEADERS.leaseExpiresAt));
        const verified = Number(response.headers.get(OFFLINE_HEADERS.validatedAt));
        const cursor = response.headers.get(OFFLINE_HEADERS.cursor) ?? "";
        const revision = response.headers.get(OFFLINE_HEADERS.revision);
        if (!Number.isFinite(lease) || lease <= now() || !Number.isFinite(verified) || !/^\d+$/.test(cursor) || revision !== previousRevision || (previous?.requiredCursor && compareOfflineCursors(cursor, previous.requiredCursor) < 0)) throw new ApiResponseError("Invalid offline validation");
        if (previous) return await repository.patchReading(previous.key, { lastVerifiedAt: verified, accessValidUntil: lease, invalidated: false, ...(refreshOptions.pinned ? { pinned: true } : {}) }, { cursor, generation: readingGeneration });
        else if (metadata) { metadata.validatedAt = verified; metadata.leaseExpiresAt = lease; metadata.cursor = cursor; await persist(); }
        else throw new ApiResponseError("Offline validation has no stored body");
        return true;
      }
      const envelope = offlineEnvelopeSchema.parse(await response.json());
      if (!canWrite()) return false;
      validateIdentity(envelope);
      if (envelope.resource.kind !== resource.kind || envelope.resource.id !== resource.id || envelope.resource.courseId !== resource.courseId || envelope.leaseExpiresAt <= now()) throw new ApiResponseError("Offline resource identity mismatch");
      if (previous?.requiredCursor && compareOfflineCursors(envelope.cursor, previous.requiredCursor) < 0) return false;
      if (previous && previous.contentVersion !== envelope.resource.revision) emitChange({ cursor: envelope.cursor, kind: resource.kind, resourceId: resource.id, courseId: resource.courseId, action: "upsert", revision: envelope.resource.revision });
      if (resource.kind === "article" || resource.kind === "diktat") return await repository.cacheReading(envelope, token!, { fetcher, signal: abort.signal, policy: value!.policy, pinned: refreshOptions.pinned ?? previous?.pinned, canWrite });
      await applyMetadata(envelope);
      return true;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        if (previous) await repository.removeReading(previous.key);
        emitChange({ cursor: value!.syncCursor, kind: resource.kind, resourceId: resource.id, courseId: resource.courseId, action: "delete", revision: null });
        delete value!.resources[key];
      }
      if (error instanceof ApiError && error.status === 401) await revoke();
      if (!current() || abort.signal.aborted) return false;
      return false;
    }
  };
  const refreshResource: OfflineSyncController["refreshResource"] = (resource, refreshOptions) => {
    const key = offlineResourceKey(resource.kind, resource.id, resource.courseId);
    const existing = resourceFlights.get(key);
    if (existing) return existing.then(async result => { if (result && refreshOptions?.pinned && resource.courseId) await repository.patchReading(scopedReadingKey(options.scope, resource.courseId, resource.id), { pinned: true }); return result; });
    const promise = doRefreshResource(resource, refreshOptions).finally(() => resourceFlights.delete(key));
    resourceFlights.set(key, promise); return promise;
  };
  const revoke = async () => {
    const records = await repository.listReadings();
    for (const record of records) await repository.removeReading(record.key);
    value = emptyOfflineSnapshot(options.scope);
    value.syncState = "error"; value.syncError = "access";
    await repository.writeSnapshot(value, token!);
    options.queryClient?.removeQueries({ queryKey: queryKeys.account(options.scope.userId) });
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OFFLINE_RESOURCE_CHANGED_EVENT, { detail: { scopeKey: options.scope.scopeKey, change: { kind: "access", courseId: null, resourceId: null, action: "delete", cursor: value.syncCursor, revision: null } } }));
  };
  const applyAccess = async (response: OfflineSyncResponse) => {
    const grants = new Map(response.access.map(grant => [grant.courseId, grant]));
    for (const grant of response.access) courseGrants.set(grant.courseId, grant);
    const records = await repository.listReadings();
    for (const record of records) if ((!record.pinned && now() - record.lastAccessedAt > response.policy.retentionMs) || (grants.has(record.courseId) && !offlineAccessAllowsRecord(grants.get(record.courseId), record))) await repository.removeReading(record.key);
    const revoked = new Set(response.access.filter(grant => !grant.allowed).map(grant => grant.courseId));
    for (const [key, envelope] of Object.entries(value!.resources)) if (envelope?.resource.courseId && revoked.has(envelope.resource.courseId)) delete value!.resources[key];
    for (const courseId of Object.keys(value!.manifests)) if (revoked.has(courseId)) delete value!.manifests[courseId];
    value!.materials = value!.materials.filter(item => !revoked.has(item.courseId));
    value!.enrollmentIds = response.enrollments.map(course => course.id);
    value!.courses = [...response.enrollments.map(({ id, title }) => ({ id, title, accessValidUntil: grants.get(id)?.leaseExpiresAt ?? response.leaseExpiresAt, chapterIds: grants.get(id)?.chapterIds })), ...value!.courses.filter(course => !value!.enrollmentIds!.includes(course.id) && !revoked.has(course.id)).map(course => ({ ...course, accessValidUntil: grants.get(course.id)?.leaseExpiresAt ?? course.accessValidUntil, chapterIds: grants.get(course.id)?.chapterIds ?? course.chapterIds }))];
    value!.policy = response.policy;
    value!.sessionId = response.sessionId;
    value!.lastVerifiedAt = response.serverTime;
    // The server bounds each course lease by both session and enrollment expiry.
    value!.accessValidUntil = response.leaseExpiresAt;
    options.queryClient?.setQueryData(queryKeys.student.enrollments(options.scope.userId), response.enrollments.map(({ id, title }) => ({ id, title })), { updatedAt: response.serverTime });
    for (const grant of response.access) {
      const item = value!.courses.find(course => course.id === grant.courseId);
      options.queryClient?.setQueryData(queryKeys.student.course(options.scope.userId, grant.courseId), grant.allowed && item ? item : null, { updatedAt: response.serverTime });
    }
  };
  const reconcileCourse = async (courseId: string, force: boolean) => {
    const params = new URLSearchParams({ courseId, locale: options.scope.locale });
    const response = await request(`/api/offline/manifest?${params}`);
    const manifest: OfflineManifestResponse = offlineManifestResponseSchema.parse(await response.json());
    validateIdentity(manifest);
    if (manifest.resource.courseId !== courseId) throw new ApiResponseError("Offline course mismatch");
    courseGrants.set(courseId, manifest.resource);
    const priorManifest = value!.manifests[courseId];
    if (priorManifest) for (const watched of watchedResources.values()) {
      if (watched.scopeKey !== options.scope.scopeKey || watched.resource.courseId !== courseId) continue;
      const previous = priorManifest.resources.find(resource => resource.id === watched.resource.id && resource.kind === watched.resource.kind);
      const latest = manifest.resources.find(resource => resource.id === watched.resource.id && resource.kind === watched.resource.kind);
      if (previous && (!latest || latest.revision !== previous.revision)) emitChange({ cursor: manifest.cursor, kind: watched.resource.kind, resourceId: watched.resource.id, courseId, action: latest ? "upsert" : "delete", revision: latest?.revision ?? null });
    }
    // Publish the authenticated course grant before native reading writes.
    for (const kind of ["course_outline", "video_catalog"] as const) if (!await refreshResource({ kind, id: courseId, courseId }, { force: true })) throw new Error("offline_metadata_incomplete");
    const saved = (await repository.listReadings()).filter(record => record.courseId === courseId);
    const byIdentity = new Map(manifest.resources.map(resource => [`${resource.kind}:${resource.id}`, resource]));
    for (const record of saved) {
      const kind = record.kind === "structured_article" ? "article" : "diktat";
      const descriptor = byIdentity.get(`${kind}:${record.materialId}`);
      if (!descriptor || !offlineAccessAllowsRecord(manifest.resource, record)) { emitChange({ cursor: manifest.cursor, kind, resourceId: record.materialId, courseId, action: "delete", revision: null }); await repository.removeReading(record.key); continue; }
      if (descriptor.revision !== record.contentVersion || record.invalidated || force || (record.accessValidUntil ?? 0) <= now()) {
        await repository.patchReading(record.key, { invalidated: true, requiredCursor: manifest.cursor });
        if (!await refreshResource(descriptor, { pinned: record.pinned, force: true })) throw new Error("offline_package_incomplete");
      } else {
        await repository.patchReading(record.key, { lastVerifiedAt: manifest.serverTime, accessValidUntil: manifest.leaseExpiresAt });
      }
    }
    if (await canAutomaticallyCacheOffline(value!.policy)) {
      for (const watched of watchedResources.values()) {
        if (watched.scopeKey !== options.scope.scopeKey || watched.resource.courseId !== courseId || saved.some(record => record.materialId === watched.resource.id)) continue;
        const descriptor = byIdentity.get(`${watched.resource.kind}:${watched.resource.id}`);
        if (descriptor && !await refreshResource(descriptor)) throw new Error("offline_package_incomplete");
      }
    }
    value!.manifests[courseId] = { cursor: manifest.cursor, checkedAt: manifest.serverTime, resources: manifest.resources };
  };
  const runSync = async () => {
    await getSnapshot(); assertCurrent();
    value!.syncState = "syncing";
    options.onSnapshot?.(value!);
    try {
      let pages = 0;
      let hasMore = true;
      while (hasMore && pages++ < 20) {
        const records = await repository.listReadings();
        const courseIds = [...new Set([...value!.courses.map(course => course.id), ...Object.keys(value!.manifests), ...records.map(record => record.courseId), ...requestedCourses, ...[...watchedResources.values()].filter(item => item.scopeKey === options.scope.scopeKey).flatMap(item => item.resource.courseId ? [item.resource.courseId] : [])])].slice(0, 100);
        const response = await request("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cursor: value!.lastVerifiedAt ? value!.syncCursor : null, courseIds, locale: options.scope.locale }) });
        const result = offlineSyncResponseSchema.parse(await response.json());
        validateIdentity(result);
        const previousVerifiedAt = value!.lastVerifiedAt;
        await applyAccess(result);
        // Native stores require the freshly verified scope before accepting packages.
        await persist();
        const allowed = result.access.filter(grant => grant.allowed);
        const changedCourses = new Set<string>();
        let globalChanged = result.reset;
        if (result.reset && previousVerifiedAt > 0) emitChange({ cursor: result.cursor, kind: "course", resourceId: null, courseId: null, action: "invalidate", revision: null });
        for (const change of result.changes) {
          emitChange(change);
          if (change.courseId) changedCourses.add(change.courseId);
          else globalChanged = true;
          for (const record of records) {
            if ((change.courseId && change.courseId !== record.courseId) || (change.resourceId && change.resourceId !== record.materialId && change.kind !== "course" && change.kind !== "access")) continue;
            if (change.action === "delete" && change.resourceId === record.materialId) await repository.removeReading(record.key);
            else await repository.patchReading(record.key, { invalidated: true, requiredCursor: change.cursor });
          }
        }
        const scheduled = isOfflineScheduledCheckDue(previousVerifiedAt, now(), result.policy.schedule);
        for (const grant of allowed) {
          const previous = value!.manifests[grant.courseId];
          if (globalChanged || changedCourses.has(grant.courseId) || !previous || previous.resources.some(resource => !offlineAccessAllowsRecord(grant, resource)) || scheduled || now() - previous.checkedAt >= result.policy.metadataMaxAgeMs || records.some(record => record.courseId === grant.courseId && (record.invalidated || (record.accessValidUntil ?? 0) <= now()))) {
            await reconcileCourse(grant.courseId, scheduled || result.reset);
          }
        }
        const achievementKey = offlineResourceKey("achievement_catalog", "catalog");
        if (globalChanged || !value!.resources[achievementKey] || scheduled || now() - (value!.resources[achievementKey]?.validatedAt ?? 0) >= result.policy.metadataMaxAgeMs) {
          if (!await refreshResource({ kind: "achievement_catalog", id: "catalog", courseId: null }, { force: true })) throw new Error("offline_metadata_incomplete");
        }
        // Cursor advances only after invalidations and access revocations are durable.
        value!.syncCursor = result.cursor;
        value!.syncState = "ready"; delete value!.syncError;
        await persist();
        hasMore = result.hasMore;
      }
    } catch (error) {
      if (!current()) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { await revoke(); return; }
      value!.syncState = "error"; value!.syncError = error instanceof Error && error.message === "offline_storage_unavailable" ? "storage" : "network";
      await persist().catch(() => {});
    }
  };
  return {
    sync() { if (syncFlight) return syncFlight; const promise = runSync().finally(() => { syncFlight = undefined; }); syncFlight = promise; return promise; },
    refreshResource,
    snapshot: getSnapshot,
    dispose() { disposed = true; abort.abort(); unsubscribe(); },
  };
}

let activeController: { scopeKey: string; controller: OfflineSyncController } | undefined;
export function registerOfflineSyncController(scope: OfflineCacheScope, controller: OfflineSyncController): () => void {
  activeController = { scopeKey: scope.scopeKey, controller };
  return () => { if (activeController?.controller === controller) activeController = undefined; };
}
export async function cacheReadingOnOpen(userId: string, resource: OfflineResourceRequest): Promise<boolean> {
  const token = captureOfflineScope(userId);
  if (!token) return false;
  const controller = activeController?.scopeKey === token.scope.scopeKey ? activeController.controller : createOfflineSyncController({ scope: token.scope });
  try {
    let snapshot = await controller.snapshot();
    if (!snapshot.lastVerifiedAt || snapshot.accessValidUntil <= Date.now()) { await controller.sync(); snapshot = await controller.snapshot(); }
    if (!snapshot.policy.autoCache) return false;
    // Opening an already-fetched text document may save its small JSON. Image
    // downloads respect the same network policy as background prefetch.
    if (!await canAutomaticallyCacheOffline(snapshot.policy)) return false;
    return await controller.refreshResource(resource);
  } catch { return false; }
  finally { if (controller !== activeController?.controller) controller.dispose(); }
}
export async function downloadOfflineReading(userId: string, resource: OfflineResourceRequest): Promise<boolean> {
  const unwatch = watchOfflineReading(userId, resource);
  const token = captureOfflineScope(userId);
  if (!token) { unwatch(); return false; }
  const controller = activeController?.scopeKey === token.scope.scopeKey ? activeController.controller : createOfflineSyncController({ scope: token.scope });
  try { await controller.sync(); return await controller.refreshResource(resource, { pinned: true, force: true }); }
  finally { unwatch(); if (controller !== activeController?.controller) controller.dispose(); }
}

export function watchOfflineReading(userId: string, resource: OfflineResourceRequest): () => void {
  const token = captureOfflineScope(userId);
  if (!token) return () => {};
  const key = `${token.scope.scopeKey}:${offlineResourceKey(resource.kind, resource.id, resource.courseId)}`;
  const existing = watchedResources.get(key);
  watchedResources.set(key, { scopeKey: token.scope.scopeKey, resource, count: (existing?.count ?? 0) + 1 });
  requestOfflineSync();
  return () => { const item = watchedResources.get(key); if (item && item.count > 1) item.count -= 1; else watchedResources.delete(key); };
}
export async function synchronizeOfflineLibrary(userId: string): Promise<void> {
  const token = captureOfflineScope(userId);
  if (!token) return;
  const controller = activeController?.scopeKey === token.scope.scopeKey ? activeController.controller : createOfflineSyncController({ scope: token.scope });
  try { await controller.sync(); }
  finally { if (controller !== activeController?.controller) controller.dispose(); }
}
