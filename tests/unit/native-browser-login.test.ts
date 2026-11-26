import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { redirectSystemPath } from "../../apps/mobile-native/app/+native-intent";
import { createNativeBrowserLogin } from "../../apps/mobile-native/auth/browser-flow";
import {
  NATIVE_BROWSER_FINISH_PATH,
  NATIVE_BROWSER_REDIRECT,
  parseNativeBrowserCallback,
  takeNativeBrowserCallback,
  type NativeBrowserCallback,
} from "../../apps/mobile-native/auth/browser-intent";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";

const state = "01".repeat(24);
const verifier = "01".repeat(32);
const code = "ab".repeat(64);
const callback = { code, state };
const callbackUrl = `${NATIVE_BROWSER_REDIRECT}#code=${code}&state=${state}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(result => { resolve = result; });
  return { promise, resolve };
}

function setup(overrides: Partial<Parameters<typeof createNativeBrowserLogin>[0]> = {}) {
  let stored: string | null = null;
  let queued: NativeBrowserCallback | null = null;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const accepted: Array<{ accountId: string; signal: AbortSignal; setCookie: string | null }> = [];
  const response = () => Response.json({ user: { id: "account" } }, { headers: { "Set-Cookie": "fixture=value" } });
  const controller = createNativeBrowserLogin({
    randomBytes: async count => new Uint8Array(count).fill(1),
    sha256Base64: async value => createHash("sha256").update(value).digest("base64"),
    readAttempt: async () => stored,
    saveAttempt: async value => { stored = value; },
    deleteAttempt: async () => { stored = null; },
    openBrowser: async () => ({ type: "success", url: callbackUrl }),
    dismissBrowser() {},
    takeCallback() {
      const value = queued;
      queued = null;
      return value;
    },
    fetcher: async (url, init) => { requests.push({ url, init }); return response(); },
    now: () => 1000,
    ...overrides,
  });
  return {
    controller,
    get stored() { return stored; },
    set stored(value) { stored = value; },
    set queued(value: NativeBrowserCallback | null) { queued = value; },
    requests,
    accepted,
    acceptLogin: async (...[headers, accountId, signal]: Parameters<Parameters<typeof controller.signIn>[0]>) => {
      accepted.push({ accountId, signal, setCookie: headers.get("Set-Cookie") });
    },
  };
}

function storedAttempt(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ origin: NATIVE_STAGING_ORIGIN, state, verifier, expiresAt: 301_000, ...overrides });
}

describe("native browser login", () => {
  test("starts only on request and sends S256 to staging without the verifier", async () => {
    const fixture = setup({
      openBrowser: async (url, redirect) => {
        expect(fixture.stored).toBe(storedAttempt());
        expect(redirect).toBe(NATIVE_BROWSER_REDIRECT);
        const parsed = new URL(url);
        expect(parsed.origin).toBe(NATIVE_STAGING_ORIGIN);
        expect(parsed.pathname).toBe("/api/auth/native/start");
        expect(parsed.searchParams.get("scheme")).toBe("zyx-native-parity");
        expect(parsed.searchParams.get("state")).toBe(state);
        expect(parsed.searchParams.get("challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
        expect(parsed.searchParams.get("next")).toBe("/dashboard");
        expect(url).not.toContain(verifier);
        return { type: "success", url: callbackUrl };
      },
    });
    expect(fixture.controller.getStatus()).toBe("idle");
    expect(fixture.stored).toBeNull();
    await fixture.controller.signIn(fixture.acceptLogin);
    expect(fixture.accepted).toHaveLength(1);
    expect(fixture.accepted[0]).toMatchObject({ accountId: "account", setCookie: "fixture=value" });
    expect(fixture.stored).toBeNull();
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({
      url: `${NATIVE_STAGING_ORIGIN}/api/auth/native/expo/exchange`,
      init: { method: "POST", credentials: "omit", redirect: "manual", body: JSON.stringify({ code, verifier }) },
    });
  });

  test("scrubs callbacks from the route and accepts a matching fragment only", () => {
    expect(redirectSystemPath({ path: callbackUrl, initial: true })).toBe(NATIVE_BROWSER_FINISH_PATH);
    expect(takeNativeBrowserCallback()).toEqual(callback);
    expect(takeNativeBrowserCallback()).toBeNull();

    const queryCallback = `${NATIVE_BROWSER_REDIRECT}?code=${code}&state=${state}`;
    expect(redirectSystemPath({ path: queryCallback, initial: false })).toBe(NATIVE_BROWSER_FINISH_PATH);
    expect(takeNativeBrowserCallback()).toBeNull();

    expect(parseNativeBrowserCallback(`${callbackUrl}&code=another`)).toBeNull();
    expect(parseNativeBrowserCallback(callbackUrl.replace("://auth/", "://elsewhere/"))).toBeNull();
    expect(parseNativeBrowserCallback(callbackUrl.replace("zyx-native-parity:", "https:"))).toBeNull();
    expect(redirectSystemPath({ path: "zyx-native-parity://gallery/separator", initial: false })).toBe("zyx-native-parity://gallery/separator");
  });

  test("waits for the same single exchange when the browser result and native route race", async () => {
    const browser = deferred<{ type: string; url: string }>();
    const opened = deferred<void>();
    const fixture = setup({ openBrowser: () => { opened.resolve(); return browser.promise; } });
    const warm = fixture.controller.signIn(fixture.acceptLogin);
    await opened.promise;
    fixture.queued = callback;
    const route = fixture.controller.completePending(fixture.acceptLogin);
    browser.resolve({ type: "success", url: callbackUrl });
    expect(await route).toBe(true);
    await warm;

    fixture.queued = callback;
    expect(await fixture.controller.completePending(fixture.acceptLogin)).toBe(false);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.accepted).toHaveLength(1);
  });

  test("retains an unexpired Android attempt when foreground dismissal beats the Linking callback", async () => {
    const warm = setup({
      openBrowser: async () => ({ type: "dismiss" }),
      preserveAttemptOnDismiss: true,
    });
    await warm.controller.signIn(warm.acceptLogin);
    expect(warm.stored).toBe(storedAttempt());
    expect(warm.controller.getStatus()).toBe("idle");
    expect(warm.requests).toHaveLength(0);

    warm.queued = callback;
    expect(await warm.controller.completePending(warm.acceptLogin)).toBe(true);
    expect(warm.stored).toBeNull();
    expect(warm.requests).toHaveLength(1);
    expect(warm.accepted).toHaveLength(1);
    warm.queued = callback;
    expect(await warm.controller.completePending(warm.acceptLogin)).toBe(false);
  });

  test("explicitly cancels an Android verifier retained after dismissal", async () => {
    const fixture = setup({
      openBrowser: async () => ({ type: "dismiss" }),
      preserveAttemptOnDismiss: true,
    });
    await fixture.controller.signIn(fixture.acceptLogin);
    expect(fixture.stored).toBe(storedAttempt());
    fixture.controller.cancel();
    fixture.queued = callback;
    expect(await fixture.controller.completePending(fixture.acceptLogin)).toBe(false);
    expect(fixture.stored).toBeNull();
    expect(fixture.requests).toHaveLength(0);
  });

  test("resumes a cold callback with a persisted attempt and discards expired and mismatched callbacks", async () => {
    const fixture = setup();
    fixture.stored = storedAttempt();
    fixture.queued = { ...callback, state: "02".repeat(24) };
    expect(await fixture.controller.completePending(fixture.acceptLogin)).toBe(false);
    expect(fixture.stored).toBe(storedAttempt());

    fixture.queued = callback;
    expect(await fixture.controller.completePending(fixture.acceptLogin)).toBe(true);
    expect(fixture.stored).toBeNull();
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.accepted).toHaveLength(1);

    const expired = setup();
    expired.queued = callback;
    expired.stored = storedAttempt({ expiresAt: 999 });
    expect(await expired.controller.completePending(expired.acceptLogin)).toBe(false);
    expect(expired.stored).toBeNull();
    expect(expired.requests).toHaveLength(0);
  });

  test("clears a canceled browser attempt and ignores its delayed callback", async () => {
    const browser = deferred<{ type: string }>();
    const opened = deferred<void>();
    const fixture = setup({
      openBrowser: () => { opened.resolve(); return browser.promise; },
      dismissBrowser: () => browser.resolve({ type: "dismiss" }),
      preserveAttemptOnDismiss: true,
    });
    const login = fixture.controller.signIn(fixture.acceptLogin);
    await opened.promise;
    fixture.controller.cancel();
    await login;
    fixture.queued = callback;
    expect(await fixture.controller.completePending(fixture.acceptLogin)).toBe(false);
    expect(fixture.controller.getStatus()).toBe("idle");
    expect(fixture.stored).toBeNull();
    expect(fixture.requests).toHaveLength(0);
  });

  test("never accepts a late exchange response after cancellation", async () => {
    const pending = deferred<Response>();
    const exchangeStarted = deferred<AbortSignal | null | undefined>();
    const fixture = setup({
      fetcher: (_, init) => {
        expect(fixture.stored).toBeNull();
        exchangeStarted.resolve(init.signal);
        return pending.promise;
      },
    });
    const login = fixture.controller.signIn(fixture.acceptLogin);
    const signal = await exchangeStarted.promise;
    fixture.controller.cancel();
    expect(signal?.aborted).toBe(true);
    pending.resolve(Response.json({ user: { id: "late-account" } }));
    await login;
    expect(fixture.accepted).toHaveLength(0);
    expect(fixture.controller.getStatus()).toBe("idle");
  });
});
