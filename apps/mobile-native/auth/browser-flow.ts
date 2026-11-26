import {
  NATIVE_BROWSER_REDIRECT,
  NATIVE_BROWSER_SCHEME,
  parseNativeBrowserCallback,
  type NativeBrowserCallback,
} from "./browser-intent";
import { NATIVE_STAGING_ORIGIN, type SessionHeaders } from "./session-api";
import { parseNativeLoginIntent, type NativeLoginIntent } from "./login-intent";

const ATTEMPT_TTL_MS = 5 * 60_000;
const EXCHANGE_URL = `${NATIVE_STAGING_ORIGIN}/api/auth/native/expo/exchange`;

export type NativeBrowserLoginStatus = "idle" | "opening" | "exchanging" | "error";
export type AdditionalLoginScope = Readonly<{ kind: "additional"; fromSessionId: string }>;
export type AcceptNativeBrowserLogin = (
  headers: SessionHeaders, userId: string, signal: AbortSignal, intent?: NativeLoginIntent, scope?: AdditionalLoginScope,
) => Promise<void>;
type AuthorizeAttempt = (scope: AdditionalLoginScope | undefined, signal: AbortSignal) => boolean | Promise<boolean>;

type BrowserLoginDeps = {
  randomBytes(count: number): Promise<Uint8Array>;
  sha256Base64(value: string): Promise<string>;
  readAttempt(): Promise<string | null>;
  saveAttempt(serialized: string): Promise<void>;
  deleteAttempt(): Promise<void>;
  openBrowser(url: string, redirect: string): Promise<{ type: string; url?: string }>;
  dismissBrowser(): void;
  preserveAttemptOnDismiss?: boolean;
  takeCallback(): NativeBrowserCallback | null;
  fetcher(url: string, init: RequestInit): Promise<Pick<Response, "body" | "headers" | "json" | "ok" | "redirected" | "type" | "url">>;
  now?: () => number;
};

type StoredAttempt = { origin: string; state: string; verifier: string; expiresAt: number; intent?: NativeLoginIntent; scope?: AdditionalLoginScope };
type LoginRun = {
  controller: AbortController;
  state?: string;
  ownsAttempt: boolean;
  browserOpen: boolean;
  expired: boolean;
  timer?: ReturnType<typeof setTimeout>;
  completion?: Promise<boolean>;
};

function randomHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseStoredAttempt(raw: string | null): StoredAttempt | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredAttempt> | null;
    if (!value || value.origin !== NATIVE_STAGING_ORIGIN
      || typeof value.state !== "string" || !/^[a-f0-9]{48}$/.test(value.state)
      || typeof value.verifier !== "string" || !/^[a-f0-9]{64}$/.test(value.verifier)
      || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)) return null;
    const scope = value.scope;
    if (Object.hasOwn(value, "scope") && (!scope || scope.kind !== "additional" ||
      typeof scope.fromSessionId !== "string" || !/^[^\s\u0000-\u001f\u007f]{1,256}$/.test(scope.fromSessionId))) return null;
    return { origin: value.origin, state: value.state, verifier: value.verifier, expiresAt: value.expiresAt,
      ...(scope ? { scope } : { intent: parseNativeLoginIntent(value.intent) }) };
  } catch {
    return null;
  }
}

function acceptAccountId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("user" in data)) return null;
  const user = data.user;
  return user && typeof user === "object" && "id" in user && typeof user.id === "string" && user.id.trim()
    ? user.id
    : null;
}

export function createNativeBrowserLogin(deps: BrowserLoginDeps) {
  const now = deps.now ?? Date.now;
  const listeners = new Set<() => void>();
  let status: NativeBrowserLoginStatus = "idle";
  let active: LoginRun | null = null;
  let retiredState: string | undefined;
  let dismissedState: string | undefined;
  let recoveryIntent: NativeLoginIntent | undefined;
  let recoveryScope: AdditionalLoginScope | undefined;
  let failure: string | undefined;

  function setStatus(next: NativeBrowserLoginStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of listeners) listener();
  }

  function begin(): LoginRun {
    const run = { controller: new AbortController(), ownsAttempt: false, browserOpen: false, expired: false };
    active = run;
    return run;
  }

  function cancelRun(run: LoginRun): void {
    run.controller.abort();
    if (run.browserOpen) deps.dismissBrowser();
  }

  function armExpiry(run: LoginRun, expiresAt: number): void {
    clearTimeout(run.timer);
    run.timer = setTimeout(() => {
      run.expired = true;
      cancelRun(run);
    }, Math.max(0, expiresAt - now()));
  }

  async function finish(run: LoginRun, failed: boolean, preserve = false): Promise<void> {
    clearTimeout(run.timer);
    if (run.ownsAttempt && !preserve) {
      try {
        await deps.deleteAttempt();
      } catch {
        failed = true;
      }
    }
    if (preserve) dismissedState = run.state;
    else if (run.state) {
      if (dismissedState === run.state) dismissedState = undefined;
      retiredState = run.state;
    }
    if (!failed && !run.expired) {
      recoveryIntent = undefined;
      recoveryScope = undefined;
      failure = undefined;
    }
    active = null;
    setStatus(run.expired || failed ? "error" : "idle");
  }

  function complete(run: LoginRun, callback: NativeBrowserCallback, acceptLogin: AcceptNativeBrowserLogin, authorize?: AuthorizeAttempt): Promise<boolean> {
    if (run.state && run.state !== callback.state) return Promise.resolve(false);
    return run.completion ??= (async () => {
      const attempt = parseStoredAttempt(await deps.readAttempt());
      if (!attempt || attempt.state !== callback.state) return false;
      run.state = attempt.state;
      run.ownsAttempt = true;
      const { signal } = run.controller;
      if (signal.aborted) return false;
      recoveryIntent = attempt.intent;
      recoveryScope = attempt.scope;
      if (attempt.expiresAt <= now() || attempt.expiresAt > now() + ATTEMPT_TTL_MS) {
        if (attempt.scope) failure = "SESSION_EXPIRED";
        return false;
      }
      if (authorize ? !await authorize(attempt.scope, signal) : attempt.scope) {
        failure = "SESSION_EXPIRED";
        return false;
      }
      armExpiry(run, attempt.expiresAt);
      setStatus("exchanging");
      // Consume the local verifier before contacting the single-use exchange.
      await deps.deleteAttempt();
      run.ownsAttempt = false;
      if (signal.aborted || attempt.expiresAt <= now()) return false;

      // An additional exchange can issue a new credential after local cancellation.
      // Pass a completed response back to the account controller for owned cleanup.
      const exchange = attempt.scope ? new AbortController() : undefined;
      const timeout = exchange ? setTimeout(() => exchange.abort(), 15_000) : undefined;
      const response = await deps.fetcher(EXCHANGE_URL, {
        method: "POST",
        credentials: "omit",
        redirect: "manual",
        signal: exchange?.signal ?? signal,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Origin: NATIVE_STAGING_ORIGIN },
        body: JSON.stringify({ code: callback.code, verifier: attempt.verifier }),
      }).finally(() => clearTimeout(timeout));
      if ((!attempt.scope && (signal.aborted || attempt.expiresAt <= now())) || !response.ok || response.redirected
        || response.type === "opaqueredirect" || (response.url && response.url !== EXCHANGE_URL)) {
        void response.body?.cancel().catch(() => {});
        return false;
      }
      try {
        const accountId = acceptAccountId(await response.json());
        if (!accountId || (!attempt.scope && (signal.aborted || attempt.expiresAt <= now()))) throw new Error("SESSION_EXPIRED");
        if (attempt.scope && attempt.expiresAt <= now()) run.controller.abort();
        await acceptLogin(response.headers, accountId, signal, attempt.intent, attempt.scope);
        return true;
      } catch (error) {
        failure = error instanceof Error ? error.message : undefined;
        return false;
      }
    })().catch(() => false);
  }

  return {
    getStatus: () => status,
    getRecoveryIntent: () => recoveryIntent,
    getRecoveryScope: () => recoveryScope,
    getFailure: () => failure,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    cancel() {
      recoveryIntent = undefined;
      recoveryScope = undefined;
      failure = undefined;
      if (active) {
        cancelRun(active);
      } else {
        // Sign-out can occur after a restart while a browser holds the old callback.
        const run = begin();
        run.state = dismissedState;
        run.ownsAttempt = true;
        cancelRun(run);
        void finish(run, false);
      }
    },
    async retirePending(): Promise<boolean> {
      if (active) return false;
      const run = begin();
      run.state = dismissedState;
      run.ownsAttempt = true;
      deps.takeCallback();
      try {
        await deps.deleteAttempt();
        run.ownsAttempt = false;
        return true;
      } catch {
        return false;
      } finally {
        await finish(run, run.ownsAttempt);
      }
    },
    async signIn(acceptLogin: AcceptNativeBrowserLogin, intent?: NativeLoginIntent,
      options?: { scope?: AdditionalLoginScope; authorize?: AuthorizeAttempt }): Promise<"accepted" | "cancelled" | undefined> {
      if (active) return;
      const run = begin();
      const { signal } = run.controller;
      setStatus("opening");
      let failed = false;
      let preserveUntil = 0;
      try {
        recoveryIntent = undefined;
        recoveryScope = options?.scope;
        failure = undefined;
        // Starting another login retires a verifier left by an earlier browser.
        retiredState = dismissedState ?? retiredState;
        dismissedState = undefined;
        run.ownsAttempt = true;
        await deps.deleteAttempt();
        run.ownsAttempt = false;
        if (signal.aborted) return;

        const state = randomHex(await deps.randomBytes(24));
        const verifier = randomHex(await deps.randomBytes(32));
        const challenge = (await deps.sha256Base64(verifier)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
        if (signal.aborted) return;
        if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error("Invalid login challenge");
        if (options?.authorize && !await options.authorize(options.scope, signal)) {
          failure = "SESSION_EXPIRED";
          failed = true;
          return;
        }

        const expiresAt = now() + ATTEMPT_TTL_MS;
        run.state = state;
        run.ownsAttempt = true;
        await deps.saveAttempt(JSON.stringify({ origin: NATIVE_STAGING_ORIGIN, state, verifier, expiresAt,
          ...(options?.scope ? { scope: options.scope } : { intent: parseNativeLoginIntent(intent) }) }));
        if (signal.aborted) return;
        armExpiry(run, expiresAt);
        const url = new URL("/api/auth/native/start", NATIVE_STAGING_ORIGIN);
        url.search = new URLSearchParams({ scheme: NATIVE_BROWSER_SCHEME, state, challenge, next: "/dashboard" }).toString();
        run.browserOpen = true;
        const browser = await deps.openBrowser(url.href, NATIVE_BROWSER_REDIRECT);
        run.browserOpen = false;
        const queued = deps.takeCallback();
        if (signal.aborted) return;

        const matching = queued?.state === state ? queued : null;
        const callback = (browser.type === "success" && browser.url ? parseNativeBrowserCallback(browser.url) : null) ?? matching;
        const result = run.completion ?? (callback ? complete(run, callback, acceptLogin, options?.authorize) : null);
        const accepted = result ? await result : false;
        failed = result ? !accepted && !signal.aborted : browser.type === "success";
        if (accepted && options?.scope) return "accepted";
        // Android can report the app's foreground return before Linking has
        // delivered the callback. The matching verifier is still single-use.
        if (!result && browser.type === "dismiss" && deps.preserveAttemptOnDismiss) preserveUntil = expiresAt;
        if (!result && !preserveUntil && (browser.type === "dismiss" || browser.type === "cancel")) return "cancelled";
      } catch {
        failed = !signal.aborted;
      } finally {
        if (run.completion) failed = !await run.completion && !signal.aborted;
        await finish(run, failed, !signal.aborted && !run.completion && preserveUntil > now());
      }
    },
    async completePending(acceptLogin: AcceptNativeBrowserLogin, authorize?: AuthorizeAttempt): Promise<boolean> {
      const callback = deps.takeCallback();
      if (!active && callback) {
        recoveryIntent = undefined;
        recoveryScope = undefined;
        failure = undefined;
      }
      if (!callback) return active?.completion ?? false;
      if (callback.state === retiredState) return false;
      if (active) {
        return active.state === callback.state ? complete(active, callback, acceptLogin, authorize) : false;
      }
      const run = begin();
      const accepted = await complete(run, callback, acceptLogin, authorize);
      await finish(run, !accepted && !run.controller.signal.aborted);
      return accepted;
    },
  };
}
