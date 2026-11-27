import type { NativeAccountContext } from "../../../packages/native-session/context";

export type NativeAccountRole = NativeAccountContext["roles"][number];

export type NativeSessionScope = Readonly<{
  origin: string;
  accountId: string;
  sessionId: string;
}>;

export type NativeSessionCredentials = NativeSessionScope & {
  /** Read the cookie header for this verified session from the caller's credential store. */
  readCookie(scope: NativeSessionScope): string | null | Promise<string | null>;
  /** Recheck immediately before dispatching a new request. */
  canStartRequest?(method: string, requiredRole?: NativeAccountRole): boolean;
};

export type NativeRequestInit = Pick<RequestInit, "body" | "headers" | "method" | "signal"> & {
  /** One replay on a network failure or a 502, 503, or 504 response. Only for bodyless GET and HEAD. */
  retry?: "transient-read";
  /** Require fresh account access before a protected write reaches the network. */
  requiredRole?: NativeAccountRole;
};

export type NativeResponse = Readonly<{
  status: number;
  ok: boolean;
  headers: Pick<Headers, "get" | "has">;
  body: ReadableStream<Uint8Array> | null;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Release an unread body after inspecting status or headers. */
  dispose(): void;
}>;

export type NativeSessionTransport = Readonly<{
  scope: NativeSessionScope;
  signal: AbortSignal;
  isCurrent(): boolean;
  /** Call before publishing or persisting data after additional asynchronous work. */
  assertCurrent(): void;
  request(path: string, init?: NativeRequestInit): Promise<NativeResponse>;
}>;

type FetchResponse = Pick<Response, "body" | "headers" | "ok" | "redirected" | "status" | "type" | "url" | "json" | "text" | "arrayBuffer">;
type NativeFetcher = (url: string, init: RequestInit) => Promise<FetchResponse>;

const ERROR_MESSAGES = {
  origin: "The native request is outside the configured HTTPS origin.",
  credentials: "The native session cookie is unavailable.",
  redirect: "The authenticated native request was redirected.",
  network: "The native request failed.",
};

export class NativeTransportError extends Error {
  constructor(readonly code: keyof typeof ERROR_MESSAGES) {
    super(ERROR_MESSAGES[code]);
    this.name = "NativeTransportError";
  }
}

export class NativeRequestNotDispatched extends Error {
  constructor() {
    super("Account access is not verified for this request.");
    this.name = "NativeRequestNotDispatched";
  }
}

function normalizeOrigin(input: string): string {
  try {
    const url = new URL(input);
    if (url.protocol === "https:" && !url.username && !url.password && url.href === `${url.origin}/`) {
      return url.origin;
    }
  } catch { /* Report a fixed error without the supplied URL. */ }
  throw new NativeTransportError("origin");
}

function originRequestUrl(path: string, origin: string): string {
  try {
    const url = new URL(path, origin);
    if (url.protocol === "https:" && url.origin === origin && !url.username && !url.password && !url.href.includes("#")) {
      return url.href;
    }
  } catch { /* Report a fixed error without the supplied URL. */ }
  throw new NativeTransportError("origin");
}

function abortError(): Error {
  return Object.assign(new Error("The native request was cancelled."), { name: "AbortError" });
}

function assertActive(...signals: Array<AbortSignal | null | undefined>): void {
  if (signals.some(signal => signal?.aborted)) throw abortError();
}

async function untilAborted<T>(
  signal: AbortSignal,
  work: () => T | Promise<T>,
  discard?: (result: T) => void,
): Promise<T> {
  assertActive(signal);
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortError());
  });
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const operation = Promise.resolve().then(() => {
      assertActive(signal);
      return work();
    }).then(result => {
      if (signal.aborted) {
        discard?.(result);
        throw abortError();
      }
      return result;
    });
    const result = await Promise.race([operation, cancelled]);
    if (signal.aborted) {
      discard?.(result);
      throw abortError();
    }
    return result;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function requestLifetime(session: AbortSignal, caller: AbortSignal | null | undefined, onFinish: () => void) {
  assertActive(session, caller);
  const controller = new AbortController();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onFinish();
    session.removeEventListener("abort", cancel);
    caller?.removeEventListener("abort", cancel);
  };
  const cancel = () => {
    finish();
    controller.abort();
  };
  session.addEventListener("abort", cancel, { once: true });
  caller?.addEventListener("abort", cancel, { once: true });
  return { signal: controller.signal, finish, cancel, assertCurrent: () => assertActive(session, caller, controller.signal) };
}

function discardResponse(response: FetchResponse): void {
  void response.body?.cancel().catch(() => {});
}

function isRedirect(response: FetchResponse, origin: string): boolean {
  if (response.redirected || response.type === "opaqueredirect"
    || (response.status >= 300 && response.status < 400 && response.status !== 304)) return true;
  if (!response.url) return false;
  try {
    return new URL(response.url).origin !== origin;
  } catch {
    return true;
  }
}

function scopedResponse(
  response: FetchResponse,
  method: string,
  lifetime: ReturnType<typeof requestLifetime>,
): NativeResponse {
  const empty = method === "HEAD" || [204, 205, 304].includes(response.status);
  const source = empty ? null : response.body;
  const { signal, assertCurrent } = lifetime;
  let finished = false;
  let used = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  const finish = (cancel = false) => {
    if (finished) return;
    finished = true;
    signal.removeEventListener("abort", onAbort);
    if (cancel) {
      if (reader) void reader.cancel().catch(() => {});
      else discardResponse(response);
    }
    reader?.releaseLock();
    lifetime.finish();
  };
  const onAbort = () => {
    controller?.error(abortError());
    finish(true);
  };

  const body = source && new ReadableStream<Uint8Array>({
    start(streamController) { controller = streamController; },
    async pull(streamController) {
      try {
        assertCurrent();
        used = true;
        reader ??= source.getReader();
        const chunk = await reader.read();
        if (finished) return;
        assertCurrent();
        if (chunk.done) {
          streamController.close();
          finish();
        } else {
          streamController.enqueue(chunk.value);
        }
      } catch (error) {
        if (finished) return;
        streamController.error(error);
        finish(true);
      }
    },
    cancel() {
      finish(true);
      lifetime.cancel();
    },
    // Pull only when the caller asks for a chunk, so logout can drop pending data.
  }, { highWaterMark: 0 });

  if (source) signal.addEventListener("abort", onAbort, { once: true });
  else finish(empty);

  const consume = async <T>(work: () => Promise<T>): Promise<T> => {
    assertCurrent();
    if (body) {
      if (used || body.locked) throw new TypeError("The native response body is already in use.");
      used = true;
      controller?.close();
      controller = undefined;
    }
    try {
      const value = await untilAborted(signal, work);
      assertCurrent();
      return value;
    } finally {
      finish();
    }
  };
  return {
    get status() { assertCurrent(); return response.status; },
    get ok() { assertCurrent(); return response.ok; },
    headers: {
      get(name) { assertCurrent(); return response.headers.get(name); },
      has(name) { assertCurrent(); return response.headers.has(name); },
    },
    get body() { assertCurrent(); return body; },
    json: () => consume(() => body ? response.json() : Promise.reject(new SyntaxError("The native response body is empty."))),
    text: () => consume(() => body ? response.text() : Promise.resolve("")),
    arrayBuffer: () => consume(() => body ? response.arrayBuffer() : Promise.resolve(new ArrayBuffer(0))),
    dispose() { lifetime.cancel(); },
  };
}

export function createNativeTransport({ origin: configuredOrigin, fetcher }: { origin: string; fetcher: NativeFetcher }) {
  const origin = normalizeOrigin(configuredOrigin);
  let pendingWrites = 0;
  let active: { controller: AbortController; transport: NativeSessionTransport; readCookie: NativeSessionCredentials["readCookie"] } | null = null;

  return {
    setSession(credentials: NativeSessionCredentials): NativeSessionTransport {
      if (normalizeOrigin(credentials.origin) !== origin) throw new NativeTransportError("origin");
      if (!credentials.accountId.trim() || !credentials.sessionId.trim()) throw new NativeTransportError("credentials");

      const scope = Object.freeze({ origin, accountId: credentials.accountId, sessionId: credentials.sessionId });
      const controller = new AbortController();
      const { signal } = controller;
      const transport: NativeSessionTransport = Object.freeze({
        scope,
        signal,
        isCurrent: () => !signal.aborted,
        assertCurrent: () => assertActive(signal),
        async request(path, { signal: caller, headers: requestHeaders, body, method = "GET", retry, requiredRole } = {}) {
          assertActive(signal, caller);
          const url = originRequestUrl(path, origin);
          const headers = new Headers(requestHeaders);
          if (["cookie", "cookie2", "authorization", "proxy-authorization", "host"].some(header => headers.has(header))) {
            throw new NativeTransportError("credentials");
          }
          const requestMethod = method.toUpperCase();
          if (retry && ((requestMethod !== "GET" && requestMethod !== "HEAD") || body != null)) {
            throw new TypeError("Native request replay requires a bodyless GET or HEAD.");
          }
          let dispatchedWrite = false;
          const lifetime = requestLifetime(signal, caller, () => { if (dispatchedWrite) pendingWrites--; });
          try {
            let cookie: string | null | undefined;
            try {
              const readCookie = active?.readCookie;
              cookie = await untilAborted(lifetime.signal, () => readCookie?.(scope));
            } catch {
              lifetime.assertCurrent();
              throw new NativeTransportError("credentials");
            }
            if (typeof cookie !== "string" || !cookie.trim() || /[^\x20-\x7e]/.test(cookie)) {
              throw new NativeTransportError("credentials");
            }
            headers.set("Cookie", cookie);
            headers.set("Cache-Control", "no-cache, no-store");

            for (let remaining = retry === "transient-read" ? 1 : 0; ; remaining--) {
              let response: FetchResponse;
              try {
                response = await untilAborted(lifetime.signal, () => {
                  if (credentials.canStartRequest?.(requestMethod, requiredRole) === false) {
                    if (requiredRole) throw new NativeRequestNotDispatched();
                    throw new NativeTransportError("credentials");
                  }
                  if (requestMethod !== "GET" && requestMethod !== "HEAD") {
                    pendingWrites++;
                    dispatchedWrite = true;
                  }
                  return fetcher(url, {
                    method: requestMethod,
                    body,
                    headers,
                    credentials: "omit",
                    redirect: "manual",
                    signal: lifetime.signal,
                  });
                }, discardResponse);
              } catch (error) {
                lifetime.assertCurrent();
                if (error instanceof NativeRequestNotDispatched ||
                  (error instanceof NativeTransportError && error.code === "credentials")) throw error;
                if (remaining) continue;
                throw new NativeTransportError("network");
              }
              if (lifetime.signal.aborted) {
                discardResponse(response);
                throw abortError();
              }
              if (isRedirect(response, origin)) {
                discardResponse(response);
                throw new NativeTransportError("redirect");
              }
              if (remaining && [502, 503, 504].includes(response.status)) {
                discardResponse(response);
                continue;
              }
              return scopedResponse(response, requestMethod, lifetime);
            }
          } catch (error) {
            lifetime.cancel();
            throw error;
          }
        },
      });
      const previous = active;
      active = { controller, transport, readCookie: credentials.readCookie };
      previous?.controller.abort();
      return transport;
    },
    clearSession(): void {
      const previous = active;
      active = null;
      previous?.controller.abort();
    },
    hasPendingWrites: () => pendingWrites > 0,
    captureSession(): NativeSessionTransport | null {
      return active?.transport ?? null;
    },
  };
}
