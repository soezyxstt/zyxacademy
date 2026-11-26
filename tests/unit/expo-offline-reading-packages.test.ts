import { catalogGrant, type OfflineLibraryCatalog } from "../../apps/mobile-native/offline/catalog-model";
import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { createOfflineMetadataStore, readOfflineReadingAuthority } from "../../apps/mobile-native/offline/metadata-store";
import { createOfflineReadingController } from "../../apps/mobile-native/offline/reading-client";
import { readingKey, type OfflineReadingData, type OfflineReadingTarget } from "../../apps/mobile-native/offline/reading-contract";
import { subscribeOfflineReadingChanges } from "../../apps/mobile-native/offline/reading-events";
import { createOfflineReadingStore, type OfflineReadingDatabase } from "../../apps/mobile-native/offline/reading-store";
import { createNativeOfflineSyncController } from "../../apps/mobile-native/offline/sync-client";
import type { NativeOfflineResourceDescriptor, NativeOfflineScope, NativeOfflineSyncResponse } from "../../apps/mobile-native/offline/sync-contract";

const scope: NativeOfflineScope = {
  origin: "https://staging.zyxacademy.com", accountId: "learner-1", sessionId: "session-1", locale: "id",
};
const englishScope = { ...scope, locale: "en" as const };
const now = 1_785_000_000_000;
const lease = now + 60_000;
const revision = "a".repeat(64);
const updatedRevision = "b".repeat(64);
const target: OfflineReadingTarget = { courseId: "course-1", kind: "diktat", id: "reading-1" };
const grant = { courseId: target.courseId, allowed: true, fullContent: true, chapterIds: ["chapter-1"], leaseExpiresAt: lease };
const data = {
  id: target.id, courseId: target.courseId, title: "Peluang", kind: "article", docCategory: "diktat",
  contentVersion: 1, body: "Peluang dan frekuensi.",
} satisfies OfflineReadingData;
const image = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const assetPath = `/api/offline/asset?${new URLSearchParams({ ...target, locale: scope.locale, revision, asset: "/images/sample.png" })}`;
const headerIdentity = {
  "x-offline-account-id": scope.accountId,
  "x-offline-session-id": scope.sessionId,
  "x-offline-environment": scope.origin,
  "x-offline-locale": scope.locale,
};
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

type ReadingFixtureDescriptor = NativeOfflineResourceDescriptor & OfflineReadingTarget;

function descriptor(selection = target, version = revision): ReadingFixtureDescriptor {
  return { ...selection, key: readingKey(selection), chapterIds: ["chapter-1"], title: "Peluang", revision: version, updatedAt: now, estimatedBytes: 1024 };
}

const identity = {
  protocolVersion: 1 as const, environment: scope.origin, accountId: scope.accountId, sessionId: scope.sessionId, locale: scope.locale,
};

function page(cursor = "4", changes: Partial<NativeOfflineSyncResponse> = {}): NativeOfflineSyncResponse {
  return {
    ...identity, cursor, serverTime: now, leaseExpiresAt: lease, reset: true, hasMore: false,
    access: [grant], enrollments: [{ id: target.courseId, title: "Statistika", expiresAt: null }], changes: [],
    policy: { revision: 1, updatedAt: now, metadataMaxAgeMs: 86_400_000, contentMaxAgeMs: 604_800_000, retentionMs: 2_592_000_000,
      accessLeaseMs: 86_400_000, activeCheckIntervalMs: 60_000, maxBytes: 8 * 1024 * 1024, maxEntries: 25, autoCache: true, wifiOnly: false,
      schedule: { frequency: "weekly", weekday: 5, hour: 6, timeZone: "Asia/Jakarta" } },
    ...changes,
  };
}

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function responseHeaders({ asset = false, version = revision, cursor = "4", validatedAt = now, expires = lease } = {}) {
  return {
    ...headerIdentity,
    "x-offline-cursor": cursor, "x-offline-revision": version, "x-offline-validated-at": String(validatedAt),
    "x-offline-lease-expires-at": String(expires), ETag: `"${asset ? digest(image) : version}"`,
  };
}

function resource({ withImage = false, version = revision, cursor = "4", expires = lease, validatedAt = now, url = assetPath,
  locale = scope.locale, selection = target } = {}) {
  const reading = { ...data, id: selection.id, courseId: selection.courseId };
  return Response.json({
    ...identity, locale, resource: descriptor(selection, version), data: withImage ? { ...reading, body: `![Sample](${url})` } : reading,
    cursor, validatedAt, leaseExpiresAt: expires, assets: withImage ? [{ url, required: true }] : [],
  }, { headers: { ...responseHeaders({ version, cursor, expires, validatedAt }), "x-offline-locale": locale } });
}

function raster(extraHeaders: HeadersInit = {}) {
  return new Response(image, { headers: {
    ...responseHeaders({ asset: true }), "Content-Type": "image/png", "Content-Length": String(image.byteLength),
    ...extraHeaders,
  } });
}

async function setup(...responses: Array<Response | ((url: URL) => Response | Promise<Response>)>) {
  const db = new Database(":memory:");
  databases.push(db);
  const connection: OfflineReadingDatabase = {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...params) {
      const result = db.query(sql).run(...params);
      return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getFirstAsync<T>(sql: string, ...params: Parameters<OfflineReadingDatabase["runAsync"]> extends [string, ...infer P] ? P : never) {
      return db.query<T, typeof params>(sql).get(...params);
    },
    async getAllAsync<T>(sql: string, ...params: Parameters<OfflineReadingDatabase["runAsync"]> extends [string, ...infer P] ? P : never) {
      return db.query<T, typeof params>(sql).all(...params);
    },
    async withExclusiveTransactionAsync(work) {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work(connection);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const metadata = createOfflineMetadataStore(connection);
  let clock = now;
  const readingStore = createOfflineReadingStore(connection, () => clock);
  const observed: string[] = [];
  const transport = createNativeTransport({
    origin: scope.origin,
    async fetcher(url, init) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe(scope.origin);
      const headers = new Headers(init.headers);
      expect(headers.get("cookie")).toBe("session=mocked");
      expect(headers.get("x-offline-session-id")).toBe(scope.sessionId);
      expect(headers.get("origin")).toBe(scope.origin);
      observed.push(parsed.pathname + parsed.search);
      const response = responses.shift();
      if (!response) throw new Error("Unexpected network request");
      return typeof response === "function" ? response(parsed) : response;
    },
  });
  const session = transport.setSession({ ...scope, readCookie: () => "session=mocked" });
  const guard = { verifiedUntil: now + 120_000, assertCurrent: () => {} };
  let revocations = 0;
  const options = {
    scope, session, verifiedUntil: guard.verifiedUntil,
    repository: async () => readingStore,
    now: () => clock, checkAsset: async (bytes: Uint8Array, expected: string) => digest(bytes) === expected,
    async onRevoked() {
      revocations++;
      await metadata.clearSession(scope);
      await readingStore.clearSession(scope);
    },
  };
  const controller = createOfflineReadingController(options);

  async function commit(response = page(), materials = [descriptor()], previous: string | null = null, authorityScope = scope) {
    const responseIdentity = { ...identity, environment: authorityScope.origin, accountId: authorityScope.accountId,
      sessionId: authorityScope.sessionId, locale: authorityScope.locale };
    response = { ...response, ...responseIdentity };
    const accessRevision = await metadata.applyAccess(authorityScope, { response, expectedCursor: previous });
    expect(accessRevision).toBeNumber();
    const saved = await metadata.commitPage(authorityScope, {
      response, expectedCursor: previous, accessRevision: accessRevision!,
      manifests: response.access.filter(grant => grant.allowed).map(grant => ({
        ...responseIdentity, cursor: response.cursor, serverTime: response.serverTime, leaseExpiresAt: response.leaseExpiresAt,
        resource: grant, resources: materials.filter(material => material.courseId === grant.courseId),
      })),
    });
    expect(saved).toBe(true);
  }

  await commit();
  return { controller, commit, connection, metadata, readingStore, guard, db, options, observed, transport, revocations: () => revocations,
    time(value: number) { clock = value; } };
}

test("stores a complete reading and its admitted image, then reads it offline without transport", async () => {
  const { controller, options, observed, readingStore, guard } = await setup(resource({ withImage: true }), raster());
  let changes = 0;
  const unsubscribe = subscribeOfflineReadingChanges(() => changes++);
  expect(await controller.download(target)).toEqual({ status: "saved" });
  expect(changes).toBe(1);
  expect(observed[0]?.split("?")[0]).toBe("/api/offline/resource");
  expect(observed[1]).toBe(assetPath);
  const offline = createOfflineReadingController({ ...options, session: null });
  expect(await offline.list()).toMatchObject([{ ...target, revision, title: data.title, leaseExpiresAt: lease }]);
  const saved = await offline.read(target);
  expect(saved?.assets).toEqual([{ url: assetPath, mime: "image/png", bytes: image }]);
  expect(saved?.data).toMatchObject({ body: `![Sample](${assetPath})` });
  for (const other of [{ accountId: "other" }, { sessionId: "signed-in-later" }, { origin: "https://other.example" }, { locale: "en" as const }]) {
    expect(await readingStore.read({ ...scope, ...other }, target, guard)).toBeNull();
  }
  expect(await offline.download(target)).toEqual({ status: "unavailable" });
  expect(await offline.forget(target)).toBe(true);
  expect(await offline.list()).toEqual([]);
  expect(changes).toBe(2);
  unsubscribe();
});

test("a bad image or malformed same-origin asset never replaces the existing complete package", async () => {
  const { controller, observed, db } = await setup(
    resource(), resource({ withImage: true }), raster({ ETag: `"${"c".repeat(64)}"` }),
    resource({ withImage: true, url: assetPath.replace("course-1", "other-course") }),
    resource({ withImage: true }), raster({ "Content-Type": "image/svg+xml" }),
  );
  expect((await controller.download(target)).status).toBe("saved");
  expect((await controller.download(target)).status).toBe("retry");
  expect((await controller.download(target)).status).toBe("retry");
  expect((await controller.download(target)).status).toBe("unsupported");
  expect(observed).toHaveLength(6);
  expect(await controller.read(target)).toMatchObject({ data, assets: [] });
  expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_packages_v2").get()).toEqual({ count: 1 });
});

test("a required asset reporting the material changed invalidates the old package", async () => {
  const { controller } = await setup(
    resource(), resource({ withImage: true }), Response.json({ code: "OFFLINE_MATERIAL_CHANGED" }, { status: 409 }),
  );
  expect((await controller.download(target)).status).toBe("saved");
  expect((await controller.download(target)).status).toBe("changed");
  expect(await controller.read(target)).toBeNull();
});

const courseDenied = () => Response.json({ code: "OFFLINE_COURSE_ACCESS_DENIED" }, { status: 403 });
const deniedGrant = { ...grant, allowed: false, fullContent: false, chapterIds: [], leaseExpiresAt: now };

async function pinFixtures(store: ReturnType<typeof createOfflineReadingStore>, guard: {
  verifiedUntil: number; assertCurrent(): void;
}, languageScope: NativeOfflineScope, materials: ReadingFixtureDescriptor[]) {
  for (const material of materials) {
    const authority = await store.authorize(languageScope, material, guard);
    expect(authority).not.toBeNull();
    await store.store(languageScope, {
      target: material, revision: material.revision, cursor: authority!.cursor, leaseExpiresAt: authority!.leaseExpiresAt,
      resetGeneration: authority!.resetGeneration, validatedAt: now, assetLeaseExpiresAt: null, assets: [],
      body: new TextEncoder().encode(JSON.stringify({ ...data, id: material.id, courseId: material.courseId })),
    }, guard);
  }
}

function materialManifest(cursor: string, access: typeof grant, materials: NativeOfflineResourceDescriptor[]) {
  return Response.json({ ...identity, cursor, serverTime: now, leaseExpiresAt: access.leaseExpiresAt, resource: access, resources: materials },
    { headers: headerIdentity });
}

for (const source of ["sync", "manifest"] as const) {
  test(`partial ${source} access narrows both language caches without extending the alternate lease`, async () => {
    const removed = { ...descriptor({ ...target, id: "reading-2" }), chapterIds: ["chapter-2"] };
    const other = descriptor({ ...target, courseId: "course-2" });
    const materials = [descriptor(), removed, other];
    const otherGrant = { ...grant, courseId: other.courseId };
    const broad = { ...grant, chapterIds: ["chapter-1", "chapter-2"] };
    const restricted = { ...grant, fullContent: false, chapterIds: ["chapter-1", "chapter-3"] };
    const incremental = page("5", {
      reset: false, access: [source === "sync" ? restricted : broad, otherGrant],
      changes: [{ cursor: "5", kind: "access", courseId: target.courseId, resourceId: null, action: "invalidate", revision: null }],
    });
    const { commit, connection, metadata, readingStore, guard, options, db } = await setup(
      Response.json(incremental, { headers: headerIdentity }), materialManifest("5", restricted, [descriptor()]),
    );
    await commit(page("4", { access: [broad, otherGrant] }), materials, "4");
    const alternateLease = now + 10_000;
    await commit(page("4", { access: [{ ...broad, leaseExpiresAt: alternateLease }, otherGrant] }), materials, null, englishScope);
    for (const languageScope of [scope, englishScope]) await pinFixtures(readingStore, guard, languageScope, materials);
    const sync = createNativeOfflineSyncController({
      session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
    });
    expect(await sync.sync([target.courseId])).toMatchObject({ cursor: "5" });
    for (const languageScope of [scope, englishScope]) {
      expect((await readingStore.list(languageScope, guard)).map(item => item.key).sort())
        .toEqual([readingKey(target), other.key].sort());
      expect(await readingStore.read(languageScope, removed, guard)).toBeNull();
    }
    const alternate = await readOfflineReadingAuthority(connection, englishScope);
    expect(alternate?.courses.find(course => course.courseId === target.courseId)).toMatchObject({
      fullContent: false, chapterIds: ["chapter-1"], leaseExpiresAt: alternateLease,
    });
    expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v2").get()).toEqual({ count: 4 });
  });
}

test("explicit article and diktat publication deletions remove matching packages before a failed manifest", async () => {
  const article = descriptor({ ...target, kind: "article" });
  const retained = descriptor({ ...target, id: "other-reading" });
  const materials = [descriptor(), article, retained];
  const publishedDeletes = [descriptor(), article].map(item => ({
    cursor: "5", kind: item.kind, courseId: item.courseId, resourceId: item.id, action: "delete" as const, revision: null,
  }));
  const { commit, metadata, readingStore, guard, options, db } = await setup(
    Response.json(page("5", { reset: false, changes: publishedDeletes }), { headers: headerIdentity }),
    new Response(null, { status: 503 }), new Response(null, { status: 503 }),
  );
  await commit(page(), materials, "4");
  await commit(page(), materials, null, englishScope);
  for (const languageScope of [scope, englishScope]) await pinFixtures(readingStore, guard, languageScope, materials);
  const sync = createNativeOfflineSyncController({
    session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
  });
  await expect(sync.sync([target.courseId])).rejects.toMatchObject({ code: "http", status: 503 });
  for (const languageScope of [scope, englishScope]) {
    expect((await readingStore.list(languageScope, guard)).map(item => item.key)).toEqual([retained.key]);
    expect((await metadata.read(languageScope, now))?.cursor).toBe("4");
  }
  expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v2").get()).toEqual({ count: 2 });
});

for (const equivalent of [true, false]) {
  test(`verified manifest omission ${equivalent ? "withdraws equivalent" : "preserves differently authorized"} alternate readings`, async () => {
    const retained = descriptor({ ...target, id: "other-reading" });
    const materials = [descriptor(), retained];
    const { commit, metadata, readingStore, guard, options } = await setup(
      Response.json(page("5", { reset: false, changes: [
        { cursor: "5", kind: "article", courseId: target.courseId, resourceId: "different-article", action: "invalidate", revision: null },
      ] }), { headers: headerIdentity }),
      materialManifest("5", grant, [retained]),
    );
    await commit(page(), materials, "4");
    await commit(page("4", { access: [{ ...grant, fullContent: equivalent }] }), materials, null, englishScope);
    for (const languageScope of [scope, englishScope]) await pinFixtures(readingStore, guard, languageScope, materials);
    const sync = createNativeOfflineSyncController({
      session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
    });
    expect(await sync.sync([target.courseId])).toMatchObject({ cursor: "5" });
    expect(await readingStore.read(scope, target, guard)).toBeNull();
    const alternate = await readingStore.read(englishScope, target, guard);
    if (equivalent) expect(alternate).toBeNull();
    else expect(alternate).not.toBeNull();
    expect(await readingStore.read(englishScope, retained, guard)).not.toBeNull();
  });
}

for (const source of ["sync", "manifest"] as const) {
  test(`delayed partial ${source} preserves the newer alternate-language grant and its downloads`, async () => {
    const removed = { ...descriptor({ ...target, id: "reading-2" }), chapterIds: ["chapter-2"] };
    const materials = [descriptor(), removed];
    const broad = { ...grant, chapterIds: ["chapter-1", "chapter-2"] };
    const narrower = { ...grant, fullContent: false };
    const syncResponse = Response.json(page("5", {
      reset: false, access: [source === "manifest" ? broad : narrower],
      changes: [{ cursor: "5", kind: "access", courseId: target.courseId, resourceId: null, action: "invalidate", revision: null }],
    }), { headers: headerIdentity });
    const requested = Promise.withResolvers<void>();
    const delayed = Promise.withResolvers<Response>();
    const hold = () => {
      requested.resolve();
      return delayed.promise;
    };
    const { commit, metadata, readingStore, guard, options } = await setup(
      ...(source === "sync" ? [hold, materialManifest("5", narrower, [descriptor()])] : [syncResponse, hold]),
    );
    await commit(page("4", { access: [broad] }), materials, "4");
    await commit(page("4", { access: [broad] }), materials, null, englishScope);
    for (const languageScope of [scope, englishScope]) await pinFixtures(readingStore, guard, languageScope, materials);
    const sync = createNativeOfflineSyncController({
      session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
    });
    const pending = sync.sync([target.courseId]);
    await requested.promise;
    await commit(page("6", { reset: false, access: [broad] }), materials, "4", englishScope);
    delayed.resolve(source === "sync" ? syncResponse : materialManifest("5", narrower, [descriptor()]));
    expect(await pending).toMatchObject({ cursor: "5" });
    expect(await readingStore.read(scope, removed, guard)).toBeNull();
    expect(await readingStore.read(englishScope, removed, guard)).not.toBeNull();
  });
}

test("a reset in the requesting language supplies no removal evidence for an omitted alternate course", async () => {
  const other = descriptor({ ...target, courseId: "course-2" });
  const otherGrant = { ...grant, courseId: other.courseId };
  const { commit, metadata, readingStore, guard, options } = await setup(
    Response.json(page("1", { access: [otherGrant], enrollments: [] }), { headers: headerIdentity }),
    materialManifest("1", otherGrant, [other]),
  );
  await commit(page("5", { access: [otherGrant], enrollments: [] }), [other], "4");
  await commit(page(), [descriptor()], null, englishScope);
  await pinFixtures(readingStore, guard, englishScope, [descriptor()]);
  const sync = createNativeOfflineSyncController({
    session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
  });
  expect(await sync.sync([other.courseId])).toMatchObject({ cursor: "1" });
  expect(await readingStore.read(englishScope, target, guard)).not.toBeNull();
});

test("a manifest omission does not withdraw alternate bytes if the source pass cannot commit", async () => {
  const other = descriptor({ ...target, courseId: "course-2" });
  const otherGrant = { ...grant, courseId: other.courseId };
  const both = { access: [grant, otherGrant], enrollments: [] };
  const { commit, metadata, readingStore, guard, options } = await setup(
    Response.json(page("5", { ...both, reset: false, changes: [
      { cursor: "5", kind: "course", courseId: null, resourceId: null, action: "invalidate", revision: null },
    ] }), { headers: headerIdentity }),
    materialManifest("5", grant, []),
    new Response(null, { status: 503 }), new Response(null, { status: 503 }),
  );
  await commit(page("4", both), [descriptor(), other], "4");
  await commit(page(), [descriptor()], null, englishScope);
  await pinFixtures(readingStore, guard, englishScope, [descriptor()]);
  const sync = createNativeOfflineSyncController({
    session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
  });
  await expect(sync.sync([target.courseId, other.courseId])).rejects.toMatchObject({ code: "http", status: 503 });
  expect(await readingStore.read(englishScope, target, guard)).not.toBeNull();
});

for (const endpoint of ["resource", "asset", "manifest", "sync"] as const) {
  test(`a course denial from ${endpoint} withdraws its authority and saved readings in both languages`, async () => {
    const sibling = { ...target, id: "reading-2" };
    const otherCourse = { ...target, courseId: "course-2" };
    const unsaved = { ...target, id: "reading-3" };
    const withImage = resource({ withImage: true, selection: unsaved,
      url: `/api/offline/asset?${new URLSearchParams({ ...unsaved, locale: scope.locale, revision, asset: "/images/sample.png" })}` });
    const otherGrant = { ...grant, courseId: otherCourse.courseId };
    const deniedSyncPage = page("5", { reset: false, access: [deniedGrant, otherGrant] });
    const { controller, commit, metadata, readingStore, db, options, revocations, transport, observed } = await setup(
      resource(), resource({ selection: sibling }), resource({ selection: otherCourse }),
      resource({ locale: "en" }), resource({ selection: sibling, locale: "en" }), resource({ selection: otherCourse, locale: "en" }),
      ...(endpoint === "asset" ? [withImage] : []),
      ...(endpoint === "manifest" ? [Response.json(page("5", { reset: false, access: [grant, otherGrant],
        changes: [{ cursor: "5", kind: "course", courseId: target.courseId, resourceId: null, action: "invalidate", revision: null }],
      }), { headers: headerIdentity })] : []),
      endpoint === "sync" ? Response.json(deniedSyncPage, { headers: headerIdentity }) : courseDenied(),
    );
    const bothCourses = page("4", { access: [grant, otherGrant] });
    const materials = [target, sibling, otherCourse, unsaved].map(selection => descriptor(selection));
    await commit(bothCourses, materials, "4");
    await commit(bothCourses, materials, null, englishScope);
    const english = createOfflineReadingController({ ...options, scope: englishScope });
    for (const selection of [target, sibling, otherCourse]) {
      expect(await controller.download(selection)).toEqual({ status: "saved" });
    }
    for (const selection of [target, sibling, otherCourse]) {
      expect(await english.download(selection)).toEqual({ status: "saved" });
    }
    if (endpoint === "manifest" || endpoint === "sync") {
      const sync = createNativeOfflineSyncController({
        session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
      });
      const pending = sync.sync([target.courseId]);
      if (endpoint === "manifest") {
        await expect(pending).rejects.toMatchObject({ code: "courseChanged", status: 403 });
      } else {
        expect(await pending).toMatchObject({ cursor: "5", knownCourseIds: [otherCourse.courseId] });
        expect(observed.at(-1)).toBe("/api/offline/sync");
      }
    } else {
      expect(await controller.download(unsaved)).toEqual({ status: "changed" });
    }
    expect(revocations()).toBe(0);
    expect(db.query("SELECT locale, course_id FROM expo_reading_packages_v2 ORDER BY locale").all()).toEqual([
      { locale: "en", course_id: otherCourse.courseId }, { locale: "id", course_id: otherCourse.courseId },
    ]);
    expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v2").get()).toEqual({ count: 2 });
    transport.clearSession();
    for (const languageScope of [scope, englishScope]) {
      expect((await metadata.read(languageScope, now))?.knownCourseIds).toEqual([otherCourse.courseId]);
      const offline = createOfflineReadingController({ ...options, scope: languageScope, session: null });
      expect((await offline.list()).map(item => item.courseId)).toEqual([otherCourse.courseId]);
      expect(await offline.read(target)).toBeNull();
      expect(await offline.read(sibling)).toBeNull();
      expect(await offline.read(otherCourse)).not.toBeNull();
    }
  });
}

for (const renewedScope of [scope, englishScope]) {
  test(`a delayed sync denial preserves the refreshed ${renewedScope.locale} grant`, async () => {
    const requested = Promise.withResolvers<void>();
    const delayed = Promise.withResolvers<Response>();
    const { controller, commit, metadata, readingStore, options } = await setup(resource(), resource({ locale: "en" }), () => {
      requested.resolve();
      return delayed.promise;
    });
    await commit(page(), [descriptor()], null, englishScope);
    const english = createOfflineReadingController({ ...options, scope: englishScope });
    expect(await controller.download(target)).toEqual({ status: "saved" });
    expect(await english.download(target)).toEqual({ status: "saved" });
    const sync = createNativeOfflineSyncController({
      session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
    });
    const pending = sync.sync([target.courseId]);
    await requested.promise;
    await commit(page("4", { reset: false }), [descriptor()], "4", renewedScope);
    delayed.resolve(Response.json(page("5", { reset: false, access: [deniedGrant] }), { headers: headerIdentity }));
    if (renewedScope.locale === "id") {
      await expect(pending).rejects.toMatchObject({ code: "conflict" });
      expect(await controller.read(target)).not.toBeNull();
    } else {
      expect(await pending).toMatchObject({ cursor: "5", knownCourseIds: [] });
      expect(await controller.read(target)).toBeNull();
    }
    expect(await english.read(target)).not.toBeNull();
  });
}

for (const stage of ["before response", "during withdrawal"] as const) {
  test(`switching accounts ${stage} blocks a sync denial from changing saved authority`, async () => {
    const requested = Promise.withResolvers<void>();
    const delayed = Promise.withResolvers<Response>();
    const { commit, connection, metadata, readingStore, options, transport, guard } = await setup(() => {
      requested.resolve();
      return delayed.promise;
    });
    await commit(page(), [descriptor()], null, englishScope);
    const replacement = { ...scope, accountId: "learner-2", sessionId: "session-2", readCookie: () => "session=next" };
    const replacementScopes = [replacement, { ...replacement, locale: "en" as const }];
    for (const localeScope of replacementScopes) {
      await commit(page(), [descriptor()], null, localeScope);
      const authority = await readingStore.authorize(localeScope, target, guard);
      await readingStore.store(localeScope, {
        target, revision, cursor: "4", leaseExpiresAt: lease, resetGeneration: authority!.resetGeneration,
        validatedAt: now, assetLeaseExpiresAt: null, assets: [], body: new TextEncoder().encode(JSON.stringify(data)),
      }, guard);
    }
    const sync = createNativeOfflineSyncController({
      session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
    });
    const pending = sync.sync([target.courseId]);
    await requested.promise;
    if (stage === "before response") {
      transport.setSession(replacement);
    } else {
      const run = connection.runAsync;
      connection.runAsync = async (sql, ...params) => {
        const result = await run(sql, ...params);
        if (sql.includes("course_id IN (")) transport.setSession(replacement);
        return result;
      };
    }
    delayed.resolve(Response.json(page("5", { reset: false, access: [deniedGrant] }), { headers: headerIdentity }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    for (const localeScope of replacementScopes) {
      expect((await readingStore.read(localeScope, target, guard))?.data).toEqual(data);
    }
    for (const localeScope of [scope, englishScope]) {
      expect((await metadata.read(localeScope, now))?.knownCourseIds).toEqual([target.courseId]);
    }
  });
}

test("a locally elapsed lease does not withdraw the alternate-language grant", async () => {
  const { commit, metadata, readingStore, options } = await setup(
    Response.json(page("5", { reset: false, access: [{ ...grant, leaseExpiresAt: now }] }), { headers: headerIdentity }),
  );
  await commit(page(), [descriptor()], null, englishScope);
  const sync = createNativeOfflineSyncController({
    session: options.session, locale: "id", repository: metadata, readings: async () => readingStore, now: () => now,
  });
  expect(await sync.sync([target.courseId])).toMatchObject({ cursor: "5", knownCourseIds: [] });
  expect((await metadata.read(englishScope, now))?.knownCourseIds).toEqual([target.courseId]);
});

for (const renewedScope of [scope, englishScope]) {
  test(`a delayed denial preserves the refreshed ${renewedScope.locale} grant and withdraws the older one`, async () => {
    const requested = Promise.withResolvers<void>();
    const delayed = Promise.withResolvers<Response>();
    const { controller, commit, metadata, options } = await setup(resource(), resource({ locale: "en" }), () => {
      requested.resolve();
      return delayed.promise;
    });
    await commit(page(), [descriptor()], null, englishScope);
    const english = createOfflineReadingController({ ...options, scope: englishScope });
    expect(await controller.download(target)).toEqual({ status: "saved" });
    expect(await english.download(target)).toEqual({ status: "saved" });
    const pending = controller.download(target);
    await requested.promise;
    await commit(page("4", { reset: false }), [descriptor()], "4", renewedScope);
    delayed.resolve(courseDenied());
    expect(await pending).toEqual({ status: "changed" });
    const expiredScope = renewedScope.locale === "id" ? englishScope : scope;
    const [current, expired] = renewedScope.locale === "id" ? [controller, english] : [english, controller];
    expect((await metadata.read(renewedScope, now))?.knownCourseIds).toEqual([target.courseId]);
    expect((await metadata.read(expiredScope, now))?.knownCourseIds).toEqual([]);
    expect(await current.read(target)).not.toBeNull();
    expect(await expired.read(target)).toBeNull();
  });
}

test("an older denial from another language cannot withdraw restored grants after a newer denial", async () => {
  const requested = Promise.withResolvers<void>();
  const delayed = Promise.withResolvers<Response>();
  const { controller, commit, metadata, options } = await setup(() => {
    requested.resolve();
    return delayed.promise;
  }, courseDenied(), resource({ locale: "en" }));
  await commit(page(), [descriptor()], null, englishScope);
  const english = createOfflineReadingController({ ...options, scope: englishScope });
  const pending = english.download(target);
  await requested.promise;
  expect(await controller.download(target)).toEqual({ status: "changed" });
  expect((await metadata.read(englishScope, now))?.knownCourseIds).toEqual([]);
  const refreshed = createOfflineReadingController({ ...options, scope: englishScope });
  expect(await refreshed.download(target)).toEqual({ status: "unavailable" });
  await commit(page("4", { reset: false }), [descriptor()], "4");
  await commit(page("4", { reset: false }), [descriptor()], "4", englishScope);
  expect(await refreshed.download(target)).toEqual({ status: "saved" });
  delayed.resolve(courseDenied());
  expect(await pending).toEqual({ status: "changed" });
  expect((await metadata.read(scope, now))?.knownCourseIds).toEqual([target.courseId]);
  expect(await refreshed.read(target)).not.toBeNull();
});

for (const stage of ["sync response", "narrowed manifest", "denied manifest"] as const) {
  test(`a pending ${stage} cannot restore a course withdrawn by another language`, async () => {
    const otherCourse = { ...target, courseId: "course-2" };
    const otherGrant = { ...grant, courseId: otherCourse.courseId };
    const materials = [descriptor(), descriptor(otherCourse)];
    const initial = page("4", {
      locale: "en",
      access: [grant, otherGrant],
      enrollments: [...page().enrollments, { id: otherCourse.courseId, title: "Geometri", expiresAt: null }],
    });
    const incremental = {
      ...initial, reset: false, cursor: "5",
      changes: [{ cursor: "5", kind: "course", courseId: otherCourse.courseId, resourceId: null, action: "invalidate", revision: null }],
    } satisfies NativeOfflineSyncResponse;
    const englishHeaders = { ...headerIdentity, "x-offline-locale": "en" };
    const syncResponse = (value: NativeOfflineSyncResponse) => Response.json(value, { headers: englishHeaders });
    const manifestResponse = (access: typeof grant, material: NativeOfflineResourceDescriptor, cursor = "4") => Response.json({
      ...identity, locale: "en", cursor, serverTime: now, leaseExpiresAt: lease, resource: access, resources: [material],
    }, { headers: englishHeaders });
    const requested = Promise.withResolvers<void>();
    const delayed = Promise.withResolvers<Response>();
    const { controller, commit, metadata, readingStore, options } = await setup(
      ...(stage === "sync response" ? [] : [syncResponse(incremental)]),
      url => {
        expect(url.pathname).toBe(stage === "sync response" ? "/api/offline/sync" : "/api/offline/manifest");
        if (stage !== "sync response") expect(url.searchParams.get("courseId")).toBe(otherCourse.courseId);
        requested.resolve();
        return delayed.promise;
      },
      courseDenied(), syncResponse(initial), manifestResponse(grant, materials[0]), manifestResponse(otherGrant, materials[1]),
    );
    await commit(initial, materials, "4");
    await commit(initial, materials, null, englishScope);
    const sync = createNativeOfflineSyncController({
      session: options.session, locale: "en", repository: metadata, readings: async () => readingStore, now: () => now,
    });
    const pending = sync.sync([target.courseId, otherCourse.courseId]);
    await requested.promise;
    expect(await controller.download(target)).toEqual({ status: "changed" });
    if (stage === "sync response") delayed.resolve(syncResponse(incremental));
    else if (stage === "denied manifest") delayed.resolve(Response.json({ code: "OFFLINE_ACCESS_CHANGED" }, { status: 409 }));
    else delayed.resolve(manifestResponse({ ...otherGrant, fullContent: false }, materials[1], "5"));
    await expect(pending).rejects.toMatchObject({ code: "conflict" });
    expect((await metadata.read(englishScope, now))?.knownCourseIds).toEqual([otherCourse.courseId]);
    expect((await sync.retry())?.knownCourseIds).toEqual([target.courseId, otherCourse.courseId]);
    expect((await metadata.read(scope, now))?.knownCourseIds).toEqual([otherCourse.courseId]);
  });
}

for (const mode of ["newer grant", "cursor reset", "replacement session"] as const) {
  test(`a delayed course denial preserves authority after a ${mode}`, async () => {
    const requested = Promise.withResolvers<void>();
    const delayed = Promise.withResolvers<Response>();
    const { controller, commit, readingStore, guard, metadata } = await setup(resource(), () => {
      requested.resolve();
      return delayed.promise;
    });
    expect(await controller.download(target)).toEqual({ status: "saved" });
    const pending = controller.download(target);
    await requested.promise;
    const replacement = mode === "replacement session" ? { ...scope, sessionId: "session-2" } : scope;
    const previous = mode === "replacement session" ? null : "4";
    const cursor = mode === "cursor reset" ? "1" : "4";
    await commit(page(cursor, { reset: mode !== "newer grant" }), [descriptor()], previous, replacement);
    delayed.resolve(courseDenied());
    expect(await pending).toEqual({ status: "changed" });
    expect((await metadata.read(replacement, now))?.knownCourseIds).toEqual([target.courseId]);
    expect(await readingStore.authorize(replacement, target, guard)).not.toBeNull();
    if (mode === "newer grant") expect(await controller.read(target)).not.toBeNull();
  });
}

test("a stale response cursor keeps an existing verified package", async () => {
  const { controller } = await setup(resource(), resource({ cursor: "3" }));
  expect((await controller.download(target)).status).toBe("saved");
  expect((await controller.download(target)).status).toBe("changed");
  expect(await controller.read(target)).not.toBeNull();
});

for (const mode of ["newer download", "manifest renewal", "cursor reset"] as const) {
  test(`a delayed 409 cannot delete package proof after ${mode}`, async () => {
    let respond!: (value: Response) => void;
    let observed!: () => void;
    const requested = new Promise<void>(start => { observed = start; });
    const delayed = new Promise<Response>(finish => { respond = finish; });
    const cursor = mode === "cursor reset" ? "1" : "4";
    const { controller, options, commit, readingStore, guard, time } = await setup(
      resource(), () => { observed(); return delayed; }, resource({ cursor, validatedAt: now + 1 }),
    );
    expect((await controller.download(target)).status).toBe("saved");
    const pending = controller.download(target);
    await requested;
    time(now + 1);
    if (mode !== "newer download") {
      await commit(page(cursor, { reset: mode === "cursor reset", serverTime: now + 1 }), [descriptor()], "4");
      await readingStore.reconcile(scope, guard.assertCurrent);
    }
    if (mode !== "manifest renewal") {
      const next = createOfflineReadingController(options);
      expect((await next.download(target)).status).toBe("saved");
    }
    respond(Response.json({ code: "OFFLINE_MATERIAL_CHANGED" }, { status: 409 }));
    expect((await pending).status).toBe("changed");
    expect(await controller.read(target)).not.toBeNull();
  });
}

test("preserves the public structured article body and rejects private progress fields", async () => {
  const article = { ...target, kind: "article" as const };
  const articleData = {
    id: article.id, courseId: article.courseId, chapterId: "chapter-1", title: "Peluang", slug: article.id,
    courseTitle: "Statistika", chapterTitle: null, chapterNumber: null, version: 3, totalEstimatedReadingMinutes: 3,
    sections: [{ id: "section", slug: "peluang", title: "Peluang", sectionNumber: "1", sectionKind: "topic", learningObjective: "",
      estimatedReadingMinutes: 3, orderIndex: 0, parentSectionId: null,
      blocks: [{ id: "text", blockKey: "text", blockType: "explanation", title: null, orderIndex: 0, content: "Peluang $P(A)$." }] }],
  };
  const body = { ...identity, resource: descriptor(article), data: articleData, cursor: "4", validatedAt: now, leaseExpiresAt: lease, assets: [] };
  const { controller, commit } = await setup(
    Response.json(body, { headers: responseHeaders() }),
    Response.json({ ...body, data: { ...articleData, progress: { overallPercent: 100 } } }, { headers: responseHeaders() }),
  );
  await commit(page("4", { reset: false }), [descriptor(article)], "4");
  expect((await controller.download(article)).status).toBe("saved");
  expect((await controller.download(article)).status).toBe("retry");
  expect((await controller.read(article))?.data).toEqual(articleData);
});

test("an uncommitted access event suppresses the old package and rejects a late resource response", async () => {
  let respond!: (value: Response) => void;
  let observed!: (value: void) => void;
  const requested = new Promise<void>(start => { observed = start; });
  const delayed = new Promise<Response>(finish => { respond = finish; });
  const { controller, metadata, readingStore, commit, guard } = await setup(resource(), () => {
    observed();
    return delayed;
  });
  expect((await controller.download(target)).status).toBe("saved");
  const pending = controller.download(target);
  await requested;
  const changed = page("5", { reset: false, serverTime: now + 1, changes: [{
    cursor: "5", kind: target.kind, courseId: target.courseId, resourceId: target.id, action: "upsert", revision: updatedRevision,
  }] });
  await metadata.applyAccess(scope, { response: changed, expectedCursor: "4" });
  expect(await controller.read(target)).toBeNull();
  respond(resource());
  expect((await pending).status).toBe("changed");
  await commit(changed, [descriptor(target, updatedRevision)], "4");
  expect(await readingStore.list(scope, guard)).toEqual([]);
});

test("a current matching manifest renews healthy proof and chapter withdrawal purges the reading", async () => {
  const { controller, commit, readingStore, metadata, db, guard, time } = await setup(resource({ expires: now + 1_000 }));
  expect((await controller.download(target)).status).toBe("saved");
  time(now + 500);
  await commit(page("4", { reset: false, serverTime: now + 500 }), [descriptor()], "4");
  expect((await controller.read(target))?.summary.leaseExpiresAt).toBe(now + 1_000);
  await readingStore.reconcile(scope, guard.assertCurrent);
  time(now + 1_000);
  expect((await controller.read(target))?.summary.leaseExpiresAt).toBe(lease);
  const narrowed = page("5", { reset: false, serverTime: now + 1_002, access: [{ ...grant, chapterIds: [] }] });
  await commit(narrowed, [], "4");
  expect(await controller.read(target)).toBeNull();
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v2").get()).toEqual({ count: 0 });
  await metadata.clearSession(scope);
  await readingStore.clearSession(scope);
  expect(await controller.list()).toEqual([]);
});

test("an expired resource lease requires a successful resource and required image re-download", async () => {
  const expiration = now + 1_000;
  const refreshed = resource({ withImage: true, validatedAt: expiration + 1 });
  const { controller, readingStore, commit, guard, observed, time } = await setup(
    resource({ withImage: true, expires: expiration }), raster(),
    refreshed, new Response(null, { status: 500 }),
    resource({ withImage: true, validatedAt: expiration + 1 }),
    raster({ "x-offline-validated-at": String(expiration + 1) }),
  );
  expect((await controller.download(target)).status).toBe("saved");
  time(expiration);
  await commit(page("4", { reset: false, serverTime: expiration }), [descriptor()], "4");
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect(await controller.list()).toEqual([]);
  expect((await controller.download(target)).status).toBe("retry");
  expect(await controller.read(target)).toBeNull();
  expect((await controller.download(target)).status).toBe("saved");
  expect(observed.filter(path => path === assetPath)).toHaveLength(3);
  expect((await controller.read(target))?.summary.leaseExpiresAt).toBe(lease);
});

test("a required image lease caps healthy manifest renewal and cannot be revived by metadata", async () => {
  const expiration = now + 1_000;
  const { controller, commit, readingStore, guard, time } = await setup(
    resource({ withImage: true }), raster({ "x-offline-lease-expires-at": String(expiration) }),
  );
  expect((await controller.download(target)).status).toBe("saved");
  time(now + 500);
  await commit(page("4", { reset: false, serverTime: now + 500 }), [descriptor()], "4");
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect((await controller.read(target))?.summary.leaseExpiresAt).toBe(expiration);
  time(expiration);
  await commit(page("4", { reset: false, serverTime: expiration }), [descriptor()], "4");
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect(await controller.read(target)).toBeNull();
});

test("a reading already older than the policy freshness period requires a resource request", async () => {
  const staleAt = now + 60_000;
  const expires = now + 90_000;
  const { controller, readingStore, commit, guard, time } = await setup(resource({ expires }), resource({ expires, validatedAt: staleAt }));
  const limits = { reset: false, leaseExpiresAt: expires, access: [{ ...grant, leaseExpiresAt: expires }],
    policy: { ...page().policy, contentMaxAgeMs: 60_000 } };
  await commit(page("4", limits), [descriptor()], "4");
  expect((await controller.download(target)).status).toBe("saved");
  expect((await controller.read(target))?.summary.leaseExpiresAt).toBe(staleAt);
  time(staleAt);
  await commit(page("4", { ...limits, serverTime: staleAt }), [descriptor()], "4");
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect(await controller.list()).toEqual([]);
  expect((await controller.download(target)).status).toBe("saved");
});

test("cursor reset invalidates matching packages and rejects a late pre-reset response", async () => {
  let respond!: (value: Response) => void;
  let received!: () => void;
  const requested = new Promise<void>(resolve => { received = resolve; });
  const delayed = new Promise<Response>(resolve => { respond = resolve; });
  const { controller, readingStore, commit, guard, time } = await setup(resource(), () => {
    received();
    return delayed;
  }, resource({ cursor: "1", validatedAt: now + 1 }));
  expect((await controller.download(target)).status).toBe("saved");
  const preReset = controller.download(target);
  await requested;
  time(now + 1);
  await commit(page("1", { serverTime: now + 1 }), [descriptor()], "4");
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect(await controller.read(target)).toBeNull();
  respond(resource());
  expect((await preReset).status).toBe("changed");
  expect((await controller.download(target)).status).toBe("saved");
});

test("an explicit same-revision invalidation remains pending across a matching manifest", async () => {
  const { controller, readingStore, commit, guard, time } = await setup(resource(), resource({ cursor: "5", validatedAt: now + 1 }));
  expect((await controller.download(target)).status).toBe("saved");
  time(now + 1);
  await commit(page("5", { reset: false, serverTime: now + 1, changes: [{
    cursor: "5", kind: target.kind, courseId: target.courseId, resourceId: target.id, action: "invalidate", revision,
  }] }), [descriptor()], "4");
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect(await controller.read(target)).toBeNull();
  expect((await controller.download(target)).status).toBe("saved");
});

test("a newer manifest behind a saved resource cursor cannot validate that package", async () => {
  const { controller, readingStore, commit, guard, time } = await setup(resource({ cursor: "8" }), resource({ cursor: "8", validatedAt: now + 1 }));
  expect((await controller.download(target)).status).toBe("saved");
  expect(await controller.read(target)).not.toBeNull();
  time(now + 1);
  await commit(page("5", { reset: false, serverTime: now + 1 }), [descriptor()], "4");
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect(await controller.read(target)).toBeNull();
  expect((await controller.download(target)).status).toBe("saved");
});

const legacySchema = `
  CREATE TABLE expo_reading_packages_v1 (entry INTEGER PRIMARY KEY, title TEXT);
  CREATE TABLE expo_reading_parts_v1 (entry INTEGER, data BLOB);
  CREATE TABLE expo_reading_verification_v1 (entry INTEGER PRIMARY KEY);
`;

test("upgrades atomically and keeps new downloads invisible to a downgraded reader", async () => {
  const { controller, connection, db, guard } = await setup(resource());
  db.exec(legacySchema + `
    INSERT INTO expo_reading_packages_v1 VALUES (1, 'legacy reading');
    INSERT INTO expo_reading_parts_v1 VALUES (1, X'74657874');
    INSERT INTO expo_reading_verification_v1 VALUES (1);
  `);
  const failing = createOfflineReadingStore({
    ...connection,
    withExclusiveTransactionAsync(work) {
      return connection.withExclusiveTransactionAsync(tx => work({
        ...tx,
        async execAsync(sql) {
          await tx.execAsync(sql);
          if (sql.includes("DROP TABLE")) throw new Error("migration interrupted");
        },
      }));
    },
  }, () => now);
  await expect(failing.list(scope, guard)).rejects.toThrow("migration interrupted");
  expect(db.query("SELECT title FROM expo_reading_packages_v1").get()).toEqual({ title: "legacy reading" });
  expect(db.query("SELECT length(data) AS bytes FROM expo_reading_parts_v1").get()).toEqual({ bytes: 4 });
  expect(db.query("SELECT name FROM sqlite_master WHERE name = 'expo_reading_packages_v2'").get()).toBeNull();

  expect(await controller.list()).toEqual([]);
  expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'expo_reading_%_v1'").all()).toEqual([]);
  expect((await controller.download(target)).status).toBe("saved");
  // An older build recreates and queries its own tables, which stay empty.
  db.exec(legacySchema);
  expect(db.query("SELECT title FROM expo_reading_packages_v1").all()).toEqual([]);
  expect(db.query("SELECT data FROM expo_reading_parts_v1").all()).toEqual([]);
  const reopened = createOfflineReadingStore(connection, () => now);
  expect((await reopened.read(scope, target, guard))?.data).toEqual(data);
  expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'expo_reading_%_v1'").all()).toEqual([]);
});

test("upgrade reclaims v2 packages retired by a downgraded logout or a replacement session", async () => {
  const { controller, commit, metadata, readingStore, connection, db, guard } = await setup(resource());
  const english = { ...scope, locale: "en" as const };
  const replaced = { ...scope, accountId: "replaced" };
  const active = { ...scope, accountId: "active" };
  const unknown = { ...scope, accountId: "unknown" };
  const body = new TextEncoder().encode(JSON.stringify(data));
  for (const selection of [scope, english, replaced, active, unknown]) {
    if (selection !== scope) await commit(page(), [descriptor()], null, selection);
    const authority = await readingStore.authorize(selection, target, guard);
    await readingStore.store(selection, {
      target, body, assets: [], revision, cursor: "4", resetGeneration: authority!.resetGeneration,
      assetLeaseExpiresAt: null, leaseExpiresAt: lease, validatedAt: now,
    }, guard);
  }
  // The older build can clear metadata and its v1 readings but the v2 rows are left behind.
  db.exec(legacySchema);
  await metadata.clearSession(scope);
  db.exec("UPDATE expo_reading_packages_v2 SET bytes = 209715200 WHERE account_id = 'learner-1'");
  await commit(page(), [descriptor()], null, { ...replaced, sessionId: "session-2" });
  db.exec("DELETE FROM offline_reading_metadata_v1 WHERE account_id = 'unknown'");
  expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v2").get()).toEqual({ count: 5 });

  const reopened = createOfflineReadingStore(connection, () => now);
  expect((await reopened.read(active, target, guard))?.data).toEqual(data);
  expect(db.query("SELECT account_id FROM expo_reading_packages_v2 ORDER BY account_id").all())
    .toEqual([{ account_id: active.accountId }, { account_id: unknown.accountId }]);
  expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v2").get()).toEqual({ count: 2 });
  await commit(page(), [descriptor()], null, { ...scope, sessionId: "session-2" });
  const authority = await reopened.authorize({ ...scope, sessionId: "session-2" }, target, guard);
  await reopened.store({ ...scope, sessionId: "session-2" }, {
    target, body, assets: [], revision, cursor: "4", resetGeneration: authority!.resetGeneration,
    assetLeaseExpiresAt: null, leaseExpiresAt: lease, validatedAt: now,
  }, guard);
  expect(await controller.list()).toEqual([]);
});

test("pins complete packages and releases quota by forgetting unavailable bytes", async () => {
  const { controller, readingStore, commit, guard, db, time } = await setup();
  const materials = Array.from({ length: 26 }, (_, index) => descriptor({ ...target, id: `reading-${index}` }));
  await commit(page("5"), materials, "4");
  const authority = await readingStore.authorize(scope, { ...target, id: materials[0].id }, guard);
  const verification = { revision, cursor: "5", resetGeneration: authority!.resetGeneration, assetLeaseExpiresAt: null,
    leaseExpiresAt: lease, validatedAt: now };
  for (const item of materials.slice(0, 25)) {
    const selection = { ...target, id: item.id };
    const body = new TextEncoder().encode(JSON.stringify({ ...data, id: selection.id, body: selection.id === "reading-0" ? "x".repeat(600_000) : "" }));
    await readingStore.store(scope, { target: selection, body, assets: [], ...verification,
      leaseExpiresAt: item.id === "reading-0" ? now + 5 : lease }, guard);
  }
  const next = { target: { ...target, id: materials[25].id }, body: new TextEncoder().encode(JSON.stringify(data)), assets: [], ...verification };
  await expect(readingStore.store(scope, next, guard)).rejects.toMatchObject({ code: "storage-full" });
  expect(await readingStore.list(scope, guard)).toHaveLength(25);
  expect(db.query("SELECT MAX(length(data)) AS size FROM expo_reading_parts_v2").get()).toEqual({ size: 256 * 1024 });
  expect((await readingStore.read(scope, { ...target, id: "reading-0" }, guard))?.data).toMatchObject({ body: "x".repeat(600_000) });
  time(now + 5);
  expect(await controller.storage()).toMatchObject({ unavailableCount: 1 });
  expect(await controller.purgeUnavailable()).toBe(1);
  expect(await controller.storage()).toMatchObject({ unavailableCount: 0 });
  await readingStore.store(scope, next, guard);
  expect(await readingStore.list(scope, guard)).toHaveLength(25);
  expect(db.query("SELECT MAX(length(data)) AS size FROM expo_reading_parts_v2").get()).not.toEqual({ size: 256 * 1024 });
});

test("prunes past-retention bytes even when a different download still exceeds quota", async () => {
  const { controller, readingStore, commit, guard, db, time } = await setup(resource());
  const next = { ...target, id: "reading-next" };
  expect(await controller.download(target)).toEqual({ status: "saved" });
  expect(await controller.setPinned(target, false)).toBe(true);
  time(now + 1_000);
  const maxBytes = 8 * 1024;
  const policy = { ...page().policy, retentionMs: 500, maxBytes };
  await commit(page("5", { reset: false, policy, serverTime: now + 1_000 }), [descriptor(), descriptor(next)], "4");
  const permit = await readingStore.authorize(scope, next, guard);
  const candidate = {
    target: next, assets: [], revision, cursor: "5", resetGeneration: permit!.resetGeneration,
    assetLeaseExpiresAt: null, leaseExpiresAt: lease, validatedAt: now + 1_000,
    body: new TextEncoder().encode(JSON.stringify({ ...data, id: next.id, body: "x".repeat(maxBytes) })),
  };
  await expect(readingStore.store(scope, candidate, guard)).rejects.toMatchObject({ code: "storage-full" });
  expect(await controller.storage()).toMatchObject({ unavailableCount: 0 });
  expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v2").get()).toEqual({ count: 0 });
  await readingStore.store(scope, { ...candidate, body: new TextEncoder().encode(JSON.stringify({ ...data, id: next.id })) }, guard);
  expect((await controller.list()).map(item => item.id)).toEqual([next.id]);
});

test("a refresh revalidates only three saved candidates and verifies their existing authorization", async () => {
  const selections = Array.from({ length: 4 }, (_, index) => ({ ...target, id: `saved-${index}` }));
  const responses = [new Response(null, { status: 500 }),
    ...[2, 1, 0, 3].map(index => resource({ selection: selections[index], validatedAt: now + 1 }))];
  const { controller, readingStore, commit, guard, observed, time } = await setup(...responses);
  await commit(page("4", { reset: false }), selections.map(selection => descriptor(selection)), "4");
  for (const selection of selections) {
    const permit = await readingStore.authorize(scope, selection, guard);
    const body = new TextEncoder().encode(JSON.stringify({ ...data, id: selection.id }));
    await readingStore.store(scope, { target: selection, body, assets: [], revision, cursor: "4", resetGeneration: permit!.resetGeneration,
      assetLeaseExpiresAt: null, leaseExpiresAt: now + 1, validatedAt: now }, guard);
  }
  time(now + 1);
  expect(await controller.storage()).toMatchObject({ unavailableCount: 4 });
  expect(await controller.revalidateSaved()).toEqual({ attempted: 3, restored: 2 });
  expect(observed).toHaveLength(3);
  expect(await controller.list()).toHaveLength(2);
  expect(await controller.storage()).toMatchObject({ unavailableCount: 2 });
  expect(await controller.revalidateSaved()).toEqual({ attempted: 2, restored: 2 });
  expect(observed).toHaveLength(5);
  expect(await controller.storage()).toMatchObject({ unavailableCount: 0 });
});

test("concurrent refresh calls share one budget and elapsed time stops later requests", async () => {
  let respond!: (value: Response) => void;
  let observedRequest!: () => void;
  const requested = new Promise<void>(start => { observedRequest = start; });
  const delayed = new Promise<Response>(finish => { respond = finish; });
  const next = { ...target, id: "reading-next" };
  const { controller, commit, time, observed } = await setup(
    resource({ expires: now + 1 }), resource({ expires: now + 1, selection: next }),
    () => { observedRequest(); return delayed; },
  );
  await commit(page("4", { reset: false }), [descriptor(), descriptor(next)], "4");
  expect(await controller.download(target)).toEqual({ status: "saved" });
  expect(await controller.download(next)).toEqual({ status: "saved" });
  time(now + 1);
  const refreshing = controller.revalidateSaved();
  expect(controller.revalidateSaved()).toBe(refreshing);
  await requested;
  time(now + 25_001);
  respond(new Response(null, { status: 500 }));
  expect(await refreshing).toEqual({ attempted: 1, restored: 0 });
  expect(observed).toHaveLength(3);
  expect(await controller.storage()).toMatchObject({ unavailableCount: 2 });
});

test("a saved package purged during refresh does not reappear when its response arrives", async () => {
  let respond!: (value: Response) => void;
  let observed!: () => void;
  const requested = new Promise<void>(start => { observed = start; });
  const delayed = new Promise<Response>(finish => { respond = finish; });
  const { controller, time } = await setup(resource({ expires: now + 1 }), () => { observed(); return delayed; });
  expect((await controller.download(target)).status).toBe("saved");
  time(now + 1);
  const renewing = controller.revalidateSaved();
  await requested;
  expect(await controller.purgeUnavailable()).toBe(1);
  respond(resource({ validatedAt: now + 1 }));
  expect(await renewing).toEqual({ attempted: 1, restored: 0 });
  expect(await controller.list()).toEqual([]);
  expect(await controller.storage()).toMatchObject({ unavailableCount: 0 });
});

test("forget and logout reject late network completions without resurrecting a saved reading", async () => {
  let respond!: (value: Response) => void;
  let observed!: (value: void) => void;
  const requested = new Promise<void>(start => { observed = start; });
  const delayed = new Promise<Response>(finish => { respond = finish; });
  const { controller, transport, readingStore } = await setup(resource(), () => {
    observed();
    return delayed;
  }, new Response(null, { status: 401 }));
  expect((await controller.download(target)).status).toBe("saved");
  const pending = controller.download(target);
  await requested;
  expect(await controller.forget(target)).toBe(true);
  transport.clearSession();
  await readingStore.clearSession(scope);
  respond(resource());
  expect((await pending).status).toBe("cancelled");
  expect(await controller.list()).toEqual([]);
});

test("a server account denial purges the current session's readings", async () => {
  const { controller, readingStore, guard, revocations } = await setup(resource(), Response.json({ code: "OFFLINE_ACCESS_REVOKED" }, { status: 403 }));
  expect((await controller.download(target)).status).toBe("saved");
  expect((await controller.download(target)).status).toBe("unavailable");
  expect(revocations()).toBe(1);
  expect(await readingStore.list(scope, guard)).toEqual([]);
});

test("pins take precedence within the storage budget and follow the reading across verified replacements", async () => {
  const { controller, readingStore, commit, guard } = await setup(resource(), resource());
  expect(await controller.download(target)).toEqual({ status: "saved" });
  expect(await controller.storage()).toMatchObject({ count: 1, pinnedCount: 1, bytes: expect.any(Number) });
  expect(await controller.setPinned(target, false)).toBe(true);
  expect(await controller.download(target)).toEqual({ status: "saved" });
  expect(await controller.list()).toMatchObject([{ id: target.id, pinned: false }]);
  expect(await controller.storage()).toMatchObject({ count: 1, pinnedCount: 0 });
  const next = { ...target, id: "reading-next" };
  const policy = { ...page().policy, maxEntries: 1 };
  await commit(page("5", { reset: false, policy }), [descriptor(), descriptor(next)], "4");
  const permit = await readingStore.authorize(scope, next, guard);
  await readingStore.store(scope, {
    target: next, body: new TextEncoder().encode(JSON.stringify({ ...data, id: next.id })), assets: [],
    revision, cursor: "5", resetGeneration: permit!.resetGeneration, assetLeaseExpiresAt: null, leaseExpiresAt: lease, validatedAt: now,
  }, guard);
  expect(await controller.list()).toMatchObject([{ id: next.id, pinned: true }]);
  expect(await controller.storage()).toMatchObject({ count: 1, pinnedCount: 1 });
});

test("clear removes complete downloads, preserves matched course manifests and fences another controller's pending save", async () => {
  let respond!: (response: Response) => void;
  let observed!: () => void;
  const requestStarted = new Promise<void>(start => { observed = start; });
  const delayed = new Promise<Response>(finish => { respond = finish; });
  const { controller, metadata, options } = await setup(resource(), () => { observed(); return delayed; });
  expect(await controller.download(target)).toEqual({ status: "saved" });
  const another = createOfflineReadingController(options);
  const pending = another.download(target);
  await requestStarted;
  expect(await controller.clearDownloads()).toBe(1);
  expect(await controller.storage()).toMatchObject({ count: 0, bytes: 0, pinnedCount: 0 });
  expect((await metadata.read(scope, now))?.courses[0]?.materials).toMatchObject([descriptor()]);
  respond(resource());
  expect((await pending).status).toBe("changed");
  expect(await controller.list()).toEqual([]);
  another.dispose();
});

test("video catalogs are tied to a current session, course grant and invalidation cursor", async () => {
  const { metadata, commit, controller } = await setup(resource());
  expect(await controller.download(target)).toEqual({ status: "saved" });
  const previous = (await metadata.read(scope, now))!;
  const base = { cursor: "4", revision, validatedAt: now, leaseExpiresAt: lease };
  const video: OfflineLibraryCatalog = { ...base, kind: "video_catalog", courseId: target.courseId,
    grant: catalogGrant({ fullContent: true, chapterIds: ["chapter-1"] }), videos: [{ id: "video-id", title: "Video", playable: true }] };
  const achievements: OfflineLibraryCatalog = { ...base, kind: "achievement_catalog", courseId: null,
    achievements: [{ id: "award", title: "Award", description: "", thresholds: [5, 15] }] };
  const expectedRevision = await metadata.accessRevision(scope);
  expect(previous.courses[0].catalogGrant).toBe(video.grant);
  expect(await metadata.saveCatalogs(scope, expectedRevision, [video, achievements], [], () => {}, now)).toBe(true);
  expect((await metadata.read(scope, now))?.catalogs?.map(catalog => catalog.kind)).toEqual(["achievement_catalog", "video_catalog"]);
  expect((await metadata.read({ ...scope, sessionId: "another-session" }, now))).toBeNull();
  const changed = { cursor: "5", kind: "video_catalog", courseId: target.courseId, resourceId: null, action: "invalidate", revision: null } as const;
  await commit(page("5", { reset: false, changes: [changed] }), [descriptor()], "4");
  expect((await metadata.read(scope, now))?.catalogs?.map(catalog => catalog.kind)).toEqual(["achievement_catalog"]);
  expect(await metadata.saveCatalogs(scope, expectedRevision, [video], [], () => {}, now)).toBe(false);
  expect(await controller.clearDownloads()).toBe(1);
  expect((await metadata.read(scope, now))?.catalogs?.map(catalog => catalog.kind)).toEqual(["achievement_catalog"]);
  expect((await metadata.read(scope, lease))?.catalogs).toEqual([]);
});

test("only a second distinct admitted visit saves an unpinned automatic copy within the network policy", async () => {
  const { options, commit, observed, metadata, controller } = await setup(resource());
  const policy = { ...page().policy, wifiOnly: true };
  await commit(page("4", { reset: false, policy }), [descriptor()], "4");
  let wifi = false;
  const requests: boolean[] = [];
  const automatic = createOfflineReadingController({ ...options, async canAutomaticallyDownload(wifiOnly) {
    requests.push(wifiOnly);
    return !wifiOnly || wifi;
  } });
  expect(await automatic.recordVisit(target, "visit-one")).toBe(false);
  expect(await automatic.recordVisit(target, "visit-one")).toBe(false);
  expect(observed).toHaveLength(0);
  expect(await automatic.recordVisit(target, "visit-two")).toBe(true);
  expect(await automatic.downloadAutomatically(target)).toEqual({ status: "unavailable" });
  expect(requests).toEqual([true]);
  expect(observed).toHaveLength(0);
  wifi = true;
  expect(await automatic.recordVisit(target, "visit-three")).toBe(true);
  expect(await automatic.downloadAutomatically(target)).toEqual({ status: "saved" });
  expect(await automatic.list()).toMatchObject([{ id: target.id, pinned: false }]);
  expect(await automatic.storage()).toMatchObject({ count: 1, pinnedCount: 0 });
  expect(await controller.clearDownloads()).toBe(1);
  expect((await metadata.read(scope, now))?.courses[0]?.materials).toMatchObject([descriptor()]);
  expect(await automatic.recordVisit(target, "visit-four")).toBe(false);
  automatic.dispose();
});
