import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import type { NativeAccountContext } from "../../packages/native-session/context";
import type { NativeRouteNode } from "../../apps/mobile-native/auth/login-intent";
import { createNativeSessionApi, NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import { createNativeSessionController } from "../../apps/mobile-native/auth/session-controller";
import { loadInbox, markInboxRead } from "../../apps/mobile-native/features/notification-inbox/client";
import { hasVerifiedInboxAccess } from "../../apps/mobile-native/features/notification-inbox/access";
import { loadNativeAccountContext } from "../../apps/mobile-native/network/account-context";
import { createNativeTransport, type NativeSessionTransport } from "../../apps/mobile-native/network/transport";
import { createOfflineMetadataStore } from "../../apps/mobile-native/offline/metadata-store";
import { readingAccess } from "../../apps/mobile-native/offline/reading-access";
import { createOfflineReadingController } from "../../apps/mobile-native/offline/reading-client";
import { readingKey, type OfflineReadingTarget } from "../../apps/mobile-native/offline/reading-contract";
import { createOfflineReadingStore, type OfflineReadingDatabase } from "../../apps/mobile-native/offline/reading-store";
import type { NativeOfflineScope, NativeOfflineSyncResponse } from "../../apps/mobile-native/offline/sync-contract";
import { createExpoRouteHistory, resolveExpoEntryRoute } from "../../apps/mobile-native/routing/route-history";
import { canNavigateNativeSession, navigationSessionKey, resetSessionStack } from "../../apps/mobile-native/routing/session-stack";

const origin = NATIVE_STAGING_ORIGIN;
const now = Date.parse("2026-11-26T09:00:00Z");
const expiresAt = now + 600_000;
const cookieFor = (name: string) => `__Secure-better-auth.session_token=fixture${name}.${name.repeat(43)}%3D`;

function account(name: "A" | "B", id: string) {
  const context: NativeAccountContext = {
    accountId: `learner-${name}`, sessionId: `session-${name}`, dashboard: "/dashboard", locale: "id", roles: ["murid"],
  };
  const row = {
    id, title: `Inbox ${name}`, body: `Private message ${name}`, type: "discussion", read: false,
    createdAt: new Date(now).toISOString(), metadata: { url: `/dashboard/discussions?thread=thread-${name}` },
  };
  return { context, cookie: cookieFor(name), row };
}

function heldJson(payload: unknown) {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      started.resolve();
      await release.promise;
      controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)));
      controller.close();
      finished.resolve();
    },
  }, { highWaterMark: 0 });
  return {
    response: new Response(stream, { headers: { "Content-Type": "application/json" } }),
    started: started.promise,
    release: release.resolve,
    finished: finished.promise,
  };
}

function readingDatabase(db: Database): OfflineReadingDatabase {
  type Bind = string | number | null | Uint8Array;
  const adapter: OfflineReadingDatabase = {
    async execAsync(sql) { db.exec(sql); },
    async getFirstAsync<T>(sql: string, ...params: Bind[]) { return db.query<T, Bind[]>(sql).get(...params); },
    async getAllAsync<T>(sql: string, ...params: Bind[]) { return db.query<T, Bind[]>(sql).all(...params); },
    async runAsync(sql, ...params) {
      const result = db.run(sql, params);
      return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async withExclusiveTransactionAsync(work) {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work(adapter);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return adapter;
}

const target: OfflineReadingTarget = { kind: "diktat", courseId: "course", id: "reading" };
const policy: NativeOfflineSyncResponse["policy"] = {
  revision: 1, updatedAt: now, metadataMaxAgeMs: 86_400_000, contentMaxAgeMs: 604_800_000, retentionMs: 2_592_000_000,
  accessLeaseMs: 86_400_000, activeCheckIntervalMs: 60_000, maxBytes: 8 * 1024 * 1024,
  maxEntries: 25, autoCache: true, wifiOnly: false,
  schedule: { frequency: "weekly", weekday: 5, hour: 6, timeZone: "Asia/Jakarta" },
};
const node = (href: string): NativeRouteNode => ({
  href, contextKey: `.${href}.tsx`, isGenerated: false, isInternal: false, children: [],
});
const sitemap = { ...node("/"), children: [node("/dashboard"), node("/courses/[id]")] };

test("same-role Expo account replacement retires the old stack, offline reading and in-flight inbox", async () => {
  const [a, b] = [account("A", "5d1001f0-4084-4b3c-8a7f-1d0ff80b6051"), account("B", "91499c86-97c6-4f22-bc2c-70bc81285779")];
  const pendingHistory = heldJson({ unreadCount: 1, notifications: [a.row] });
  const pendingAck = heldJson({ success: true });
  const auth = new Map([a, b].map(item => [item.cookie, item]));
  const heldCleanup = Promise.withResolvers<void>();
  const enteredCleanup = Promise.withResolvers<void>();
  let holdHistory = false;
  let credential: string | null = null;
  let routeRecord: string | null = null;
  const acknowledgements: { accountId: string; ids: string[] }[] = [];

  const api = createNativeSessionApi(origin, async (raw, init) => {
    const cookie = new Headers(init.headers).get("Cookie") ?? "";
    const actor = auth.get(cookie);
    const path = new URL(raw).pathname;
    if (path === "/api/auth/sign-out") {
      auth.delete(cookie);
      return Response.json({ success: true });
    }
    expect(path).toBe("/api/auth/get-session");
    if (!actor) return Response.json(null);
    const { accountId, sessionId } = actor.context;
    return Response.json({ user: { id: accountId }, session: { id: sessionId, userId: accountId, expiresAt: new Date(expiresAt).toISOString() } });
  });
  const network = createNativeTransport({ origin, fetcher: async (raw, init) => {
    const url = new URL(raw);
    const actor = auth.get(new Headers(init.headers).get("Cookie") ?? "");
    if (!actor) return new Response(null, { status: 401 });
    if (url.pathname === "/api/native/context") return Response.json(actor.context);
    if (url.pathname === "/api/notifications/history") {
      expect(url.searchParams.has("userId")).toBe(false);
      if (actor === a && holdHistory) return pendingHistory.response;
      return Response.json({ unreadCount: Number(!actor.row.read), notifications: [actor.row] });
    }
    expect(url.pathname).toBe("/api/notifications/read");
    expect(init.method).toBe("PATCH");
    const { ids } = JSON.parse(String(init.body)) as { ids: string[] };
    acknowledgements.push({ accountId: actor.context.accountId, ids });
    if (ids.includes(actor.row.id)) actor.row.read = true;
    return actor === a ? pendingAck.response : Response.json({ success: true });
  } });
  const controller = createNativeSessionController({ origin, api, dataTransport: network, now: () => now, store: {
    async read() { return credential; },
    async write(value) { credential = value; },
    async remove() { credential = null; },
  } });
  const history = createExpoRouteHistory({
    read: () => routeRecord, write(value) { routeRecord = value; }, remove() { routeRecord = null; },
  }, () => now);
  const db = new Database(":memory:");
  const adapter = readingDatabase(db);
  const metadata = createOfflineMetadataStore(adapter);
  const store = createOfflineReadingStore(adapter, () => now);
  controller.subscribeBeforeLocalLogout(async scope => {
    enteredCleanup.resolve();
    await heldCleanup.promise;
    history.clear(scope);
    await metadata.clearSession(scope);
    await store.clearSession(scope);
  });

  const headers = (item: typeof a) => new Headers({ "Set-Cookie": `${item.cookie}; Path=/; Secure; HttpOnly` });
  const signal = new AbortController().signal;
  function bound() {
    const active = controller.getSnapshot().transport;
    if (!active) throw new Error("Expected a verified account transport");
    return active;
  }
  function access(context: NativeAccountContext | null, offline: boolean) {
    const { state, transport, revalidating } = controller.getSnapshot();
    const identity = state.status === "signed-in" ? state : state.status === "unavailable" ? state.offlineIdentity : undefined;
    return readingAccess({ identity: identity ? { ...identity, origin } : null, locale: "id", foreground: true, offline,
      liveStudent: !!context?.roles.includes("murid") && !!transport && hasVerifiedInboxAccess("student", context, transport),
      denied: false, revalidating, now });
  }
  function reader(scope: NativeOfflineScope, session: NativeSessionTransport) {
    return createOfflineReadingController({ scope, session, verifiedUntil: expiresAt,
      repository: async () => store, onRevoked: async () => {}, now: () => now, checkAsset: async () => false });
  }
  async function pin(scope: NativeOfflineScope, session: NativeSessionTransport, body: string) {
    const identity = { accountId: scope.accountId, sessionId: scope.sessionId, locale: scope.locale,
      environment: scope.origin, protocolVersion: 1 as const, cursor: "1", serverTime: now, leaseExpiresAt: expiresAt };
    const resource = { courseId: target.courseId, allowed: true, fullContent: true, chapterIds: ["chapter"], leaseExpiresAt: expiresAt };
    const response: NativeOfflineSyncResponse = { ...identity, reset: true, hasMore: false, policy,
      access: [resource], enrollments: [{ id: target.courseId, title: "Course", expiresAt: null }], changes: [] };
    const accessRevision = await metadata.applyAccess(scope, { expectedCursor: null, response }, session.assertCurrent);
    if (accessRevision === null) throw new Error("Expected an applied access page");
    const revision = "a".repeat(64);
    const materials = [{ ...target, key: readingKey(target), revision, chapterIds: ["chapter"],
      title: "Diktat", updatedAt: now, estimatedBytes: 40 }];
    expect(await metadata.commitPage(scope, { expectedCursor: null, response, accessRevision,
      manifests: [{ ...identity, resource, resources: materials }] }, session.assertCurrent)).toBe(true);
    const guard = { assertCurrent: session.assertCurrent, verifiedUntil: expiresAt };
    const authority = await store.authorize(scope, target, guard);
    if (!authority) throw new Error("Expected an authorized reading");
    const reading = { id: target.id, courseId: target.courseId, title: "Diktat", kind: "article", docCategory: "diktat", contentVersion: 1, body };
    await store.store(scope, { target, revision, cursor: identity.cursor, validatedAt: now,
      resetGeneration: authority.resetGeneration, leaseExpiresAt: expiresAt, assetLeaseExpiresAt: null, assets: [],
      body: new TextEncoder().encode(JSON.stringify(reading)) }, guard);
  }

  try {
    await controller.refresh();
    await controller.acceptLogin(headers(a), a.context.accountId);
    const sessionA = bound();
    const whoA = await loadNativeAccountContext(sessionA);
    await controller.rememberAccountAccess(whoA, sessionA);
    const scopeA = access(whoA, false).scope!;
    const readingA = reader(scopeA, sessionA);
    await pin(scopeA, sessionA, "Private reading A");
    expect((await readingA.read(target))?.data.body).toBe("Private reading A");
    history.remember(sessionA.scope, whoA, "/courses/private-a", sessionA.isCurrent);
    expect(history.restore(sessionA.scope, whoA, sitemap, sessionA.isCurrent)).toBe("/courses/private-a");
    const stateA = controller.getSnapshot().state;
    const canNavigateA = () => canNavigateNativeSession(stateA, sessionA, controller.getSnapshot(), now);
    expect(canNavigateA()).toBe(true);
    expect(canNavigateNativeSession(stateA, sessionA, { ...controller.getSnapshot(), revalidating: true }, now)).toBe(false);
    expect(canNavigateNativeSession(stateA, sessionA, controller.getSnapshot(), expiresAt)).toBe(false);
    expect((await loadInbox(sessionA, true, signal)).rows[0]?.id).toBe(a.row.id);
    await expect(controller.acceptLogin(headers(b), b.context.accountId)).rejects.toThrow();

    holdHistory = true;
    const oldRead = loadInbox(sessionA, true, signal);
    const oldAck = markInboxRead(sessionA, { id: a.row.id }, signal);
    const discarded = Promise.allSettled([oldRead, oldAck]);
    await Promise.all([pendingHistory.started, pendingAck.started]);

    const logout = controller.logout();
    await enteredCleanup.promise;
    expect(canNavigateA()).toBe(false);
    expect(controller.getSnapshot().transport).toBeNull();
    expect(access(whoA, true).scope).toBeNull();
    expect(await readingA.read(target)).toBeNull();
    await expect(controller.acceptLogin(headers(b), b.context.accountId)).rejects.toThrow();
    const statePending = controller.getSnapshot().state;
    expect(navigationSessionKey(statePending)).toBeNull();
    const stack = { index: 1, routes: [
      { name: "dashboard", key: "dashboard-a" }, { name: "sign-out", key: "exit-a" },
      { name: "courses/[id]", key: "preloaded-a", isPreloaded: true, params: { id: "private-a" } },
    ] };
    expect(resetSessionStack(stack, true)?.routes).toEqual([stack.routes[1]]);

    heldCleanup.resolve();
    await logout;
    expect(controller.getSnapshot().state.status).toBe("signed-out");
    expect(auth.has(a.cookie)).toBe(false);
    expect(routeRecord).toBeNull();
    expect(await metadata.read(scopeA, now)).toBeNull();
    expect(db.query("SELECT COUNT(*) AS count FROM expo_reading_parts_v2").get()).toEqual({ count: 0 });

    await controller.acceptLogin(headers(b), b.context.accountId);
    const sessionB = bound();
    const whoB = await loadNativeAccountContext(sessionB);
    expect(whoB.roles).toEqual(whoA.roles);
    const stateB = controller.getSnapshot().state;
    expect(navigationSessionKey(stateB)).not.toBe(navigationSessionKey(stateA));
    expect(canNavigateA()).toBe(false);
    expect(canNavigateNativeSession(stateB, sessionB, controller.getSnapshot(), now)).toBe(true);
    const scopeB = access(whoB, false).scope!;
    const readingB = reader(scopeB, sessionB);
    expect(await readingB.read(target)).toBeNull();
    await pin(scopeB, sessionB, "Private reading B");
    expect((await readingB.read(target))?.data.body).toBe("Private reading B");
    expect(await readingA.read(target)).toBeNull();
    expect(resolveExpoEntryRoute(undefined, whoB, sitemap, () => history.restore(sessionB.scope, whoB, sitemap, sessionB.isCurrent)))
      .toEqual({ status: "ready", href: "/dashboard" });
    history.remember(sessionB.scope, whoB, "/courses/private-b",
      () => canNavigateNativeSession(stateB, sessionB, controller.getSnapshot(), now));
    history.remember(sessionA.scope, whoA, "/courses/private-a", canNavigateA);
    expect(history.restore(sessionB.scope, whoB, sitemap, sessionB.isCurrent)).toBe("/courses/private-b");
    expect(JSON.parse(credential!).accountId).toBe(whoB.accountId);
    expect(credential).not.toContain(a.cookie);

    pendingHistory.release();
    pendingAck.release();
    await Promise.all([pendingHistory.finished, pendingAck.finished]);
    for (const request of await discarded) {
      expect(request).toMatchObject({ status: "rejected", reason: { name: "AbortError" } });
    }
    expect(await loadInbox(sessionB, true, signal)).toMatchObject({ unread: 1, rows: [{ id: b.row.id, read: false }] });
    await markInboxRead(sessionB, { id: a.row.id }, signal);
    expect(await loadInbox(sessionB, true, signal)).toMatchObject({ unread: 1, rows: [{ id: b.row.id, read: false }] });
    await markInboxRead(sessionB, { id: b.row.id }, signal);
    expect(await loadInbox(sessionB, true, signal)).toMatchObject({ unread: 0, rows: [{ id: b.row.id, read: true }] });
    expect(acknowledgements).toEqual([
      { accountId: whoA.accountId, ids: [a.row.id] },
      { accountId: whoB.accountId, ids: [a.row.id] },
      { accountId: whoB.accountId, ids: [b.row.id] },
    ]);
  } finally {
    heldCleanup.resolve();
    pendingHistory.release();
    pendingAck.release();
    db.close();
  }
});

test("protected navigation permits the current offline identity until its verified session expires", () => {
  const offline = { status: "unavailable" as const, offlineIdentity: { accountId: "learner-A", sessionId: "session-A", expiresAt } };
  const current = { state: offline, transport: null, revalidating: false };
  expect(canNavigateNativeSession(offline, null, current, now)).toBe(true);
  expect(canNavigateNativeSession(offline, null, current, expiresAt)).toBe(false);
  expect(canNavigateNativeSession(offline, null, { ...current, state: { ...offline } }, now)).toBe(false);
});
