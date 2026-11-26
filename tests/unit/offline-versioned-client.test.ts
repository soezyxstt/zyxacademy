import { afterEach, describe, expect, test } from "bun:test";
import { isOfflineScheduledCheckDue } from "@/lib/date-utils";
import { createOfflineScope, setOfflineScope, getOfflineScope, captureOfflineScope, isOfflineScopeCurrent, scopedReadingKey } from "@/lib/offline/cache-scope";
import { canApplyOfflineValidation, canReplaceOfflineRecord, clearAllOfflineReadings, clearOfflineReadingsForOtherUsers, isOfflineRecordReadable, offlineReadingGeneration, selectEvictionKeys, type OfflineReadingRecord } from "@/lib/offline/reading-cache";
import { emptyOfflineSnapshot, parsePersistableQuery } from "@/lib/offline/metadata-cache";
import { createOfflineSyncController, offlineAccessAllowsRecord, type OfflineSyncRepository } from "@/lib/offline/sync-client";
import { DEFAULT_OFFLINE_POLICY, OFFLINE_HEADERS, offlineResourceKey, type OfflineResourceDescriptor, type OfflineResourceKind, type OfflineSyncResponse } from "@/lib/offline/sync-contract";
import { downloadOfflineImages } from "@/lib/offline/asset-cache";
import { offlineEnvelopeSchema } from "@/lib/offline/client-validation";
import { visibleOfflineLibrary } from "@/lib/offline/library-access";

const scope = createOfflineScope("student", "https://staging.zyxacademy.com", "id");
const now = Date.now();
const key = scopedReadingKey(scope, "course", "article");
const reading = (overrides: Partial<OfflineReadingRecord> = {}): OfflineReadingRecord => ({ key, userId: scope.userId, courseId: "course", materialId: "article", kind: "structured_article", title: "Materi", sizeBytes: 1024, savedAt: now, lastAccessedAt: now, schemaVersion: 2, scopeKey: scope.scopeKey, environment: scope.environment, locale: scope.locale, contentVersion: "v1", contentCursor: "1", lastVerifiedAt: now, accessValidUntil: now + 3600_000, chapterIds: ["chapter"], assetsComplete: true, ...overrides });
afterEach(() => { setOfflineScope(null); });

function mockFetch(handler: (...args: Parameters<typeof fetch>) => Promise<Response>): typeof fetch {
  return Object.assign(handler, { preconnect: () => {} });
}

test("account and locale changes fence already-started cache writes", () => {
  setOfflineScope(scope);
  const token = captureOfflineScope(scope.userId)!;
  expect(isOfflineScopeCurrent(token)).toBe(true);
  setOfflineScope(createOfflineScope(scope.userId, scope.environment, "en"));
  expect(isOfflineScopeCurrent(token)).toBe(false);
  expect(scopedReadingKey(scope, "c", "m")).not.toBe(scopedReadingKey(createOfflineScope(scope.userId, "https://zyxacademy.com", "id"), "c", "m"));
  setOfflineScope(createOfflineScope("other", scope.environment, "id"));
  expect(isOfflineRecordReadable(reading(), createOfflineScope("other", scope.environment, "id"))).toBe(false);
});

test("expired and incomplete packages stay unavailable; late versions cannot replace a newer package", () => {
  expect(isOfflineRecordReadable(reading(), scope, now)).toBe(true);
  expect(isOfflineRecordReadable(reading({ accessValidUntil: now }), scope, now)).toBe(false);
  expect(isOfflineRecordReadable(reading({ assetsComplete: false }), scope, now)).toBe(false);
  expect(canReplaceOfflineRecord(reading({ contentCursor: "9" }), reading({ contentCursor: "8" }))).toBe(false);
  expect(canReplaceOfflineRecord(reading({ requiredCursor: "12", invalidated: true }), reading({ contentCursor: "11" }))).toBe(false);
  expect(canReplaceOfflineRecord(reading({ requiredCursor: "12" }), reading({ contentCursor: "12", contentVersion: "new" }))).toBe(true);
});

test("a 304 cannot clear an invalidation committed after its request began", () => {
  const generation = offlineReadingGeneration(key);
  expect(canApplyOfflineValidation(reading({ requiredCursor: "9", invalidated: true }), { cursor: "8", generation })).toBe(false);
  expect(canApplyOfflineValidation(reading({ requiredCursor: "9", invalidated: true }), { cursor: "9", generation })).toBe(true);
});

test("full-content access still enforces the current chapter scope", () => {
  const grant = { courseId: "course", allowed: true, fullContent: true, chapterIds: ["chapter"], leaseExpiresAt: now + 1000 };
  expect(offlineAccessAllowsRecord(grant, reading())).toBe(true);
  expect(offlineAccessAllowsRecord(grant, reading({ chapterIds: ["revoked-chapter"] }))).toBe(false);
  expect(offlineAccessAllowsRecord({ ...grant, allowed: false }, reading())).toBe(false);
  expect(offlineAccessAllowsRecord(grant, reading({ chapterIds: [] }))).toBe(false);
});

test("eviction preserves pinned downloads and evicts the least recently read automatic item", () => {
  expect(selectEvictionKeys([{ key: "pinned", pinned: true, sizeBytes: 500, lastAccessedAt: 1 }, { key: "old", sizeBytes: 400, lastAccessedAt: 2 }, { key: "new", sizeBytes: 400, lastAccessedAt: 3 }], 2, 1000)).toEqual(["old"]);
});

test("query persistence projects only small course metadata, without progress or arbitrary private responses", () => {
  expect(parsePersistableQuery(["zyx", "account", "student", "student", "enrollments"], [{ id: "c", title: "Fisika", token: "secret" }], "student")).toEqual([{ id: "c", title: "Fisika" }]);
  expect(parsePersistableQuery(["zyx", "account", "other", "student", "enrollments"], [], "student")).toBeUndefined();
  expect(parsePersistableQuery(["zyx", "account", "student", "quizzes", "attempt", "x"], { answers: {} }, "student")).toBeUndefined();
  expect(parsePersistableQuery(["zyx", "account", "student", "student", "course", "a"], { id: "b", title: "Bad identity" }, "student")).toBeUndefined();
});

test("Friday checks use Jakarta boundaries and catch missed dates and clock regression", () => {
  const schedule = { frequency: "weekly" as const, weekday: 5, hour: 6, timeZone: "Asia/Jakarta" as const };
  const before = Date.parse("2026-11-27T05:59:00+07:00");
  const at = Date.parse("2026-11-27T06:00:00+07:00");
  expect(isOfflineScheduledCheckDue(before, at, schedule)).toBe(true);
  expect(isOfflineScheduledCheckDue(at, at + 60_000, schedule)).toBe(false);
  expect(isOfflineScheduledCheckDue(0, at, schedule)).toBe(true);
  expect(isOfflineScheduledCheckDue(at, Date.parse("2026-12-12T18:00:00+07:00"), schedule)).toBe(true);
  expect(isOfflineScheduledCheckDue(at + 1, at, schedule)).toBe(true);
  expect(isOfflineScheduledCheckDue(at - 1000, before, schedule)).toBe(true);
});

test("required image failures reject the new package instead of declaring it offline ready", async () => {
  const resource = { kind: "article" as const, id: "a", courseId: "c" };
  const fetcher = mockFetch(async () => new Response("missing", { status: 404 }));
  await expect(downloadOfflineImages({ resource, fetcher, assets: [{ url: "/api/offline/asset?asset=figure", required: true }] })).rejects.toThrow();
  expect(await downloadOfflineImages({ resource, fetcher, assets: [{ url: "/api/offline/asset?asset=thumb", required: false }] })).toEqual([]);
});

function fixture() {
  setOfflineScope(scope);
  let stored: ReturnType<typeof emptyOfflineSnapshot> = { ...emptyOfflineSnapshot(scope), syncCursor: "1", lastVerifiedAt: now - 1000, accessValidUntil: now + 3600_000, courses: [{ id: "course", title: "Fisika" }] };
  const records = new Map([[key, reading({ pinned: true })]]);
  let rejectPackage = false;
  let writes = 0;
  const repository: OfflineSyncRepository = {
    readSnapshot: async () => structuredClone(stored),
    writeSnapshot: async (value, token) => { if (!isOfflineScopeCurrent(token)) return false; stored = structuredClone(value); writes++; return true; },
    listReadings: async () => [...records.values()].map(value => ({ ...value })),
    removeReading: async key => { records.delete(key); },
    patchReading: async (key, patch, validation) => { const current = records.get(key); if (!current || (patch.invalidated === false && (!validation || !canApplyOfflineValidation(current, validation)))) return false; records.set(key, { ...current, ...patch }); return true; },
    cacheReading: async (envelope, _token, options) => { if (rejectPackage || options.canWrite?.() === false) return false; records.set(key, reading({ contentVersion: envelope.resource.revision, contentCursor: envelope.cursor, pinned: options.pinned })); return true; },
  };
  const identity = { protocolVersion: 1 as const, accountId: scope.userId, sessionId: "session", environment: scope.environment, locale: scope.locale };
  const descriptor = (kind: OfflineResourceKind, id: string, courseId: string | null): OfflineResourceDescriptor => ({ key: offlineResourceKey(kind, id, courseId), kind, id, courseId, chapterIds: ["chapter"], title: "Materi", revision: "v2", updatedAt: now, estimatedBytes: 1000 });
  const data = {
    id: "article", courseId: "course", chapterId: "chapter", slug: "article", title: "Materi", courseTitle: "Fisika", chapterTitle: null, chapterNumber: null, version: 2, totalEstimatedReadingMinutes: 1,
    sections: [{ id: "s", slug: "s", title: "Pendahuluan", sectionNumber: "1", sectionKind: "topic", learningObjective: "Belajar", estimatedReadingMinutes: 1, orderIndex: 0, parentSectionId: null, blocks: [{ id: "b", blockKey: "b", blockType: "explanation", title: null, orderIndex: 0, content: "Versi baru" }] }],
  };
  const grant = { courseId: "course", allowed: true, fullContent: true, chapterIds: ["chapter"], leaseExpiresAt: now + 3600_000 };
  const delta: OfflineSyncResponse = { ...identity, cursor: "2", reset: false, hasMore: false, serverTime: now, leaseExpiresAt: now + 3600_000, policy: DEFAULT_OFFLINE_POLICY, enrollments: [{ id: "course", title: "Fisika", expiresAt: null }], access: [grant], changes: [{ cursor: "2", kind: "article", resourceId: "article", courseId: "course", action: "upsert", revision: "v2" }] };
  const fetcher = mockFetch(async input => {
    const url = new URL(String(input), scope.environment);
    if (url.pathname === "/api/offline/sync") return Response.json(delta);
    if (url.pathname === "/api/offline/manifest") return Response.json({ ...identity, cursor: "2", serverTime: now, leaseExpiresAt: grant.leaseExpiresAt, resource: grant, resources: [descriptor("article", "article", "course")] });
    const kind = url.searchParams.get("kind") as OfflineResourceKind;
    const id = url.searchParams.get("id")!;
    const courseId = url.searchParams.get("courseId");
    const content = kind === "article" ? data : kind === "course_outline" ? { id: "course", title: "Fisika", chapters: [], materials: [descriptor("article", "article", "course")] } : kind === "video_catalog" ? { videos: [], playlists: [] } : { achievements: [] };
    return Response.json({ ...identity, resource: descriptor(kind, id, courseId), cursor: "2", validatedAt: now, leaseExpiresAt: grant.leaseExpiresAt, data: content, assets: [] });
  });
  return { repository, fetcher, records, delta, data, identity, descriptor, get stored() { return stored; }, get writes() { return writes; }, rejectPackages(value: boolean) { rejectPackage = value; } };
}

describe("durable sync recovery", () => {
  test.each(["course_outline", "video_catalog"] as const)("%s renews expired library entries on a 304", async kind => {
    const f = fixture();
    f.records.clear();
    f.delta.changes = [];
    const grant = f.delta.access[0]!;
    grant.leaseExpiresAt = now + 3000;
    const article = f.descriptor("article", "article", "course");
    const revoked = { ...f.descriptor("diktat", "revoked", "course"), chapterIds: ["revoked-chapter"] };
    const thumbnail = "data:image/png;base64,AA==";
    const video = { id: "video", title: "Video", videoUrl: "youtube/abc", thumbnailUrl: thumbnail, playlistId: null, durationSeconds: null };
    const material = kind === "course_outline" ? article : { ...video, kind: "video" };
    const resource = f.descriptor(kind, "course", "course");
    const { key: catalogKey } = resource;
    const expired = now - 1;
    f.stored.resources[catalogKey] = {
      ...f.identity, resource, cursor: "1", validatedAt: expired,
      // Older clients could already renew the outline envelope but leave its derived rows expired.
      leaseExpiresAt: kind === "course_outline" ? now + 1000 : expired,
      data: kind === "course_outline"
        ? { id: "course", title: "Fisika", chapters: [], materials: [article, revoked] }
        : { videos: [video], playlists: [] },
      assets: kind === "video_catalog" ? [{ url: "/api/offline/asset?asset=thumb", required: false }] : [],
    };
    const siblingKind = kind === "course_outline" ? "video_catalog" : "course_outline";
    for (const sibling of [siblingKind, "achievement_catalog"] as const) {
      const courseId = sibling === "achievement_catalog" ? null : "course";
      const id = courseId ?? "catalog";
      const response = await f.fetcher(`/api/offline/resource?kind=${sibling}&id=${id}${courseId ? "&courseId=course" : ""}`);
      f.stored.resources[offlineResourceKey(sibling, id, courseId)] = offlineEnvelopeSchema.parse(await response.json());
    }
    f.stored.manifests.course = { cursor: "1", checkedAt: now, resources: [article] };
    f.stored.materials = [{ id: material.id, courseId: "course", title: material.title, kind: material.kind, contentVersion: "v2", accessValidUntil: expired, ...(kind === "video_catalog" ? { thumbnailUrl: thumbnail } : {}) }];
    expect(visibleOfflineLibrary(f.stored, now)?.materials).toEqual([]);
    let conditionalRequests = 0;
    const fetcher = mockFetch(async (input, init) => {
      if (String(input).includes(`kind=${kind}`)) {
        conditionalRequests++;
        expect(new Headers(init?.headers).get("If-None-Match")).toBe('"v2"');
        return new Response(null, { status: 304, headers: {
          [OFFLINE_HEADERS.accountId]: f.identity.accountId,
          [OFFLINE_HEADERS.sessionId]: f.identity.sessionId,
          [OFFLINE_HEADERS.environment]: f.identity.environment,
          [OFFLINE_HEADERS.locale]: f.identity.locale,
          [OFFLINE_HEADERS.cursor]: "2",
          [OFFLINE_HEADERS.revision]: "v2",
          [OFFLINE_HEADERS.validatedAt]: String(now),
          [OFFLINE_HEADERS.leaseExpiresAt]: String(now + 6000),
        } });
      }
      return f.fetcher(input, init);
    });
    const controller = createOfflineSyncController({ scope, repository: f.repository, fetcher, now: () => now });
    try {
      await controller.sync();
      expect(conditionalRequests).toBe(1);
      expect(f.stored.syncState).toBe("ready");
      expect(f.stored.resources[catalogKey]).toMatchObject({ cursor: "2", validatedAt: now, leaseExpiresAt: grant.leaseExpiresAt });
      expect(f.stored.courses).toEqual([{ id: "course", title: "Fisika", accessValidUntil: grant.leaseExpiresAt, chapterIds: ["chapter"] }]);
      const materials = visibleOfflineLibrary(f.stored, now)?.materials;
      expect(materials?.find(item => item.id === material.id)).toMatchObject({ id: material.id, kind: material.kind, accessValidUntil: grant.leaseExpiresAt });
      expect(materials?.some(item => item.id === "revoked")).toBe(false);
      if (kind === "video_catalog") {
        expect(materials?.find(item => item.id === "video")).toMatchObject({ videoUrl: video.videoUrl, thumbnailUrl: undefined });
        expect((f.stored.resources[catalogKey]?.data as { videos: Array<{ thumbnailUrl: string | null }> }).videos[0]?.thumbnailUrl).toBeNull();
      }
      expect(visibleOfflineLibrary(f.stored, grant.leaseExpiresAt)?.materials).toEqual([]);
    } finally {
      controller.dispose();
    }
  });

  test.each([
    { label: "complete with current access", patch: {}, reset: false, requests: 0 },
    { label: "incomplete", patch: { assetsComplete: false }, reset: false, requests: 1 },
    { label: "invalidated", patch: { invalidated: true }, reset: false, requests: 1 },
    { label: "stale", patch: { lastVerifiedAt: now - DEFAULT_OFFLINE_POLICY.contentMaxAgeMs }, reset: false, requests: 1 },
    { label: "expired", patch: { accessValidUntil: now }, reset: false, requests: 1 },
    { label: "complete after a cursor reset", patch: {}, reset: true, requests: 1 },
  ])("scheduled manifest reconciliation handles a package that is $label", async ({ patch, reset, requests }) => {
    const f = fixture();
    f.stored.lastVerifiedAt = now - 8 * 86_400_000;
    f.stored.manifests.course = { cursor: "1", checkedAt: now, resources: [f.descriptor("article", "article", "course")] };
    f.records.set(key, reading({ contentVersion: "v2", pinned: true, lastVerifiedAt: now - 1000, accessValidUntil: now + 1000, ...patch }));
    f.delta.changes = [];
    f.delta.reset = reset;
    let manifestRequests = 0;
    const validators: (string | null)[] = [];
    const fetcher = mockFetch(async (input, init) => {
      if (String(input).startsWith("/api/offline/manifest?")) manifestRequests++;
      if (String(input).includes("kind=article")) validators.push(new Headers(init?.headers).get("If-None-Match"));
      return f.fetcher(input, init);
    });
    const controller = createOfflineSyncController({ scope, repository: f.repository, fetcher, now: () => now });
    try {
      await controller.sync();
      expect(manifestRequests).toBe(1);
      expect(validators).toEqual(requests ? [("assetsComplete" in patch) ? null : '"v2"'] : []);
      expect(f.records.get(key)).toMatchObject({ assetsComplete: true, pinned: true, lastVerifiedAt: now, accessValidUntil: f.delta.leaseExpiresAt });
      expect(f.stored.syncState).toBe("ready");
    } finally {
      controller.dispose();
    }
  });

  test("clearing downloads preserves active sync and fences old packages; logout still revokes the scope", async () => {
    const originalWindow = globalThis.window;
    const storage = new Map<string, string>();
    const nativeRecords = new Map<string, Record<string, unknown>>([
      [key, { ...reading(), pinned: true }],
      ["another-scope", { key: "another-scope", scopeKey: "other" }],
    ]);
    const clearedAccounts: string[] = [];
    let clearedLibraries = 0;
    Object.assign(globalThis, { window: {
      location: { origin: scope.environment },
      dispatchEvent: () => true,
      localStorage: {
        get length() { return storage.size; },
        key: (index: number) => [...storage.keys()][index] ?? null,
        getItem: (name: string) => storage.get(name) ?? null,
        setItem: (name: string, value: string) => { storage.set(name, value); },
        removeItem: (name: string) => { storage.delete(name); },
      },
      Capacitor: { isNativePlatform: () => true, Plugins: { ZyxOfflineStore: {
        listReadings: async () => ({ items: [...nativeRecords.values()] }),
        removeReading: async ({ key }: { key: string }) => { nativeRecords.delete(key); },
        clearOtherUsers: async ({ userId }: { userId: string }) => { clearedAccounts.push(userId); nativeRecords.clear(); },
        clearLibrarySnapshot: async () => { clearedLibraries++; },
      } } },
    } });
    const f = fixture();
    let finish!: (response: Response) => void;
    let started!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    let delay = true;
    const fetcher = mockFetch(async (input, init) => {
      if (delay && String(input).includes("kind=article")) {
        delay = false;
        started();
        return new Promise<Response>(resolve => { finish = resolve; });
      }
      return f.fetcher(input, init);
    });
    const controller = createOfflineSyncController({ scope, repository: f.repository, fetcher, now: () => now });
    try {
      const token = captureOfflineScope(scope.userId)!;
      const generation = offlineReadingGeneration(key);
      const oldRequest = controller.refreshResource({ kind: "article", id: "article", courseId: "course" }, { force: true });
      await start;
      await clearAllOfflineReadings();
      expect(nativeRecords.has(key)).toBe(false);
      expect(nativeRecords.has("another-scope")).toBe(true);
      expect(clearedAccounts).toEqual([]);
      expect(clearedLibraries).toBe(0);
      expect(getOfflineScope()).toEqual(scope);
      expect(isOfflineScopeCurrent(token)).toBe(true);
      expect(offlineReadingGeneration(key)).toBeGreaterThan(generation);
      expect(canApplyOfflineValidation(reading(), { cursor: "2", generation })).toBe(false);
      finish(await f.fetcher("/api/offline/resource?kind=article&id=article&courseId=course&locale=id"));
      expect(await oldRequest).toBe(false);
      expect(f.records.get(key)?.contentVersion).toBe("v1");
      await controller.sync();
      expect(f.stored.syncState).toBe("ready");
      expect(f.records.get(key)?.contentVersion).toBe("v2");
      const writes = f.writes;
      await clearOfflineReadingsForOtherUsers(null);
      expect(clearedAccounts).toEqual([""]);
      expect(getOfflineScope()).toBeNull();
      expect(isOfflineScopeCurrent(token)).toBe(false);
      await expect(controller.sync()).rejects.toThrow("Offline account changed");
      expect(f.writes).toBe(writes);
    } finally {
      controller.dispose();
      if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
      else globalThis.window = originalWindow;
    }
  });

  test("startup retrieves changes missed while offline without any push; failed download retries next sync", async () => {
    const f = fixture();
    f.rejectPackages(true);
    const controller = createOfflineSyncController({ scope, repository: f.repository, fetcher: f.fetcher, now: () => now });
    await controller.sync();
    expect(f.records.get(key)?.contentVersion).toBe("v1");
    expect(f.records.get(key)?.invalidated).toBe(true);
    expect(f.stored.syncCursor).toBe("1");
    expect(f.stored.syncState).toBe("error");
    f.rejectPackages(false);
    await controller.sync();
    expect(f.records.get(key)?.contentVersion).toBe("v2");
    expect(f.stored.syncCursor).toBe("2");
    expect(f.stored.syncState).toBe("ready");
    controller.dispose();
  });

  test("a response that arrives after switching accounts never hydrates the next account", async () => {
    const f = fixture();
    let finish!: (value: Response) => void;
    let started!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    const fetcher = mockFetch(async () => new Promise<Response>(resolve => { finish = resolve; started(); }));
    const controller = createOfflineSyncController({ scope, repository: f.repository, fetcher });
    const task = controller.sync();
    await start;
    setOfflineScope(createOfflineScope("other", scope.environment, "id"));
    finish(Response.json(f.delta));
    await task;
    expect(f.writes).toBe(0);
    expect(f.records.get(key)?.contentVersion).toBe("v1");
    controller.dispose();
  });

  test("server projections strip private progress and do not accept a malformed public document", () => {
    const f = fixture();
    const envelope = { ...f.identity, resource: f.descriptor("article", "article", "course"), cursor: "2", validatedAt: now, leaseExpiresAt: now + 1000, assets: [], data: { ...f.data, progress: { completed: true }, privateAnswer: "secret" } };
    const parsed = offlineEnvelopeSchema.parse(envelope);
    expect(parsed.data).not.toHaveProperty("progress");
    expect(parsed.data).not.toHaveProperty("privateAnswer");
    expect(() => offlineEnvelopeSchema.parse({ ...envelope, data: { ...f.data, sections: "broken" } })).toThrow();
  });
});
