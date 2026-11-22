import { afterAll, describe, expect, mock, test } from "bun:test";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { multiSessionClient } from "better-auth/client/plugins";
import { multiSession } from "better-auth/plugins/multi-session";
import { oneTimeToken } from "better-auth/plugins/one-time-token";
import { createAuthClient } from "better-auth/react";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { accountSwitchPlugin } from "@/lib/auth/account-switch-plugin";
import { MAX_SAVED_ACCOUNTS } from "@/lib/auth/account-switch-contract";
import { createAccountSessionFetch } from "@/lib/auth/account-session-fetch";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
afterAll(() => client.close());
const suspended = new Set<string>();
const origin = "https://staging.zyxacademy.com";
const common = {
  baseURL: origin,
  secret: "account-switch-test-secret-32-characters-only",
  trustedOrigins: [origin],
  emailAndPassword: { enabled: true },
  database: drizzleAdapter(testDb, { provider: "pg", schema }),
};
const legacyAuth = betterAuth(common);
const auth = betterAuth({
  ...common,
  plugins: [
    multiSession({ maximumSessions: MAX_SAVED_ACCOUNTS }),
    accountSwitchPlugin({ isAccountAvailable: async (id) => !suspended.has(id) }),
    oneTimeToken({ expiresIn: 2, storeToken: "hashed", disableClientRequest: true }),
  ],
});

class Browser {
  cookies = new Map<string, string>();

  async send(path: string, body?: unknown, legacy = false) {
    return (legacy ? legacyAuth : auth).handler(new Request(`${origin}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  }

  applyCookies(response: Response) {
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0];
      const split = pair.indexOf("=");
      const name = pair.slice(0, split);
      const content = pair.slice(split + 1);
      if (!content || /max-age=0/i.test(value)) this.cookies.delete(name);
      else this.cookies.set(name, content);
    }
  }

  async request(path: string, body?: unknown, legacy = false) {
    const response = await this.send(path, body, legacy);
    this.applyCookies(response);
    return { response, data: await response.json() };
  }

  async signup(label: string, legacy = false) {
    return this.request("/sign-up/email", {
      name: label,
      email: `${label}@example.test`,
      password: "account-switch-password-123",
    }, legacy);
  }
}

describe("saved device account sessions", () => {
  test("the account picker loads through the real client and streamed HTTP requests", async () => {
    const browser = new Browser();
    const responses: Array<{ path: string; status: number }> = [];
    const authClient = createAuthClient({
      baseURL: origin,
      plugins: [multiSessionClient()],
      fetchOptions: {
        customFetchImpl: async (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set("origin", origin);
          headers.set("cookie", [...browser.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
          // Next's Node adapter supplies a stream even when a POST has no bytes.
          // Preserve the real client's headers so missing JSON content types fail.
          const body = init?.body ?? (init?.method === "POST"
            ? new ReadableStream({ start(controller) { controller.close(); } })
            : undefined);
          const request = new Request(input, { ...init, headers, body, duplex: "half" } as RequestInit);
          const response = await auth.handler(request);
          browser.applyCookies(response);
          responses.push({ path: new URL(request.url).pathname, status: response.status });
          return response;
        },
      },
    });
    mock.module("@/lib/auth-client", () => ({ authClient }));
    const { listSavedAccounts } = await import("@/lib/auth/account-switch");

    const [guest] = await Promise.allSettled([listSavedAccounts()]);
    expect(responses).toEqual([
      { path: "/api/auth/account-switch/remember", status: 200 },
      { path: "/api/auth/multi-session/list-device-sessions", status: 200 },
    ]);
    expect(guest).toEqual({ status: "fulfilled", value: [] });

    const signedIn = await browser.signup("streamed-client-account", true);
    expect(signedIn.response.status).toBe(200);
    expect([...browser.cookies.keys()].some((key) => key.includes("_multi-"))).toBe(false);
    responses.length = 0;
    const accounts = await listSavedAccounts();
    expect(accounts.map((account) => account.user.id)).toEqual([signedIn.data.user.id]);
    expect([...browser.cookies.keys()].some((key) => key.includes("_multi-"))).toBe(true);
    expect(responses).toEqual([
      { path: "/api/auth/account-switch/remember", status: 200 },
      { path: "/api/auth/multi-session/list-device-sessions", status: 200 },
    ]);
  });

  test("guest account picker preparation does not require an existing login", async () => {
    const browser = new Browser();
    const remembered = await browser.request("/account-switch/remember", {});
    expect(remembered.response.status).toBe(200);
    expect(remembered.data).toEqual({ userId: null });
    const listed = await browser.request("/multi-session/list-device-sessions");
    expect(listed.response.status).toBe(200);
    expect(listed.data).toEqual([]);
  });
  test("remembers pre-feature sessions, rejects another device and suspended targets, revokes only the chosen account", async () => {
    const browser = new Browser();
    const first = await browser.signup("account-a", true);
    expect(first.response.status).toBe(200);
    const firstId = first.data.user.id as string;
    expect([...browser.cookies.keys()].some((key) => key.includes("_multi-"))).toBe(false);
    expect((await browser.request("/account-switch/remember", {})).response.status).toBe(200);
    expect([...browser.cookies.keys()].some((key) => key.includes("_multi-"))).toBe(true);
    const second = await browser.signup("account-b");
    expect(second.response.status).toBe(200);
    const secondId = second.data.user.id as string;
    const listed = await browser.request("/multi-session/list-device-sessions");
    expect(listed.response.status).toBe(200);
    expect(listed.data.map((item: { user: { id: string } }) => item.user.id).sort()).toEqual([firstId, secondId].sort());
    const tokenA = listed.data.find((item: { user: { id: string } }) => item.user.id === firstId).session.token;

    const attacker = new Browser();
    await attacker.signup("another-device");
    expect((await attacker.request("/multi-session/set-active", { sessionToken: tokenA })).response.status).toBe(401);

    suspended.add(firstId);
    const denied = await browser.request("/multi-session/set-active", { sessionToken: tokenA });
    expect(denied.response.status).toBe(403);
    expect(denied.data.code).toBe("ACCOUNT_UNAVAILABLE");
    expect((await browser.request("/get-session")).data.user.id).toBe(secondId);
    suspended.delete(firstId);

    const switched = await browser.request("/multi-session/set-active", { sessionToken: tokenA });
    expect(switched.response.status).toBe(200);
    expect(switched.data.user.id).toBe(firstId);
    const activeRemoval = await browser.request("/multi-session/revoke", { sessionToken: tokenA });
    expect(activeRemoval.response.status).toBe(400);
    expect(activeRemoval.data.code).toBe("ACTIVE_ACCOUNT");
    const tokenB = listed.data.find((item: { user: { id: string } }) => item.user.id === secondId).session.token;
    expect((await browser.request("/multi-session/revoke", { sessionToken: tokenB })).response.status).toBe(200);
    expect((await browser.request("/get-session")).data.user.id).toBe(firstId);
    expect((await browser.request("/multi-session/list-device-sessions")).data).toHaveLength(1);
    expect((await browser.request("/multi-session/set-active", { sessionToken: tokenB })).response.status).toBe(401);
  });

  test("enforces the device account limit before new session creation and sign-out clears saved sessions", async () => {
    const browser = new Browser();
    let lastId = "";
    for (let index = 0; index < MAX_SAVED_ACCOUNTS; index += 1) {
      const result = await browser.signup(`limited-${index}`);
      expect(result.response.status).toBe(200);
      lastId = result.data.user.id;
    }
    const overflow = await browser.signup("limited-overflow");
    expect(overflow.response.status).toBe(403);
    expect(overflow.data.code).toBe("SESSION_LIMIT");
    expect((await browser.request("/get-session")).data.user.id).toBe(lastId);
    const listed = await browser.request("/multi-session/list-device-sessions");
    expect(listed.data).toHaveLength(MAX_SAVED_ACCOUNTS);
    const oldCookies = new Map(browser.cookies);
    expect((await browser.request("/sign-out", {})).response.status).toBe(200);
    expect((await browser.request("/get-session")).data).toBeNull();
    expect((await browser.request("/multi-session/list-device-sessions")).data).toEqual([]);
    expect([...browser.cookies.keys()].some((key) => key.includes("_multi-"))).toBe(false);
    browser.cookies = oldCookies;
    expect((await browser.request("/get-session")).data).toBeNull();
    expect((await browser.request("/multi-session/list-device-sessions")).data).toEqual([]);
  });

  test("reauthenticating a saved account keeps one device session and removal leaves other devices signed in", async () => {
    const browser = new Browser();
    const first = await browser.signup("repeat-account-a");
    const userA = first.data.user.id as string;
    const oldDeviceCookies = new Map(browser.cookies);
    const otherDevice = new Browser();
    const elsewhere = await otherDevice.request("/sign-in/email", {
      email: "repeat-account-a@example.test", password: "account-switch-password-123",
    });
    expect(elsewhere.response.status).toBe(200);
    const otherToken = elsewhere.data.token as string;
    const second = await browser.signup("repeat-account-b");
    const userB = second.data.user.id as string;
    let latestToken = "";
    for (let index = 0; index <= MAX_SAVED_ACCOUNTS; index += 1) {
      const repeated = await browser.request("/sign-in/email", {
        email: "repeat-account-a@example.test", password: "account-switch-password-123",
      });
      expect(repeated.response.status).toBe(200);
      latestToken = repeated.data.token;
      expect([...browser.cookies.keys()].filter((name) => name.includes("_multi-"))).toHaveLength(2);
      const saved = await browser.request("/multi-session/list-device-sessions");
      expect(saved.data).toHaveLength(2);
      expect(saved.data.find((item: { user: { id: string } }) => item.user.id === userA).session.token).toBe(latestToken);
    }
    const sessionsA = await testDb.select({ token: schema.session.token }).from(schema.session).where(eq(schema.session.userId, userA));
    expect(sessionsA.map((item) => item.token).sort()).toEqual([latestToken, otherToken].sort());
    const capturedDevice = new Browser();
    capturedDevice.cookies = oldDeviceCookies;
    expect((await capturedDevice.request("/get-session?disableCookieCache=true&disableRefresh=true")).data).toBeNull();
    const saved = await browser.request("/multi-session/list-device-sessions");
    const tokenB = saved.data.find((item: { user: { id: string } }) => item.user.id === userB).session.token;
    expect((await browser.request("/multi-session/set-active", { sessionToken: tokenB })).response.status).toBe(200);
    expect((await browser.request("/multi-session/revoke", { sessionToken: latestToken })).response.status).toBe(200);
    const remaining = await browser.request("/multi-session/list-device-sessions");
    expect(remaining.data.map((item: { user: { id: string } }) => item.user.id)).toEqual([userB]);
    expect([...browser.cookies.keys()].filter((name) => name.includes("_multi-"))).toHaveLength(1);
    expect((await browser.request("/multi-session/list-device-sessions")).data).toHaveLength(1);
    expect((await otherDevice.request("/get-session?disableCookieCache=true&disableRefresh=true")).data.user.id).toBe(userA);
    const afterRemoval = await testDb.select({ token: schema.session.token }).from(schema.session).where(eq(schema.session.userId, userA));
    expect(afterRemoval.map((item) => item.token)).toEqual([otherToken]);
  });

  test("an existing-session native handoff consolidates device cookies from overlapping sign-in responses", async () => {
    const browser = new Browser();
    const first = await browser.signup("repeat-handoff-a");
    const userA = first.data.user.id as string;
    const second = await browser.signup("repeat-handoff-b");
    const userB = second.data.user.id as string;
    const tokenB = second.data.token as string;
    const credentials = { email: "repeat-handoff-a@example.test", password: "account-switch-password-123" };
    const otherDevice = new Browser();
    const otherToken = (await otherDevice.request("/sign-in/email", credentials)).data.token as string;

    // Both requests use the same cookie snapshot. Their responses may arrive
    // later from separate tabs, leaving two valid cookies for the same account.
    const earlier = await browser.send("/sign-in/email", credentials);
    const later = await browser.send("/sign-in/email", credentials);
    expect(earlier.status).toBe(200);
    expect(later.status).toBe(200);
    browser.applyCookies(earlier);
    const earlierCookies = new Map(browser.cookies);
    browser.applyCookies(later);
    const latestToken = (await later.json()).token as string;
    expect([...browser.cookies.keys()].filter((name) => name.includes("_multi-"))).toHaveLength(3);
    const handoff = await auth.api.generateOneTimeToken({
      headers: new Headers({ cookie: [...browser.cookies].map(([key, value]) => `${key}=${value}`).join("; ") }),
    });
    const imported = await browser.request("/one-time-token/verify", handoff);
    expect(imported.response.status).toBe(200);
    expect(imported.data.user.id).toBe(userA);
    expect([...browser.cookies.keys()].filter((name) => name.includes("_multi-"))).toHaveLength(2);
    const sessionsA = await testDb.select({ token: schema.session.token }).from(schema.session).where(eq(schema.session.userId, userA));
    expect(sessionsA.map((item) => item.token).sort()).toEqual([latestToken, otherToken].sort());
    const capturedDevice = new Browser();
    capturedDevice.cookies = earlierCookies;
    expect((await capturedDevice.request("/get-session?disableCookieCache=true&disableRefresh=true")).data).toBeNull();
    expect((await browser.request("/multi-session/set-active", { sessionToken: tokenB })).response.status).toBe(200);
    expect((await browser.request("/multi-session/revoke", { sessionToken: latestToken })).response.status).toBe(200);
    expect((await browser.request("/multi-session/list-device-sessions")).data.map((item: { user: { id: string } }) => item.user.id)).toEqual([userB]);
    expect((await browser.request("/multi-session/list-device-sessions")).data).toHaveLength(1);
    expect([...browser.cookies.keys()].filter((name) => name.includes("_multi-"))).toHaveLength(1);
    expect((await otherDevice.request("/get-session?disableCookieCache=true&disableRefresh=true")).data.user.id).toBe(userA);
  });

  test("unavailable accounts are removed from the saved list and cannot trap the device at its account limit", async () => {
    const browser = new Browser();
    const ids: string[] = [];
    for (let index = 0; index < MAX_SAVED_ACCOUNTS; index += 1) {
      const result = await browser.signup(`suspended-limit-${index}`);
      expect(result.response.status).toBe(200);
      ids.push(result.data.user.id);
    }
    const staleCookies = new Map(browser.cookies);
    ids.slice(0, -1).forEach((id) => suspended.add(id));
    const listed = await browser.request("/multi-session/list-device-sessions");
    expect(listed.data.map((item: { user: { id: string } }) => item.user.id)).toEqual([ids.at(-1)]);
    expect([...browser.cookies.keys()].filter((key) => key.includes("_multi-"))).toHaveLength(1);
    // Another still-open tab may start sign-in using its pre-listing cookies.
    // Both the cap check and successful response must use the available accounts.
    browser.cookies = staleCookies;
    const added = await browser.signup("suspended-limit-new");
    expect(added.response.status).toBe(200);
    expect((await browser.request("/get-session")).data.user.id).toBe(added.data.user.id);
    expect((await browser.request("/multi-session/list-device-sessions")).data).toHaveLength(2);
    expect([...browser.cookies.keys()].filter((key) => key.includes("_multi-"))).toHaveLength(2);
  });

  test("a suspended active account can still list and switch to another saved account", async () => {
    const browser = new Browser();
    const available = await browser.signup("recover-available");
    const blocked = await browser.signup("recover-suspended");
    suspended.add(blocked.data.user.id);
    const remembered = await browser.request("/account-switch/remember", {});
    expect(remembered.response.status).toBe(200);
    expect(remembered.data).toEqual({ userId: null });
    const listed = await browser.request("/multi-session/list-device-sessions");
    expect(listed.data.map((item: { user: { id: string } }) => item.user.id)).toEqual([available.data.user.id]);
    expect((await browser.request("/multi-session/set-active", { sessionToken: listed.data[0].session.token })).response.status).toBe(200);
    expect((await browser.request("/get-session")).data.user.id).toBe(available.data.user.id);
  });

  test("an interrupted passive refresh cannot deliver the old account cookie after a switch", async () => {
    const browser = new Browser();
    const first = await browser.signup("refresh-race-a");
    const second = await browser.signup("refresh-race-b");
    const listed = await browser.request("/multi-session/list-device-sessions");
    const tokenFor = (userId: string) => listed.data.find((item: { user: { id: string } }) => item.user.id === userId).session.token as string;
    const tokenA = tokenFor(first.data.user.id);
    const tokenB = tokenFor(second.data.user.id);
    await browser.request("/multi-session/set-active", { sessionToken: tokenA });
    await testDb.update(schema.session).set({ expiresAt: new Date(Date.now() + 1_000_000) }).where(eq(schema.session.token, tokenA));
    const primaryName = [...browser.cookies.keys()].find((name) => name.endsWith(".session_token"))!;

    let pending = false;
    const listeners = new Set<(pending: boolean) => void>();
    const setPending = (next: boolean) => { pending = next; [...listeners].forEach((listener) => listener(next)); };
    let holdFirst = true;
    let delayedResponse!: Response;
    let releaseOld!: () => void;
    let oldWasAborted = false;
    let ready!: () => void;
    const responseReady = new Promise<void>((resolve) => { ready = resolve; });
    const sessionFetch = createAccountSessionFetch({
      isPending: () => pending,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const response = await browser.send(`/get-session${url.search}`);
        if (holdFirst) {
          holdFirst = false;
          delayedResponse = response;
          await new Promise<void>((resolve, reject) => {
            releaseOld = resolve;
            init?.signal?.addEventListener("abort", () => {
              oldWasAborted = true;
              reject(init.signal?.reason);
            }, { once: true });
            ready();
          });
        }
        if (init?.signal?.aborted) throw init.signal.reason;
        browser.applyCookies(response);
        return response;
      },
    });
    const passive = sessionFetch(`${origin}/api/auth/get-session`);
    await responseReady;
    // This is a real refresh response containing Set-Cookie for account A.
    // Delivery is held so the test can model the network ordering from another tab.
    expect(delayedResponse.headers.getSetCookie().some((cookie) => cookie.startsWith(`${primaryName}=`))).toBe(true);
    setPending(true);
    expect(oldWasAborted).toBe(true);
    expect((await browser.request("/multi-session/set-active", { sessionToken: tokenB })).response.status).toBe(200);
    releaseOld();
    const verified = await sessionFetch(`${origin}/api/auth/get-session?disableCookieCache=true&disableRefresh=true`);
    expect((await verified.json()).user.id).toBe(second.data.user.id);
    expect(verified.headers.getSetCookie().some((cookie) => cookie.startsWith(`${primaryName}=`))).toBe(false);

    // Releasing the pause retries with the current cookie. Ordinary refresh is
    // still enabled, including extending the current account's session lifetime.
    await testDb.update(schema.session).set({ expiresAt: new Date(Date.now() + 1_000_000) }).where(eq(schema.session.token, tokenB));
    setPending(false);
    const resumed = await passive;
    expect((await resumed.json()).user.id).toBe(second.data.user.id);
    expect(resumed.headers.getSetCookie().some((cookie) => cookie.startsWith(`${primaryName}=`))).toBe(true);
    expect((await browser.request("/get-session?disableCookieCache=true&disableRefresh=true")).data.user.id).toBe(second.data.user.id);
    expect(listeners.size).toBe(0);
  });

  test("native browser handoff rechecks suspension, live account limit and session expiry before replacing cookies", async () => {
    const browser = new Browser();
    let currentId = "";
    for (let index = 0; index < MAX_SAVED_ACCOUNTS; index += 1) {
      currentId = (await browser.signup(`handoff-${index}`)).data.user.id;
    }
    const externalBrowser = new Browser();
    const external = await externalBrowser.signup("handoff-new");
    const headers = new Headers({ cookie: [...externalBrowser.cookies].map(([key, value]) => `${key}=${value}`).join("; ") });
    const { token } = await auth.api.generateOneTimeToken({ headers });
    suspended.add(external.data.user.id);
    const suspendedResult = await browser.request("/one-time-token/verify", { token });
    expect(suspendedResult.response.status).toBe(403);
    expect(suspendedResult.data.code).toBe("ACCOUNT_UNAVAILABLE");
    suspended.delete(external.data.user.id);
    const limitResult = await browser.request("/one-time-token/verify", { token });
    expect(limitResult.response.status).toBe(403);
    expect(limitResult.data.code).toBe("SESSION_LIMIT");
    expect((await browser.request("/get-session")).data.user.id).toBe(currentId);

    const listed = await browser.request("/multi-session/list-device-sessions");
    const old = listed.data.find((item: { user: { id: string } }) => item.user.id !== currentId);
    await testDb.update(schema.session).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(schema.session.token, old.session.token));
    // An expired saved cookie must not make the stock cookie-count limit drop the imported account.
    const imported = await browser.request("/one-time-token/verify", { token });
    expect(imported.response.status).toBe(200);
    expect(imported.data.user.id).toBe(external.data.user.id);
    const after = await browser.request("/multi-session/list-device-sessions");
    expect(after.data).toHaveLength(MAX_SAVED_ACCOUNTS);
    expect(after.data.some((item: { user: { id: string } }) => item.user.id === external.data.user.id)).toBe(true);
    expect((await browser.request("/one-time-token/verify", { token })).response.status).toBe(401);

    const expiredSource = new Browser();
    const expired = await expiredSource.signup("handoff-expired");
    const expiredToken = await auth.api.generateOneTimeToken({
      headers: new Headers({ cookie: [...expiredSource.cookies].map(([key, value]) => `${key}=${value}`).join("; ") }),
    });
    await testDb.update(schema.session).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(schema.session.userId, expired.data.user.id));
    expect((await browser.request("/one-time-token/verify", expiredToken)).response.status).toBe(401);
    expect((await browser.request("/get-session")).data.user.id).toBe(external.data.user.id);
  });
});
