import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { createOfflineMetadataLifecycle } from "../../apps/mobile-native/offline/lifecycle";
import { createOfflineMetadataStore } from "../../apps/mobile-native/offline/metadata-store";
import { createNativeOfflineSyncController } from "../../apps/mobile-native/offline/sync-client";
import type {
  NativeOfflineCourseAccess,
  NativeOfflineManifestResponse,
  NativeOfflineResourceDescriptor,
  NativeOfflineSyncResponse,
} from "../../apps/mobile-native/offline/sync-contract";

const origin = "https://staging.example.test";
const scope = { origin, accountId: "learner", sessionId: "verified-session", locale: "id" } as const;
const verifiedAt = 1_750_000_000_000;
const leaseExpiresAt = verifiedAt + 86_400_000;
const descriptor: NativeOfflineResourceDescriptor = {
  key: JSON.stringify(["article", "course-1", "material-1"]),
  kind: "article",
  courseId: "course-1",
  id: "material-1",
  title: "Simpangan baku",
  chapterIds: ["chapter-1"],
  revision: "r1",
  updatedAt: verifiedAt,
  estimatedBytes: 1200,
};
const grant: NativeOfflineCourseAccess = {
  courseId: "course-1", fullContent: true, allowed: true, chapterIds: ["chapter-1", "chapter-2"], leaseExpiresAt,
};
const firstCursor = "9007199254740993";

const identity = (cursor: string) => ({
  protocolVersion: 1 as const,
  environment: origin,
  accountId: scope.accountId,
  sessionId: scope.sessionId,
  locale: scope.locale,
  cursor,
  serverTime: verifiedAt,
  leaseExpiresAt,
});
function page(cursor = firstCursor, updates: Partial<NativeOfflineSyncResponse> = {}): NativeOfflineSyncResponse {
  return {
    ...identity(cursor), reset: true, hasMore: false,
    access: [grant],
    enrollments: [{ id: "course-1", title: "Statistika", expiresAt: null }],
    changes: [],
    policy: {
      metadataMaxAgeMs: 86_400_000, contentMaxAgeMs: 604_800_000, retentionMs: 2_592_000_000,
      accessLeaseMs: 86_400_000, activeCheckIntervalMs: 60_000, maxBytes: 104_857_600, maxEntries: 250,
      autoCache: true, wifiOnly: false,
      schedule: { frequency: "weekly", weekday: 5, hour: 6, timeZone: "Asia/Jakarta" },
      revision: 1, updatedAt: 0,
    },
    ...updates,
  };
}
function manifest(cursor = firstCursor, updates: Partial<NativeOfflineManifestResponse> = {}): NativeOfflineManifestResponse {
  return { ...identity(cursor), resource: grant, resources: [descriptor], ...updates };
}

const headers = {
  "x-offline-account-id": scope.accountId,
  "x-offline-session-id": scope.sessionId,
  "x-offline-environment": scope.origin,
  "x-offline-locale": scope.locale,
};

function authorized(value: unknown, responseHeaders: HeadersInit = headers) {
  return Response.json(value, { headers: responseHeaders });
}

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

type Respond = (url: URL, init: RequestInit) => Response | Promise<Response>;
function setup(...responses: Array<Response | Respond>) {
  const db = new Database(":memory:");
  databases.push(db);
  const repository = createOfflineMetadataStore({
    async execAsync(sql) { db.exec(sql); },
    async getFirstAsync<T>(sql: string, ...values: Array<string | number | null>) { return db.query<T, typeof values>(sql).get(...values); },
    async runAsync(sql, ...values) { return db.run(sql, values); },
  });
  const observed: Array<{ path: string; body?: unknown }> = [];
  const transport = createNativeTransport({
    origin,
    fetcher: async (url, init) => {
      const parsed = new URL(url);
      const requestHeaders = new Headers(init.headers);
      expect(requestHeaders.get("Cookie")).toBe("session=verified");
      expect(requestHeaders.get("Origin")).toBe(origin);
      expect(requestHeaders.get("x-offline-account-id")).toBe(scope.accountId);
      expect(requestHeaders.get("x-offline-session-id")).toBe(scope.sessionId);
      observed.push({ path: parsed.pathname + parsed.search, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const next = responses.shift();
      if (!next) throw new Error("Unexpected fixture request");
      return typeof next === "function" ? next(parsed, init) : next;
    },
  });
  const session = transport.setSession({ ...scope, readCookie: () => "session=verified" });
  let clock = verifiedAt;
  const controller = createNativeOfflineSyncController({ session, locale: scope.locale, repository, now: () => clock });
  return { controller, transport, observed, repository, setNow: (now: number) => { clock = now; } };
}

describe("Expo offline metadata synchronization", () => {
  test("publishes the authorized lifecycle projection before another course manifest finishes", async () => {
    const retainedGrant = { ...grant, courseId: "course-2" };
    const retainedMaterial = { ...descriptor, courseId: "course-2", key: '["article","course-2","material-1"]' };
    const enrollments = [
      { id: "course-1", title: "Statistika", expiresAt: null },
      { id: "course-2", title: "Geometri", expiresAt: null },
    ];
    const next = "9007199254740994";
    const manifestStarted = Promise.withResolvers<void>();
    const pendingManifest = Promise.withResolvers<Response>();
    const fixture = setup(
      authorized(page(firstCursor, { access: [grant, retainedGrant], enrollments })),
      authorized(manifest()),
      authorized(manifest(firstCursor, { resource: retainedGrant, resources: [retainedMaterial] })),
      authorized(page(next, {
        reset: false,
        access: [{ ...grant, allowed: false, fullContent: false, chapterIds: [] }, retainedGrant],
        enrollments,
        changes: [{ cursor: next, kind: "course", courseId: "course-2", resourceId: null, action: "invalidate", revision: null }],
      })),
      url => {
        expect(url.pathname + url.search).toBe("/api/offline/manifest?courseId=course-2&locale=id");
        manifestStarted.resolve();
        return pendingManifest.promise;
      },
    );
    await fixture.controller.sync(["course-1", "course-2"]);
    const lifecycle = createOfflineMetadataLifecycle({
      read: () => fixture.repository.read(scope, verifiedAt),
      async sync(courseIds, publishAccess) {
        const stop = fixture.controller.subscribeAccess(publishAccess);
        try {
          await fixture.controller.sync(courseIds);
        } finally {
          stop();
        }
      },
      cancelSync: fixture.controller.dispose,
      now: () => verifiedAt,
      schedule: () => () => {},
    });
    const completed = Promise.withResolvers<void>();
    const titles: string[][] = [];
    const unsubscribe = lifecycle.subscribe(() => {
      const { status, snapshot } = lifecycle.getSnapshot();
      titles.push(snapshot?.courses.map(course => course.title) ?? []);
      if (status === "ready") completed.resolve();
    });
    lifecycle.setEnvironment({ foreground: true, online: true, verified: true, expiresAt: leaseExpiresAt });
    lifecycle.register(["course-1", "course-2"]);
    try {
      await manifestStarted.promise;
      expect(titles).toContainEqual(["Statistika", "Geometri"]);
      expect(lifecycle.getSnapshot()).toMatchObject({
        status: "syncing",
        snapshot: { cursor: firstCursor, knownCourseIds: ["course-2"], courses: [{ title: "Geometri", materials: [] }] },
      });
      expect((await fixture.repository.read(scope, verifiedAt))?.knownCourseIds).toEqual(["course-2"]);
      pendingManifest.resolve(authorized(manifest(next, { resource: retainedGrant, resources: [retainedMaterial] })));
      await completed.promise;
      expect(lifecycle.getSnapshot().snapshot).toMatchObject({
        cursor: next,
        courses: [{ title: "Geometri", materials: [retainedMaterial] }],
      });
    } finally {
      lifecycle.dispose();
      unsubscribe();
      pendingManifest.resolve(new Response(null, { status: 503 }));
    }
  });

  test("still reports a revoked session if clearing local metadata fails", async () => {
    const fixture = setup(new Response(null, { status: 401 }));
    let purgeAttempted = false;
    fixture.repository.clear = async () => {
      purgeAttempted = true;
      throw new Error("SQLite unavailable");
    };
    await expect(fixture.controller.sync(["course-1"])).rejects.toMatchObject({ code: "revoked" });
    expect(purgeAttempted).toBe(true);
  });

  test("uses the deployed endpoint envelopes, stores only manifest descriptors and resumes from a precise cursor", async () => {
    const extraFields = { ...descriptor, body: "not authorized for metadata persistence" };
    const fixture = setup(
      authorized(page()),
      authorized({ ...manifest(), resources: [extraFields] }),
      authorized(page(firstCursor, { reset: false })),
    );
    const snapshot = await fixture.controller.sync(["course-1", "course-1"]);
    expect(snapshot).toEqual({
      cursor: firstCursor,
      knownCourseIds: ["course-1"],
      activeCheckIntervalMs: 60_000,
      courses: [{ id: "course-1", title: "Statistika", leaseExpiresAt, manifestCheckedAt: verifiedAt,
        manifestLeaseExpiresAt: leaseExpiresAt, materials: [descriptor] }],
    });
    expect(await fixture.controller.resume()).toEqual(snapshot);
    expect(fixture.observed).toEqual([
      { path: "/api/offline/sync", body: { cursor: null, courseIds: ["course-1"], locale: "id" } },
      { path: "/api/offline/manifest?courseId=course-1&locale=id" },
      { path: "/api/offline/sync", body: { cursor: firstCursor, courseIds: ["course-1"], locale: "id" } },
    ]);
  });

  test("re-fetches expired manifests and leaves their previous lease in force on failure", async () => {
    const shortLease = verifiedAt + 100;
    const nextManifestTime = shortLease + 5;
    const fixture = setup(
      authorized(page()),
      authorized(manifest(firstCursor, { leaseExpiresAt: shortLease })),
      authorized(page(firstCursor, { reset: false, serverTime: nextManifestTime })),
      new Response(null, { status: 503 }),
      new Response(null, { status: 503 }),
      authorized(page(firstCursor, { reset: false, serverTime: nextManifestTime })),
      authorized(manifest(firstCursor, { serverTime: nextManifestTime })),
    );
    expect((await fixture.controller.sync(["course-1"]))?.courses[0]?.materials).toEqual([descriptor]);
    fixture.setNow(nextManifestTime);
    await expect(fixture.controller.reconnect()).rejects.toMatchObject({ code: "http", status: 503 });
    expect((await fixture.repository.read(scope, nextManifestTime))?.courses[0]?.materials).toEqual([]);
    expect((await fixture.controller.retry())?.courses[0]?.materials).toEqual([descriptor]);
    expect(fixture.observed.filter(entry => entry.path.startsWith("/api/offline/manifest"))).toHaveLength(4);
  });

  test("acknowledges each complete page and holds the cursor on incomplete reconciliation", async () => {
    const next = "9007199254740994";
    const end = "9007199254740995";
    const deletePage = page(end, {
      reset: false,
      changes: [{ cursor: end, kind: "article", courseId: "course-1", resourceId: "material-1", action: "delete", revision: null }],
    });
    const fixture = setup(
      authorized(page()),
      authorized(manifest()),
      authorized(page(next, { reset: false, hasMore: true })),
      authorized(deletePage),
      authorized(manifest(next, { resources: [] })),
      authorized(deletePage),
      authorized(manifest(end, { resources: [] })),
    );
    await fixture.controller.sync(["course-1"]);
    await expect(fixture.controller.reconnect()).rejects.toMatchObject({ name: "NativeOfflineProtocolError" });
    const incomplete = await fixture.repository.read(scope, verifiedAt);
    expect(incomplete?.cursor).toBe(next);
    expect(incomplete?.courses[0]?.materials).toEqual([]);
    const recovered = await fixture.controller.retry();
    expect(recovered?.cursor).toBe(end);
    expect(recovered?.courses[0]?.materials).toEqual([]);
  });

  test("requires matching response headers and strict course identity before committing metadata", async () => {
    const fixture = setup(
      authorized(page(), { ...headers, "x-offline-locale": "en" }),
      authorized(page()),
      authorized(manifest(firstCursor, { sessionId: "another-session" })),
      authorized(page()),
      authorized(manifest(firstCursor, { resources: [{ ...descriptor, chapterIds: ["disallowed"] }] })),
    );
    await expect(fixture.controller.sync(["course-1"])).rejects.toMatchObject({ name: "NativeOfflineProtocolError" });
    expect(await fixture.repository.read(scope, verifiedAt)).toBeNull();

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(fixture.controller.retry()).rejects.toMatchObject({ name: "NativeOfflineProtocolError" });
      expect((await fixture.repository.read(scope, verifiedAt))?.cursor).toBeNull();
      expect((await fixture.repository.read(scope, verifiedAt))?.courses[0]?.materials).toEqual([]);
    }
  });

  test("removes a course denied by the manifest before retry and clears the scope on session denial", async () => {
    const next = "9007199254740994";
    const end = "9007199254740995";
    const fixture = setup(
      authorized(page()),
      authorized(manifest()),
      authorized(page(next, { reset: false, changes: [
        { cursor: next, kind: "course", courseId: "course-1", resourceId: null, action: "invalidate", revision: null },
      ] })),
      Response.json({ code: "OFFLINE_COURSE_ACCESS_DENIED" }, { status: 403 }),
      authorized(page(end, { reset: false, access: [{ ...grant, allowed: false, chapterIds: [] }] })),
      new Response(null, { status: 401 }),
    );
    await fixture.controller.sync(["course-1"]);
    await expect(fixture.controller.resume()).rejects.toMatchObject({ code: "courseChanged", status: 403 });
    expect((await fixture.repository.read(scope, verifiedAt))?.courses).toEqual([]);
    expect((await fixture.repository.read(scope, verifiedAt))?.cursor).toBe(firstCursor);
    expect((await fixture.controller.retry())?.cursor).toBe(end);
    await expect(fixture.controller.reconnect()).rejects.toMatchObject({ code: "revoked", status: 401 });
    expect(await fixture.repository.read(scope, verifiedAt)).toBeNull();
  });

  test("keeps narrower chapters and accepts a lower cursor only with a complete server reset", async () => {
    const chapterTwo: NativeOfflineResourceDescriptor = {
      ...descriptor, key: JSON.stringify(["article", "course-1", "material-2"]), id: "material-2", chapterIds: ["chapter-2"],
    };
    const restricted = { ...grant, chapterIds: ["chapter-1"], fullContent: false };
    const fixture = setup(
      authorized(page()),
      authorized(manifest(firstCursor, { resources: [descriptor, chapterTwo] })),
      authorized(page("2", { reset: false, access: [restricted] })),
      authorized(page("2", { access: [restricted] })),
      authorized(manifest("2", { resources: [descriptor, chapterTwo] })),
    );
    expect((await fixture.controller.sync(["course-1"]))?.courses[0]?.materials).toHaveLength(2);
    await expect(fixture.controller.resume()).rejects.toMatchObject({ name: "NativeOfflineProtocolError" });
    const snapshot = await fixture.controller.retry();
    expect(snapshot?.cursor).toBe("2");
    expect(snapshot?.courses[0]?.materials).toEqual([descriptor]);
  });

  test("coalesces reconnect, resume and retry and rejects the outgoing session's late response", async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(next => { resolve = next; });
    let dispatched!: () => void;
    const started = new Promise<void>(next => { dispatched = next; });
    const fixture = setup((_url, init) => {
      expect(init.signal?.aborted).toBe(false);
      dispatched();
      return pending;
    });
    const first = fixture.controller.sync(["course-1"]);
    expect(fixture.controller.resume()).toBe(first);
    expect(fixture.controller.reconnect()).toBe(first);
    expect(fixture.controller.retry()).toBe(first);
    await started;
    fixture.transport.clearSession();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    resolve(authorized(page()));
    expect(await fixture.repository.read(scope, verifiedAt)).toBeNull();
  });

  test("only a caller-triggered reconnect replays an unsuccessful sync request", async () => {
    const fixture = setup(
      new Response(null, { status: 503 }),
      authorized(page()),
      authorized(manifest()),
    );
    await expect(fixture.controller.sync(["course-1"])).rejects.toMatchObject({ code: "http", status: 503 });
    expect(fixture.observed).toHaveLength(1);
    expect((await fixture.controller.reconnect())?.cursor).toBe(firstCursor);
    expect(fixture.observed).toHaveLength(3);
  });
});


test("first library visit fetches a newly enrolled course manifest before returning an empty result", async () => {
  const fixture = setup(authorized(page()), authorized(manifest()));
  const result = await fixture.controller.sync([]);
  expect(fixture.observed).toEqual([
    { path: "/api/offline/sync", body: { cursor: null, courseIds: [], locale: "id" } },
    { path: "/api/offline/manifest?courseId=course-1&locale=id" },
  ]);
  expect(result?.courses[0]?.materials).toEqual([descriptor]);
});
