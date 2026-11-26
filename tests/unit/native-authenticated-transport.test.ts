import { describe, expect, test } from "bun:test";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";

const origin = "https://staging.example.test";
const cookie = "__Secure-better-auth.session_token=fixture";
const credentials = { origin, accountId: "student-1", sessionId: "session-1", readCookie: () => cookie };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(result => { resolve = result; });
  return { promise, resolve };
}

describe("native authenticated transport", () => {
  test("attaches the scoped cookie with ambient cookies disabled and redirects left unfollowed", async () => {
    const transport = createNativeTransport({
      origin: origin + "/",
      fetcher: async (url, init) => {
        expect(url).toBe(origin + "/api/offline/sync");
        expect(init).toMatchObject({ method: "POST", credentials: "omit", redirect: "manual" });
        const headers = new Headers(init.headers);
        expect(headers.get("Cookie")).toBe(cookie);
        expect(headers.get("Cache-Control")).toBe("no-cache, no-store");
        expect(headers.get("x-offline-session-id")).toBe(credentials.sessionId);
        return Response.json({ cursor: "42" });
      },
    });
    const session = transport.setSession({
      ...credentials,
      readCookie: (scope) => {
        expect(scope).toEqual({ origin, accountId: "student-1", sessionId: "session-1" });
        return cookie;
      },
    });

    const response = await session.request("/api/offline/sync", {
      method: "POST",
      headers: { "x-offline-session-id": session.scope.sessionId },
      body: JSON.stringify({ locale: "id" }),
    });

    expect(transport.captureSession()).toBe(session);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cursor: "42" });
  });

  test("rejects other origins and caller-supplied credentials before reading a cookie", async () => {
    const transport = createNativeTransport({
      origin,
      fetcher: async () => { throw new Error("Unexpected request"); },
    });
    expect(() => transport.setSession({ ...credentials, origin: "https://production.example.test" })).toThrow();
    const session = transport.setSession({
      ...credentials,
      readCookie: () => { throw new Error("Unexpected credential read"); },
    });
    for (const path of [
      "http://staging.example.test/api",
      "https://staging.example.test:8443/api",
      "https://other.example.test/api",
      "//other.example.test/api",
      "/\\other.example.test/api",
      "https://someone@staging.example.test/api",
      "https://staging.example.test@other.example.test/api",
    ]) {
      await expect(session.request(path)).rejects.toMatchObject({ code: "origin" });
    }
    await expect(session.request("/api", { headers: { Cookie: "other=fixture" } })).rejects.toMatchObject({ code: "credentials" });
    await expect(session.request("/api", { headers: { Host: "other.example.test" } })).rejects.toMatchObject({ code: "credentials" });
    expect(() => createNativeTransport({ origin: "http://localhost:3000", fetcher: async () => new Response() })).toThrow();
  });

  test("rejects unavailable or invalid stored credentials without sending the request", async () => {
    const transport = createNativeTransport({
      origin,
      fetcher: async () => { throw new Error("Unexpected request"); },
    });
    for (const invalidCookie of [null, "", "  ", "session=y\r\nX-Injected: z"]) {
      const session = transport.setSession({ ...credentials, readCookie: () => invalidCookie });
      await expect(session.request("/api/offline/sync")).rejects.toMatchObject({ code: "credentials" });
    }
  });

  test("quarantines redirects without replay and returns header-only offline validation", async () => {
    let calls = 0;
    const transport = createNativeTransport({
      origin,
      fetcher: async () => {
        calls++;
        return calls === 1
          ? new Response(null, { status: 307, headers: { Location: "https://other.example.test/api" } })
          : new Response(null, { status: 304, headers: { "x-offline-cursor": "42" } });
      },
    });
    const session = transport.setSession(credentials);
    await expect(session.request("/api/offline/resource", { retry: "transient-read" })).rejects.toMatchObject({ code: "redirect" });
    expect(calls).toBe(1);
    const response = await session.request("/api/offline/resource");
    expect(response.status).toBe(304);
    expect(response.headers.get("x-offline-cursor")).toBe("42");
    expect(response.body).toBeNull();
  });

  test("aborts a pending credential read at logout before dispatch", async () => {
    const credentialRead = deferred<string>();
    const readStarted = deferred<void>();
    let calls = 0;
    const transport = createNativeTransport({ origin, fetcher: async () => { calls++; return new Response(); } });
    const session = transport.setSession({
      ...credentials,
      readCookie: () => { readStarted.resolve(); return credentialRead.promise; },
    });
    const pending = session.request("/api/zyra/chat", { method: "POST" });
    await readStarted.promise;
    transport.clearSession();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    credentialRead.resolve(cookie);
    expect(transport.captureSession()).toBeNull();
    expect(session.isCurrent()).toBe(false);
    expect(calls).toBe(0);
  });

  test("cancels an outgoing fetch and disposes a late response after replacing the session", async () => {
    const oldResponse = deferred<Response>();
    const dispatched = deferred<AbortSignal | null | undefined>();
    const discarded = deferred<void>();
    let calls = 0;
    const transport = createNativeTransport({
      origin,
      fetcher: async (_, init) => {
        calls++;
        if (calls === 1) {
          dispatched.resolve(init.signal);
          return oldResponse.promise;
        }
        expect(new Headers(init.headers).get("cookie")).toBe("session=second");
        return Response.json({ owner: "second" });
      },
    });
    const first = transport.setSession(credentials);
    const pending = first.request("/api/offline/resource", { retry: "transient-read" });
    const signal = await dispatched.promise;
    const second = transport.setSession({ ...credentials, accountId: "student-2", readCookie: () => "session=second" });

    expect(signal?.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    oldResponse.resolve(new Response(new ReadableStream({ cancel() { discarded.resolve(); } })));
    await discarded.promise;
    await expect(first.request("/api/offline/resource")).rejects.toMatchObject({ name: "AbortError" });
    expect(await (await second.request("/api/offline/resource")).json()).toEqual({ owner: "second" });
    expect(calls).toBe(2);
  });

  test("streams bytes incrementally and cancels a pending read even when source cleanup stalls", async () => {
    const cancelled = deferred<void>();
    const cleanup = deferred<void>();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Uint8Array.of(9, 4, 2)); },
      cancel() { cancelled.resolve(); return cleanup.promise; },
    });
    const transport = createNativeTransport({ origin, fetcher: async () => new Response(stream) });
    const session = transport.setSession(credentials);
    const caller = new AbortController();
    const response = await session.request("/api/zyra/chat", { method: "POST", signal: caller.signal });
    const reader = response.body!.getReader();
    expect(await reader.read()).toEqual({ done: false, value: Uint8Array.of(9, 4, 2) });
    const pending = reader.read();
    caller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await cancelled.promise;
    cleanup.resolve();
    reader.releaseLock();
    expect(session.isCurrent()).toBe(true);
  });

  test("withholds buffered and unread response data after logout", async () => {
    const responseText = deferred<string>();
    const reading = deferred<void>();
    const raw = new Response("old account");
    raw.text = () => { reading.resolve(); return responseText.promise; };
    const transport = createNativeTransport({ origin, fetcher: async () => raw });
    const session = transport.setSession(credentials);
    const response = await session.request("/api/offline/resource");
    const buffered = response.text();
    await reading.promise;
    transport.clearSession();
    await expect(buffered).rejects.toMatchObject({ name: "AbortError" });
    responseText.resolve("old account");
    expect(() => response.headers.get("Content-Type")).toThrow();
    await expect(response.json()).rejects.toMatchObject({ name: "AbortError" });
  });

  test("only replays explicitly opted-in safe reads", async () => {
    let calls = 0;
    const transport = createNativeTransport({
      origin,
      fetcher: async () => {
        calls++;
        if (calls === 1) throw new Error("Simulated network error");
        if (calls === 2) return new Response("overload", { status: 503 });
        if (calls === 3) return new Response("recovered");
        return new Response("sign in", { status: 401 });
      },
    });
    const session = transport.setSession(credentials);
    await expect(session.request("/api/zyra/chat", { method: "POST" })).rejects.toMatchObject({ code: "network" });
    await expect(session.request("/api/zyra/chat", { method: "POST", retry: "transient-read" })).rejects.toBeInstanceOf(TypeError);
    expect(calls).toBe(1);
    expect(await (await session.request("/api/offline/resource", { retry: "transient-read" })).text()).toBe("recovered");
    const expired = await session.request("/api/offline/resource", { retry: "transient-read" });
    expect(expired.status).toBe(401);
    expired.dispose();
    expect(calls).toBe(4);
  });
});
