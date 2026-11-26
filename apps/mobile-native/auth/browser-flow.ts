import {
  NATIVE_BROWSER_REDIRECT,
  NATIVE_BROWSER_SCHEME,
  parseNativeBrowserCallback,
  type NativeBrowserCallback,
} from "./browser-intent";
import { NATIVE_STAGING_ORIGIN, type SessionHeaders } from "./session-api";

const ATTEMPT_TTL_MS = 5 * 60_000;
const EXCHANGE_URL = `${NATIVE_STAGING_ORIGIN}/api/auth/native/expo/exchange`;

export type NativeBrowserLoginStatus = "idle" | "opening" | "exchanging" | "error";
export type AcceptNativeBrowserLogin = (headers: SessionHeaders, userId: string, signal: AbortSignal) => Promise<void>;

type BrowserLoginDeps = {
  randomBytes(count: number): Promise<Uint8Array>;
  sha256Base64(value: string): Promise<string>;
  readAttempt(): Promise<string | null>;
  saveAttempt(serialized: string): Promise<void>;
  deleteAttempt(): Promise<void>;
  openBrowser(url: string, redirect: string): Promise<{ type: string; url?: string }>;
  dismissBrowser(): void;
  takeCallback(): NativeBrowserCallback | null;
  fetcher(url: string, init: RequestInit): Promise<Pick<Response, "body" | "headers" | "json" | "ok" | "redirected" | "type" | "url">>;
  now?: () => number;
};

type StoredAttempt = { origin: string; state: string; verifier: string; expiresAt: number };
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
  if (!raw || raw.length > 512) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredAttempt> | null;
    if (!value || value.origin !== NATIVE_STAGING_ORIGIN
      || typeof value.state !== "string" || !/^[a-f0-9]{48}$/.test(value.state)
      || typeof value.verifier !== "string" || !/^[a-f0-9]{64}$/.test(value.verifier)
      || typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)) return null;
    return { origin: value.origin, state: value.state, verifier: value.verifier, expiresAt: value.expiresAt };
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

  async function finish(run: LoginRun, failed: boolean): Promise<void> {
    clearTimeout(run.timer);
    if (run.ownsAttempt) {
      try {
        await deps.deleteAttempt();
      } catch {
        failed = true;
      }
    }
    if (run.state) retiredState = run.state;
    active = null;
    setStatus(run.expired || failed ? "error" : "idle");
  }

  function complete(run: LoginRun, callback: NativeBrowserCallback, acceptLogin: AcceptNativeBrowserLogin): Promise<boolean> {
    if (run.state && run.state !== callback.state) return Promise.resolve(false);
    return run.completion ??= (async () => {
      const attempt = parseStoredAttempt(await deps.readAttempt());
      if (!attempt || attempt.state !== callback.state) return false;
      run.state = attempt.state;
      run.ownsAttempt = true;
      const { signal } = run.controller;
      if (signal.aborted || attempt.expiresAt <= now() || attempt.expiresAt > now() + ATTEMPT_TTL_MS) return false;
      armExpiry(run, attempt.expiresAt);
      setStatus("exchanging");
      // Consume the local verifier before contacting the single-use exchange.
      await deps.deleteAttempt();
      run.ownsAttempt = false;
      if (signal.aborted || attempt.expiresAt <= now()) return false;

      const response = await deps.fetcher(EXCHANGE_URL, {
        method: "POST",
        credentials: "omit",
        redirect: "manual",
        signal,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Origin: NATIVE_STAGING_ORIGIN },
        body: JSON.stringify({ code: callback.code, verifier: attempt.verifier }),
      });
      if (signal.aborted || attempt.expiresAt <= now() || !response.ok || response.redirected
        || response.type === "opaqueredirect" || (response.url && response.url !== EXCHANGE_URL)) {
        void response.body?.cancel().catch(() => {});
        return false;
      }
      const accountId = acceptAccountId(await response.json());
      if (!accountId || signal.aborted || attempt.expiresAt <= now()) return false;
      await acceptLogin(response.headers, accountId, signal);
      return !signal.aborted;
    })().catch(() => false);
  }

  return {
    getStatus: () => status,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    cancel() {
      if (active) cancelRun(active);
    },
    async signIn(acceptLogin: AcceptNativeBrowserLogin): Promise<void> {
      if (active) return;
      const run = begin();
      const { signal } = run.controller;
      setStatus("opening");
      let failed = false;
      try {
        const state = randomHex(await deps.randomBytes(24));
        const verifier = randomHex(await deps.randomBytes(32));
        const challenge = (await deps.sha256Base64(verifier)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
        if (signal.aborted) return;
        if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error("Invalid login challenge");

        const expiresAt = now() + ATTEMPT_TTL_MS;
        run.state = state;
        run.ownsAttempt = true;
        await deps.saveAttempt(JSON.stringify({ origin: NATIVE_STAGING_ORIGIN, state, verifier, expiresAt }));
        if (signal.aborted) return;
        armExpiry(run, expiresAt);
        const url = new URL("/api/auth/native/start", NATIVE_STAGING_ORIGIN);
        url.search = new URLSearchParams({ scheme: NATIVE_BROWSER_SCHEME, state, challenge, next: "/dashboard" }).toString();
        run.browserOpen = true;
        const browser = await deps.openBrowser(url.href, NATIVE_BROWSER_REDIRECT);
        run.browserOpen = false;
        const queued = deps.takeCallback();
        if (signal.aborted) return;

        const callback = browser.type === "success" && browser.url ? parseNativeBrowserCallback(browser.url) : queued;
        const result = run.completion ?? (callback ? complete(run, callback, acceptLogin) : null);
        failed = result ? !await result && !signal.aborted : browser.type === "success";
      } catch {
        failed = !signal.aborted;
      } finally {
        await run.completion;
        await finish(run, failed);
      }
    },
    async completePending(acceptLogin: AcceptNativeBrowserLogin): Promise<boolean> {
      const callback = deps.takeCallback();
      if (!callback) return active?.completion ?? false;
      if (callback.state === retiredState) return false;
      if (active) {
        return active.state === callback.state ? complete(active, callback, acceptLogin) : false;
      }
      const run = begin();
      const accepted = await complete(run, callback, acceptLogin);
      await finish(run, !accepted && !run.controller.signal.aborted);
      return accepted;
    },
  };
}
