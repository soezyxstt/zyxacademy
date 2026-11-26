import type { NativeRequestInit, NativeResponse, NativeSessionTransport } from "../network/transport";
import type { NativeOfflineMetadataSnapshot } from "./metadata-store";
import {
  isNativeOfflineCursor,
  NATIVE_OFFLINE_COURSE_LIMIT,
  NATIVE_OFFLINE_HEADERS,
  NativeOfflineProtocolError,
  parseNativeOfflineManifestResponse,
  parseNativeOfflineSyncResponse,
  type NativeOfflineCourseAccess,
  type NativeOfflineLocale,
  type NativeOfflineManifestResponse,
  type NativeOfflineScope,
  type NativeOfflineSyncResponse,
} from "./sync-contract";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 20;

export type NativeOfflineSnapshot = NativeOfflineMetadataSnapshot;
type AccessListener = (snapshot: NativeOfflineSnapshot | null) => void;

type PendingPage = { expectedCursor: string | null; response: NativeOfflineSyncResponse };
type CompletePage = PendingPage & { manifests: NativeOfflineManifestResponse[]; accessRevision: number };

export interface NativeOfflineMetadataRepository {
  read(scope: NativeOfflineScope, now?: number): Promise<NativeOfflineSnapshot | null>;
  applyAccess(scope: NativeOfflineScope, page: PendingPage, assertCurrent?: () => void): Promise<number | null>;
  commitPage(scope: NativeOfflineScope, page: CompletePage, assertCurrent?: () => void): Promise<boolean>;
  clear(scope: NativeOfflineScope, assertCurrent?: () => void): Promise<boolean>;
}

const ERROR_MESSAGES = {
  revoked: "The offline session is no longer authorized.",
  courseChanged: "The offline course access changed during synchronization.",
  incomplete: "The offline metadata page is incomplete.",
  conflict: "The offline metadata changed during synchronization.",
  http: "The offline metadata request failed.",
  timeout: "The offline metadata request timed out.",
};

export class NativeOfflineSyncError extends Error {
  constructor(readonly code: keyof typeof ERROR_MESSAGES, readonly status?: number) {
    super(ERROR_MESSAGES[code]);
    this.name = "NativeOfflineSyncError";
  }
}

function enforceScopeHeaders(response: NativeResponse, scope: NativeOfflineScope): void {
  if (response.headers.get(NATIVE_OFFLINE_HEADERS.accountId) !== scope.accountId
    || response.headers.get(NATIVE_OFFLINE_HEADERS.sessionId) !== scope.sessionId
    || response.headers.get(NATIVE_OFFLINE_HEADERS.environment) !== scope.origin
    || response.headers.get(NATIVE_OFFLINE_HEADERS.locale) !== scope.locale) {
    throw new NativeOfflineProtocolError();
  }
}

async function readJson(response: NativeResponse, maxBytes = MAX_RESPONSE_BYTES): Promise<unknown> {
  const type = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  const body = response.body;
  if (type !== "application/json" || !body || Number(response.headers.get("Content-Length")) > maxBytes) {
    throw new NativeOfflineProtocolError();
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new NativeOfflineProtocolError();
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new NativeOfflineProtocolError();
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function failure(response: NativeResponse, manifest: boolean): Promise<NativeOfflineSyncError> {
  const { status } = response;
  if (status === 401) return new NativeOfflineSyncError("revoked", status);
  if (manifest && status === 404) return new NativeOfflineSyncError("courseChanged", status);
  if (status === 403 || status === 409) {
    const body = await readJson(response, 4096).catch(() => null);
    const code = body && typeof body === "object" && "code" in body ? body.code : null;
    if (manifest && (code === "OFFLINE_COURSE_ACCESS_DENIED" || code === "OFFLINE_ACCESS_CHANGED")) {
      return new NativeOfflineSyncError("courseChanged", status);
    }
    if (status === 403 || code === "OFFLINE_ACCOUNT_CHANGED") return new NativeOfflineSyncError("revoked", status);
  }
  return new NativeOfflineSyncError("http", status);
}

function deny(grant: NativeOfflineCourseAccess, now: number): NativeOfflineCourseAccess {
  return { ...grant, allowed: false, fullContent: false, chapterIds: [], leaseExpiresAt: now };
}

function restrictManifest(manifest: NativeOfflineManifestResponse, grant: NativeOfflineCourseAccess): NativeOfflineManifestResponse {
  const earlierChapters = new Set(grant.chapterIds);
  const chapterIds = manifest.resource.chapterIds.filter(chapter => earlierChapters.has(chapter));
  const allowedChapters = new Set(chapterIds);
  const leaseExpiresAt = Math.min(manifest.leaseExpiresAt, grant.leaseExpiresAt);
  return {
    ...manifest,
    leaseExpiresAt,
    resource: { ...grant, chapterIds, leaseExpiresAt, fullContent: grant.fullContent && manifest.resource.fullContent },
    resources: manifest.resources.filter(descriptor => descriptor.chapterIds.every(chapter => allowedChapters.has(chapter))),
  };
}

type SyncOptions = {
  session: NativeSessionTransport;
  locale: NativeOfflineLocale;
  repository: NativeOfflineMetadataRepository;
  now?: () => number;
};

export function createNativeOfflineSyncController({ session, locale, repository, now = Date.now }: SyncOptions) {
  if (locale !== "id" && locale !== "en") throw new TypeError("Unsupported offline metadata locale.");
  const scope: NativeOfflineScope = Object.freeze({ ...session.scope, locale });
  const lifetime = new AbortController();
  const accessListeners = new Set<AccessListener>();
  let targets: readonly string[] = [];
  let flight: Promise<NativeOfflineSnapshot | null> | undefined;

  const assertCurrent = () => {
    session.assertCurrent();
    if (lifetime.signal.aborted) {
      throw Object.assign(new Error("The offline metadata operation was cancelled."), { name: "AbortError" });
    }
  };

  async function request(path: string, init: NativeRequestInit, manifest = false): Promise<unknown> {
    assertCurrent();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    lifetime.signal.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
    let response: NativeResponse | undefined;
    try {
      const headers = new Headers(init.headers);
      headers.set(NATIVE_OFFLINE_HEADERS.accountId, scope.accountId);
      headers.set(NATIVE_OFFLINE_HEADERS.sessionId, scope.sessionId);
      headers.set("Origin", scope.origin);
      headers.set("Accept", "application/json");
      response = await session.request(path, { ...init, headers, signal: controller.signal });
      if (!response.ok) throw await failure(response, manifest);
      enforceScopeHeaders(response, scope);
      const body = await readJson(response);
      assertCurrent();
      return body;
    } catch (error) {
      assertCurrent();
      if (controller.signal.aborted) throw new NativeOfflineSyncError("timeout");
      throw error;
    } finally {
      clearTimeout(timeout);
      lifetime.signal.removeEventListener("abort", cancel);
      response?.dispose();
    }
  }

  async function syncPage(courseIds: string[], expectedCursor: string | null) {
    const value = await request("/api/offline/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cursor: expectedCursor, courseIds, locale }),
    });
    const response = parseNativeOfflineSyncResponse(value, scope, expectedCursor);
    if (response.leaseExpiresAt <= Math.max(now(), response.serverTime)) throw new NativeOfflineSyncError("revoked");
    const grants = new Map(response.access.map(item => [item.courseId, {
      ...item,
      leaseExpiresAt: Math.min(item.leaseExpiresAt, response.leaseExpiresAt),
    }]));
    if (courseIds.some(id => !grants.has(id))) throw new NativeOfflineSyncError("incomplete");
    for (const [id, grant] of grants) {
      if (grant.leaseExpiresAt <= Math.max(now(), response.serverTime)) grants.set(id, deny(grant, now()));
    }
    response.access = [...grants.values()];

    async function applyAccess() {
      assertCurrent();
      const revision = await repository.applyAccess(scope, { expectedCursor, response }, assertCurrent);
      assertCurrent();
      if (revision === null) throw new NativeOfflineSyncError("conflict");
      let snapshot: NativeOfflineSnapshot | null;
      try {
        snapshot = await repository.read(scope, now());
      } catch (error) {
        assertCurrent();
        for (const listener of accessListeners) listener(null);
        throw error;
      }
      assertCurrent();
      for (const listener of accessListeners) listener(snapshot);
      return { revision, snapshot };
    }

    const { revision, snapshot } = await applyAccess();
    let accessRevision = revision;
    const cachedCourses = new Map(snapshot?.courses.map(course => [course.id, course]));
    const manifests: NativeOfflineManifestResponse[] = [];
    // Enrollment discovery can start with an empty local database. The same
    // sync response contains the authorized grants for newly found courses.
    const manifestIds = new Set([...courseIds, ...response.enrollments.map(entry => entry.id)]);
    for (const courseId of manifestIds) {
      const grant = grants.get(courseId);
      if (!grant) continue;
      if (!grant.allowed) continue;
      const cached = cachedCourses.get(courseId);
      const changed = response.changes.some(change => (!change.courseId || change.courseId === courseId)
        && ["article", "diktat", "course_outline", "course", "policy", "access"].includes(change.kind));
      if (cached && !response.reset && !changed && cached.leaseExpiresAt > now()
        && cached.manifestCheckedAt !== undefined && now() - cached.manifestCheckedAt < response.policy.metadataMaxAgeMs) continue;

      const path = `/api/offline/manifest?${new URLSearchParams({ courseId, locale })}`;
      let manifest: NativeOfflineManifestResponse;
      try {
        const value = await request(path, { retry: "transient-read" }, true);
        manifest = restrictManifest(parseNativeOfflineManifestResponse(value, scope, courseId, response.cursor), grant);
        if (manifest.leaseExpiresAt <= Math.max(now(), manifest.serverTime)) throw new NativeOfflineSyncError("courseChanged");
      } catch (error) {
        if (error instanceof NativeOfflineSyncError && error.code === "courseChanged") {
          grants.set(courseId, deny(grant, now()));
          response.access = [...grants.values()];
          await applyAccess();
        }
        throw error;
      }
      if (grant.fullContent !== manifest.resource.fullContent || grant.chapterIds.length !== manifest.resource.chapterIds.length
        || grant.leaseExpiresAt !== manifest.leaseExpiresAt) {
        grants.set(courseId, manifest.resource);
        response.access = [...grants.values()];
        accessRevision = (await applyAccess()).revision;
      }
      manifests.push(manifest);
    }

    assertCurrent();
    if (response.leaseExpiresAt <= now() || manifests.some(manifest => manifest.leaseExpiresAt <= now())) {
      throw new NativeOfflineSyncError("incomplete");
    }
    if (!await repository.commitPage(scope, { expectedCursor, response, manifests, accessRevision }, assertCurrent)) {
      throw new NativeOfflineSyncError("conflict");
    }
    return response;
  }

  async function runPass(selected: readonly string[]): Promise<NativeOfflineSnapshot | null> {
    assertCurrent();
    const snapshot = await repository.read(scope, now());
    const courseIds = [...new Set([...selected, ...(snapshot?.knownCourseIds ?? [])])].slice(0, NATIVE_OFFLINE_COURSE_LIMIT);
    let cursor = snapshot?.cursor ?? null;
    if (cursor !== null && !isNativeOfflineCursor(cursor)) throw new NativeOfflineProtocolError();
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await syncPage(courseIds, cursor);
      cursor = response.cursor;
      assertCurrent();
      if (!response.hasMore) {
        const result = await repository.read(scope, now());
        assertCurrent();
        return result;
      }
    }
    throw new NativeOfflineSyncError("incomplete");
  }

  async function run(): Promise<NativeOfflineSnapshot | null> {
    try {
      let result: NativeOfflineSnapshot | null;
      let selected: readonly string[];
      do {
        selected = targets;
        result = await runPass(selected);
      } while (selected !== targets);
      return result;
    } catch (error) {
      assertCurrent();
      if (error instanceof NativeOfflineSyncError && error.code === "revoked") await repository.clear(scope, assertCurrent).catch(() => {});
      throw error;
    }
  }

  function sync(courseIds?: readonly string[]): Promise<NativeOfflineSnapshot | null> {
    if (courseIds) {
      const selected = [...new Set(courseIds)];
      if (selected.length > NATIVE_OFFLINE_COURSE_LIMIT || selected.some(id => !id.trim() || id.length > 256)) {
        return Promise.reject(new TypeError("Invalid offline course scope."));
      }
      if (JSON.stringify(selected) !== JSON.stringify(targets)) targets = selected;
    }
    return flight ??= run().finally(() => { flight = undefined; });
  }

  return {
    scope,
    sync,
    subscribeAccess(listener: AccessListener) {
      accessListeners.add(listener);
      return () => { accessListeners.delete(listener); };
    },
    resume: () => sync(),
    reconnect: () => sync(),
    retry: () => sync(),
    dispose() {
      lifetime.abort();
      accessListeners.clear();
    },
  };
}
