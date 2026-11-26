import { describe, expect, test } from "bun:test";
import { createNativeSessionApi, NATIVE_STAGING_ORIGIN, readSignedSessionCookie } from "../../apps/mobile-native/auth/session-api";
import { createNativeSessionController } from "../../apps/mobile-native/auth/session-controller";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";

const origin = NATIVE_STAGING_ORIGIN;
const now = Date.parse("2026-11-26T09:00:00Z");
const cookie = `__Secure-better-auth.session_token=opaque.${"A".repeat(43)}%3D`;
const secureCookie = `${cookie}; Path=/; Secure; HttpOnly; SameSite=Lax`;
const identity = { accountId: "student-1", sessionId: "session-1", expiresAt: now + 600_000 };
const loginHeaders = new Headers({ "Set-Cookie": secureCookie });

function sessionResponse() {
  return { user: { id: identity.accountId }, session: {
    id: identity.sessionId, userId: identity.accountId, expiresAt: new Date(identity.expiresAt).toISOString(),
  } };
}

function createHarness() {
  let stored: string | null = null;
  let serverSession: unknown = sessionResponse();
  let canDelete = true;
  let offline = false;
  let beforeWrite: (() => Promise<void>) | undefined;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const api = createNativeSessionApi(origin, async (url, init) => {
    requests.push({ url, init });
    if (offline) throw new TypeError("offline");
    if (init.method === "POST") {
      if (canDelete) serverSession = null;
      return Response.json({ success: true });
    }
    return Response.json(serverSession);
  });
  const dataTransport = createNativeTransport({ origin, fetcher: async () => Response.json({ success: true }) });
  const controller = () => createNativeSessionController({ origin, api, dataTransport, now: () => now, store: {
    read: async () => stored,
    write: async value => {
      await beforeWrite?.();
      stored = value;
    },
    remove: async () => { stored = null; },
  } });
  return {
    controller, requests,
    readStored: () => stored,
    setStored: (value: unknown) => { stored = JSON.stringify(value); },
    setBeforeWrite: (value?: () => Promise<void>) => { beforeWrite = value; },
    setOffline: (value: boolean) => { offline = value; },
    setCanDelete: (value: boolean) => { canDelete = value; },
    setServerSession: (value: unknown) => { serverSession = value; },
  };
}

describe("Expo staging session", () => {
  test("extracts only the signed secure session cookie from multiple or combined headers", () => {
    const sibling = "__Secure-better-auth.session_data=unused; Expires=Thu, 01 Dec 2026 00:00:00 GMT";
    expect(readSignedSessionCookie({ get: () => `${sibling}, ${secureCookie}, other=1` })).toBe(cookie);
    expect(readSignedSessionCookie({ get: () => null, getSetCookie: () => [sibling, secureCookie] })).toBe(cookie);
    expect(readSignedSessionCookie({ get: () => `${secureCookie}, ${secureCookie}` })).toBeNull();
    expect(readSignedSessionCookie({ get: () => secureCookie.replace("__Secure-", "") })).toBeNull();
    expect(readSignedSessionCookie({ get: () => secureCookie.replace("; HttpOnly", "") })).toBeNull();
    expect(readSignedSessionCookie({ get: () => secureCookie.replace(cookie, "__Secure-better-auth.session_token=unsigned") })).toBeNull();
  });

  test("uses an exact staging origin, omits ambient cookies and rejects redirects", async () => {
    const harness = createHarness();
    const session = harness.controller();
    await session.refresh();
    await session.acceptLogin(loginHeaders, identity.accountId);
    const [request] = harness.requests;
    expect(request.url).toBe(`${origin}/api/auth/get-session?disableCookieCache=true`);
    expect(request.init).toMatchObject({ method: "GET", credentials: "omit", redirect: "manual" });
    expect(new Headers(request.init.headers).get("cookie")).toBe(cookie);
    expect(new Headers(request.init.headers).get("cache-control")).toContain("no-store");
    expect(() => createNativeSessionApi("https://zyx.academy", async () => Response.json(null))).toThrow();
    const redirected = createNativeSessionApi(origin, async () => Response.redirect("https://zyx.academy"));
    await expect(redirected.read(cookie)).rejects.toThrow();
  });

  test("stores only a verified session and checks the same identity on restart and revalidation", async () => {
    const harness = createHarness();
    const session = harness.controller();
    await session.refresh();
    await expect(session.acceptLogin(loginHeaders, "another-account")).rejects.toThrow();
    expect(harness.readStored()).toBeNull();

    await session.acceptLogin(loginHeaders, identity.accountId);
    expect(session.getSnapshot().state).toEqual({ status: "signed-in", ...identity });
    expect(JSON.parse(harness.readStored()!)).toEqual({ status: "active", origin, cookie, ...identity });

    const restored = harness.controller();
    expect(restored.getSnapshot().transport).toBeNull();
    await restored.refresh();
    const activeTransport = restored.getSnapshot().transport;
    expect(activeTransport?.scope).toEqual({ origin, accountId: identity.accountId, sessionId: identity.sessionId });
    harness.setServerSession({ ...sessionResponse(), session: { ...sessionResponse().session, id: "another-session" } });
    await restored.refresh();
    expect(restored.getSnapshot()).toEqual({ state: { status: "signed-out" }, transport: null, revalidating: false });
    expect(activeTransport?.isCurrent()).toBe(false);
    expect(harness.readStored()).toBeNull();
  });

  test("clears a different origin or expired record before using it", async () => {
    for (const change of [{ origin: "https://zyx.academy" }, { expiresAt: now }]) {
      const harness = createHarness();
      harness.setStored({ status: "active", origin, cookie, ...identity, ...change });
      const session = harness.controller();
      await session.refresh();
      expect(harness.requests).toEqual([]);
      expect(harness.readStored()).toBeNull();
      expect(session.getSnapshot().state.status).toBe("signed-out");
    }
  });

  test("retains an unconsumed intent only with its verified session and clears it on consumption", async () => {
    const harness = createHarness();
    const session = harness.controller();
    const intent = { entry: "sign-up", locale: "en", next: "/settings?tab=learning" } as const;
    await session.refresh();
    await session.acceptLogin(loginHeaders, identity.accountId, undefined, intent);
    expect(session.getSnapshot().loginIntent).toEqual(intent);
    expect(JSON.parse(harness.readStored()!).loginIntent).toEqual(intent);

    const restarted = harness.controller();
    expect(restarted.getSnapshot().loginIntent).toBeUndefined();
    await restarted.refresh();
    expect(restarted.getSnapshot().loginIntent).toEqual(intent);
    await restarted.clearLoginIntent({ ...identity, sessionId: "other-session" });
    expect(restarted.getSnapshot().loginIntent).toEqual(intent);
    await restarted.clearLoginIntent(identity);
    expect(restarted.getSnapshot().loginIntent).toBeUndefined();
    expect(JSON.parse(harness.readStored()!).loginIntent).toBeUndefined();
    expect(restarted.getSnapshot().transport?.isCurrent()).toBe(true);

    harness.setStored({ status: "active", origin, cookie, ...identity, loginIntent: intent });
    harness.setServerSession(null);
    const revoked = harness.controller();
    await revoked.refresh();
    expect(revoked.getSnapshot().loginIntent).toBeUndefined();
    expect(harness.readStored()).toBeNull();
  });

  test("hides data access during failed logout and verifies revocation on restart", async () => {
    const harness = createHarness();
    const session = harness.controller();
    await session.refresh();
    await session.acceptLogin(loginHeaders, identity.accountId);
    const activeTransport = session.getSnapshot().transport;
    if (!activeTransport) throw new Error("Expected the verified transport");
    let unregisterUsesOutgoing = false;
    session.subscribeBeforeLogout(async transport => {
      expect(transport.scope).toEqual(activeTransport.scope);
      expect(transport.isCurrent()).toBe(true);
      expect(activeTransport?.isCurrent()).toBe(false);
      expect(session.getSnapshot().transport).toBeNull();
      expect(JSON.parse(harness.readStored()!).status).toBe("revoking");
      const cleanup = await transport.request("/api/notifications/register-token", { method: "DELETE" });
      await expect(cleanup.json()).resolves.toEqual({ success: true });
      await expect(transport.request("/api/notifications/register-token", { method: "POST" })).rejects.toThrow();
      await expect(transport.request("/api/other", { method: "DELETE" })).rejects.toThrow();
      unregisterUsesOutgoing = true;
    });
    harness.setCanDelete(false);
    await session.logout();
    expect(unregisterUsesOutgoing).toBe(true);
    expect(activeTransport?.isCurrent()).toBe(false);
    expect(session.getSnapshot()).toEqual({ state: { status: "logout-pending", retry: true }, transport: null, revalidating: false });
    expect(harness.requests.at(-1)?.url).toBe(`${origin}/api/auth/get-session?disableCookieCache=true&disableRefresh=true`);

    const restarted = harness.controller();
    harness.setOffline(true);
    await restarted.refresh();
    expect(restarted.getSnapshot()).toEqual({ state: { status: "logout-pending", retry: true }, transport: null, revalidating: false });
    harness.setOffline(false);
    harness.setCanDelete(true);
    await restarted.logout();
    expect(restarted.getSnapshot()).toEqual({ state: { status: "signed-out" }, transport: null, revalidating: false });
    expect(harness.readStored()).toBeNull();
  });

  test("cannot republish a session whose secure write finished after logout started", async () => {
    const harness = createHarness();
    const session = harness.controller();
    await session.refresh();
    const observed: string[] = [];
    const unsubscribe = session.subscribe(() => observed.push(session.getSnapshot().state.status));
    const writeStarted = Promise.withResolvers<void>();
    const writeBlocked = Promise.withResolvers<void>();
    harness.setBeforeWrite(() => {
      harness.setBeforeWrite();
      writeStarted.resolve();
      return writeBlocked.promise;
    });

    const login = session.acceptLogin(loginHeaders, identity.accountId);
    await writeStarted.promise;
    const logout = session.logout();
    writeBlocked.resolve();
    await expect(login).rejects.toThrow();
    await logout;
    unsubscribe();

    expect(observed).toEqual(["logout-pending", "signed-out"]);
    expect(harness.readStored()).toBeNull();
    expect(harness.requests.some(request => request.url.endsWith("/sign-out"))).toBe(true);
  });

  test("a connection failure disables the authenticated transport and preserves only the local reading identity", async () => {
    const harness = createHarness();
    const session = harness.controller();
    await session.refresh();
    await session.acceptLogin(loginHeaders, identity.accountId);
    const activeTransport = session.getSnapshot().transport;
    harness.setOffline(true);
    const validating = session.refresh();
    expect(session.getSnapshot().revalidating).toBe(true);
    await validating;
    expect(session.getSnapshot()).toEqual({ state: { status: "unavailable", offlineIdentity: identity }, transport: null, revalidating: false });
    expect(activeTransport?.isCurrent()).toBe(false);
    expect(harness.readStored()).toBeTruthy();
    harness.setOffline(false);
    await session.refresh();
    expect(session.getSnapshot().state).toEqual({ status: "signed-in", ...identity });
  });

  test("purges offline scope during logout without a transport and retries a failed purge", async () => {
    const harness = createHarness();
    const session = harness.controller();
    await session.refresh();
    await session.acceptLogin(loginHeaders, identity.accountId);
    harness.setOffline(true);
    await session.refresh();
    expect(session.getSnapshot().transport).toBeNull();

    let attempts = 0;
    session.subscribeBeforeLocalLogout(scope => {
      expect(scope).toEqual({ origin, accountId: identity.accountId, sessionId: identity.sessionId });
      expect(session.getSnapshot().transport).toBeNull();
      if (++attempts === 1) throw new Error("SQLite unavailable");
    });
    harness.setOffline(false);
    await session.logout();
    expect(session.getSnapshot().state).toEqual({ status: "logout-pending", retry: true });
    expect(harness.requests.some(request => request.url.endsWith("/sign-out"))).toBe(true);
    await session.refresh();
    expect(attempts).toBe(2);
    expect(session.getSnapshot().state).toEqual({ status: "signed-out" });
  });

  test("purges expired or server-revoked sessions without exposing their former transport", async () => {
    for (const expired of [true, false]) {
      const harness = createHarness();
      harness.setStored({ ...identity, expiresAt: expired ? now : identity.expiresAt, origin, cookie, status: "active" });
      if (!expired) harness.setServerSession(null);
      const session = harness.controller();
      const purged: unknown[] = [];
      session.subscribeBeforeLocalLogout(scope => { purged.push(scope); });
      await session.refresh();
      expect(purged).toEqual([{ origin, accountId: identity.accountId, sessionId: identity.sessionId }]);
      expect(session.getSnapshot()).toEqual({ state: { status: "signed-out" }, transport: null, revalidating: false });
      expect(harness.readStored()).toBeNull();
    }
  });
});


test("cold offline launch cannot use invalid identities, malformed server responses or revocation tombstones for local reading", async () => {
  const harness = createHarness();
  harness.setStored({ origin, status: "active", cookie, ...identity });
  harness.setOffline(true);
  const restored = harness.controller();
  await restored.refresh();
  expect(restored.getSnapshot().state).toEqual({ status: "unavailable", offlineIdentity: identity });
  expect(restored.getSnapshot().transport).toBeNull();
  harness.setOffline(false);
  harness.setServerSession({ invalid: true });
  await restored.refresh();
  expect(restored.getSnapshot().state).toEqual({ status: "unavailable" });
  harness.setOffline(true);
  harness.setStored({ origin, status: "revoking", cookie, ...identity });
  const pending = harness.controller();
  await pending.refresh();
  expect(pending.getSnapshot().state.status).toBe("logout-pending");
  expect(pending.getSnapshot().transport).toBeNull();
});


test("a forbidden session hides local access but cannot confirm a remote logout", async () => {
  const api = createNativeSessionApi(origin, async (_url, init) =>
    init.method === "POST" ? Response.json({ success: true }) : new Response(null, { status: 403 }));
  expect(await api.read(cookie)).toBeNull();
  await expect(api.revoke(cookie)).rejects.toThrow();
});
