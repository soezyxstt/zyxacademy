import type { QueryClient } from "@tanstack/react-query";
import { ApiError, ApiResponseError } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";
import { getCapacitor } from "@/lib/native/runtime";
import { isOfflineScheduledCheckDue } from "@/lib/date-utils";
import { captureOfflineScope, isOfflineScopeCurrent, scopedReadingKey, subscribeOfflineScope, type OfflineCacheScope, type OfflineScopeToken } from "./cache-scope";
import { recordOfflineReadingVisit } from "./cache-db";
import { offlineEnvelopeSchema, offlineManifestResponseSchema, offlineSyncResponseSchema } from "./client-validation";
import { OFFLINE_HEADERS, OFFLINE_SYNC_COURSE_LIMIT, offlineResourceKey, offlineResourceUrl, type OfflineCourseAccess, type OfflineManifestResponse, type OfflinePolicy, type OfflineResourceDescriptor, type OfflineResourceEnvelope,  type OfflineSyncResponse, type OfflineVideoCatalog, type OfflineAchievementCatalog, type OfflineCourseOutline } from "./sync-contract";
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
type OfflineRefreshOptions = { pinned?: boolean; force?: boolean; automatic?: boolean };
export interface OfflineSyncController {
  sync: () => Promise<void>;
  refreshResource: (resource: OfflineResourceRequest, options?: OfflineRefreshOptions) => Promise<boolean>;
  snapshot: () => Promise<OfflineMetadataSnapshot>;
  courseIds: () => Promise<string[]>;
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
  ready?: Promise<unknown>;
  onChange?: (change: import("./sync-contract").OfflineChange) => void;
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
  let requiresReset: boolean | undefined;
  let syncFlight: Promise<void> | undefined;
  let syncAgain = false;
  let value: OfflineMetadataSnapshot | undefined;
  const resourceFlights = new Map<string, { promise: Promise<boolean>; automatic?: boolean }>();
  const requestedCourses = new Set<string>();
  const courseGrants = new Map<string, { access: OfflineCourseAccess; cursor: string }>();
  const emittedChanges = new Set<string>();
  const publishChange = (change: import("./sync-contract").OfflineChange) => {
    const detail = { scopeKey: options.scope.scopeKey, change };
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OFFLINE_RESOURCE_CHANGED_EVENT, { detail }));
    options.onChange?.(change);
  };
  const emitChange = (change: import("./sync-contract").OfflineChange) => {
    const key = JSON.stringify([change.cursor, change.kind, change.courseId, change.resourceId, change.action, change.revision]);
    if (emittedChanges.has(key)) return;
    emittedChanges.add(key);
    if (emittedChanges.size > 500) emittedChanges.delete(emittedChanges.values().next().value!);
    publishChange(change);
  };
  const load = repository.readSnapshot().then(stored => value = stored?.scopeKey === options.scope.scopeKey ? stored : emptyOfflineSnapshot(options.scope, options.initialSnapshot?.scopeKey === options.scope.scopeKey ? options.initialSnapshot : undefined));
  const current = () => !disposed && Boolean(token && token.scope.scopeKey === options.scope.scopeKey && isOfflineScopeCurrent(token));
  const assertCurrent = () => { if (!current()) throw new DOMException("Offline account changed", "AbortError"); };
  const unsubscribe = subscribeOfflineScope(() => { if (!current()) { disposed = true; abort.abort(); } });
  const getSnapshot = async () => { await load; requiresReset ??= !value!.lastVerifiedAt; return value!; };
  const persist = async () => {
    assertCurrent();
    value = boundOfflineMetadata(value!);
    if (!await repository.writeSnapshot(value!, token!)) throw new Error("offline_storage_unavailable");
    assertCurrent();
    options.onSnapshot?.(value!);
  };
  const withStoreLock = async <T>(work: () => Promise<T>): Promise<T> => {
    await options.ready;
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    if (options.repository || !locks) return work();
    return locks.request(`zyx:offline-scope:${options.scope.scopeKey}`, { signal: abort.signal }, async () => {
      await getSnapshot();
      assertCurrent();
      const stored = await repository.readSnapshot();
      if (stored?.scopeKey === options.scope.scopeKey) value = stored;
      return work();
    });
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
  const publishCourseQuery = async (courseId: string, course?: { id: string; title: string }, verifiedAt = now()) => {
    const client = options.queryClient;
    if (!client) return;
    const key = queryKeys.student.course(options.scope.userId, courseId);
    const previous = client.getQueryData<{ id: string; title: string } | null>(key);
    if ((!course && previous === null) || (course && previous?.id === course.id && previous.title === course.title)) return;
    await client.cancelQueries({ queryKey: key, exact: true });
    assertCurrent();
    client.setQueryData(key, course ? { id: course.id, title: course.title } : null, { updatedAt: verifiedAt });
  };
  const applyMetadata = async (envelope: OfflineResourceEnvelope, cached?: OfflineResourceEnvelope) => {
    const { key, courseId } = envelope.resource;
    let images: Awaited<ReturnType<typeof downloadOfflineImages>> = [];
    if (!cached && envelope.assets.length && await canAutomaticallyCacheOffline(value!.policy)) {
      images = await downloadOfflineImages({ assets: envelope.assets, identity: envelope, resource: envelope.resource, fetcher, signal: abort.signal, maxBytes: Math.min(value!.policy.maxBytes / 4, 8 * 1024 * 1024) });
    }
    assertCurrent();
    const currentEnvelope = value!.resources[key];
    const grant = courseId ? courseGrants.get(courseId) : undefined;
    if ((cached && currentEnvelope !== cached)
      || compareOfflineCursors(envelope.cursor, currentEnvelope?.cursor ?? "0") < 0
      || (grant && (!grant.access.allowed || compareOfflineCursors(envelope.cursor, grant.cursor) < 0))) return false;
    const lease = Math.min(envelope.leaseExpiresAt, grant?.access.leaseExpiresAt ?? Infinity);
    if (lease <= now()) return false;
    const prepared = {
      ...envelope,
      leaseExpiresAt: Math.min(lease, ...images.map(image => image.leaseExpiresAt ?? lease)),
      data: images.length ? replaceOfflineAssetUrls(envelope.data, images) : envelope.data,
    };
    if (prepared.leaseExpiresAt <= now()) return false;
    // A resource 304 authorizes its catalog, but does not renew copied image bytes.
    if (cached && cached.leaseExpiresAt < lease && cached.assets.length) {
      if (prepared.resource.kind === "video_catalog") {
        const catalog = prepared.data as OfflineVideoCatalog;
        prepared.data = { ...catalog, videos: catalog.videos.map(video => video.thumbnailUrl?.startsWith("data:image/") ? { ...video, thumbnailUrl: null } : video) };
      } else if (prepared.resource.kind === "achievement_catalog") {
        const catalog = prepared.data as OfflineAchievementCatalog;
        prepared.data = { achievements: catalog.achievements.map(item => item.icon.startsWith("data:image/") ? { ...item, icon: "" } : item) };
      }
    }
    if (prepared.resource.kind === "course_outline") {
      const outline = prepared.data as OfflineCourseOutline;
      if (outline.id !== courseId) return false;
      const chapterIds = grant?.access.chapterIds ?? value!.courses.find(course => course.id === outline.id)?.chapterIds;
      const materials = outline.materials.filter(item => item.courseId === courseId && (!grant || offlineAccessAllowsRecord(grant.access, item)));
      value!.courses = [...value!.courses.filter(course => course.id !== outline.id), { id: outline.id, title: outline.title, accessValidUntil: prepared.leaseExpiresAt, chapterIds, fullContent: grant?.access.fullContent }];
      value!.materials = [...value!.materials.filter(item => item.courseId !== outline.id || item.kind === "video"), ...materials.map(item => ({ id: item.id, courseId: outline.id, accessValidUntil: prepared.leaseExpiresAt, title: item.title, kind: item.kind, contentVersion: item.revision }))];
    }
    if (prepared.resource.kind === "video_catalog" && prepared.resource.courseId) {
      const courseId = prepared.resource.courseId;
      value!.materials = [...value!.materials.filter(item => item.courseId !== courseId || item.kind !== "video"), ...(prepared.data as OfflineVideoCatalog).videos.map(item => ({ id: item.id, courseId, accessValidUntil: prepared.leaseExpiresAt, title: item.title, kind: "video", videoUrl: item.videoUrl, thumbnailUrl: item.thumbnailUrl?.startsWith("data:image/") ? item.thumbnailUrl : undefined, contentVersion: prepared.resource.revision }))];
    }
    if (prepared.resource.kind === "achievement_catalog") value!.achievements = (prepared.data as OfflineAchievementCatalog).achievements;
    value!.resources[key] = prepared;
    await persist();
    if (prepared.resource.kind === "course_outline" && courseId) await publishCourseQuery(courseId, value!.courses.find(course => course.id === courseId), prepared.validatedAt);
    return true;
  };
  const doRefreshResource = async (resource: OfflineResourceRequest, refreshOptions: OfflineRefreshOptions = {}): Promise<boolean> => {
    await getSnapshot(); assertCurrent();
    if (resource.courseId) requestedCourses.add(resource.courseId);
    const key = offlineResourceKey(resource.kind, resource.id, resource.courseId);
    const readingKey = resource.courseId ? scopedReadingKey(options.scope, resource.courseId, resource.id) : key;
    const readingGeneration = offlineReadingGeneration(readingKey);
    const policy = value!.policy;
    const automatic = refreshOptions.automatic;
    if (automatic && !await canAutomaticallyCacheOffline(policy)) return false;
    let authorized: OfflineResourceEnvelope | undefined;
    const canWrite = () => {
      if (!current() || offlineReadingGeneration(readingKey) !== readingGeneration) return false;
      const grant = resource.courseId ? courseGrants.get(resource.courseId) : undefined;
      if (grant && (!grant.access.allowed || (authorized && (compareOfflineCursors(authorized.cursor, grant.cursor) < 0 || !offlineAccessAllowsRecord(grant.access, authorized.resource))))) return false;
      if (!automatic) return true;
      if (value!.policy.revision !== policy.revision || !value!.policy.autoCache || (typeof navigator !== "undefined" && navigator.onLine === false)) return false;
      return Boolean(grant?.access.allowed && grant.access.leaseExpiresAt > now()
        && (!authorized || (compareOfflineCursors(authorized.cursor, grant.cursor) >= 0
          && offlineAccessAllowsRecord(grant.access, authorized.resource))));
    };
    const readings = resource.kind === "article" || resource.kind === "diktat" ? await repository.listReadings() : [];
    const previous = readings.find(item => item.materialId === resource.id && item.courseId === resource.courseId);
    if (automatic && !canWrite()) return false;
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
      if (!canWrite()) return false;
      if (response.status === 304) {
        const identity = { accountId: response.headers.get(OFFLINE_HEADERS.accountId) ?? "", sessionId: response.headers.get(OFFLINE_HEADERS.sessionId) ?? "", environment: response.headers.get(OFFLINE_HEADERS.environment) ?? "", locale: response.headers.get(OFFLINE_HEADERS.locale) ?? "" };
        validateIdentity(identity);
        const lease = Number(response.headers.get(OFFLINE_HEADERS.leaseExpiresAt));
        const verified = Number(response.headers.get(OFFLINE_HEADERS.validatedAt));
        const cursor = response.headers.get(OFFLINE_HEADERS.cursor) ?? "";
        const revision = response.headers.get(OFFLINE_HEADERS.revision);
        if (!Number.isFinite(lease) || lease <= now() || !Number.isFinite(verified) || !/^\d+$/.test(cursor) || revision !== previousRevision || (previous?.requiredCursor && compareOfflineCursors(cursor, previous.requiredCursor) < 0)) throw new ApiResponseError("Invalid offline validation");
        if (previous) return await repository.patchReading(previous.key, { lastVerifiedAt: verified, accessValidUntil: lease, invalidated: false, ...(refreshOptions.pinned ? { pinned: true } : {}) }, { cursor, generation: readingGeneration });
        else if (metadata) return await applyMetadata({ ...metadata, validatedAt: verified, leaseExpiresAt: lease, cursor }, metadata);
        else throw new ApiResponseError("Offline validation has no stored body");
      }
      const envelope = offlineEnvelopeSchema.parse(await response.json());
      if (!canWrite()) return false;
      validateIdentity(envelope);
      if (envelope.resource.kind !== resource.kind || envelope.resource.id !== resource.id || envelope.resource.courseId !== resource.courseId || envelope.leaseExpiresAt <= now()) throw new ApiResponseError("Offline resource identity mismatch");
      if (previous?.requiredCursor && compareOfflineCursors(envelope.cursor, previous.requiredCursor) < 0) return false;
      authorized = envelope;
      if ((automatic && !await canAutomaticallyCacheOffline(policy)) || !canWrite()) return false;
      if (previous && previous.contentVersion !== envelope.resource.revision) emitChange({ cursor: envelope.cursor, kind: resource.kind, resourceId: resource.id, courseId: resource.courseId, action: "upsert", revision: envelope.resource.revision });
      if (resource.kind === "article" || resource.kind === "diktat") return await repository.cacheReading(envelope, token!, { fetcher, signal: abort.signal, policy: value!.policy, pinned: refreshOptions.pinned ?? previous?.pinned, canWrite });
      return await applyMetadata(envelope);
    } catch (error) {
      if (!current()) return false;
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        if (previous) await repository.removeReading(previous.key);
        emitChange({ cursor: value!.syncCursor, kind: resource.kind, resourceId: resource.id, courseId: resource.courseId, action: "delete", revision: null });
        delete value!.resources[key];
      }
      if (error instanceof ApiError && error.status === 401) await revoke();
      return false;
    }
  };
  const refreshResource: OfflineSyncController["refreshResource"] = (resource, refreshOptions) => {
    const key = offlineResourceKey(resource.kind, resource.id, resource.courseId);
    const existing = resourceFlights.get(key);
    if (existing) return existing.promise.then(async result => {
      if (!refreshOptions?.pinned || !resource.courseId) return result;
      if (!current()) return false;
      if (!result) return existing.automatic ? refreshResource(resource, refreshOptions) : false;
      return repository.patchReading(scopedReadingKey(options.scope, resource.courseId, resource.id), { pinned: true });
    });
    const promise = doRefreshResource(resource, refreshOptions).finally(() => resourceFlights.delete(key));
    resourceFlights.set(key, { promise, automatic: refreshOptions?.automatic });
    return promise;
  };
  const revoke = async () => {
    if (value!.syncError !== "access") publishChange({ kind: "access", courseId: null, resourceId: null, action: "delete", cursor: "0", revision: null });
    options.queryClient?.removeQueries({ queryKey: queryKeys.account(options.scope.userId) });
    const records = await repository.listReadings();
    for (const record of records) await repository.removeReading(record.key);
    verifiedSession = undefined;
    value = emptyOfflineSnapshot(options.scope);
    value.syncState = "error"; value.syncError = "access";
    await repository.writeSnapshot(value, token!);
    requiresReset = true;
  };
  const applyAccess = async (response: OfflineSyncResponse) => {
    const grants = new Map(response.access.map(grant => [grant.courseId, grant]));
    const narrowed = new Set<string>();
    for (const grant of response.access) {
      const savedCourse = value!.courses.find(course => course.id === grant.courseId);
      const oldGrant = courseGrants.get(grant.courseId)?.access;
      if (!grant.allowed || ((oldGrant?.fullContent ?? savedCourse?.fullContent) && !grant.fullContent) || savedCourse?.chapterIds?.some(id => !grant.chapterIds.includes(id))) narrowed.add(grant.courseId);
      const watched = [...watchedResources.values()].filter(item => item.scopeKey === options.scope.scopeKey && item.resource.courseId === grant.courseId);
      if (narrowed.has(grant.courseId) && (savedCourse || oldGrant?.allowed || (!oldGrant && watched.length))) {
        emitChange({ cursor: response.cursor, kind: "access", action: grant.allowed ? "invalidate" : "delete", courseId: grant.courseId, resourceId: null, revision: null });
        if (grant.allowed) for (const item of watched) {
          const resource = value!.manifests[grant.courseId]?.resources.find(resource => resource.kind === item.resource.kind && resource.id === item.resource.id);
          if (resource && !offlineAccessAllowsRecord(grant, resource)) {
            emitChange({ cursor: response.cursor, kind: resource.kind, courseId: grant.courseId, resourceId: resource.id, action: "delete", revision: null });
          }
        }
      }
      const previous = courseGrants.get(grant.courseId);
      const cursor = previous && compareOfflineCursors(previous.cursor, response.cursor) > 0 ? previous.cursor : response.cursor;
      courseGrants.set(grant.courseId, { access: grant, cursor });
    }
    const records = await repository.listReadings();
    for (const record of records) if ((!record.pinned && now() - record.lastAccessedAt > response.policy.retentionMs) || (grants.has(record.courseId) && !offlineAccessAllowsRecord(grants.get(record.courseId), record))) await repository.removeReading(record.key);
    const revoked = new Set(response.access.filter(grant => !grant.allowed).map(grant => grant.courseId));
    for (const [key, envelope] of Object.entries(value!.resources)) if (envelope?.resource.courseId && narrowed.has(envelope.resource.courseId)) delete value!.resources[key];
    for (const courseId of Object.keys(value!.manifests)) if (revoked.has(courseId)) delete value!.manifests[courseId];
    value!.materials = value!.materials.filter(item => !narrowed.has(item.courseId));
    value!.enrollmentIds = response.enrollments.map(course => course.id);
    value!.courses = [...response.enrollments.map(({ id, title }) => ({ id, title, accessValidUntil: grants.get(id)?.leaseExpiresAt ?? response.leaseExpiresAt, chapterIds: grants.get(id)?.chapterIds, fullContent: grants.get(id)?.fullContent })), ...value!.courses.filter(course => !value!.enrollmentIds!.includes(course.id) && !revoked.has(course.id)).map(course => ({ ...course, accessValidUntil: grants.get(course.id)?.leaseExpiresAt ?? course.accessValidUntil, chapterIds: grants.get(course.id)?.chapterIds ?? course.chapterIds, fullContent: grants.get(course.id)?.fullContent ?? course.fullContent }))];
    value!.policy = response.policy;
    value!.sessionId = response.sessionId;
    value!.lastVerifiedAt = response.serverTime;
    // The server bounds each course lease by both session and enrollment expiry.
    value!.accessValidUntil = response.leaseExpiresAt;
    if (options.queryClient) {
      const key = queryKeys.student.enrollments(options.scope.userId);
      const data = response.enrollments.map(({ id, title }) => ({ id, title }));
      const previous = options.queryClient.getQueryData<typeof data>(key);
      if (previous?.length !== data.length || previous.some((item, index) => item.id !== data[index]?.id || item.title !== data[index]?.title)) {
        await options.queryClient.cancelQueries({ queryKey: key, exact: true });
        assertCurrent();
        options.queryClient.setQueryData(key, data, { updatedAt: response.serverTime });
      }
      for (const grant of response.access) {
        const course = value!.courses.find(course => course.id === grant.courseId);
        if (!grant.allowed || course) await publishCourseQuery(grant.courseId, grant.allowed ? course : undefined, response.serverTime);
      }
    }
  };
  const needsReadingValidation = (record: OfflineReadingRecord) => !record.assetsComplete || record.invalidated
    || (record.accessValidUntil ?? 0) <= now() || now() - (record.lastVerifiedAt ?? 0) >= value!.policy.contentMaxAgeMs;
  const reconcileCourse = async (courseId: string, reset: boolean, changedReadings: Set<string>) => {
    const params = new URLSearchParams({ courseId, locale: options.scope.locale });
    const response = await request(`/api/offline/manifest?${params}`);
    const manifest: OfflineManifestResponse = offlineManifestResponseSchema.parse(await response.json());
    validateIdentity(manifest);
    if (manifest.resource.courseId !== courseId) throw new ApiResponseError("Offline course mismatch");
    const grantCursor = courseGrants.get(courseId)?.cursor;
    if (grantCursor && compareOfflineCursors(manifest.cursor, grantCursor) < 0) throw new ApiResponseError("Outdated offline manifest");
    courseGrants.set(courseId, { access: { ...manifest.resource, leaseExpiresAt: Math.min(manifest.resource.leaseExpiresAt, manifest.leaseExpiresAt) }, cursor: manifest.cursor });
    const priorManifest = value!.manifests[courseId];
    for (const watched of watchedResources.values()) {
      if (watched.scopeKey !== options.scope.scopeKey || watched.resource.courseId !== courseId) continue;
      const previous = priorManifest?.resources.find(resource => resource.id === watched.resource.id && resource.kind === watched.resource.kind);
      const latest = manifest.resources.find(resource => resource.id === watched.resource.id && resource.kind === watched.resource.kind);
      const changed = changedReadings.has(offlineResourceKey(watched.resource.kind, watched.resource.id, courseId));
      if ((!latest && (previous || changed)) || (latest && previous && latest.revision !== previous.revision)) emitChange({ cursor: manifest.cursor, kind: watched.resource.kind, resourceId: watched.resource.id, courseId, action: latest ? "upsert" : "delete", revision: latest?.revision ?? null });
    }
    const saved = (await repository.listReadings()).filter(record => record.courseId === courseId);
    const byIdentity = new Map(manifest.resources.map(resource => [`${resource.kind}:${resource.id}`, resource]));
    const currentReadings = [];
    for (const record of saved) {
      const kind = record.kind === "structured_article" ? "article" : "diktat";
      const descriptor = byIdentity.get(`${kind}:${record.materialId}`);
      // Use the current descriptor's chapters so a move outside a grant takes
      // effect even when the saved package's old chapter is still accessible.
      if (!descriptor || !offlineAccessAllowsRecord(manifest.resource, descriptor)) {
        emitChange({ cursor: manifest.cursor, kind, resourceId: record.materialId, courseId, action: "delete", revision: null });
        await repository.removeReading(record.key);
      } else currentReadings.push({ record, descriptor });
    }
    value!.materials = value!.materials.filter(item => item.courseId !== courseId || item.kind === "video" || byIdentity.has(`${item.kind}:${item.id}`));
    // Publish revoked readings and the authorized outline before fetching replacements.
    for (const kind of ["course_outline", "video_catalog"] as const) if (!await refreshResource({ kind, id: courseId, courseId }, { force: true })) throw new Error("offline_metadata_incomplete");
    for (const { record, descriptor } of currentReadings) {
      if (descriptor.revision !== record.contentVersion || reset || needsReadingValidation(record)) {
        await repository.patchReading(record.key, { invalidated: true, requiredCursor: manifest.cursor });
        if (!await refreshResource(descriptor, { pinned: record.pinned, force: true })) throw new Error("offline_package_incomplete");
      } else {
        await repository.patchReading(record.key, { lastVerifiedAt: manifest.serverTime, accessValidUntil: manifest.leaseExpiresAt });
      }
    }
    value!.manifests[courseId] = { cursor: manifest.cursor, checkedAt: manifest.serverTime, resources: manifest.resources };
  };
  const courseIds = async (records?: OfflineReadingRecord[]) => {
    await getSnapshot();
    const watched = [...watchedResources.values()].flatMap(item => item.scopeKey === options.scope.scopeKey && item.resource.courseId ? [item.resource.courseId] : []);
    const persisted = options.queryClient?.getQueriesData({ queryKey: [...queryKeys.student.all(options.scope.userId), "course"] })
      .flatMap(([key, data]) => data && typeof key[5] === "string" ? [key[5]] : []) ?? [];
    return [...new Set([...watched, ...(records ?? await repository.listReadings()).map(record => record.courseId), ...requestedCourses, ...Object.keys(value!.manifests), ...persisted, ...value!.courses.map(course => course.id)])].slice(0, OFFLINE_SYNC_COURSE_LIMIT);
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
        const response = await request("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cursor: requiresReset ? null : value!.syncCursor, courseIds: await courseIds(records), locale: options.scope.locale }) }).catch(async error => {
          if (error instanceof ApiError && error.status === 403) await revoke();
          throw error;
        });
        const result = offlineSyncResponseSchema.parse(await response.json());
        validateIdentity(result);
        const previousVerifiedAt = value!.lastVerifiedAt;
        if (result.reset) { requiresReset = true; courseGrants.clear(); }
        await applyAccess(result);
        const allowed = result.access.filter(grant => grant.allowed);
        const changedCourses = new Set<string>();
        const changedReadings = new Set<string>();
        let globalChanged = result.reset;
        let achievementsChanged = result.reset;
        for (const change of result.changes) {
          emitChange(change);
          if (change.kind === "achievement_catalog" || (change.kind === "course" && !change.courseId)) achievementsChanged = true;
          if (change.courseId) changedCourses.add(change.courseId);
          else if (change.kind === "course" || change.kind === "policy" || change.kind === "access") globalChanged = true;
          if (change.kind === "video_catalog" && change.action === "delete" && change.courseId) {
            delete value!.resources[offlineResourceKey("video_catalog", change.courseId, change.courseId)];
            value!.materials = value!.materials.filter(item => item.courseId !== change.courseId || item.kind !== "video");
          }
          if (change.kind !== "article" && change.kind !== "diktat") continue;
          if (change.resourceId) changedReadings.add(offlineResourceKey(change.kind, change.resourceId, change.courseId));
          if (change.action === "delete") value!.materials = value!.materials.filter(item => item.courseId !== change.courseId || item.id !== change.resourceId || item.kind !== change.kind);
          for (const record of records) {
            if (change.courseId !== record.courseId || change.resourceId !== record.materialId || change.kind !== (record.kind === "structured_article" ? "article" : "diktat")) continue;
            if (change.action === "delete") await repository.removeReading(record.key);
            else await repository.patchReading(record.key, { invalidated: true, requiredCursor: change.cursor });
          }
        }
        // Native stores require the freshly verified scope before accepting packages.
        await persist();
        let reconcileError: unknown;
        const scheduled = isOfflineScheduledCheckDue(previousVerifiedAt, now(), result.policy.schedule);
        for (const grant of allowed) {
          const previous = value!.manifests[grant.courseId];
          const catalogExpired = (["course_outline", "video_catalog"] as const).some(kind =>
            (value!.resources[offlineResourceKey(kind, grant.courseId, grant.courseId)]?.leaseExpiresAt ?? 0) <= now())
            || value!.materials.some(item => item.courseId === grant.courseId && item.accessValidUntil !== undefined && item.accessValidUntil <= now());
          if (globalChanged || changedCourses.has(grant.courseId) || !previous || catalogExpired || previous.resources.some(resource => !offlineAccessAllowsRecord(grant, resource)) || scheduled || now() - previous.checkedAt >= result.policy.metadataMaxAgeMs || records.some(record => record.courseId === grant.courseId && needsReadingValidation(record))) {
            try { await reconcileCourse(grant.courseId, result.reset, changedReadings); } catch (error) { reconcileError = error; }
          }
        }
        const achievementKey = offlineResourceKey("achievement_catalog", "catalog");
        const achievements = value!.resources[achievementKey];
        if (achievementsChanged || !achievements || achievements.leaseExpiresAt <= now() || scheduled || now() - achievements.validatedAt >= result.policy.metadataMaxAgeMs) {
          if (!await refreshResource({ kind: "achievement_catalog", id: "catalog", courseId: null }, { force: true })) throw new Error("offline_metadata_incomplete");
        }
        // Cursor advances only after invalidations and access revocations are durable.
        if (reconcileError) throw reconcileError;
        const previousCursor = value!.syncCursor;
        value!.syncCursor = result.cursor;
        value!.syncState = "ready"; delete value!.syncError;
        try { await persist(); } catch (error) { value!.syncCursor = previousCursor; throw error; }
        requiresReset = false;
        hasMore = result.hasMore;
      }
    } catch (error) {
      if (!current()) return;
      if (error instanceof ApiError && error.status === 401) { await revoke(); return; }
      if (value!.syncError === "access") return;
      value!.syncState = "error"; value!.syncError = error instanceof Error && error.message === "offline_storage_unavailable" ? "storage" : "network";
      await persist().catch(() => {});
    }
  };
  return {
    sync() {
      if (syncFlight) { syncAgain = true; return syncFlight; }
      syncFlight = withStoreLock(async () => {
        do { syncAgain = false; await runSync(); } while (syncAgain && current());
      }).finally(() => { syncFlight = undefined; });
      return syncFlight;
    },
    refreshResource: (resource, refreshOptions) => withStoreLock(() => refreshResource(resource, refreshOptions)),
    snapshot: getSnapshot,
    courseIds,
    dispose() { disposed = true; abort.abort(); unsubscribe(); },
  };
}

let activeController: { scopeKey: string; controller: OfflineSyncController } | undefined;
export function registerOfflineSyncController(scope: OfflineCacheScope, controller: OfflineSyncController): () => void {
  activeController = { scopeKey: scope.scopeKey, controller };
  return () => { if (activeController?.controller === controller) activeController = undefined; };
}
const automaticReadingFlights = new Set<string>();

export async function cacheReadingOnOpen(token: OfflineScopeToken, resource: OfflineResourceRequest, visitId: string): Promise<boolean> {
  if (!resource.courseId || (resource.kind !== "article" && resource.kind !== "diktat") || !isOfflineScopeCurrent(token)) return false;
  const resourceKey = offlineResourceKey(resource.kind, resource.id, resource.courseId);
  const key = JSON.stringify([token.scope.scopeKey, resourceKey]);
  try {
    if (!await recordOfflineReadingVisit(token.scope.scopeKey, resourceKey, visitId, () => isOfflineScopeCurrent(token))) return false;
    if (navigator.onLine === false || automaticReadingFlights.has(key)) return false;
    const admit = async () => {
      if (!isOfflineScopeCurrent(token)) return false;
      const shared = activeController?.scopeKey === token.scope.scopeKey ? activeController.controller : undefined;
      const controller = shared ?? createOfflineSyncController({ scope: token.scope });
      const unwatch = watchOfflineReading(token.scope.userId, resource);
      try {
        await controller.sync();
        const snapshot = await controller.snapshot();
        if (!isOfflineScopeCurrent(token) || snapshot.syncState !== "ready" || snapshot.accessValidUntil <= Date.now()) return false;
        if (!await canAutomaticallyCacheOffline(snapshot.policy)) return false;
        return await controller.refreshResource(resource, { automatic: true });
      } finally { unwatch(); if (!shared) controller.dispose(); }
    };
    automaticReadingFlights.add(key);
    try {
      // A second tab can record a visit while an admission is already in progress.
      return navigator.locks
        ? await navigator.locks.request(`zyx:offline-reading:${key}`, { ifAvailable: true }, lock => lock ? admit() : false)
        : await admit();
    } finally { automaticReadingFlights.delete(key); }
  } catch { return false; }
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
