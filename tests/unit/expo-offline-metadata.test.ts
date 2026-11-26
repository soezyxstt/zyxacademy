import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOfflineMetadataStore, type OfflineMetadataDatabase } from "../../apps/mobile-native/offline/metadata-store";
import type { NativeOfflineCourseAccess, NativeOfflineManifestResponse, NativeOfflineResourceDescriptor, NativeOfflineScope, NativeOfflineSyncResponse } from "../../apps/mobile-native/offline/sync-contract";

const scope: NativeOfflineScope = {
  origin: "https://staging.zyxacademy.com", accountId: "murid-1", sessionId: "session-1", locale: "id",
};
const now = 1_780_000_000_000;
const sqliteFiles = new Set<string>();
const connections = new Set<Database>();
afterEach(() => {
  for (const database of connections) database.close();
  for (const folder of sqliteFiles) rmSync(folder, { recursive: true, force: true });
  connections.clear();
  sqliteFiles.clear();
});

function openTestStore(file = ":memory:", afterWrite?: (sql: string) => void) {
  const database = new Database(file);
  connections.add(database);
  const adapter: OfflineMetadataDatabase = {
    async execAsync(sql) { database.exec(sql); },
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]) {
      return database.query<T, (string | number | null)[]>(sql).get(...params);
    },
    async runAsync(sql, ...params) {
      const { changes } = database.query(sql).run(...params);
      afterWrite?.(sql);
      return { changes };
    },
  };
  return { database, store: createOfflineMetadataStore(adapter) };
}

function grant(courseId = "course-1", parts = ["chapter-1", "chapter-2"]): NativeOfflineCourseAccess {
  return { courseId, allowed: true, fullContent: true, chapterIds: parts, leaseExpiresAt: now + 30_000 };
}

function descriptor(id: string, chapterId: string, courseId = "course-1"): NativeOfflineResourceDescriptor {
  return { kind: "article", key: JSON.stringify(["article", courseId, id]), id, courseId,
    title: id, chapterIds: [chapterId], revision: "r-1", updatedAt: now, estimatedBytes: 900 };
}

function response(cursor: string, patch: Partial<NativeOfflineSyncResponse> = {}): NativeOfflineSyncResponse {
  return {
    protocolVersion: 1, accountId: scope.accountId, sessionId: scope.sessionId, environment: scope.origin, locale: scope.locale,
    cursor, reset: false, hasMore: false, serverTime: now, leaseExpiresAt: now + 60_000,
    policy: { revision: 0, updatedAt: 0, metadataMaxAgeMs: 86_400_000, contentMaxAgeMs: 604_800_000,
      retentionMs: 2_592_000_000, accessLeaseMs: 86_400_000, activeCheckIntervalMs: 60_000, maxBytes: 104_857_600,
      maxEntries: 250, autoCache: true, wifiOnly: false,
      schedule: { frequency: "weekly", weekday: 5, hour: 6, timeZone: "Asia/Jakarta" } },
    enrollments: [{ id: "course-1", title: "Fisika", expiresAt: null }], access: [grant()], changes: [], ...patch,
  };
}

function manifest(page: NativeOfflineSyncResponse, resource: NativeOfflineCourseAccess,
  resources: NativeOfflineResourceDescriptor[], patch: Partial<NativeOfflineManifestResponse> = {}): NativeOfflineManifestResponse {
  const { protocolVersion, accountId, sessionId, environment, locale, cursor, serverTime } = page;
  return { protocolVersion, accountId, sessionId, environment, locale, cursor, serverTime,
    leaseExpiresAt: resource.leaseExpiresAt, resource, resources, ...patch };
}

async function commit(store: ReturnType<typeof createOfflineMetadataStore>, expectedCursor: string | null,
  page: NativeOfflineSyncResponse, manifests: NativeOfflineManifestResponse[]) {
  const accessRevision = await store.applyAccess(scope, { expectedCursor, response: page });
  expect(accessRevision).toBeNumber();
  return store.commitPage(scope, { expectedCursor, response: page, manifests, accessRevision: accessRevision! });
}

describe("Expo SQLite reading metadata", () => {
  test("persists only verified descriptor fields across connections with exact account, origin, locale and session isolation", async () => {
    const folder = mkdtempSync(join(tmpdir(), "zyx-expo-metadata-"));
    sqliteFiles.add(folder);
    const file = join(folder, "metadata.db");
    const { store, database } = openTestStore(file);
    const initial = response("7", { reset: true });
    const reading = { ...descriptor("article-1", "chapter-1"), body: "private-body", assets: ["private-asset"] };
    const view = manifest(initial, grant(), [reading]);
    expect(await commit(store, null, initial, [view])).toBe(true);
    const raw = database.query<{ snapshot: string }, []>("SELECT snapshot FROM offline_reading_metadata_v1").get();
    expect(raw?.snapshot).not.toContain("private-body");
    expect(raw?.snapshot).not.toContain("private-asset");

    const restarted = openTestStore(file).store;
    expect(await restarted.read(scope, now)).toMatchObject({ cursor: "7", knownCourseIds: ["course-1"],
      courses: [{ title: "Fisika", manifestCheckedAt: now, materials: [descriptor("article-1", "chapter-1")] }] });
    for (const other of [{ origin: "https://zyx.academy" }, { accountId: "murid-2" }, { locale: "en" as const }, { sessionId: "session-2" }]) {
      expect(await restarted.read({ ...scope, ...other }, now)).toBeNull();
    }
    await expect(restarted.applyAccess(scope, { expectedCursor: "7", response: { ...initial, sessionId: "unexpected" } })).rejects.toThrow();
  });

  test("atomically deletes denied courses, narrowed chapters and published deletions before acknowledging the cursor", async () => {
    const { store, database } = openTestStore();
    const deniedCourse = grant("course-2");
    const initial = response("13", { reset: true, access: [grant(), deniedCourse] });
    expect(await commit(store, null, initial, [manifest(initial, grant(), [
      descriptor("deleted", "chapter-1"), descriptor("narrowed", "chapter-2"), descriptor("retained", "chapter-1"),
    ]), manifest(initial, deniedCourse, [descriptor("denied", "chapter-1", deniedCourse.courseId)])])).toBe(true);

    const narrowed = { ...grant("course-1", ["chapter-1"]), fullContent: false };
    const changed = response("14", { serverTime: now + 1, access: [narrowed, { ...deniedCourse, allowed: false }],
      changes: [{ cursor: "14", kind: "article", action: "delete", courseId: "course-1", resourceId: "deleted", revision: null }] });
    const accessRevision = await store.applyAccess(scope, { expectedCursor: "13", response: changed });
    expect(accessRevision).toBeNumber();
    expect(await store.read(scope, now + 2)).toMatchObject({ cursor: "13", knownCourseIds: ["course-1"],
      courses: [{ materials: [descriptor("retained", "chapter-1")] }] });
    const raw = database.query<{ snapshot: string }, []>("SELECT snapshot FROM offline_reading_metadata_v1").get();
    const persisted = JSON.parse(raw!.snapshot);
    const courses = JSON.stringify(persisted.courses);
    expect(courses).not.toContain("narrowed");
    expect(courses).not.toContain("deleted");
    expect(courses).not.toContain("denied");
    expect(persisted.readingValidation.invalidations).toEqual({ [JSON.stringify(["article", "course-1", "deleted"])]: "14" });

    await expect(store.commitPage(scope, { expectedCursor: "13", response: changed, accessRevision: accessRevision!,
      manifests: [manifest(changed, narrowed, [descriptor("retained", "chapter-1")]), manifest(changed, deniedCourse, [])] })).rejects.toThrow();
    expect((await store.read(scope, now + 2))?.cursor).toBe("13");

    expect(await store.commitPage(scope, { expectedCursor: "13", response: changed, accessRevision: accessRevision!,
      manifests: [manifest(changed, narrowed, [descriptor("retained", "chapter-1")])] })).toBe(true);
    expect((await store.read(scope, now + 2))?.cursor).toBe("14");
  });

  test("does not renew manifest authorizations with a grant-only sync", async () => {
    const { store } = openTestStore();
    const initial = response("1", { reset: true });
    const reading = descriptor("article-1", "chapter-1");
    expect(await commit(store, null, initial, [manifest(initial, grant(), [reading], { leaseExpiresAt: now + 5_000 })])).toBe(true);
    const later = response("1", { serverTime: now + 3_000, access: [{ ...grant(), leaseExpiresAt: now + 40_000 }] });
    expect(await commit(store, "1", later, [])).toBe(true);
    expect((await store.read(scope, now + 4_999))?.courses[0].materials).toEqual([reading]);
    expect((await store.read(scope, now + 5_000))?.courses[0]).toMatchObject({ manifestCheckedAt: undefined, materials: [] });
    expect(await store.read(scope, now + 40_000)).toEqual({ cursor: "1", knownCourseIds: ["course-1"], activeCheckIntervalMs: 60_000, courses: [] });
  });

  test("rejects stale cursor acknowledgements, preserves large integer order, and supports a server reset", async () => {
    const { store } = openTestStore();
    const earlier = "9007199254740992";
    const later = "9007199254740993";
    const first = response(earlier, { reset: true });
    expect(await commit(store, null, first, [manifest(first, grant(), [descriptor("old", "chapter-1")])])).toBe(true);
    const next = response(later, { serverTime: now + 2 });
    const staleRevision = await store.applyAccess(scope, { expectedCursor: earlier, response: next });
    const newest = response(later, { serverTime: now + 3, access: [{ ...grant(), allowed: false }] });
    const accessRevision = await store.applyAccess(scope, { expectedCursor: earlier, response: newest });
    expect(accessRevision).toBeNumber();
    expect(await store.commitPage(scope, { expectedCursor: earlier, response: next, accessRevision: staleRevision!,
      manifests: [manifest(next, grant(), [descriptor("old", "chapter-1")])] })).toBe(false);
    expect(await store.commitPage(scope, { expectedCursor: earlier, response: newest, accessRevision: accessRevision!, manifests: [] })).toBe(true);
    expect(await store.applyAccess(scope, { expectedCursor: later, response: response(earlier, { serverTime: now + 4 }) })).toBeNull();
    await expect(store.applyAccess(scope, { expectedCursor: later, response: response("99999999999999999999") })).rejects.toThrow();

    const reset = response("2", { reset: true, serverTime: now + 5 });
    const resetRevision = await store.applyAccess(scope, { expectedCursor: later, response: reset });
    expect(await store.read(scope, now + 6)).toMatchObject({ cursor: later, courses: [{ materials: [] }] });
    expect(await store.commitPage(scope, { expectedCursor: later, response: reset, accessRevision: resetRevision!,
      manifests: [manifest(reset, grant(), [descriptor("new", "chapter-1")])] })).toBe(true);
    expect(await store.read(scope, now + 6)).toMatchObject({ cursor: "2", courses: [{ materials: [descriptor("new", "chapter-1")] }] });
  });

  test("a purge or session change prevents a delayed page from restoring revoked data", async () => {
    const { store } = openTestStore();
    const first = response("1", { reset: true });
    const accessRevision = await store.applyAccess(scope, { expectedCursor: null, response: first });
    expect(await store.clear(scope)).toBe(true);
    expect(await store.commitPage(scope, { expectedCursor: null, response: first, accessRevision: accessRevision!,
      manifests: [manifest(first, grant(), [descriptor("old", "chapter-1")])] })).toBe(false);
    expect(await store.read(scope, now)).toBeNull();

    const updated = { ...scope, sessionId: "session-2" };
    const later = response("2", { reset: true, sessionId: updated.sessionId });
    await expect(store.applyAccess(scope, { expectedCursor: null, response: first }, () => { throw new Error("cancelled"); })).rejects.toThrow("cancelled");
    expect(await store.applyAccess(updated, { expectedCursor: null, response: later })).toBeNumber();
    expect(await store.clear(scope)).toBe(false);
    expect(await store.read(updated, now)).not.toBeNull();
  });

  test("a session invalidated during a native SQLite write cannot leave that revision readable", async () => {
    let current = true;
    const { store } = openTestStore(":memory:", sql => {
      if (sql.includes("INSERT INTO")) current = false;
    });
    const first = response("1", { reset: true });
    await expect(store.applyAccess(scope, { expectedCursor: null, response: first }, () => {
      if (!current) throw new Error("cancelled");
    })).rejects.toThrow("cancelled");
    expect(await store.read(scope, now)).toBeNull();
  });

  test("purges both locales in the same SQLite operation while preserving a replacement session", async () => {
    const { store } = openTestStore();
    const first = response("1", { reset: true });
    expect(await commit(store, null, first, [manifest(first, grant(), [descriptor("id", "chapter-1")])])).toBe(true);
    const english = { ...scope, locale: "en" as const };
    const firstEnglish = { ...first, locale: english.locale };
    expect(await store.applyAccess(english, { expectedCursor: null, response: firstEnglish })).toBeNumber();
    await store.clearSession(scope);
    expect(await store.read(scope, now)).toBeNull();
    expect(await store.read(english, now)).toBeNull();

    const next = { ...english, sessionId: "session-2" };
    expect(await store.applyAccess(next, { expectedCursor: null, response: { ...firstEnglish, sessionId: next.sessionId } })).toBeNumber();
    await store.clearSession(scope);
    expect(await store.read(next, now)).not.toBeNull();
  });
});
