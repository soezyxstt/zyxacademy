import type { AcceptNativeBrowserLogin, NativeBrowserLoginStatus } from "./browser-flow";
import { NATIVE_STAGING_ORIGIN, readSignedSessionCookie, type SessionHeaders } from "./session-api";
import type { NativeLoginIntent } from "./login-intent";

const PATH = "/api/auth/native/google";
const ENDPOINT = NATIVE_STAGING_ORIGIN + PATH;
const PROOF = "zyx_native_google_challenge";
const lifetime = 5 * 60_000;
const requestTimeout = 15_000;
const googleClient = /^[A-Za-z0-9_-]{1,228}\.apps\.googleusercontent\.com$/;
const noncePattern = /^[A-Za-z0-9_-]{43}$/;

type GoogleResponse = Pick<Response, "body" | "json" | "ok" | "redirected" | "status" | "type" | "url"> & { headers: SessionHeaders };
type CredentialDependencies = {
  isConfigured(): boolean;
  pick(clientId: string, nonce: string): Promise<unknown>;
  cancelPicker(): Promise<void>;
  fetcher(url: string, init: RequestInit): Promise<GoogleResponse>;
  revoke(cookie: string): Promise<void>;
};
export type GoogleCredentialOutcome = "cancelled" | "unavailable" | "error" | "accepted";
type GoogleRun = { controller: AbortController; picking: boolean; expired: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readProof(headers: SessionHeaders) {
  const separate = headers.getSetCookie?.();
  const cookies = separate?.length ? separate : [headers.get("set-cookie") ?? ""];
  const matches = cookies.flatMap(value => value.split(/,\s*(?=[^\s=,;]+=)/)).flatMap(value => {
    const [cookie, ...attributes] = value.trim().split(/;\s*/);
    if (!cookie.startsWith(PROOF + "=") || !noncePattern.test(cookie.slice(PROOF.length + 1))) return [];
    const flags = new Set(attributes.map(attribute => attribute.toLowerCase()));
    return flags.has("secure") && flags.has("httponly") && flags.has("samesite=strict") && flags.has("path=" + PATH)
      ? [cookie] : [];
  });
  return matches.length === 1 ? matches[0] : null;
}

export function createGoogleCredentialLogin(deps: CredentialDependencies) {
  let status: NativeBrowserLoginStatus = "idle";
  let active: GoogleRun | undefined;
  const listeners = new Set<() => void>();
  function setStatus(value: NativeBrowserLoginStatus) {
    status = value;
    for (const listener of listeners) listener();
  }

  async function send(body: Record<string, string>, proof?: string, signal?: AbortSignal, limit = requestTimeout) {
    const request = new AbortController();
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timeout = setTimeout(abort, limit);
    try {
      const response = await deps.fetcher(ENDPOINT, {
        method: "POST", credentials: "omit", redirect: "manual", signal: request.signal,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Origin: NATIVE_STAGING_ORIGIN, ...(proof ? { Cookie: proof } : {}) },
        body: JSON.stringify(body),
      });
      if (response.redirected || response.type === "opaqueredirect" || (response.url && response.url !== ENDPOINT)
        || (response.status >= 300 && response.status < 400)) {
        void response.body?.cancel().catch(() => {});
        throw new Error("Google sign-in response is invalid.");
      }
      const value = record(await response.json());
      return { value, headers: response.headers, ok: response.ok };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  function cancel(run = active) {
    if (!run) return;
    run.controller.abort();
    if (run.picking) void deps.cancelPicker().catch(() => {});
  }

  return {
    isConfigured: () => deps.isConfigured(),
    isRunning: () => Boolean(active),
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    cancel: () => cancel(),
    async signIn(accept: AcceptNativeBrowserLogin, intent?: NativeLoginIntent, retireBrowserAttempt?: () => Promise<boolean>): Promise<GoogleCredentialOutcome> {
      if (active) return "error";
      if (!deps.isConfigured()) return "unavailable";
      const run: GoogleRun = { controller: new AbortController(), picking: false, expired: false };
      const { signal } = run.controller;
      active = run;
      setStatus("opening");
      const timer = setTimeout(() => {
        run.expired = true;
        cancel(run);
      }, lifetime);
      let proof: string | null = null;
      let outcome: GoogleCredentialOutcome = "error";
      try {
        if (retireBrowserAttempt && !await retireBrowserAttempt()) return outcome;
        if (signal.aborted) return outcome = run.expired ? "error" : "cancelled";
        const challenge = await send({ action: "challenge" }, undefined, signal);
        if (!challenge.ok && challenge.value?.code === "GOOGLE_NOT_CONFIGURED") return outcome = "unavailable";
        proof = readProof(challenge.headers);
        const clientId = challenge.value?.clientId;
        const nonce = challenge.value?.nonce;
        if (!challenge.ok || !proof || typeof clientId !== "string" || !googleClient.test(clientId)
          || typeof nonce !== "string" || !noncePattern.test(nonce)) return outcome;
        if (signal.aborted) return outcome = run.expired ? "error" : "cancelled";

        run.picking = true;
        const selected = record(await deps.pick(clientId, nonce));
        run.picking = false;
        if (signal.aborted) return outcome = run.expired ? "error" : "cancelled";
        if (selected?.status === "cancelled") return outcome = "cancelled";
        if (selected?.status === "unavailable") return outcome = "unavailable";
        if (selected?.status !== "selected" || typeof selected.idToken !== "string" || selected.idToken.length > 12_000
          || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(selected.idToken)) return outcome;

        setStatus("exchanging");
        // A sent verification can create a live session even if the UI cancels.
        // Finish reading its response, then only install while the run is still current.
        const result = await send({ action: "verify", idToken: selected.idToken }, proof);
        if (!result.ok) return outcome = signal.aborted && !run.expired ? "cancelled" : "error";
        const cookie = readSignedSessionCookie(result.headers);
        if (!cookie) return outcome;
        try {
          const userId = result.value?.userId;
          if (signal.aborted || typeof userId !== "string" || !userId.trim()) throw new Error("Google sign-in not accepted.");
          await accept(result.headers, userId, signal, intent);
          return outcome = "accepted";
        } catch {
          await deps.revoke(cookie).catch(() => {});
          return outcome = signal.aborted && !run.expired ? "cancelled" : "error";
        }
      } catch {
        return outcome = signal.aborted && !run.expired ? "cancelled" : "error";
      } finally {
        clearTimeout(timer);
        if (proof) {
          // The server consumes proof at most once. Expire an unused proof without persisting it locally.
          void send({ action: "cancel" }, proof, undefined, 3_000).catch(() => {});
        }
        active = undefined;
        setStatus(outcome === "error" ? "error" : "idle");
      }
    },
  };
}
