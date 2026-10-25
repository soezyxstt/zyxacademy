import { expect, test } from "bun:test";
import { NonRetriableError, RetryAfterError } from "inngest";
import type { Browser } from "playwright-core";
import { acquireVerificationBrowser, runVerificationBrowserOperation } from "@/lib/compute/product-v4-browser-session";

const account = "a".repeat(32), token = "private-test-token";
const sessionId = "00000000-0000-4000-8000-000000000001";
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/browser-run/devtools/browser`;

test("CDP acquisition honors Retry-After and sanitizes rate-limit errors", async () => {
  for (const [header, expected] of [["45", "45"], ["60000", "60000"], [null, "25"], ["garbage", "25"]]) {
    const ports = { fetch: (async () => new Response(`Rate limit exceeded ${token}`, { status: 429, headers: header ? { "Retry-After": header } : {} })) as typeof fetch, connect: async () => { throw new Error("must not connect"); } };
    try { await acquireVerificationBrowser(account, token, ports); throw new Error("expected rejection"); }
    catch (error) {
      expect(error).toBeInstanceOf(RetryAfterError);
      expect((error as RetryAfterError).retryAfter).toBe(expected!);
      expect((error as Error).message).toBe("VERIFICATION_BROWSER_RATE_LIMITED");
    }
  }
});

test("a remote operation deadline releases the browser before propagating timeout", async () => {
  let closed = false;
  let signal: AbortSignal | undefined;
  await expect(runVerificationBrowserOperation(input => { signal = input; return new Promise<never>(() => {}); }, async () => { expect(signal?.aborted).toBe(true); closed = true; }, 5)).rejects.toThrow("VERIFICATION_BROWSER_OPERATION_TIMEOUT");
  expect(closed).toBe(true);
});

test("browser cleanup preserves the operation error and blocks success if cleanup fails", async () => {
  const close = async () => { throw new Error("CLEANUP_FAILED"); };
  await expect(runVerificationBrowserOperation(async () => { throw new Error("RENDER_FAILED"); }, close)).rejects.toThrow("RENDER_FAILED");
  await expect(runVerificationBrowserOperation(async () => "evidence", close)).rejects.toThrow("CLEANUP_FAILED");
});

test("daily quota and denied access fail without spending transient retries", async () => {
  for (const [status, body, code] of [[429, "Browser time limit exceeded for today", "DAILY_QUOTA_EXCEEDED"], [403, token, "ACCESS_DENIED"]] as const) {
    const ports = { fetch: (async () => new Response(body, { status })) as typeof fetch, connect: async () => { throw new Error("must not connect"); } };
    await expect(acquireVerificationBrowser(account, token, ports)).rejects.toBeInstanceOf(NonRetriableError);
    await expect(acquireVerificationBrowser(account, token, ports)).rejects.toThrow(`VERIFICATION_BROWSER_${code}`);
  }
});

test("cleanup terminates the remote session as well as disconnecting Playwright", async () => {
  const calls: string[] = [];
  const browser = { close: async () => { calls.push("disconnect"); } } as unknown as Browser;
  const ports = { fetch: (async (url, options) => {
    expect((options?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    calls.push(`${options?.method} ${url}`);
    return options?.method === "POST" ? Response.json({ sessionId, webSocketDebuggerUrl: `${endpoint.replace("https:", "wss:")}/${sessionId}` }) : Response.json({ status: "closing" });
  }) as typeof fetch, connect: async () => browser };
  const acquired = await acquireVerificationBrowser(account, token, ports);
  await acquired.close();
  expect(calls).toEqual([`POST ${endpoint}?keep_alive=60000`, `DELETE ${endpoint}/${sessionId}`, "disconnect"]);
});

test("connection failures release acquired capacity and cannot leak authentication", async () => {
  let released = false;
  const ports = { fetch: (async (_url, options) => {
    if (options?.method === "DELETE") { released = true; return new Response(null, { status: 204 }); }
    return Response.json({ sessionId, webSocketDebuggerUrl: `${endpoint.replace("https:", "wss:")}/${sessionId}` });
  }) as typeof fetch, connect: async () => { throw new Error(`WebSocket error Authorization: Bearer ${token}`); } };
  await expect(acquireVerificationBrowser(account, token, ports)).rejects.toThrow("VERIFICATION_BROWSER_CONNECT_FAILED");
  expect(released).toBe(true);
});

test("Browser Run acquisition accepts Cloudflare's canonical browser-rendering CDP alias", async () => {
  const canonical = `${endpoint.replace("https:", "wss:").replace("/browser-run/", "/browser-rendering/")}/${sessionId}`;
  let connected = false;
  const ports = { fetch: (async (_url, options) => options?.method === "POST" ? Response.json({ sessionId, webSocketDebuggerUrl: canonical }) : new Response(null, { status: 204 })) as typeof fetch,
    connect: async (url: string) => { expect(url).toBe(canonical); connected = true; return { close: async () => {} } as unknown as Browser; } };
  const acquired = await acquireVerificationBrowser(account, token, ports);
  await acquired.close();
  expect(connected).toBe(true);
});

test("provider WebSocket locations cannot redirect credentials to another origin", async () => {
  let connected = false, released = false;
  const ports = { fetch: (async (_url, options) => {
    if (options?.method === "DELETE") { released = true; return new Response(null, { status: 204 }); }
    return Response.json({ sessionId, webSocketDebuggerUrl: "wss://external.example/browser" });
  }) as typeof fetch, connect: async () => { connected = true; throw new Error("must not connect"); } };
  await expect(acquireVerificationBrowser(account, token, ports)).rejects.toThrow("SESSION_INVALID");
  expect(connected).toBe(false);
  expect(released).toBe(true);
});

test("Steel uses reserved session, canonical CDP, bounded free browser options and explicit release", async () => {
  const { acquireSteelVerificationBrowser } = await import("@/lib/compute/product-v4-browser-session");
  let id = "", disconnected = false;
  const calls: string[] = [];
  const ports = { fetch: (async (url, options) => {
    expect((options?.headers as Record<string, string>)["steel-api-key"]).toBe(token);
    calls.push(String(url));
    if (String(url).endsWith("/release")) return Response.json({ success: true });
    const body = JSON.parse(String(options?.body));
    id = body.sessionId;
    expect(body).toEqual({ sessionId: id, timeout: 120000, inactivityTimeout: 60000, headless: true, useProxy: false, solveCaptcha: false, persistProfile: false });
    return Response.json({ id, websocketUrl: "wss://untrusted.example/?apiKey=other" });
  }) as typeof fetch, connect: async (endpoint: string) => {
    const url = new URL(endpoint);
    expect(url.origin).toBe("wss://connect.steel.dev");
    expect(url.searchParams.get("sessionId")).toBe(id);
    expect(url.searchParams.get("apiKey")).toBe(token);
    return { close: async () => { disconnected = true; } } as unknown as Browser;
  } };
  const session = await acquireSteelVerificationBrowser(token, ports);
  await session.close();
  expect(calls).toEqual(["https://api.steel.dev/v1/sessions", `https://api.steel.dev/v1/sessions/${id}/release`]);
  expect(disconnected).toBe(true);
});

test("Steel classifies authentication, credits, capacity and Retry-After without daily-reset assumptions", async () => {
  const { acquireSteelVerificationBrowser } = await import("@/lib/compute/product-v4-browser-session");
  for (const [status, body, code, terminal] of [
    [401, token, "ACCESS_DENIED", true], [403, token, "ACCESS_DENIED", true],
    [402, token, "CREDITS_EXHAUSTED", true], [429, "Insufficient credits", "CREDITS_EXHAUSTED", true],
    [429, "daily quota today", "RATE_LIMITED", false], [429, "Maximum concurrent sessions reached", "CAPACITY_UNAVAILABLE", false], [409, token, "CAPACITY_UNAVAILABLE", false], [503, token, "CAPACITY_UNAVAILABLE", false],
  ] as const) {
    try {
      await acquireSteelVerificationBrowser(token, { fetch: (async () => new Response(body, { status, headers: { "Retry-After": "45" } })) as typeof fetch, connect: async () => { throw new Error("must not connect"); } });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(terminal ? NonRetriableError : RetryAfterError);
      expect((error as Error).message).toBe(`VERIFICATION_STEEL_ACQUIRE_${code}`);
      expect(String(error)).not.toContain(token);
      if (!terminal) expect((error as RetryAfterError).retryAfter).toBe("45");
    }
  }
});

test("Steel releases malformed and failed connections and sanitizes transport, metadata and cleanup errors", async () => {
  const { acquireSteelVerificationBrowser } = await import("@/lib/compute/product-v4-browser-session");
  for (const mode of ["connect", "metadata", "json", "transport", "cleanup"] as const) {
    let released = false;
    const ports = { fetch: (async (url, options) => {
      if (String(url).endsWith("/release")) {
        released = true;
        if (mode === "cleanup") throw new Error(token);
        return Response.json({ success: true });
      }
      if (mode === "transport") throw new Error(`https://api.steel.dev?apiKey=${token}`);
      if (mode === "json") return new Response(token);
      return Response.json({ id: mode === "metadata" ? "wrong" : JSON.parse(String(options?.body)).sessionId });
    }) as typeof fetch, connect: async () => { throw new Error(`wss://connect.steel.dev?apiKey=${token}`); } };
    try { await acquireSteelVerificationBrowser(token, ports); throw new Error("expected failure"); }
    catch (error) {
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain("wss:");
      expect(String(error)).toContain(mode === "cleanup" ? "CLEANUP_FAILED" : mode === "transport" ? "TRANSPORT_FAILED" : mode === "connect" ? "CONNECT_FAILED" : "SESSION_INVALID");
    }
    expect(released).toBe(true);
  }
});

test("Steel cleanup failures prevent success and still disconnect", async () => {
  const { acquireSteelVerificationBrowser } = await import("@/lib/compute/product-v4-browser-session");
  let disconnected = false;
  const session = await acquireSteelVerificationBrowser(token, {
    fetch: (async (url, options) => String(url).endsWith("/release") ? new Response(token, { status: 503 }) : Response.json({ id: JSON.parse(String(options?.body)).sessionId })) as typeof fetch,
    connect: async () => ({ close: async () => { disconnected = true; } }) as unknown as Browser,
  });
  await expect(session.close()).rejects.toThrow("VERIFICATION_STEEL_RELEASE_CAPACITY_UNAVAILABLE");
  expect(disconnected).toBe(true);
});
