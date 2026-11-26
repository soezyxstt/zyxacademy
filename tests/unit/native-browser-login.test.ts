import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { createNativeIntentRedirect } from "../../apps/mobile-native/routing/consent-intent";
import { createNativeBrowserLogin } from "../../apps/mobile-native/auth/browser-flow";
import {
  NATIVE_BROWSER_FINISH_PATH,
  NATIVE_BROWSER_REDIRECT,
  parseNativeBrowserCallback,
  takeNativeBrowserCallback,
  type NativeBrowserCallback,
} from "../../apps/mobile-native/auth/browser-intent";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import {
  authEntryHref, parseNativeLoginIntent, readAuthReturnTo, resolveNativeLoginReturn, rewriteNativeAuthEntry,
  type NativeLoginIntent,
} from "../../apps/mobile-native/auth/login-intent";

const state = "01".repeat(24);
const verifier = "01".repeat(32);
const code = "ab".repeat(64);
const callback = { code, state };
const callbackUrl = `${NATIVE_BROWSER_REDIRECT}#code=${code}&state=${state}`;
const redirectSystemPath = createNativeIntentRedirect(async () => {
  throw new Error("Browser login paths do not request consent entropy");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(result => { resolve = result; });
  return { promise, resolve };
}

function setup(overrides: Partial<Parameters<typeof createNativeBrowserLogin>[0]> = {}) {
  let stored: string | null = null;
  let queued: NativeBrowserCallback | null = null;
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const accepted: Array<{ accountId: string; signal: AbortSignal; setCookie: string | null; intent?: NativeLoginIntent }> = [];
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
    acceptLogin: async (...[headers, accountId, signal, intent]: Parameters<Parameters<typeof controller.signIn>[0]>) => {
      accepted.push({ accountId, signal, setCookie: headers.get("Set-Cookie"), intent });
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
    warm.queued = { ...callback, state: "02".repeat(24) };
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

  test("starting another Android login retires the prior dismissed verifier", async () => {
    let opens = 0;
    const fixture = setup({
      randomBytes: async count => new Uint8Array(count).fill(opens + 1),
      openBrowser: async () => ({ type: ++opens === 1 ? "dismiss" : "cancel" }),
      preserveAttemptOnDismiss: true,
    });
    await fixture.controller.signIn(fixture.acceptLogin);
    expect(fixture.stored).toBe(storedAttempt());
    await fixture.controller.signIn(fixture.acceptLogin);
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

  test("keeps the validated return intent in the matching cold attempt and outside the browser request", async () => {
    const intent = { entry: "sign-up", locale: "en", next: "/courses/course-1/material/m1?tab=notes#example" } as const;
    const warm = setup({
      preserveAttemptOnDismiss: true,
      openBrowser: async url => {
        expect(new URL(url).searchParams.get("next")).toBe("/dashboard");
        expect(url).not.toContain("course-1");
        return { type: "dismiss" };
      },
    });
    await warm.controller.signIn(warm.acceptLogin, intent);
    expect(JSON.parse(warm.stored!)).toMatchObject({ intent });

    const cold = setup();
    cold.stored = warm.stored;
    cold.queued = callback;
    expect(await cold.controller.completePending(cold.acceptLogin)).toBe(true);
    expect(cold.accepted[0].intent).toEqual(intent);
    expect(cold.controller.getRecoveryIntent()).toBeUndefined();
  });

  test("retains the safe destination for retry only after a matching failed exchange", async () => {
    const fixture = setup({ fetcher: async () => Response.json(null, { status: 401 }) });
    const intent = { entry: "sign-up", locale: "id", next: "/profile" } as const;
    fixture.stored = storedAttempt({ intent });
    fixture.queued = { ...callback, state: "02".repeat(24) };
    expect(await fixture.controller.completePending(fixture.acceptLogin)).toBe(false);
    expect(fixture.controller.getRecoveryIntent()).toBeUndefined();
    fixture.queued = callback;
    expect(await fixture.controller.completePending(fixture.acceptLogin)).toBe(false);
    expect(fixture.controller.getRecoveryIntent()).toEqual(intent);
    expect(fixture.stored).toBeNull();
  });

  test("cancels an outstanding attempt from a previous process during sign-out", async () => {
    const deleted = deferred<void>();
    const fixture = setup({
      deleteAttempt: async () => {
        fixture.stored = null;
        deleted.resolve();
      },
    });
    fixture.stored = storedAttempt();
    fixture.controller.cancel();
    await deleted.promise;
    fixture.queued = callback;
    expect(await fixture.controller.completePending(fixture.acceptLogin)).toBe(false);
    expect(fixture.requests).toHaveLength(0);
  });
});

describe("native login destination", () => {
  const account = { dashboard: "/dashboard", roles: ["murid"] } as const;
  const nestedNext = "/courses/course-1/material/m1?percent=%2525&plus=a+b%2Bc&part=a%26b&anchor=%23ref#example%25~.a";
  type RouteNode = NonNullable<Parameters<typeof resolveNativeLoginReturn>[2]>;
  const leaf = (href: string, config?: Partial<RouteNode>): RouteNode => ({
    href, contextKey: `.${href}.tsx`, children: [], isInternal: false, isGenerated: false, ...config,
  });
  const sitemap = (...children: RouteNode[]) => leaf("/", { contextKey: "./_layout.tsx", children });

  test("captures the raw sign-in destination before Expo Router can decode it", () => {
    const params = new URLSearchParams({ next: nestedNext, locale: "en", error: "access_denied" });
    const links = [
      ["/sign-in", "/sign-in"],
      ["sign-up/", "/sign-up"],
      [`${NATIVE_STAGING_ORIGIN}/sign-in`, "/sign-in"],
      ["zyx-native-parity://sign-up", "/sign-up"],
      ["zyx-native-parity:///sign-in", "/sign-in"],
    ];
    for (const [input, screen] of links) {
      const rewritten = redirectSystemPath({ path: `${input}?${params}#outer`, initial: true });
      const [pathname, query] = decodeURIComponent(rewritten).split("?");
      const routerParams = new URLSearchParams(query);
      const returnTo = routerParams.get("returnTo") ?? "";
      expect(pathname).toBe(screen);
      expect(returnTo).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(readAuthReturnTo(decodeURIComponent(returnTo))).toBe(nestedNext);
      expect(routerParams.get("locale")).toBe("en");
      expect(routerParams.get("error")).toBe("access_denied");
      expect(routerParams.has("next")).toBe(false);
      expect(rewriteNativeAuthEntry(rewritten)).toBe(rewritten);
    }
  });

  test("preserves the destination through internal sign-in, sign-up, and retry navigation", () => {
    const original = { entry: "sign-in", locale: "id", next: nestedNext } as const;
    const initial = authEntryHref(original);
    function throughRouter(href: ReturnType<typeof authEntryHref>) {
      const query = new URLSearchParams({ locale: href.params.locale, returnTo: href.params.returnTo ?? "" });
      const params = new URLSearchParams(decodeURIComponent(query.toString()));
      return readAuthReturnTo(decodeURIComponent(params.get("returnTo") ?? ""));
    }
    const signUp = authEntryHref({ ...original, entry: "sign-up", next: throughRouter(initial) });
    expect(signUp.pathname).toBe("/sign-up");
    expect(signUp.params.locale).toBe("id");
    const retrySignUp = authEntryHref({ ...original, entry: "sign-up", next: throughRouter(signUp) });
    expect(retrySignUp).toEqual(signUp);
    expect(authEntryHref({ ...original, next: throughRouter(retrySignUp) })).toEqual(initial);
    expect(throughRouter(initial)).toBe(nestedNext);
  });

  test("drops mixed, repeated or unsafe destinations without changing other native intents", () => {
    const safe = authEntryHref({ entry: "sign-in", locale: "id", next: "/profile" }).params.returnTo;
    for (const query of [
      "next=%2Fprofile&next=%2Fdashboard",
      `next=%2Fprofile&returnTo=${safe}`,
      `returnTo=${safe}&returnTo=${safe}`,
      "next=%2F%2Foutside.test%2Fprofile",
      "returnTo=.2F.2Foutside.test.2Fprofile",
      "returnTo=.2Gprofile",
    ]) {
      expect(rewriteNativeAuthEntry(`/sign-in?${query}&locale=id`)).toBe("/sign-in?locale=id");
    }
    expect(readAuthReturnTo([safe, safe])).toBeUndefined();
    expect(rewriteNativeAuthEntry("https://outside.test/sign-in?next=/profile")).toBeNull();
    expect(rewriteNativeAuthEntry("/mcp/authorize?state=unchanged")).toBeNull();
  });

  test("rejects external, ambiguous, encoded separator, auth and unsanctioned application paths", () => {
    const intent = { entry: "sign-in", locale: "id" } as const;
    for (const next of [
      "https://staging.zyxacademy.com/profile", "//staging.zyxacademy.com/profile", "/\\external.invalid/profile",
      ["/dashboard", "/admin"], "/courses/a%2Fb", "/courses/a%5cb", "/courses/[id]", "/courses/a/./material",
      "/auth/native-finish", "/sign-out", "/mcp/authorize", "/gallery/separator", "/tutor/a/unknown",
    ]) {
      expect(parseNativeLoginIntent({ ...intent, next })).toEqual(intent);
    }
    expect(parseNativeLoginIntent({ ...intent, next: "/murid?tab=today" })?.next).toBe("/dashboard?tab=today");
    expect(parseNativeLoginIntent({ ...intent, next: "/meet/bahasa-%c3%a9" })?.next).toBe("/meet/bahasa-%C3%A9");
  });

  test("requires the canonical role and matching concrete route pattern to continue", () => {
    const app = sitemap(leaf("/(student)/dashboard"), leaf("/(admin)/admin"), leaf("/(tutor)/tutor"),
      leaf("/(student)/courses/[id]/material/[materialId]"), leaf("/meet/[slug]"));
    const next = "/courses/c1/material/m1?tab=notes#examples";
    expect(resolveNativeLoginReturn(next, account, app)).toEqual({ status: "ready", href: next });
    expect(resolveNativeLoginReturn("/admin", account, app)).toEqual({ status: "denied", dashboard: "/dashboard" });
    expect(resolveNativeLoginReturn(undefined, { dashboard: "/admin", roles: ["admin"] }, app))
      .toEqual({ status: "ready", href: "/admin" });
    expect(resolveNativeLoginReturn("/tutor", { dashboard: "/admin", roles: ["admin"] }, app))
      .toEqual({ status: "denied", dashboard: "/admin" });
    expect(resolveNativeLoginReturn("/tutor", { dashboard: "/admin", roles: ["admin", "tutor"] }, app))
      .toEqual({ status: "ready", href: "/tutor" });
    expect(resolveNativeLoginReturn(undefined, { dashboard: "/tutor", roles: ["tutor"] }, app))
      .toEqual({ status: "ready", href: "/tutor" });
    expect(resolveNativeLoginReturn("/meet/session-name?from=schedule", account, app))
      .toEqual({ status: "ready", href: "/meet/session-name?from=schedule" });
  });

  test("retains a real destination pending integration and ignores layouts, wildcards and galleries", () => {
    const app = sitemap(leaf("/[...path]"), leaf("/admin", { contextKey: "./admin/_layout.tsx" }),
      leaf("/(student)/dashboard", { isGenerated: true }), leaf("/(internal)/dashboard", { isInternal: true }),
      leaf("/gallery/courses/[id]"), leaf("/courses/[id]"));
    expect(resolveNativeLoginReturn("/courses/tutorial-pka", account, app))
      .toEqual({ status: "unavailable", dashboard: null });
    expect(resolveNativeLoginReturn("/courses/%74utorial-pka", account, app))
      .toEqual({ status: "unavailable", dashboard: null });
    expect(resolveNativeLoginReturn("/admin", { dashboard: "/admin", roles: ["admin"] }, app))
      .toEqual({ status: "unavailable", dashboard: null });
    expect(resolveNativeLoginReturn("/courses/science", account, app))
      .toEqual({ status: "ready", href: "/courses/science" });
  });
});
