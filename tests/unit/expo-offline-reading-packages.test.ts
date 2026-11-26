import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { createNativeTransport } from "../../apps/mobile-native/network/transport";
import { createOfflineMetadataStore } from "../../apps/mobile-native/offline/metadata-store";
import { createOfflineReadingController } from "../../apps/mobile-native/offline/reading-client";
import { readingKey, type OfflineReadingTarget } from "../../apps/mobile-native/offline/reading-contract";
import { subscribeOfflineReadingChanges } from "../../apps/mobile-native/offline/reading-events";
import { createOfflineReadingStore, type OfflineReadingDatabase } from "../../apps/mobile-native/offline/reading-store";
import type { NativeOfflineResourceDescriptor, NativeOfflineScope, NativeOfflineSyncResponse } from "../../apps/mobile-native/offline/sync-contract";

const scope: NativeOfflineScope = {
  origin: "https://staging.zyxacademy.com", accountId: "learner-1", sessionId: "session-1", locale: "id",
};
const now = 1_785_000_000_000;
const lease = now + 60_000;
const revision = "a".repeat(64);
const updatedRevision = "b".repeat(64);
const target: OfflineReadingTarget = { courseId: "course-1", kind: "diktat", id: "reading-1" };
const grant = { courseId: target.courseId, allowed: true, fullContent: true, chapterIds: ["chapter-1"], leaseExpiresAt: lease };
const data = { id: target.id, courseId: target.courseId, title: "Peluang", kind: "article", docCategory: "diktat", contentVersion: 1, body: "Peluang dan frekuensi." };
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

function descriptor(selection = target, version = revision): NativeOfflineResourceDescriptor {
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

function resource({ withImage = false, version = revision, cursor = "4", expires = lease, url = assetPath, locale = scope.locale } = {}) {
  return Response.json({
    ...identity, locale, resource: descriptor(target, version), data: withImage ? { ...data, body: `![Sample](${url})` } : data,
    cursor, validatedAt: now, leaseExpiresAt: expires, assets: withImage ? [{ url, required: true }] : [],
  }, { headers: responseHeaders({ version, cursor, expires }) });
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

  async function commit(response = page(), materials = [descriptor()], previous: string | null = null) {
    const accessRevision = await metadata.applyAccess(scope, { response, expectedCursor: previous });
    expect(accessRevision).toBeNumber();
    const saved = await metadata.commitPage(scope, { response, expectedCursor: previous, accessRevision: accessRevision!, manifests: [{
      ...identity, cursor: response.cursor, serverTime: response.serverTime, leaseExpiresAt: response.leaseExpiresAt,
      resource: response.access[0], resources: materials,
    }] });
    expect(saved).toBe(true);
  }

  await commit();
  return { controller, commit, metadata, readingStore, guard, db, options, observed, transport, revocations: () => revocations,
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
  expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_packages_v1").get()).toEqual({ count: 1 });
});

test("a required asset reporting the material changed invalidates the old package", async () => {
  const { controller } = await setup(
    resource(), resource({ withImage: true }), Response.json({ code: "OFFLINE_MATERIAL_CHANGED" }, { status: 409 }),
  );
  expect((await controller.download(target)).status).toBe("saved");
  expect((await controller.download(target)).status).toBe("changed");
  expect(await controller.read(target)).toBeNull();
});

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

test("expiry, renewed matching manifest, chapter withdrawal and session purge are enforced", async () => {
  const { controller, commit, readingStore, metadata, db, guard, time } = await setup(resource({ expires: now + 1_000 }), resource());
  expect((await controller.download(target)).status).toBe("saved");
  time(now + 1_000);
  expect(await controller.read(target)).toBeNull();
  await commit(page("4", { reset: false, serverTime: now + 1_001 }), [descriptor()], "4");
  expect((await controller.read(target))?.summary.leaseExpiresAt).toBe(lease);
  const narrowed = page("5", { reset: false, serverTime: now + 1_002, access: [{ ...grant, chapterIds: [] }] });
  await commit(narrowed, [], "4");
  expect(await controller.read(target)).toBeNull();
  await readingStore.reconcile(scope, guard.assertCurrent);
  expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v1").get()).toEqual({ count: 0 });
  await metadata.clearSession(scope);
  await readingStore.clearSession(scope);
  expect(await controller.list()).toEqual([]);
});

test("pins complete packages within storage policy and splits large payloads into bounded SQLite rows", async () => {
  const { readingStore, commit, guard, db } = await setup();
  const materials = Array.from({ length: 26 }, (_, index) => descriptor({ ...target, id: `reading-${index}` }));
  await commit(page("5"), materials, "4");
  for (const item of materials.slice(0, 25)) {
    const selection = { ...target, id: item.id };
    const body = new TextEncoder().encode(JSON.stringify({ ...data, id: selection.id, body: selection.id === "reading-0" ? "x".repeat(600_000) : "" }));
    await readingStore.store(scope, { target: selection, body, assets: [], revision, cursor: "5", leaseExpiresAt: lease, validatedAt: now }, guard);
  }
  await expect(readingStore.store(scope, { target: { ...target, id: materials[25].id }, body: new Uint8Array([42]),
    assets: [], revision, cursor: "5", validatedAt: now, leaseExpiresAt: lease }, guard)).rejects.toMatchObject({ code: "storage-full" });
  expect(await readingStore.list(scope, guard)).toHaveLength(25);
  expect(db.query("SELECT MAX(length(data)) AS size FROM expo_reading_parts_v1").get()).toEqual({ size: 256 * 1024 });
  expect((await readingStore.read(scope, { ...target, id: "reading-0" }, guard))?.data).toMatchObject({ body: "x".repeat(600_000) });
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
